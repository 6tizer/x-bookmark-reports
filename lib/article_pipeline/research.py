"""Research module — SearXNG 主 + Firecrawl 备 + xAI / Exa Search 可选补充."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

from lib import config
from lib.config import (
    ARTICLE_RESEARCH_DIR,
    EXA_API_KEY,
    EXA_BASE_URL,
    FIRECRAWL_API_KEY,
    FIRECRAWL_BASE_URL,
    SEARXNG_BASE_URL,
    XAI_API_KEY,
    XAI_BASE_URL,
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
    raw_searxng_response: str = ""
    raw_firecrawl_response: str = ""
    search_results_text: str = ""
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
            "raw_searxng_response": self.raw_searxng_response[:4000],
            "raw_firecrawl_response": self.raw_firecrawl_response[:4000],
            "search_results_text": self.search_results_text[:8000],
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
        if self.search_results_text:
            parts.append(f"## 搜索结果\n{self.search_results_text}")
        if self.sources:
            parts.append("## 来源")
            for s in self.sources:
                parts.append(f"- {s}")
        return "\n\n".join(parts)


class Researcher:
    """研究编排：xAI（可选）→ SearXNG（主）→ Firecrawl（备）→ Exa Search（可选补充）。"""

    def __init__(self) -> None:
        self._xai_client: Any = None
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

    # --- 搜索后端（全部 fail-soft：异常由调用方捕获记录，不向上抛） ---

    def _search_searxng(self, query: str, limit: int = 10) -> List[Dict[str, str]]:
        """SearXNG 主搜索：GET /search?q=...&format=json，取 results[]。"""
        resp = requests.get(
            f"{SEARXNG_BASE_URL.rstrip('/')}/search",
            params={"q": query, "format": "json"},
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        results: List[Dict[str, str]] = []
        for item in (data.get("results") or [])[:limit]:
            results.append({
                "title": str(item.get("title") or ""),
                "url": str(item.get("url") or ""),
                "content": str(item.get("content") or ""),
            })
        return results

    def _search_firecrawl(self, query: str, limit: int = 5) -> List[Dict[str, str]]:
        """Firecrawl 备用搜索：POST {base}/search；无 key 时 Keyless（不带 Authorization）。"""
        headers: Dict[str, str] = {"Content-Type": "application/json"}
        if FIRECRAWL_API_KEY:
            headers["Authorization"] = f"Bearer {FIRECRAWL_API_KEY}"
        resp = requests.post(
            f"{FIRECRAWL_BASE_URL.rstrip('/')}/search",
            headers=headers,
            json={"query": query, "limit": limit},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        results: List[Dict[str, str]] = []
        for item in ((data.get("data") or {}).get("web") or [])[:limit]:
            results.append({
                "title": str(item.get("title") or ""),
                "url": str(item.get("url") or ""),
                "content": str(item.get("description") or item.get("content") or ""),
            })
        return results

    def _search_exa(self, query: str, limit: int = 5) -> List[Dict[str, str]]:
        """Exa 可选补充：POST {EXA_BASE_URL}/search（REST + x-api-key；非已退役的 exa-research 模型）。"""
        resp = requests.post(
            f"{EXA_BASE_URL.rstrip('/')}/search",
            headers={"x-api-key": EXA_API_KEY, "Content-Type": "application/json"},
            json={"query": query, "numResults": limit},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        results: List[Dict[str, str]] = []
        for item in (data.get("results") or [])[:limit]:
            results.append({
                "title": str(item.get("title") or ""),
                "url": str(item.get("url") or ""),
                "content": str(item.get("text") or item.get("summary") or ""),
            })
        return results

    @staticmethod
    def _format_search_results(results: List[Dict[str, str]]) -> str:
        """把搜索结果（标题/URL/摘要）拼成 markdown，供 to_text() 传给 rewrite 步骤。"""
        lines: List[str] = []
        for r in results:
            title = r.get("title") or "(no title)"
            url = r.get("url") or ""
            snippet = (r.get("content") or "").strip()
            lines.append(f"- [{title}]({url})")
            if snippet:
                lines.append(f"  {snippet[:300]}")
        return "\n".join(lines)

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
        # topic 默认设为 meta 标题，保证 xAI 缺席时 bundle.topic 非空
        topic = meta.get("title") or meta.get("url") or "unknown topic"
        bundle.topic = topic
        query = self._build_query(meta, body_excerpt)
        # 搜索引擎用简洁查询词（标题优先），区别于喂给 xAI 的长 prompt
        search_query = meta.get("title") or body_excerpt[:200] or topic

        # --- x.ai ---
        xai_text = ""
        xai_sources: List[str] = []
        try:
            client = self._get_xai_client()
            logger.info("x.ai research: querying '%s' (model=%s)", topic[:60], config.XAI_MODEL)

            # Try Responses API first (supports web_search + x_search)
            try:
                response = client.responses.create(
                    model=config.XAI_MODEL,
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
                    model=config.XAI_MODEL,
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

        # --- SearXNG（主搜索，必跑；失败 fail-soft 仅记录） ---
        searxng_results: List[Dict[str, str]] = []
        try:
            logger.info("SearXNG search: '%s'", search_query[:60])
            searxng_results = self._search_searxng(search_query, limit=10)
            bundle.raw_searxng_response = json.dumps(searxng_results, ensure_ascii=False)
            logger.info("SearXNG search done: %d results", len(searxng_results))
        except Exception as exc:
            logger.warning("SearXNG search failed: %s", exc)
            bundle.raw_searxng_response = f"[searxng error: {exc}]"

        # --- Firecrawl（备用：仅 SearXNG 失败或 0 结果时启用） ---
        firecrawl_results: List[Dict[str, str]] = []
        if not searxng_results:
            try:
                logger.info("Firecrawl search (fallback): '%s'", search_query[:60])
                firecrawl_results = self._search_firecrawl(search_query, limit=5)
                bundle.raw_firecrawl_response = json.dumps(firecrawl_results, ensure_ascii=False)
                logger.info("Firecrawl search done: %d results", len(firecrawl_results))
            except Exception as exc:
                logger.warning("Firecrawl search failed: %s", exc)
                bundle.raw_firecrawl_response = f"[firecrawl error: {exc}]"

        # --- Exa /search（可选补充，有 key 时；REST 端点，非已退役的 exa-research 模型） ---
        exa_results: List[Dict[str, str]] = []
        if EXA_API_KEY:
            try:
                logger.info("Exa /search supplement: '%s'", search_query[:60])
                exa_results = self._search_exa(search_query, limit=5)
                bundle.raw_exa_response = json.dumps(exa_results, ensure_ascii=False)
                logger.info("Exa /search done: %d results", len(exa_results))
            except Exception as exc:
                logger.warning("Exa /search failed: %s", exc)
                bundle.raw_exa_response = f"[exa error: {exc}]"

        # 汇总搜索结果：URL 去重进 sources；markdown 进 search_results_text 供 rewrite 使用
        all_results = searxng_results + firecrawl_results + exa_results
        seen_urls = set(bundle.sources)
        for r in all_results:
            u = r.get("url") or ""
            if u and u not in seen_urls:
                seen_urls.add(u)
                bundle.sources.append(u)
        bundle.search_results_text = self._format_search_results(all_results)

        # Parse structured data from combined text（xAI 缺席时保留 meta 标题作为 topic）
        self._parse_research(bundle, xai_text)
        if not bundle.topic:
            bundle.topic = topic
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
            raw_searxng_response=data.get("raw_searxng_response", ""),
            raw_firecrawl_response=data.get("raw_firecrawl_response", ""),
            search_results_text=data.get("search_results_text", ""),
            sources=data.get("sources", []),
        )
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Could not load research bundle %s: %s", path, exc)
        return None
