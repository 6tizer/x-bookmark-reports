"""Research module — x.ai Responses API + Exa dual-path search."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from lib.config import (
    ARTICLE_RESEARCH_DIR,
    EXA_API_KEY,
    EXA_BASE_URL,
    XAI_API_KEY,
    XAI_BASE_URL,
    XAI_MODEL,
)

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).parent / "prompts"


def _load_prompt(name: str) -> str:
    p = _PROMPTS_DIR / name
    if p.exists():
        return p.read_text(encoding="utf-8")
    return ""


def _extract_text_from_responses(response: Any) -> str:
    """Extract text content from x.ai responses.create() output.

    The Responses API returns output items; we collect all text parts.
    """
    # Try common response shapes
    text_parts: List[str] = []

    # Shape 1: response.output is a list of items
    output = getattr(response, "output", None)
    if output is None:
        output = getattr(response, "output_items", None)

    if isinstance(output, list):
        for item in output:
            content = getattr(item, "content", None)
            if isinstance(content, str):
                text_parts.append(content)
            elif isinstance(content, list):
                for part in content:
                    text = getattr(part, "text", None)
                    if text:
                        text_parts.append(text)
            # Some items have .text directly
            elif hasattr(item, "text") and item.text:
                text_parts.append(item.text)

    # Shape 2: response has .output_text or direct attribute
    if not text_parts:
        out_text = getattr(response, "output_text", None)
        if out_text:
            text_parts.append(out_text)

    # Shape 3: response has output[0].content[0].text
    if not text_parts and hasattr(response, "__getitem__"):
        try:
            first = response[0] if isinstance(response, list) else None
            if first:
                ct = getattr(first, "content", None)
                if isinstance(ct, list) and ct:
                    text_parts.append(getattr(ct[0], "text", str(ct[0])))
        except (IndexError, TypeError, KeyError):
            pass

    # Shape 4: response.output is a string
    if not text_parts and isinstance(output, str):
        text_parts.append(output)

    # Fallback: str()
    if not text_parts:
        text_parts.append(str(response))

    return "\n".join(text_parts)


def _extract_sources_from_responses(response: Any) -> List[str]:
    """Extract source URLs from x.ai responses (citations)."""
    sources: List[str] = []
    # Try citations attribute
    citations = getattr(response, "citations", None)
    if isinstance(citations, list):
        for c in citations:
            if isinstance(c, str):
                sources.append(c)
            elif isinstance(c, dict):
                url = c.get("url") or c.get("citation_url", "")
                if url:
                    sources.append(url)
    return sources


@dataclass
class ResearchBundle:
    """Structured output from the research step."""

    topic: str = ""
    competitors: List[Dict[str, str]] = field(default_factory=list)
    community_feedback: str = ""
    github_stats: Optional[Dict[str, Any]] = None
    author_background: str = ""
    key_insights: List[str] = field(default_factory=list)
    raw_xai_response: str = ""
    raw_exa_response: str = ""
    sources: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "topic": self.topic,
            "competitors": self.competitors,
            "community_feedback": self.community_feedback,
            "github_stats": self.github_stats,
            "author_background": self.author_background,
            "key_insights": self.key_insights,
            "raw_xai_response": self.raw_xai_response[:4000],
            "raw_exa_response": self.raw_exa_response[:4000],
            "sources": self.sources,
        }

    def to_text(self) -> str:
        """Human-readable text for feeding into the rewrite step."""
        parts: List[str] = []
        if self.topic:
            parts.append(f"## 主题\n{self.topic}")
        if self.competitors:
            parts.append("## 竞品对比")
            for c in self.competitors:
                parts.append(f"- **{c.get('name', '')}**: {c.get('description', '')}")
        if self.community_feedback:
            parts.append(f"## 社区反馈\n{self.community_feedback}")
        if self.github_stats:
            parts.append("## GitHub 项目")
            parts.append(
                f"Stars: {self.github_stats.get('stars', 'N/A')}, "
                f"最近更新: {self.github_stats.get('last_updated', 'N/A')}, "
                f"Contributors: {self.github_stats.get('contributors', 'N/A')}, "
                f"License: {self.github_stats.get('license', 'N/A')}"
            )
        if self.author_background:
            parts.append(f"## 作者背景\n{self.author_background}")
        if self.key_insights:
            parts.append("## 关键发现")
            for i, ins in enumerate(self.key_insights, 1):
                parts.append(f"{i}. {ins}")
        if self.sources:
            parts.append("## 来源")
            for s in self.sources:
                parts.append(f"- {s}")
        return "\n\n".join(parts)


class Researcher:
    """Run research via x.ai (primary) and Exa (supplementary)."""

    def __init__(self) -> None:
        self._xai_client: Any = None
        self._exa_client: Any = None
        self._system_prompt = _load_prompt("system_research.txt")

    def _get_xai_client(self) -> Any:
        if self._xai_client is None:
            if not XAI_API_KEY:
                raise ValueError("XAI_API_KEY not configured")
            from openai import OpenAI

            self._xai_client = OpenAI(
                api_key=XAI_API_KEY,
                base_url=XAI_BASE_URL,
            )
        return self._xai_client

    def _get_exa_client(self) -> Any:
        if self._exa_client is None:
            if not EXA_API_KEY:
                return None
            from openai import OpenAI

            self._exa_client = OpenAI(
                api_key=EXA_API_KEY,
                base_url=EXA_BASE_URL,
            )
        return self._exa_client

    def research(
        self,
        meta: Dict[str, Any],
        body_excerpt: str,
    ) -> ResearchBundle:
        """Run research for a single article.

        Args:
            meta: ArticleMeta dict (title, author, type, url, etc.)
            body_excerpt: First N chars of the deep draft body.

        Returns:
            ResearchBundle with structured findings.
        """
        bundle = ResearchBundle()
        topic = meta.get("title") or meta.get("url") or "unknown topic"
        query = self._build_query(meta, body_excerpt)

        # --- x.ai ---
        xai_text = ""
        xai_sources: List[str] = []
        try:
            client = self._get_xai_client()
            logger.info("x.ai research: querying '%s' (model=%s)", topic[:60], XAI_MODEL)

            # Try Responses API first (supports web_search + x_search)
            try:
                response = client.responses.create(
                    model=XAI_MODEL,
                    input=[
                        {"role": "system", "content": self._system_prompt},
                        {"role": "user", "content": query},
                    ],
                    tools=[
                        {"type": "web_search"},
                        {"type": "x_search"},
                    ],
                )
                xai_text = _extract_text_from_responses(response)
                xai_sources = _extract_sources_from_responses(response)
            except Exception as resp_err:
                # Fallback: chat.completions without search tools
                logger.warning(
                    "x.ai responses.create() failed (%s), falling back to chat.completions",
                    resp_err,
                )
                resp = client.chat.completions.create(
                    model=XAI_MODEL,
                    messages=[
                        {"role": "system", "content": self._system_prompt},
                        {"role": "user", "content": query},
                    ],
                )
                xai_text = resp.choices[0].message.content or ""
                xai_sources = []

            bundle.raw_xai_response = xai_text
            bundle.sources.extend(xai_sources)
            logger.info("x.ai research done: %d chars, %d sources", len(xai_text), len(xai_sources))

        except Exception as exc:
            logger.error("x.ai research failed: %s", exc)
            bundle.raw_xai_response = f"[x.ai error: {exc}]"

        # --- Exa (optional supplement) ---
        exa_client = self._get_exa_client()
        if exa_client is not None:
            try:
                logger.info("Exa research: supplementing for '%s'", topic[:60])
                exa_query = f"对以下主题进行深度研究，补充竞品分析、社区反馈和项目背景：{topic}\n\n{body_excerpt[:1000]}"
                exa_resp = exa_client.chat.completions.create(
                    model="exa-research",
                    messages=[
                        {"role": "system", "content": self._system_prompt},
                        {"role": "user", "content": exa_query},
                    ],
                )
                exa_text = exa_resp.choices[0].message.content or ""
                bundle.raw_exa_response = exa_text
                logger.info("Exa research done: %d chars", len(exa_text))
            except Exception as exc:
                logger.warning("Exa research failed (non-fatal): %s", exc)
                bundle.raw_exa_response = f"[Exa error: {exc}]"

        # Parse structured data from combined text
        self._parse_research(bundle, xai_text)
        return bundle

    def _build_query(self, meta: Dict[str, Any], body_excerpt: str) -> str:
        """Build the research query from meta + body."""
        title = meta.get("title", "")
        author = meta.get("author", "")
        url = meta.get("url", "")
        bm_type = meta.get("type", "")

        parts: List[str] = []
        if title:
            parts.append(f"原始素材标题: {title}")
        if author:
            parts.append(f"作者: {author}")
        if url:
            parts.append(f"来源链接: {url}")
        if bm_type:
            parts.append(f"类型: {bm_type}")
        parts.append(f"\n原始素材摘要:\n{body_excerpt[:3000]}")
        parts.append(
            "\n\n请搜索补充信息，包括：竞品/同类方案对比、"
            "真实用户使用体验、GitHub项目活跃度（如适用）、作者团队背景。"
        )
        return "\n".join(parts)

    def _parse_research(self, bundle: ResearchBundle, text: str) -> None:
        """Best-effort extraction of structured fields from raw text."""
        if not text:
            return
        # Try to parse as JSON first
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                bundle.topic = data.get("topic", bundle.topic)
                if isinstance(data.get("competitors"), list):
                    bundle.competitors = data["competitors"]
                bundle.community_feedback = data.get("community_feedback", bundle.community_feedback)
                if data.get("github_stats"):
                    bundle.github_stats = data["github_stats"]
                bundle.author_background = data.get("author_background", bundle.author_background)
                if isinstance(data.get("key_insights"), list):
                    bundle.key_insights = data["key_insights"]
                return
        except json.JSONDecodeError:
            pass

        # Fallback: treat entire text as the research summary
        lines = text.split("\n")
        # Try to extract a topic from the first meaningful line
        for line in lines:
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                bundle.topic = stripped[:200]
                break

        # Use the full text as community feedback fallback
        bundle.community_feedback = text[:2000]
        if not bundle.key_insights:
            # Extract lines that look like insights
            for line in lines:
                s = line.strip()
                if s.startswith(("- ", "* ", "1.", "2.", "3.", "4.", "5.")):
                    bundle.key_insights.append(s.lstrip("-*0123456789. "))


def save_bundle(tweet_id: str, bundle: ResearchBundle) -> Path:
    """Save research bundle to disk and return the path."""
    ARTICLE_RESEARCH_DIR.mkdir(parents=True, exist_ok=True)
    path = ARTICLE_RESEARCH_DIR / f"{tweet_id}.json"
    path.write_text(
        json.dumps(bundle.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return path


def load_bundle(tweet_id: str) -> Optional[ResearchBundle]:
    """Load a previously saved research bundle."""
    path = ARTICLE_RESEARCH_DIR / f"{tweet_id}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return ResearchBundle(
            topic=data.get("topic", ""),
            competitors=data.get("competitors", []),
            community_feedback=data.get("community_feedback", ""),
            github_stats=data.get("github_stats"),
            author_background=data.get("author_background", ""),
            key_insights=data.get("key_insights", []),
            raw_xai_response=data.get("raw_xai_response", ""),
            raw_exa_response=data.get("raw_exa_response", ""),
            sources=data.get("sources", []),
        )
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Could not load research bundle %s: %s", path, exc)
        return None
