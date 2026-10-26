#!/usr/bin/env python3
"""网络环境检测与自动修复：找出当前能访问 X / Notion 的那条路，写入 cache/network_profile.json。

候选顺序（先到先得；--all 时全部探测便于 WebUI 展示）：
  1. manual       —— 命令行 --proxy 传入（WebUI 手填）
  2. env_file     —— .env 里的 PROXY
  3. saved        —— 上次检测选中的代理（保证 launchd 环境下也能沿用 shell 里检测到的代理）
  4. system       —— macOS 系统代理（Clash / Surge 开「系统代理」时会写这里）
  5. process_env  —— 当前进程环境变量 HTTPS_PROXY / HTTP_PROXY
  6. local_port   —— 本机常见代理端口（Clash Verge 7897、Clash/mihomo 7890、Surge 6152 等）
  7. direct       —— 直连

判定：x.com、abs.twimg.com（rettiwt 取 transaction-id）、api.notion.com 三个地址都能拿到 HTTP 响应即可用。

用法:
  python3 bin/network_doctor.py                 # 检测并打印结论，不落盘
  python3 bin/network_doctor.py --apply         # 检测并写入网络档案
  python3 bin/network_doctor.py --apply --print-proxy   # auto_run.sh 用：stdout 只输出代理 URL（直连输出空行）
  python3 bin/network_doctor.py --cached --print-proxy  # 不探测，直接按现有档案输出
  python3 bin/network_doctor.py --apply --all --json    # WebUI 用：探测全部候选并输出 JSON

退出码：0 = 找到可用路径；2 = 全部不可用（offline）。
只用标准库，兼容系统 /usr/bin/python3（3.9）。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from lib.net_profile import PROFILE_PATH, effective_decision, load_profile, save_profile  # noqa: E402

# 必须全部可达的探测地址
PROBE_URLS: List[Tuple[str, str]] = [
    ("x", "https://x.com/"),
    ("twimg", "https://abs.twimg.com/"),
    ("notion", "https://api.notion.com/v1/"),
]
PROBE_TIMEOUT = 8
PORT_TIMEOUT = 1.5

# 本机常见代理软件的 HTTP / mixed 端口
COMMON_LOCAL_PORTS: List[Tuple[int, str]] = [
    (7897, "Clash Verge"),
    (7890, "Clash / mihomo"),
    (6152, "Surge"),
    (10809, "v2rayN"),
    (1087, "ShadowsocksX-NG"),
]

# 已安装但可能没启动的代理软件：(App 路径, 名称, 默认端口)
KNOWN_PROXY_APPS: List[Tuple[str, str, int]] = [
    ("/Applications/Clash Verge.app", "Clash Verge", 7897),
    ("/Applications/ClashX Pro.app", "ClashX Pro", 7890),
    ("/Applications/ClashX.app", "ClashX", 7890),
    ("/Applications/Surge.app", "Surge", 6152),
]

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) network_doctor/1.0"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_proxy(raw: str) -> Optional[str]:
    """把 'host:port' / 'http://host:port/' 统一成 'http://host:port'；非 HTTP 代理（socks）返回 None。"""
    raw = (raw or "").strip().strip("'\"")
    if not raw:
        return None
    if "://" not in raw:
        raw = "http://" + raw
    parts = urlsplit(raw)
    if parts.scheme not in ("http", "https") or not parts.hostname or not parts.port:
        return None
    return f"{parts.scheme}://{parts.hostname}:{parts.port}"


def _read_env_file_proxy() -> Optional[str]:
    """直接解析 .env 的 PROXY（不依赖 python-dotenv，避免进程环境变量干扰）。"""
    env_path = ROOT / ".env"
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    value = None
    for line in lines:
        m = re.match(r"^\s*(?:export\s+)?PROXY\s*=\s*(.*)$", line)
        if m:
            value = m.group(1).split(" #", 1)[0].strip()
    return value


def _read_macos_system_proxy() -> Optional[str]:
    """读取 macOS 系统 HTTPS/HTTP 代理（scutil --proxy）。"""
    try:
        out = subprocess.run(
            ["scutil", "--proxy"], capture_output=True, text=True, timeout=5
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    kv: Dict[str, str] = {}
    for line in out.splitlines():
        m = re.match(r"^\s*(\w+)\s*:\s*(.+?)\s*$", line)
        if m:
            kv[m.group(1)] = m.group(2)
    for prefix in ("HTTPS", "HTTP"):
        if kv.get(f"{prefix}Enable") == "1" and kv.get(f"{prefix}Proxy") and kv.get(f"{prefix}Port"):
            return f"http://{kv[f'{prefix}Proxy']}:{kv[f'{prefix}Port']}"
    return None


def build_candidates(manual: Optional[str]) -> List[Dict[str, Any]]:
    """按优先级生成候选列表（按代理地址去重）。

    label 为中文（CLI 日志用）；WebUI 按 source + label_params 走 network 词典渲染当前语言。
    """
    raw: List[Tuple[str, str, Dict[str, Any], Optional[str]]] = []
    if manual:
        raw.append(("manual", "手动填写", {}, manual))
    env_proxy = _read_env_file_proxy()
    if env_proxy:
        raw.append(("env_file", ".env 中的 PROXY", {}, env_proxy))
    saved = effective_decision(load_profile())
    if saved and saved["mode"] == "proxy":
        raw.append(("saved", "上次检测可用的代理", {}, saved["proxy"]))
    system_proxy = _read_macos_system_proxy()
    if system_proxy:
        raw.append(("system", "macOS 系统代理", {}, system_proxy))
    for key in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"):
        if os.environ.get(key):
            raw.append(("process_env", f"环境变量 {key}", {"var": key}, os.environ[key]))
    for port, name in COMMON_LOCAL_PORTS:
        raw.append(("local_port", f"本机 {name} 端口", {"name": name}, f"http://127.0.0.1:{port}"))

    seen = set()
    result: List[Dict[str, Any]] = []
    for source, label, label_params, value in raw:
        proxy = _normalize_proxy(value or "")
        if not proxy or proxy in seen:
            continue
        seen.add(proxy)
        result.append({"source": source, "label": label, "label_params": label_params, "proxy": proxy})
    result.append({"source": "direct", "label": "直连（不走代理）", "label_params": {}, "proxy": None})
    return result


def _port_open(proxy: str) -> bool:
    parts = urlsplit(proxy)
    try:
        with socket.create_connection((parts.hostname, parts.port), timeout=PORT_TIMEOUT):
            return True
    except OSError:
        return False


def _probe_url(url: str, proxy: Optional[str]) -> Dict[str, Any]:
    """请求一次 URL；拿到任何 HTTP 响应（含 4xx/5xx）都算可达。"""
    # 直连必须显式给空 ProxyHandler，否则 urllib 会读进程环境变量里的代理
    handler = urllib.request.ProxyHandler({"http": proxy, "https": proxy} if proxy else {})
    opener = urllib.request.build_opener(handler)
    req = urllib.request.Request(url, headers={"User-Agent": UA}, method="GET")
    start = time.monotonic()
    try:
        with opener.open(req, timeout=PROBE_TIMEOUT) as resp:
            status = resp.status
        ok, error = True, None
    except urllib.error.HTTPError as e:
        status, ok, error = e.code, True, None
    except Exception as e:  # noqa: BLE001  网络层错误一律视为不可达
        status, ok, error = None, False, f"{type(e).__name__}: {e}"[:160]
    return {"ok": ok, "status": status, "error": error, "ms": int((time.monotonic() - start) * 1000)}


def probe_candidate(candidate: Dict[str, Any]) -> Dict[str, Any]:
    """探测单个候选：代理先查端口，再并发请求全部探测地址。"""
    result = dict(candidate)
    proxy = candidate["proxy"]
    if proxy and not _port_open(proxy):
        result.update(
            ok=False, detail="端口没有程序在监听", detail_code="port_closed", failed=[],
            probes={}, latency_ms=None,
        )
        return result
    with ThreadPoolExecutor(max_workers=len(PROBE_URLS)) as pool:
        futures = {name: pool.submit(_probe_url, url, proxy) for name, url in PROBE_URLS}
        probes = {name: f.result() for name, f in futures.items()}
    failed = [name for name, p in probes.items() if not p["ok"]]
    result["probes"] = probes
    result["ok"] = not failed
    result["latency_ms"] = max(p["ms"] for p in probes.values())
    result["detail"] = "全部可达" if not failed else "无法访问：" + "、".join(failed)
    result["detail_code"] = "ok" if not failed else "unreachable"
    result["failed"] = failed
    return result


def _build_hints(
    chosen: Optional[Dict[str, Any]], results: List[Dict[str, Any]]
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """返回 (中文提示, 结构化提示)。结构化提示 {code, params} 供 WebUI 按 network 词典 hint.<code> 渲染。"""
    hints: List[str] = []
    codes: List[Dict[str, Any]] = []
    env_proxy = _normalize_proxy(_read_env_file_proxy() or "")
    if chosen is None:
        hints.append("直连和所有代理都无法访问 X / Notion：请检查网络，或启动代理软件（Clash Verge / Surge / v2rayN）后再检测一次。")
        codes.append({"code": "offline", "params": {}})
    elif chosen["source"] == "direct":
        hints.append("当前网络直连即可访问 X / Notion，流水线将不走代理。")
        codes.append({"code": "chosen_direct", "params": {}})
    else:
        hints.append(f"流水线将使用代理 {chosen['proxy']}（{chosen['label']}）。")
        codes.append({
            "code": "chosen_proxy",
            "params": {"proxy": chosen["proxy"], "source": chosen["source"], **chosen.get("label_params", {})},
        })
    if env_proxy and chosen and chosen.get("proxy") != env_proxy:
        hints.append(
            f".env 中的 PROXY（{env_proxy}）当前不可用，已自动改用上面的结果；"
            "无需修改 .env，如想固定可在设置页 Proxy URL 中更新。"
        )
        codes.append({"code": "env_proxy_stale", "params": {"envProxy": env_proxy}})
    probed_ports = {r["proxy"]: r for r in results if r.get("proxy")}
    for app_path, name, port in KNOWN_PROXY_APPS:
        url = f"http://127.0.0.1:{port}"
        r = probed_ports.get(url)
        if os.path.isdir(app_path) and (r is None or not r.get("ok")) and not _port_open(url):
            hints.append(f"检测到已安装 {name}，但本机 {port} 端口未开启；如需走 {name}，打开它后再点一次检测即可自动切换。")
            codes.append({"code": "app_installed_not_running", "params": {"name": name, "port": port}})
    return hints, codes


def run_detection(manual: Optional[str], probe_all: bool) -> Dict[str, Any]:
    candidates = build_candidates(manual)
    results: List[Dict[str, Any]] = []
    chosen: Optional[Dict[str, Any]] = None
    for cand in candidates:
        r = probe_candidate(cand)
        results.append(r)
        if r["ok"] and chosen is None:
            chosen = r
            if not probe_all:
                break

    profile: Dict[str, Any] = {
        "version": 1,
        "checked_at": _now_iso(),
        "candidates": results,
    }
    if chosen is not None:
        profile.update(
            mode="proxy" if chosen["proxy"] else "direct",
            proxy=chosen["proxy"],
            source=chosen["source"],
            label=chosen["label"],
        )
    else:
        previous = load_profile()
        last_good = effective_decision(previous)
        profile.update(mode="offline", proxy=None, source=None, label=None)
        if last_good:
            profile["last_good"] = last_good
    profile["hints"], profile["hint_codes"] = _build_hints(chosen, results)
    return profile


def _log(msg: str) -> None:
    print(f"[network_doctor] {msg}", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description="检测网络环境并写入 cache/network_profile.json")
    parser.add_argument("--apply", action="store_true", help="把检测结果写入网络档案")
    parser.add_argument("--all", action="store_true", help="探测全部候选（默认找到第一个可用就停）")
    parser.add_argument("--proxy", default=None, help="额外加入一个最高优先级的代理候选")
    parser.add_argument("--json", action="store_true", help="stdout 输出完整 JSON")
    parser.add_argument("--print-proxy", action="store_true", help="stdout 只输出代理 URL，直连输出空行")
    parser.add_argument("--cached", action="store_true", help="不探测，直接读取现有档案")
    args = parser.parse_args()

    if args.cached:
        decision = effective_decision(load_profile())
        if args.print_proxy:
            print((decision or {}).get("proxy") or "")
        elif args.json:
            print(json.dumps(load_profile() or {}, ensure_ascii=False, indent=2))
        return 0 if decision else 2

    profile = run_detection(args.proxy, args.all)
    if args.apply:
        save_profile(profile)

    for r in profile["candidates"]:
        mark = "OK  " if r["ok"] else "FAIL"
        _log(f"{mark} {r['label']:<20} {r['proxy'] or '-':<28} {r['detail']}")
    for hint in profile["hints"]:
        _log(f"提示：{hint}")
    _log(f"结论：mode={profile['mode']} proxy={profile.get('proxy') or '-'}"
         + (f"（已写入 {PROFILE_PATH}）" if args.apply else "（未写入，加 --apply 落盘）"))

    if args.json:
        print(json.dumps(profile, ensure_ascii=False, indent=2))
    elif args.print_proxy:
        print(profile.get("proxy") or "")
    return 0 if profile["mode"] != "offline" else 2


if __name__ == "__main__":
    sys.exit(main())
