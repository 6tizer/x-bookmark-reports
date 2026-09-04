"""产品统一时区工具（默认 Asia/Singapore）。

所有面向用户展示的日期（Notion「发布时间」、报告里的「Bookmarked」、成文 generated_at 等）
都必须经过这里转换，避免直接对 UTC 时间戳做 ``.date()`` / ``[:10]`` 截取导致
新加坡 00:00–08:00 的内容被记到前一天（B-NOTION-PUBDATE-UTC）。

只依赖标准库，方便 ``bin/`` 下独立脚本直接导入。
时区可用环境变量 ``APP_TIMEZONE`` 覆盖。
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

# 产品时区名（IANA），默认新加坡；.env 里 APP_TIMEZONE 可覆盖
APP_TIMEZONE: str = (os.getenv("APP_TIMEZONE") or "Asia/Singapore").strip() or "Asia/Singapore"

try:
    LOCAL_TZ = ZoneInfo(APP_TIMEZONE)
except Exception:  # 配错时区名时回退新加坡，不让整条管线挂掉
    APP_TIMEZONE = "Asia/Singapore"
    LOCAL_TZ = ZoneInfo(APP_TIMEZONE)

# 推文时间戳的两种历史格式（rettiwt v4 Twitter native / v7 ISO 8601）
_TWITTER_NATIVE_FORMATS = ("%a %b %d %H:%M:%S %z %Y", "%a %b %d %H:%M:%S +0000 %Y")


def now_local() -> datetime:
    """当前时间（产品时区，带 tzinfo）。"""
    return datetime.now(LOCAL_TZ)


def to_local(dt: datetime) -> datetime:
    """任意 datetime → 产品时区。naive 视为 UTC（项目历史上所有 naive 时间戳都是 UTC）。"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(LOCAL_TZ)


def parse_any(raw: str) -> Optional[datetime]:
    """解析项目里出现过的各种时间字符串为带 tz 的 datetime；解析失败返回 None。

    支持：ISO 8601（含 ``Z`` 后缀）、Twitter native（``Tue Mar 31 09:39:04 +0000 2026``）。
    """
    if not raw:
        return None
    s = str(raw).strip()
    for fmt in _TWITTER_NATIVE_FORMATS:
        try:
            dt = datetime.strptime(s, fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def local_date_str(raw: str | datetime, fmt: str = "%Y-%m-%d") -> Optional[str]:
    """时间字符串/datetime → 产品时区下的日期字符串（默认 ``YYYY-MM-DD``）。无法解析返回 None。"""
    dt = raw if isinstance(raw, datetime) else parse_any(raw)
    if dt is None:
        return None
    return to_local(dt).strftime(fmt)
