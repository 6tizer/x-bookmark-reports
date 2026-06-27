# 项目工作日志 (Progress.md)

> 本文件按时间倒序记录每次开发迭代的：实现功能 / 遇到错误 / 解决方案。
> 每个已完成步骤的最后追加一条记录，不要遗漏。

---

## 2026-06-27 — 文档整理 PR（cursor/docs-cleanup-2026-06-27）

### 实现的功能

1. **归档过期规划文档**：`UI-ADJUSTMENT-PLAN.md` 移到 `docs/archive/UI-ADJUSTMENT-PLAN-v2-2026-04.md`，保留历史但移出根目录。
2. **删除 Streamlit legacy**：`app.py`（旧 Streamlit UI，1087 行）+ `start.command`（启动器）删除，已被 Next.js Dashboard 完全取代。
3. **新建工作日志**：`Progress.md`（根目录，按 user rules 要求）。
4. **新建变更日志**：`docs/CHANGELOG.md`，从 `BUGS.md` 已修复表 + `PROJECT_CONTEXT.md` 里程碑提取，被 `WORKFLOW.md` §6.2 引用。
5. **提交 UI 审计文档**：`docs/UI_AUDIT_2026-06-27.md`（31+ bug，4 P0 / 6 P1 / 9 P2）加入 git。
6. **更新根目录三份核心文档**：
   - `PROJECT_CONTEXT.md`：日期 2026-05-05 → 2026-06-27；书签 940+ → 1584；补 `logs/`、`docs/`、Settings 五 Tab；launchd 日志路径改为 `logs/bookmark-auto.log`；状态改为 `output/auto_run_state.json`；补 UI API routes（plaintext-key、launchd GET、data）。
   - `README.md`：目录结构补 `docs/`、`Progress.md`；Settings 改为五 Tab；补 `docs/UI_AUDIT` 与 `docs/CHANGELOG` 链接。
   - `WORKFLOW.md`：§9.3 修正 `auto_run_state.json` 路径为 `output/auto_run_state.json`，新增 `tail -f logs/bookmark-auto.log`；§3 文件职责表补 `Progress.md`、`docs/CHANGELOG.md`、`docs/UI_AUDIT_*.md`。
7. **BUGS.md 补全**：UI 审计 P0/P1 写入「待修复」表格，新增 B046–B055 共 10 条；P2/P3 保留在审计文档中。
8. **重写 `ui/README.md`**：删除 x-reader / x-tweet-reader / Mock 模式 / `.env.twitter` / Reports 页 / 旧管线描述；改为当前 5 主页面 + Settings 五 Tab + 4 步管线 + 调试说明。
9. **标注 `ui/CONTRACT.md` 过时**：顶部加 DEPRECATED PARTIAL 警告块，正文保留 Phase 1 历史，指向 `ui/src/app/api/` 为准。

### 遇到的错误

1. **`UI-ADJUSTMENT-PLAN.md` 仍在根目录被 git 跟踪**：直接 `mv` 不会同步索引，需用 `git mv` 才能正确显示为 rename。
2. **`app.py` / `start.command` 删除前需确认无引用**：搜索 `app\.py|start\.command|streamlit` 全仓库无命中，确认安全删除。
3. **`Progress.md` 与 `CHANGELOG.md` 位置选择**：user rules 要求 `progress.md` 但未指定位置；`WORKFLOW.md` 已引用 `CHANGELOG.md`。最终选择 `Progress.md` 在根目录（符合 user rules 习惯），`CHANGELOG.md` 在 `docs/`（与 `UI_AUDIT` 同目录，作为变更历史档案）。

### 解决方案

1. 使用 `git mv` 而非 `mv`，让 git 正确识别为重命名，diff 更清晰。
2. 删除前用 `rg -l "app\.py|start\.command|streamlit"` 验证零引用，并 `git ls-files | grep` 确认跟踪状态。
3. 位置分歧通过 AskQuestion 一次性问清，用户选择「split」方案，避免后续返工。

---

## 2026-06-27 — UI 全面审计（cursor/docs-cleanup-2026-06-27 前置）

### 实现的功能

1. **逐页审计 Next.js Dashboard**：Dashboard / Bookmarks（list + detail）/ Sync / Articles（list + detail）/ Settings（General / LLM & Web Search / Schedule / Logs / Data）共 9 个截图对应页面。
2. **源码 + HTTP 抓包对照**：用 `curl --noproxy '*'` 抓 API 真实响应，与 UI 显示对比，定位数据不一致根因。
3. **生成审计文档**：`docs/UI_AUDIT_2026-06-27.md`，964 行，含真实数据基准、问题清单、P0/P1/P2 详解、4 阶段 PR 路线图。
4. **设计决策对齐**：通过 AskQuestion 与用户对齐 6 项决策（书签计数口径、文章计数拆分、Pipeline 进度分母、Tags 列行为、面包屑格式、LLM 模型配置策略）。

### 遇到的错误

1. **Cursor 内置浏览器 502**：系统 HTTP 代理把 `127.0.0.1` 转发出去，导致 Simple Browser 502。改用截图 + curl 抓包组合验证。
2. **`isDbEmpty()` 误判**：DB 中有真实 logs，但 `isDbEmpty()` 仍返回 true，导致 Activity Feed / Logs Viewer 显示 mock 数据。根因是函数语义错误（检查的是 `bookmarks` 表而非 `logs` 表）。
3. **跨 provider 模型 bug**：在 Settings 切换为 xAI Grok 后，研究步骤把 `grok-4.3` 模型名喂给 DeepSeek API，导致 400 错误。

### 解决方案

1. 工作区设 `NO_PROXY=127.0.0.1,localhost,::1,0.0.0.0`，`Open Dashboard UI.command` 已写入；浏览器也可直接用 `127.0.0.1:3001`。
2. 列入 B046（P0），修复方案在 `db.ts` 改为检查 `logs` 表计数。
3. 列入 B050（P0），修复方案是 Settings 中按 provider 分组模型列表，禁止跨 provider 切换。

---

## 2026-06-27 — auto_run.sh 日志持久化（cursor/persistent-auto-run-log，已合并）

### 实现的功能

1. **`auto_run.sh` 日志路径改为 `$SCRIPT_DIR/logs/bookmark-auto.log`**（原 `/tmp/bookmark-auto.log`，重启清空）。
2. **`launchd` plist 同步更新** `StandardOutPath` / `StandardErrorPath`。
3. **`.gitignore` 加 `logs/`**，避免日志文件入库。
4. **多代理工作流**：Commander（Claude 4.7 Opus）+ Coder（GLM 5.2）+ Tester（Composer 2.5 fast）+ Reviewer（Commander）。

### 遇到的错误

1. **`/tmp/bookmark-auto.log` 重启丢失**：macOS 重启清空 `/tmp`，导致 launchd 历史日志全部丢失。
2. **`auto_run_state.json` 也曾写到 `/tmp`**：同样丢失，状态不可追。
3. **Cursor 内置浏览器无法用**：本次任务首次发现 Simple Browser 502 问题。

### 解决方案

1. 日志改到项目内 `logs/`（gitignore），重启不丢。
2. 状态文件统一在 `output/` 下（与其它 state 文件并列）。
3. 改用截图 + curl 验证，并把「Cursor 浏览器代理问题」列入 B035 已修复。

---

## 2026-05-05 — 管线全面重构与稳定化（B037–B045）

详见 `docs/CHANGELOG.md` 与 `BUGS.md` 已修复表。核心：4 步管线固化、`auto_run.sh` 重写、`launchd` 调频 3 小时、Notion 去重、Exa `choices[0]` 修复、并发进程保护、`--resume` 默认 True。

---

## 2026-04-28 — 代码审查与修复（B021–B034）

详见 `docs/CHANGELOG.md` 与 `BUGS.md` 已修复表。

---

## 2026-04-20 — rettiwt-api v4→v7 升级

详见 `PROJECT_CONTEXT.md` §二 schema 兼容说明（`createdAt` 双格式）。

---

## 2026-04-01 — 报告增强 Phase 1–3（B014–B020）

详见 `docs/CHANGELOG.md` 与 `BUGS.md` 已修复表。

---

## 2026-03-30 — 初始创建（B001–B012）

详见 `docs/CHANGELOG.md` 与 `BUGS.md` 已修复表。
