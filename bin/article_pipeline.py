#!/usr/bin/env python3
"""Article pipeline CLI — deep draft → research → rewrite → Notion upload.

Usage:
    python3 bin/article_pipeline.py status [--json]
    python3 bin/article_pipeline.py run-one --id <tweet_id>
    python3 bin/article_pipeline.py run-batch [--limit N] [--resume]
    python3 bin/article_pipeline.py research-only --id <tweet_id>
    python3 bin/article_pipeline.py write-only --id <tweet_id>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# --- Bootstrap project root ---
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from lib.config import (
    ARTICLE_FINAL_DIR,
    ARTICLE_PIPELINE_STATE,
    ARTICLE_RESEARCH_DIR,
    PROJECT_ROOT,
)

OUTPUT_DIR = PROJECT_ROOT / "output"

from lib.article_pipeline.metadata import (
    ArticleMeta,
    find_deep_draft_by_id,
    find_deep_drafts,
    parse_deep_draft,
)
from lib.article_pipeline.research import Researcher, load_bundle, save_bundle
from lib.article_pipeline.rewrite import Rewriter, parse_final_frontmatter, save_final
from lib.article_pipeline.state import PipelineState

logger = logging.getLogger("article_pipeline")

_STATUS_ORDER = {
    "draft": 0,
    "metadata_done": 1,
    "researched": 2,
    "written": 3,
    "uploaded": 4,
    "failed": 99,
}


def _setup_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )


def _load_state() -> PipelineState:
    return PipelineState(ARTICLE_PIPELINE_STATE).load()


def _compute_hash(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


# =====================================================================
# Step runners
# =====================================================================


def run_metadata(state: PipelineState, meta: ArticleMeta) -> bool:
    """Parse metadata from deep draft. Always succeeds (no LLM call)."""
    entry = state.get(meta.tweet_id)
    if entry and entry.get("status") in ("metadata_done", "researched", "written", "uploaded"):
        logger.info("  [SKIP] metadata already done for %s", meta.tweet_id)
        return True

    state.upsert(
        meta.tweet_id,
        status="metadata_done",
        deep_draft=meta.deep_draft_path,
        metadata=meta.to_dict(),
    )
    logger.info("  [DONE] metadata for %s: %s", meta.tweet_id, meta.title[:60])
    return True


def run_research(
    state: PipelineState,
    meta: ArticleMeta,
    force: bool = False,
) -> bool:
    """Run the research step."""
    entry = state.get(meta.tweet_id)
    if not force and entry and entry.get("status") in ("researched", "written", "uploaded"):
        logger.info("  [SKIP] research already done for %s", meta.tweet_id)
        return True

    researcher = Researcher()
    bundle = researcher.research(meta.to_dict(), meta.body_excerpt)
    path = save_bundle(meta.tweet_id, bundle)
    text = bundle.to_text()
    h = _compute_hash(text)

    state.upsert(
        meta.tweet_id,
        status="researched",
        research_bundle=str(path),
        research_hash=h,
    )
    logger.info(
        "  [DONE] research for %s: %d chars, %d sources",
        meta.tweet_id,
        len(bundle.raw_xai_response),
        len(bundle.sources),
    )
    return True


def run_write(
    state: PipelineState,
    meta: ArticleMeta,
    model: Optional[str] = None,
    force: bool = False,
) -> bool:
    """Run the rewrite step."""
    entry = state.get(meta.tweet_id)
    if not force and entry and entry.get("status") in ("written", "uploaded"):
        logger.info("  [SKIP] write already done for %s", meta.tweet_id)
        return True

    # Load research bundle
    bundle = load_bundle(meta.tweet_id)
    research_text = bundle.to_text() if bundle else ""

    # Read full body
    draft_path = Path(meta.deep_draft_path)
    if not draft_path.exists():
        # Try to find it
        found = find_deep_draft_by_id(OUTPUT_DIR, meta.tweet_id)
        if found:
            draft_path = found
        else:
            logger.error("  [FAIL] deep draft not found for %s", meta.tweet_id)
            state.upsert(meta.tweet_id, status="failed", last_error="deep draft not found")
            return False

    full_text = draft_path.read_text(encoding="utf-8")
    # Get body (after frontmatter)
    body = full_text
    if full_text.startswith("---"):
        end = full_text.find("\n---", 3)
        if end != -1:
            body = full_text[end + 4:].lstrip("\n")

    rewriter = Rewriter()
    try:
        content = rewriter.rewrite(meta.to_dict(), body, research_text, model=model)
    except Exception as exc:
        logger.error("  [FAIL] rewrite for %s: %s", meta.tweet_id, exc)
        state.upsert(meta.tweet_id, status="failed", last_error=str(exc))
        return False

    path = save_final(meta.tweet_id, content)
    state.upsert(
        meta.tweet_id,
        status="written",
        final_md=str(path),
    )
    logger.info("  [DONE] write for %s -> %s", meta.tweet_id, path)
    return True


# =====================================================================
# Commands
# =====================================================================


def cmd_status(args: argparse.Namespace) -> int:
    """Show pipeline status."""
    state = _load_state()
    entries = state.all_entries()
    if not entries:
        print("Pipeline state: empty (no articles processed yet)")
        return 0

    if args.json:
        print(json.dumps(entries, ensure_ascii=False, indent=2))
        return 0

    # Count by status
    counts: dict = {}
    for e in entries:
        s = e.get("status", "unknown")
        counts[s] = counts.get(s, 0) + 1

    print(f"Pipeline state: {len(entries)} articles")
    for s in sorted(counts, key=lambda x: _STATUS_ORDER.get(x, 99)):
        print(f"  {s}: {counts[s]}")

    # Show recent entries
    print()
    print("Recent entries:")
    for e in entries[-10:]:
        tid = e.get("tweet_id", "?")
        st = e.get("status", "?")
        title = (e.get("metadata") or {}).get("title", "")
        print(f"  {tid[:12]}...  [{st}]  {title[:50]}")
    return 0


def cmd_run_one(args: argparse.Namespace) -> int:
    """Process a single article through the pipeline."""
    tweet_id = args.id
    force = getattr(args, "force", False)
    model = getattr(args, "model", None)

    state = _load_state()
    logger.info("Processing tweet_id=%s", tweet_id)

    # Find deep draft
    draft_path = find_deep_draft_by_id(OUTPUT_DIR, tweet_id)
    if not draft_path:
        # Check if already in state
        entry = state.get(tweet_id)
        if entry and entry.get("deep_draft"):
            draft_path = Path(entry["deep_draft"])
        else:
            print(f"ERROR: No deep draft found for tweet_id={tweet_id}", file=sys.stderr)
            return 1

    # Parse metadata
    meta = parse_deep_draft(draft_path)
    if not meta:
        print(f"ERROR: Could not parse deep draft {draft_path}", file=sys.stderr)
        return 1
    meta.tweet_id = tweet_id

    # Run steps
    ok = True
    ok = run_metadata(state, meta)
    state.save()
    if not ok:
        print(f"WARN: metadata step failed for {tweet_id}", file=sys.stderr)
        return 1

    if not getattr(args, "no_research", False):
        ok = run_research(state, meta, force=force)
        state.save()
        if not ok:
            print(f"WARN: research step failed for {tweet_id}", file=sys.stderr)
            return 1

    if not getattr(args, "no_write", False):
        ok = run_write(state, meta, model=model, force=force)
        state.save()

    if ok:
        print(f"OK: article pipeline completed for {tweet_id}")
    else:
        print(f"WARN: article pipeline had errors for {tweet_id}", file=sys.stderr)
    return 0 if ok else 1


def cmd_run_batch(args: argparse.Namespace) -> int:
    """Process multiple articles in batch."""
    limit = args.limit or 0
    resume = args.resume
    force = getattr(args, "force", False)
    model = getattr(args, "model", None)

    state = _load_state()
    drafts = find_deep_drafts(OUTPUT_DIR)

    if not drafts:
        print("No deep drafts found in output/")
        return 0

    # Filter already completed if resuming
    to_process = []
    for d in drafts:
        meta = parse_deep_draft(d)
        if not meta or not meta.tweet_id:
            continue
        if resume:
            entry = state.get(meta.tweet_id)
            if entry and entry.get("status") in ("written", "uploaded"):
                logger.debug("Skipping completed %s", meta.tweet_id)
                continue
        to_process.append(meta)

    if limit > 0:
        to_process = to_process[:limit]

    total = len(to_process)
    print(f"Batch processing: {total} articles (of {len(drafts)} drafts)")

    success = 0
    failed = 0
    for i, meta in enumerate(to_process, 1):
        logger.info("[%d/%d] Processing %s", i, total, meta.tweet_id)
        print(f"\n--- [{i}/{total}] {meta.tweet_id} ---")

        try:
            run_metadata(state, meta)
            state.save()

            run_research(state, meta, force=force)
            state.save()

            run_write(state, meta, model=model, force=force)
            state.save()

            entry = state.get(meta.tweet_id)
            if entry and entry.get("status") == "written":
                success += 1
                print(f"  OK: {meta.tweet_id}")
            else:
                failed += 1
                print(f"  FAIL: {meta.tweet_id}")
        except KeyboardInterrupt:
            print("\nInterrupted, saving state...")
            state.save()
            return 1
        except Exception as exc:
            logger.exception("Error processing %s", meta.tweet_id)
            state.upsert(meta.tweet_id, status="failed", last_error=str(exc))
            state.save()
            failed += 1
            print(f"  ERROR: {meta.tweet_id}: {exc}")

        # Rate limit: pause between articles
        if i < total:
            time.sleep(2)

    print(f"\nBatch complete: {success} success, {failed} failed")
    return 0 if failed == 0 else 1


def cmd_research_only(args: argparse.Namespace) -> int:
    """Run only the research step."""
    tweet_id = args.id
    state = _load_state()

    draft_path = find_deep_draft_by_id(OUTPUT_DIR, tweet_id)
    if not draft_path:
        print(f"ERROR: No deep draft found for {tweet_id}", file=sys.stderr)
        return 1

    meta = parse_deep_draft(draft_path)
    if not meta:
        print(f"ERROR: Could not parse {draft_path}", file=sys.stderr)
        return 1
    meta.tweet_id = tweet_id

    run_metadata(state, meta)
    state.save()

    ok = run_research(state, meta, force=getattr(args, "force", False))
    state.save()
    return 0 if ok else 1


def cmd_write_only(args: argparse.Namespace) -> int:
    """Run only the rewrite step (requires existing research)."""
    tweet_id = args.id
    state = _load_state()

    entry = state.get(tweet_id)
    if not entry:
        print(f"ERROR: No state found for {tweet_id}. Run research first.", file=sys.stderr)
        return 1

    meta_dict = entry.get("metadata", {})
    meta = ArticleMeta(
        tweet_id=tweet_id,
        title=meta_dict.get("title", ""),
        author=meta_dict.get("author", ""),
        author_name=meta_dict.get("author_name", ""),
        type=meta_dict.get("type", ""),
        url=meta_dict.get("url", ""),
        published_at=meta_dict.get("published_at", ""),
        stats=meta_dict.get("stats", {}),
        deep_draft_path=entry.get("deep_draft", ""),
        body_excerpt="",
    )

    ok = run_write(state, meta, model=getattr(args, "model", None), force=getattr(args, "force", False))
    state.save()
    return 0 if ok else 1


# =====================================================================
# Main
# =====================================================================


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Article pipeline: deep draft → research → rewrite → Notion",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s status
  %(prog)s run-one --id 2037365525542797367
  %(prog)s run-batch --limit 5 --resume
  %(prog)s research-only --id 2037365525542797367
  %(prog)s write-only --id 2037365525542797367 --model deepseek-chat
        """,
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Debug logging")

    sub = parser.add_subparsers(dest="command", help="Command to run")

    # status
    p_status = sub.add_parser("status", help="Show pipeline status")
    p_status.add_argument("--json", action="store_true", help="JSON output")

    # run-one
    p_one = sub.add_parser("run-one", help="Process a single article")
    p_one.add_argument("--id", required=True, help="Tweet ID")
    p_one.add_argument("--force", action="store_true", help="Force re-run all steps")
    p_one.add_argument("--model", default=None, help="Override rewrite model")
    p_one.add_argument("--no-research", action="store_true", help="Skip research step")
    p_one.add_argument("--no-write", action="store_true", help="Skip write step")

    # run-batch
    p_batch = sub.add_parser("run-batch", help="Process multiple articles")
    p_batch.add_argument("--limit", type=int, default=0, help="Max articles to process (0=all)")
    p_batch.add_argument("--resume", action="store_true", help="Skip already completed")
    p_batch.add_argument("--force", action="store_true", help="Force re-run all steps")
    p_batch.add_argument("--model", default=None, help="Override rewrite model")

    # research-only
    p_rsch = sub.add_parser("research-only", help="Run research step only")
    p_rsch.add_argument("--id", required=True, help="Tweet ID")
    p_rsch.add_argument("--force", action="store_true", help="Force re-run")

    # write-only
    p_write = sub.add_parser("write-only", help="Run rewrite step only")
    p_write.add_argument("--id", required=True, help="Tweet ID")
    p_write.add_argument("--model", default=None, help="Override rewrite model")
    p_write.add_argument("--force", action="store_true", help="Force re-run")

    args = parser.parse_args()
    _setup_logging(getattr(args, "verbose", False))

    if args.command == "status":
        return cmd_status(args)
    elif args.command == "run-one":
        return cmd_run_one(args)
    elif args.command == "run-batch":
        return cmd_run_batch(args)
    elif args.command == "research-only":
        return cmd_research_only(args)
    elif args.command == "write-only":
        return cmd_write_only(args)
    else:
        parser.print_help()
        return 0


if __name__ == "__main__":
    sys.exit(main())
