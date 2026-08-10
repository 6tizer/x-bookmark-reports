"""Rewrite module — DeepSeek article generation."""

from __future__ import annotations

import json as _json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from lib.config import (
    ARTICLE_FINAL_DIR,
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL,
)

logger = logging.getLogger(__name__)


class ContentPolicyError(Exception):
    """DeepSeek 内容审核拒绝（Content Exists Risk），永久性拒绝不可重试。"""


_PROMPTS_DIR = Path(__file__).parent / "prompts"

# Emoji candidates for auto icon selection based on keywords
_ICON_MAP: List[tuple] = [
    (["ai", "llm", "gpt", "claude", "gemini", "deepseek", "model", "agent"], "\U0001f916"),
    (["tool", "dev", "开发", "工具", "cli", "sdk", "api"], "\U0001f6e0\ufe0f"),
    (["browser", "浏览器", "web", "chrome", "firefox"], "\U0001f310"),
    (["voice", "语音", "audio", "speech", "tts", "stt"], "\U0001f399\ufe0f"),
    (["search", "搜索", "retrieval", "rag", "engine"], "\U0001f50d"),
    (["security", "privacy", "安全", "隐私", "encrypt"], "\U0001f512"),
    (["blockchain", "crypto", "defi", "web3", "链"], "\u26d3\ufe0f"),
    (["data", "分析", "analytics", "dashboard", "可视化"], "\U0001f4ca"),
    (["open source", "开源", "github", "oss"], "\U0001f4a1"),
    (["tutorial", "教程", "guide", "指南", "入门"], "\U0001f4d6"),
    (["design", "ui", "ux", "设计", "figma"], "\U0001f3a8"),
    (["database", "存储", "storage", "db"], "\U0001f4be"),
    (["mobile", "ios", "android", "app"], "\U0001f4f1"),
]


def _load_system_prompt() -> str:
    p = _PROMPTS_DIR / "system_rewrite.txt"
    if p.exists():
        return p.read_text(encoding="utf-8")
    return "你是一个专业的技术写作助手。"


def _pick_icon(title: str, body: str) -> str:
    """Pick an emoji icon based on content keywords."""
    combined = (title + " " + body[:2000]).lower()
    for keywords, emoji in _ICON_MAP:
        for kw in keywords:
            if kw in combined:
                return emoji
    return "\U0001f4cc"  # default: pin


def _extract_title_from_body(body: str) -> str:
    """Extract the first H1 from the rewritten body."""
    for line in body.split("\n"):
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            return stripped[2:].strip()
    return ""


def _extract_tags(title: str, body: str) -> List[str]:
    """Extract plausible tags from title + body content."""
    text = (title + " " + body[:3000]).lower()
    tags: List[str] = []

    # Common tech keywords
    candidates = [
        ("AI", ["ai ", "artificial intelligence", "machine learning"]),
        ("LLM", ["llm", "large language model", "gpt", "claude", "gemini"]),
        ("开源", ["open source", "开源", "github"]),
        ("开发工具", ["developer tool", "开发工具", "cli", "sdk"]),
        ("安全", ["security", "隐私", "privacy", "encrypt"]),
        ("区块链", ["blockchain", "crypto", "web3", "defi"]),
        ("数据可视化", ["visualization", "可视化", "dashboard"]),
        ("搜索", ["search", "搜索引擎", "retrieval"]),
        ("自动化", ["automation", "自动化", "workflow"]),
        ("浏览器", ["browser", "浏览器", "extension"]),
    ]
    for tag, keywords in candidates:
        for kw in keywords:
            if kw in text:
                tags.append(tag)
                break
    return tags[:5]


class Rewriter:
    """Generate finished articles via DeepSeek."""

    def __init__(self) -> None:
        self._client: Any = None
        self._system_prompt = _load_system_prompt()

    def _get_client(self) -> Any:
        if self._client is None:
            if not DEEPSEEK_API_KEY:
                raise ValueError("DEEPSEEK_API_KEY not configured")
            from openai import OpenAI

            self._client = OpenAI(
                api_key=DEEPSEEK_API_KEY,
                base_url=DEEPSEEK_BASE_URL,
            )
        return self._client

    def rewrite(
        self,
        meta: Dict[str, Any],
        body: str,
        research_text: str,
        model: Optional[str] = None,
    ) -> str:
        """Generate a finished article.

        Args:
            meta: ArticleMeta dict.
            body: Deep draft body text.
            research_text: Formatted research bundle text.
            model: Override default model.

        Returns:
            Complete Markdown with frontmatter.
        """
        client = self._get_client()
        use_model = model or DEEPSEEK_MODEL

        user_content = self._build_user_message(meta, body, research_text)
        logger.info(
            "DeepSeek rewrite: model=%s, input ~%d chars",
            use_model,
            len(user_content),
        )

        try:
            resp = client.chat.completions.create(
                model=use_model,
                messages=[
                    {"role": "system", "content": self._system_prompt},
                    {"role": "user", "content": user_content},
                ],
                temperature=0.7,
                # reasoning 模型（v4-flash/v4-pro）的 reasoning_content 会占用 max_tokens 配额。
                # 实测：v4-flash 长输入 reasoning≈6.4k tokens + 正文≈0.9k，4096/8192 都会被 reasoning
                # 吃光导致正文 content=0（finish_reason=length）。16384 给 reasoning+正文留足空间。
                max_tokens=16384,
            )
        except Exception as e:
            # DeepSeek 内容审核拒绝是永久性错误，抛专门异常让上层标 skipped
            msg = str(e)
            if "Content Exists Risk" in msg or "content_policy" in msg.lower():
                raise ContentPolicyError(msg) from e
            raise

        article_body = resp.choices[0].message.content or ""
        logger.info("DeepSeek rewrite done: %d chars output", len(article_body))

        # 空正文防御：content 为空（reasoning 占满 max_tokens 导致 finish_reason=length）
        # 时抛错让上层标 failed 重试，而不是保存空文件污染 Notion
        if not article_body.strip():
            finish = getattr(resp.choices[0], "finish_reason", "?")
            raise ValueError(
                f"DeepSeek returned empty content (finish_reason={finish}); "
                "likely max_tokens exhausted by reasoning_content"
            )

        # Extract title from the generated body
        gen_title = _extract_title_from_body(article_body)
        if not gen_title:
            gen_title = meta.get("title") or ""

        # Clean the title (remove leading # if somehow still there)
        gen_title = gen_title.lstrip("#").strip()

        # 占位/坏标题防御：素材不足、密码保护、未命名文章、空 → 回退 meta.title
        _BAD_TITLE_MARKERS = ("素材不足", "密码保护", "未命名文章")
        if (not gen_title) or any(m in gen_title for m in _BAD_TITLE_MARKERS):
            fallback = (meta.get("title") or "").strip()
            if fallback and not any(m in fallback for m in _BAD_TITLE_MARKERS):
                logger.warning(
                    "Rejecting placeholder title %r; falling back to meta.title %r",
                    gen_title,
                    fallback,
                )
                gen_title = fallback
            else:
                raise ValueError(
                    f"Invalid article title after rewrite: {gen_title!r} "
                    f"(meta.title={fallback!r}); marking failed"
                )

        # Remove the H1 from body (it will go into frontmatter)
        article_clean = re.sub(r"^#\s+.+\n?", "", article_body, count=1, flags=re.MULTILINE)
        article_clean = article_clean.strip()

        # Pick icon and tags
        icon = _pick_icon(gen_title, article_clean)
        tags = _extract_tags(gen_title, article_clean)

        # Build frontmatter
        now = datetime.now(timezone.utc).isoformat()
        source_url = meta.get("url") or ""
        author = meta.get("author") or ""

        frontmatter = (
            f"---\n"
            f"title: \"{gen_title}\"\n"
            f"author: \"{author}\"\n"
            f"source_url: \"{source_url}\"\n"
            f"tags: {json_dumps_tags(tags)}\n"
            f"notion_icon: \"{icon}\"\n"
            f"generated_at: \"{now}\"\n"
            f"---\n"
        )

        return frontmatter + "\n" + article_clean

    def _build_user_message(
        self,
        meta: Dict[str, Any],
        body: str,
        research_text: str,
    ) -> str:
        parts: List[str] = []
        parts.append("## 原始素材\n")
        if meta.get("title"):
            parts.append(f"标题: {meta['title']}")
        if meta.get("author"):
            parts.append(f"作者: {meta['author']}")
        if meta.get("url"):
            parts.append(f"链接: {meta['url']}")

        # Truncate body to avoid excessive token usage
        max_body = 8000
        body_text = body[:max_body]
        if len(body) > max_body:
            body_text += "\n\n... (原始素材已截断)"
        parts.append(f"\n{body_text}")

        if research_text:
            parts.append("\n\n## 搜索研究结果\n")
            max_research = 8000
            rt = research_text[:max_research]
            if len(research_text) > max_research:
                rt += "\n\n... (研究结果已截断)"
            parts.append(rt)

        return "\n".join(parts)


def json_dumps_tags(tags: List[str]) -> str:
    """Dump tags as a JSON array string for YAML frontmatter."""
    return _json.dumps(tags, ensure_ascii=False)


def save_final(tweet_id: str, content: str) -> Path:
    """Save finished article to disk and return the path."""
    ARTICLE_FINAL_DIR.mkdir(parents=True, exist_ok=True)
    path = ARTICLE_FINAL_DIR / f"{tweet_id}.md"
    path.write_text(content, encoding="utf-8")
    return path


def parse_final_frontmatter(content: str) -> Dict[str, Any]:
    """Parse frontmatter from a finished article .md file."""
    meta: Dict[str, Any] = {}
    if not content.startswith("---"):
        return meta
    end = content.find("\n---", 3)
    if end == -1:
        return meta
    fm_block = content[3:end].strip()

    for line in fm_block.splitlines():
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()
        # Remove surrounding quotes
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
            val = val[1:-1]
        # Try to parse JSON arrays (for tags)
        if val.startswith("["):
            try:
                val = _json.loads(val)
            except _json.JSONDecodeError:
                pass
        meta[key] = val
    return meta
