#!/usr/bin/env python3
"""Entry point for Twitter Bookmark Coordinator.

Usage:
    python3 bin/coordinator.py [options]
    cd /path/to/x-bookmark-reports && python3 bin/coordinator.py --help
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


def get_project_root() -> Path:
    """Get project root directory (parent of bin/)."""
    return Path(__file__).parent.parent


def setup_python_path(project_root: Path) -> None:
    """Add project root to Python path for imports."""
    root_str = str(project_root)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Process Twitter bookmarks and generate reports",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                      Run with default settings (incremental)
  %(prog)s --full               Force full reprocessing (skip cache)
  %(prog)s --limit 10           Process only first 10 bookmarks
  %(prog)s --id 2037365525542797367  Single deep report (default for --id)
  %(prog)s --id ... --batch       Legacy batch-style report for one id
  %(prog)s --format html          Generate HTML report (batch mode)
  %(prog)s --bookmarks /path/to/bookmarks.json  Use custom bookmarks file
  %(prog)s --output ./reports   Use custom output directory
  %(prog)s --deep-batch         One deep Markdown report per bookmark (resume supported)
  %(prog)s --deep-batch --batch-size 5 --no-resume
        """,
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Process all bookmarks (skip cache)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of bookmarks to process",
    )
    parser.add_argument(
        "--id",
        type=str,
        default=None,
        help="Process a single bookmark by tweet ID",
    )
    parser.add_argument(
        "--format",
        choices=["markdown", "html", "batch"],
        default="markdown",
        help="Report format: markdown/html for batch runs; use 'batch' with --id for legacy single-id batch report",
    )
    parser.add_argument(
        "--batch",
        action="store_true",
        help="With --id: use batch BookmarkReport instead of deep single report",
    )
    parser.add_argument(
        "--deep",
        "--single",
        action="store_true",
        dest="deep",
        help="With --id: single deep report (default; explicit alias)",
    )
    parser.add_argument(
        "--bookmarks",
        type=Path,
        default=None,
        help="Path to bookmarks JSON file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output directory for reports",
    )
    parser.add_argument(
        "--chdir",
        action="store_true",
        help="Change to project root directory before running",
    )
    parser.add_argument(
        "--replies",
        action="store_true",
        default=False,
        help="Fetch replies for each bookmark using TwitterAPI.io",
    )
    parser.add_argument(
        "--deep-batch",
        action="store_true",
        help="Generate one deep Markdown report per bookmark (with resume; not for use with --id)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=5,
        metavar="N",
        help="With --deep-batch: log a checkpoint every N successful reports (0=disable)",
    )
    parser.add_argument(
        "--no-resume",
        action="store_true",
        help="With --deep-batch: do not skip bookmark IDs listed in the state file",
    )
    parser.add_argument(
        "--resume-file",
        type=Path,
        default=None,
        help="With --deep-batch: path to resume state JSON (default: output/.deep-run-state.json)",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    if args.format == "batch" and not args.id:
        parser.error("--format batch is only valid with --id (single bookmark legacy mode)")
    if args.deep_batch and args.id:
        parser.error("--deep-batch cannot be used with --id")
    if args.deep_batch and args.format != "markdown":
        parser.error("--deep-batch only supports default markdown output (omit --format)")

    project_root = get_project_root()

    if args.chdir:
        os.chdir(project_root)
        print(f"Changed directory to: {project_root}")

    setup_python_path(project_root)

    from lib.coordinator import BookmarkCoordinator

    legacy_batch = bool(args.id) and (args.batch or (args.format == "batch"))
    single_deep = bool(args.id) and not legacy_batch
    report_format = "markdown" if args.format == "batch" else args.format

    coordinator = BookmarkCoordinator(
        bookmarks_path=args.bookmarks,
        output_dir=args.output,
        skip_cache=args.full,
        include_replies=args.replies or single_deep or args.deep_batch,
        deep_report=single_deep,
    )

    if args.deep_batch:
        result = coordinator.run_deep(
            limit=args.limit,
            batch_size=args.batch_size,
            resume_file=args.resume_file,
            resume=not args.no_resume,
        )
        if "error" in result:
            print(f"Error: {result['error']}")
            sys.exit(1)
        stats = result["stats"]
        paths = result.get("report_paths") or []
        print("\n" + "=" * 50)
        print("DEEP BATCH COMPLETE")
        print("=" * 50)
        print(f"Deep reports saved: {stats.get('deep_processed', 0)}")
        print(f"Skipped (resume): {stats.get('deep_skipped', 0)}")
        print(f"Failed: {stats.get('deep_failed', 0)}")
        print(f"Errors (total): {stats.get('errors', 0)}")
        print(f"Resume state: {result.get('resume_file', '')}")
        print(f"Report files: {len(paths)}")
        for p in paths[-10:]:
            print(f"  {p}")
        if len(paths) > 10:
            print(f"  ... and {len(paths) - 10} more")
        print(f"Time: {result['elapsed_seconds']:.1f}s")
        return

    if args.id:
        bookmarks = coordinator.load_bookmarks()
        bookmark = None
        for bm in bookmarks:
            if str(bm.get("id")) == str(args.id):
                bookmark = bm
                break

        if bookmark is None:
            print(f"Error: Bookmark with ID '{args.id}' not found")
            sys.exit(1)

        print(f"Processing single bookmark: {args.id}")
        started = datetime.now(timezone.utc)
        t0 = time.perf_counter()
        result = coordinator.process_bookmark(bookmark)
        elapsed = time.perf_counter() - t0

        if single_deep:
            if report_format != "markdown":
                print(
                    "Note: Deep single report is Markdown-only; "
                    f"writing Markdown instead of {report_format}."
                )
            report = coordinator.build_deep_report(result, started, elapsed)
            safe_id = "".join(c for c in str(args.id) if c.isalnum() or c in "-_")[:64]
            fname = f"bookmark-deep-{safe_id}-{started.strftime('%Y%m%d_%H%M%S')}.md"
            report_path = coordinator.save_report(report, format="markdown", filename=fname)
        else:
            report = coordinator.build_report([result], format=report_format)
            report_path = coordinator.save_report(report, format=report_format)
        print(f"\nReport saved to: {report_path}")
    else:
        result = coordinator.run(limit=args.limit, full=args.full)

        # Warn about errors but continue with partial results
        if "error" in result:
            print(f"Warning: {result['error']}")

        # Check if we have any bookmarks to report
        bookmarks = result.get("bookmarks", [])
        if not bookmarks:
            print("Error: No bookmarks were processed")
            sys.exit(1)

        stats = result["stats"]
        if stats.get("errors", 0) > 0:
            print(
                f"Warning: {stats['errors']} bookmark(s) failed to process "
                "(see error count below)"
            )

        report = coordinator.build_report(bookmarks, format=args.format)
        report_path = coordinator.save_report(report, format=args.format)
        data_path = coordinator.save_processed_data(bookmarks)

        print("\n" + "=" * 50)
        print("PROCESSING COMPLETE")
        print("=" * 50)
        print(f"Total processed: {stats['total']}")
        print(f"  - Articles: {stats['articles']}")
        print(f"  - Quoted tweets: {stats['quoted']}")
        print(f"  - GitHub links: {stats['github']}")
        print(f"  - External links: {stats['external']}")
        print(f"  - Errors: {stats['errors']}")
        print(f"\nReport: {report_path}")
        print(f"Data: {data_path}")
        print(f"Time: {result['elapsed_seconds']:.1f}s")


if __name__ == "__main__":
    main()
