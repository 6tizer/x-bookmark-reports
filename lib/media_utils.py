"""Parse media arrays from bookmark JSON (images, video URLs, thumbnails)."""

from __future__ import annotations

from typing import Any, Optional


def _best_size(sizes: Any) -> tuple[int, int]:
    """Return (width, height) from Twitter `sizes` or similar dict."""
    if not isinstance(sizes, dict):
        return 0, 0
    best_w, best_h = 0, 0
    for _name, dim in sizes.items():
        if not isinstance(dim, dict):
            continue
        w = int(dim.get("w") or dim.get("width") or 0)
        h = int(dim.get("h") or dim.get("height") or 0)
        if w * h > best_w * best_h:
            best_w, best_h = w, h
    return best_w, best_h


def _image_url(m: dict) -> str:
    return (
        m.get("url")
        or m.get("media_url_https")
        or m.get("mediaUrl")
        or ""
    )


def _video_urls(m: dict) -> list[str]:
    """Collect MP4 / HLS URLs from variants or direct fields."""
    urls: list[str] = []
    vm = m.get("video_info") or m.get("videoInfo") or {}
    if isinstance(vm, dict):
        for v in vm.get("variants") or []:
            if isinstance(v, dict):
                u = v.get("url")
                if u and u not in urls:
                    urls.append(u)
    for key in ("url", "playbackUrl", "playback_url"):
        u = m.get(key)
        if isinstance(u, str) and u.startswith("http") and u not in urls:
            urls.append(u)
    return urls


def _duration_seconds(m: dict) -> float:
    ms = m.get("duration_millis") or m.get("durationMillis")
    if ms is None and isinstance(m.get("video_info"), dict):
        ms = m["video_info"].get("duration_millis")
    if ms is None and isinstance(m.get("videoInfo"), dict):
        ms = m["videoInfo"].get("duration_millis")
    try:
        if ms is not None:
            return round(float(ms) / 1000.0, 2)
    except (TypeError, ValueError):
        pass
    return 0.0


def _thumbnail(m: dict) -> str:
    direct = m.get("thumbnailUrl") or m.get("thumbnail_url") or ""
    if direct:
        return direct
    vi = m.get("video_info")
    if isinstance(vi, dict):
        return vi.get("thumbnail_url") or ""
    return ""


def extract_media_details(media_list: Optional[list]) -> dict[str, Any]:
    """
    Parse bookmark `media` array into structured image/video details.

    Returns:
        dict with keys: images (list), videos (list), raw_count (int)
    """
    images: list[dict[str, Any]] = []
    videos: list[dict[str, Any]] = []

    for m in media_list or []:
        if not isinstance(m, dict):
            continue
        mtype = (m.get("type") or "").lower()
        if mtype in ("photo", "image", "animated_gif"):
            sizes = m.get("sizes") or m.get("large") or {}
            w, h = _best_size(sizes)
            if not w and not h:
                w = int(m.get("width") or 0)
                h = int(m.get("height") or 0)
            images.append({
                "url": _image_url(m),
                "width": w,
                "height": h,
                "type": mtype,
            })
        elif mtype in ("video",):
            vurls = _video_urls(m)
            videos.append({
                "urls": vurls,
                "duration_seconds": _duration_seconds(m),
                "thumbnail_url": _thumbnail(m),
                "type": mtype,
            })
        else:
            # Unknown: try to infer
            if m.get("video_info") or m.get("videoInfo") or m.get("duration_millis"):
                vurls = _video_urls(m)
                videos.append({
                    "urls": vurls,
                    "duration_seconds": _duration_seconds(m),
                    "thumbnail_url": _thumbnail(m),
                    "type": mtype or "video",
                })
            elif _image_url(m):
                images.append({
                    "url": _image_url(m),
                    "width": 0,
                    "height": 0,
                    "type": mtype or "photo",
                })

    return {
        "images": images,
        "videos": videos,
        "raw_count": len(media_list or []),
    }
