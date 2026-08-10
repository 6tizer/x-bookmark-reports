#!/bin/bash
#
# 书签自动化流水线：同步新书签 → 生成深度报告 → 撰写成品文章 → 上传到 Notion
#
# 用法:
#   bash auto_run.sh          # 正常运行（代理检测 + 增量同步 + 深度报告 + 成品文章 + Notion 上传）
#   bash auto_run.sh --force  # 跳过代理检测，直接运行
#
# 被 launchd 定时调用。运行状态写入 output/auto_run_state.json，日志写入 logs/bookmark-auto.log。
#
# 新管线流程（5 步）:
#   Step 0: 代理检测
#   Step 1: sync_bookmarks.sh      — 从 Twitter 拉取新书签
#   Step 2: coordinator.py         — 生成深度草稿（deep reports）
#   Step 3: article_pipeline.py    — 研究(SearXNG+Firecrawl+Exa) + 撰写成品文章
#   Step 4: upload_to_notion.py    — 上传成品文章到 Notion（finished 模式）
#

set -euo pipefail

# ========== 路径配置 ==========
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_FILE="$SCRIPT_DIR/output/auto_run_state.json"
LOG_FILE="$SCRIPT_DIR/logs/bookmark-auto.log"
SYNC_LOG="$PROJECT_ROOT/twitter_data/sync_log.txt"
PROXY_URL="http://127.0.0.1:7897"
PYTHON3="/usr/bin/python3"
# article_pipeline.py 需要 openai 包，用 .venv 的 python
VENV_PYTHON3="$SCRIPT_DIR/.venv/bin/python3"

# ========== 工具函数 ==========

write_state() {
    # write_state STATUS STEP SYNC_NEW PROCESS_NEW ARTICLE_NEW UPLOAD_NEW ERROR_MSG
    local status="$1"
    local step="$2"
    local sync_new="${3:-0}"
    local process_new="${4:-0}"
    local article_new="${5:-0}"
    local upload_new="${6:-0}"
    local error_msg="${7:-}"

    mkdir -p "$(dirname "$STATE_FILE")"

    "$PYTHON3" - "$status" "$step" "$sync_new" "$process_new" "$article_new" "$upload_new" "$error_msg" "$STATE_FILE" "$LOG_FILE" <<'PYEOF'
import sys, json, datetime
status, step, sync_new, process_new, article_new, upload_new, error_msg, state_file, log_file = sys.argv[1:]
s = {
    "last_run": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "status": status,
    "step": step,
    "sync_new_count": int(sync_new),
    "process_new_count": int(process_new),
    "article_new_count": int(article_new),
    "upload_new_count": int(upload_new),
    "error": error_msg if error_msg else None,
    "log_file": log_file,
}
with open(state_file, "w", encoding="utf-8") as f:
    json.dump(s, f, ensure_ascii=False, indent=2)
PYEOF
}

log() {
    local ts
    ts="$(date '+%Y-%m-%d %H:%M:%S')"
    echo "[$ts] $*" | tee -a "$LOG_FILE"
}

# ========== 历史记录（PR-3 Commit 5）==========
# 每次运行结束追加一行 JSON 到 output/auto_run_history.jsonl
# 旋转保留最近 100 条
append_history() {
    # append_history STATUS STEP SYNC_NEW PROCESS_NEW ARTICLE_NEW UPLOAD_NEW ERROR_MSG
    local status="$1"
    local step="$2"
    local sync_new="${3:-0}"
    local process_new="${4:-0}"
    local article_new="${5:-0}"
    local upload_new="${6:-0}"
    local error_msg="${7:-}"
    local end_ts
    end_ts="$(date +%s)"
    local duration=$((end_ts - START_TS))
    local history_file="$SCRIPT_DIR/output/auto_run_history.jsonl"

    mkdir -p "$(dirname "$history_file")"

    local record
    record=$("$PYTHON3" - "$status" "$step" "$sync_new" "$process_new" "$article_new" "$upload_new" "$error_msg" "$duration" <<'PYEOF'
import sys, json, datetime
status, step, sync_new, process_new, article_new, upload_new, error_msg, duration = sys.argv[1:]
record = {
    "last_run": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "status": status,
    "step": step,
    "sync_new_count": int(sync_new),
    "process_new_count": int(process_new),
    "article_new_count": int(article_new),
    "upload_new_count": int(upload_new),
    "error": error_msg if error_msg else None,
    "duration_sec": int(duration),
}
print(json.dumps(record, ensure_ascii=False))
PYEOF
)

    # append（写入失败不影响主流程）
    if printf '%s\n' "$record" >> "$history_file" 2>/dev/null; then
        # 旋转保留最近 100 行
        local total
        total=$(wc -l < "$history_file" 2>/dev/null || echo 0)
        if [ "$total" -gt 100 ]; then
            # 保留最近 100 行（旧的 sed "100,$d" 写反了：会砍掉最新记录、留最旧的）
            tail -n 100 "$history_file" > "$history_file.tmp" 2>/dev/null \
                && mv "$history_file.tmp" "$history_file" 2>/dev/null || true
        fi
    fi
}

# ========== 主流程 ==========

# 确保日志目录存在
mkdir -p "$(dirname "$LOG_FILE")"

# 日志轮转（超过 5MB 清空）
if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE")" -gt $((5 * 1024 * 1024)) ]; then
    > "$LOG_FILE"
fi

log "===== 书签自动化流水线启动 ====="
# 记录开始时间用于历史 duration（PR-3 Commit 5）
START_TS=$(date +%s)
write_state "running" "init" 0 0 0 0 ""

# ========== Step 0: 代理检测 ==========
FORCE_MODE=false
if [ "${1:-}" = "--force" ]; then
    FORCE_MODE=true
fi

if [ "$FORCE_MODE" = false ]; then
    log "Step 0: 检测代理 $PROXY_URL ..."
    PROBE_OK=false
    for PROBE_URL in "https://x.com" "https://api.notion.com" "https://httpbin.org/get"; do
        if curl -s --max-time 8 --proxy "$PROXY_URL" "$PROBE_URL" -o /dev/null 2>&1; then
            PROBE_OK=true
            break
        fi
    done
    if [ "$PROBE_OK" = false ]; then
        ERR="代理不可达（$PROXY_URL），请确认 Clash Verge 已启动后手动执行"
        log "ERROR: $ERR"
        write_state "failed" "proxy_check" 0 0 0 0 "$ERR"
        append_history "failed" "proxy_check" 0 0 0 0 "$ERR"
        exit 1
    fi
    log "Step 0: 代理正常"
else
    log "Step 0: 已跳过代理检测（--force 模式）"
fi

# ========== Step 1: 同步新书签 ==========
log "Step 1: 同步新书签..."

# 记录同步前 sync_log.txt 末行，用于对比新增数
SYNC_LOG_BEFORE=""
if [ -f "$SYNC_LOG" ]; then
    SYNC_LOG_BEFORE="$(tail -1 "$SYNC_LOG" 2>/dev/null || true)"
fi

if ! bash "$PROJECT_ROOT/sync_bookmarks.sh" >> "$LOG_FILE" 2>&1; then
    ERR="sync_bookmarks.sh 执行失败，查看日志: $LOG_FILE"
    log "ERROR: $ERR"
    write_state "failed" "sync" 0 0 0 0 "$ERR"
    append_history "failed" "sync" "$SYNC_NEW" 0 0 0 "$ERR"
    exit 1
fi

# 从 sync_log.txt 提取本次新增数（格式: "... | 新增: 5 | 总计: 364"）
SYNC_NEW=0
if [ -f "$SYNC_LOG" ]; then
    SYNC_LOG_AFTER="$(tail -1 "$SYNC_LOG" 2>/dev/null || true)"
    if [ "$SYNC_LOG_AFTER" != "$SYNC_LOG_BEFORE" ] && [ -n "$SYNC_LOG_AFTER" ]; then
        SYNC_NEW="$(echo "$SYNC_LOG_AFTER" | grep -oE '[0-9]+' | head -1 || echo 0)"
        # 更精确：取"新增: N"后的数字
        MAYBE="$(echo "$SYNC_LOG_AFTER" | grep -oE '新增: [0-9]+' | grep -oE '[0-9]+' || echo "")"
        [ -n "$MAYBE" ] && SYNC_NEW="$MAYBE"
    fi
fi
log "Step 1: 同步完成，本次新增 $SYNC_NEW 条书签"

# ========== Step 2: 批量生成深度报告 ==========
log "Step 2: 批量生成深度报告..."

# 记录处理前已完成报告数
DEEP_STATE="$SCRIPT_DIR/output/.deep-run-state.json"
COMPLETED_BEFORE=0
if [ -f "$DEEP_STATE" ]; then
    COMPLETED_BEFORE="$("$PYTHON3" -c "
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print(len(d.get('completed_ids') or []))
except Exception:
    print(0)
" "$DEEP_STATE")"
fi

cd "$SCRIPT_DIR"
if ! "$PYTHON3" bin/coordinator.py --deep-batch >> "$LOG_FILE" 2>&1; then
    ERR="coordinator.py --deep-batch 执行失败，查看日志: $LOG_FILE"
    log "ERROR: $ERR"
    write_state "failed" "process" "$SYNC_NEW" 0 0 0 "$ERR"
    append_history "failed" "process" "$SYNC_NEW" 0 0 0 "$ERR"
    exit 1
fi

# 计算本次新增报告数
COMPLETED_AFTER=0
if [ -f "$DEEP_STATE" ]; then
    COMPLETED_AFTER="$("$PYTHON3" -c "
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print(len(d.get('completed_ids') or []))
except Exception:
    print(0)
" "$DEEP_STATE")"
fi
PROCESS_NEW=$((COMPLETED_AFTER - COMPLETED_BEFORE))
[ "$PROCESS_NEW" -lt 0 ] && PROCESS_NEW=0
log "Step 2: 处理完成，本次新增 $PROCESS_NEW 篇报告"

# ========== Step 3: 撰写成品文章（article pipeline）==========
log "Step 3: 运行 Article Pipeline（研究 + 撰写成品文章）..."

ARTICLE_STATE="$SCRIPT_DIR/output/.article-pipeline-state.json"
ARTICLE_WRITTEN_BEFORE=0
if [ -f "$ARTICLE_STATE" ]; then
    ARTICLE_WRITTEN_BEFORE="$("$PYTHON3" -c "
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    arts = d.get('articles', {})
    print(sum(1 for e in arts.values() if e.get('status') == 'written'))
except Exception:
    print(0)
" "$ARTICLE_STATE")"
fi

# PR-5 Commit 2：Step 3 fail-soft——article_pipeline 部分/全部失败也继续 Step 4，
# 上传已 written 的积压文章，避免单篇失败阻塞整条流水线（7-4~7-7 事故教训）
ARTICLE_EXIT=0
"$VENV_PYTHON3" bin/article_pipeline.py run-batch >> "$LOG_FILE" 2>&1 || ARTICLE_EXIT=$?

if [ "$ARTICLE_EXIT" -ne 0 ]; then
    WARN="article_pipeline.py run-batch 失败（exit=$ARTICLE_EXIT），继续 Step 4 上传已 written 文章"
    log "WARN: $WARN"
fi

ARTICLE_WRITTEN_AFTER=0
if [ -f "$ARTICLE_STATE" ]; then
    ARTICLE_WRITTEN_AFTER="$("$PYTHON3" -c "
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    arts = d.get('articles', {})
    print(sum(1 for e in arts.values() if e.get('status') == 'written'))
except Exception:
    print(0)
" "$ARTICLE_STATE")"
fi
ARTICLE_NEW=$((ARTICLE_WRITTEN_AFTER - ARTICLE_WRITTEN_BEFORE))
[ "$ARTICLE_NEW" -lt 0 ] && ARTICLE_NEW=0
log "Step 3: Article Pipeline 完成，本次新增 $ARTICLE_NEW 篇成品文章"

# ========== Step 4: 上传成品文章到 Notion ==========
log "Step 4: 上传成品文章到 Notion（finished 模式）..."

UPLOAD_OUTPUT=""
UPLOAD_NEW=0
UPLOAD_ERRORS=0
UPLOAD_EXIT=0
UPLOAD_OUTPUT="$("$VENV_PYTHON3" bin/upload_to_notion.py --mode finished --live 2>&1)" || UPLOAD_EXIT=$?

# 打印 upload 输出到主日志
echo "$UPLOAD_OUTPUT" >> "$LOG_FILE"

# 从输出末行提取 "uploaded: N" 和 "errors: N"
UPLOAD_NEW="$(echo "$UPLOAD_OUTPUT" | grep -oE 'uploaded: [0-9]+' | grep -oE '[0-9]+' | tail -1 || echo 0)"
[ -z "$UPLOAD_NEW" ] && UPLOAD_NEW=0
UPLOAD_ERRORS="$(echo "$UPLOAD_OUTPUT" | grep -oE 'errors: [0-9]+' | grep -oE '[0-9]+' | tail -1 || echo 0)"
[ -z "$UPLOAD_ERRORS" ] && UPLOAD_ERRORS=0

if [ "$UPLOAD_EXIT" -ne 0 ] && [ "$UPLOAD_NEW" -eq 0 ]; then
    ERR="upload_to_notion.py 全部失败（errors: $UPLOAD_ERRORS），查看日志: $LOG_FILE"
    log "ERROR: $ERR"
    write_state "failed" "upload" "$SYNC_NEW" "$PROCESS_NEW" "$ARTICLE_NEW" 0 "$ERR"
    append_history "failed" "upload" "$SYNC_NEW" "$PROCESS_NEW" "$ARTICLE_NEW" 0 "$ERR"
    exit 1
elif [ "$UPLOAD_EXIT" -ne 0 ] && [ "$UPLOAD_NEW" -gt 0 ]; then
    WARN="Notion 上传部分完成（新增 $UPLOAD_NEW 篇，告警 $UPLOAD_ERRORS 篇；partial 文件已写入 state 不会重试）"
    log "WARN: $WARN"
    write_state "partial" "done" "$SYNC_NEW" "$PROCESS_NEW" "$ARTICLE_NEW" "$UPLOAD_NEW" "$WARN"
    append_history "partial" "done" "$SYNC_NEW" "$PROCESS_NEW" "$ARTICLE_NEW" "$UPLOAD_NEW" "$WARN"
    log "===== 流水线完成（同步 +$SYNC_NEW 条，报告 +$PROCESS_NEW 篇，成品 +$ARTICLE_NEW 篇，Notion +$UPLOAD_NEW 篇，失败 $UPLOAD_ERRORS 篇）====="
    exit 0
fi

log "Step 4: Notion 上传完成，本次新增 $UPLOAD_NEW 篇"

# ========== 写入成功状态 ==========
if [ "$ARTICLE_EXIT" -ne 0 ]; then
    WARN="article 步骤部分失败（exit=$ARTICLE_EXIT），但 Notion 上传成功"
    write_state "partial" "done" "$SYNC_NEW" "$PROCESS_NEW" "$ARTICLE_NEW" "$UPLOAD_NEW" "$WARN"
    append_history "partial" "done" "$SYNC_NEW" "$PROCESS_NEW" "$ARTICLE_NEW" "$UPLOAD_NEW" "$WARN"
    log "===== 流水线完成（同步 +$SYNC_NEW 条，报告 +$PROCESS_NEW 篇，成品 +$ARTICLE_NEW 篇，Notion +$UPLOAD_NEW 篇；article 步骤有失败）====="
else
    write_state "success" "done" "$SYNC_NEW" "$PROCESS_NEW" "$ARTICLE_NEW" "$UPLOAD_NEW" ""
    append_history "success" "done" "$SYNC_NEW" "$PROCESS_NEW" "$ARTICLE_NEW" "$UPLOAD_NEW" ""
    log "===== 流水线完成（同步 +$SYNC_NEW 条，报告 +$PROCESS_NEW 篇，成品 +$ARTICLE_NEW 篇，Notion +$UPLOAD_NEW 篇）====="
fi
