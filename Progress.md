# 项目工作日志 (Progress.md)

> 本文件按时间倒序记录每次开发迭代的：实现功能 / 遇到错误 / 解决方案。
> 每个已完成步骤的最后追加一条记录，不要遗漏。

---

## 2026-07-07 — PR-5 流水线 fail-soft 加固 + 健康检查（cursor/pr-5-batch-failsoft-fix）

### 事故复盘（7-4 ~ 7-7）

- **现象**：Notion 最新文章停在 7-5 凌晨，用户 7-7 下午才发现；期间 launchd 每 3h 触发的 auto_run 连续 9 次 failed。
- **根因链**：tweet `2073171123542573231`（AI 蒸馏话题长推文）触发 DeepSeek 400 "Content Exists Risk"（内容审核永久拒绝）→ article_pipeline run-batch fail-fast 整个 batch exit 1 → auto_run.sh Step 3 exit 1 跳过 Step 4 → 52 篇已 written 文章积压 2 天不上传。
- **误判排除**：xAI 403 自 5 月起就是常态（Exa 兜底工作正常，7-4 前一直成功）；DeepSeek 未欠费（是内容审核不是额度）；rettiwt 标签获取正常（sync 每 3h 都有新增）。
- **应急恢复（7-7 17:20）**：确认工作区 fail-soft 修改有效（dry test 跳过 failed），等 18:00 launchd 自动触发 → 19:10 成功上传 53 篇积压（含 1 篇新文章），流水线完全恢复。

### 实现的功能（5 commit × Coder/Reviewer/Tester 子代理流水，子代理 Composer 2.5）

1. **Commit 1 — run-batch fail-soft**：failed 默认跳过（新增 `--retry-failed` 显式重试）；仅全部失败才 exit 1，部分失败不阻塞上层
2. **Commit 2 — auto_run.sh Step 3 fail-soft**：记录 ARTICLE_EXIT 不退出，继续 Step 4 上传积压；article 失败但 upload 成功时状态降级 partial/done
3. **Commit 3 — ContentPolicyError 标 skipped**：rewrite.py 新增 ContentPolicyError（检测 Content Exists Risk）；run_write 标 status=skipped（`[SKIP-POLICY]` 日志）；UI 全链路加 skipped 状态（fs-data / types / 列表页 / 详情页，灰色 badge）
4. **Commit 4 — /api/health + HealthBanner**：健康检查端点（launchd / lastRun / recentFailStreak / pendingUploads / xAI 状态 / warnings）；顶部警告条 60s 轮询，连续失败>=3 红色告警
5. **Commit 5 — BUGS.md / Progress.md**：4 项新 bug 登记 + 本工作日志

### 遇到的错误

1. git push 403：gh active account 是 tizerluo（无权限），`gh auth switch -u 6tizer` 解决
2. Tester curl /api/articles 得 403：本机代理拦截，需 `--noproxy '*'`（既有已知问题，非代码 bug）
3. Commander 初次应急时误删 state 中的 failed 条目（会导致下次重新处理再触发 400），及时从备份还原，改为依赖 fail-soft 跳过逻辑

### 解决方案

1. 事故的三层防御：单篇隔离（skipped）→ batch 容错（fail-soft return）→ 流水线容错（Step 3 不阻塞 Step 4）
2. 监控闭环：/api/health 4 条告警规则 + HealthBanner，同类事故最长 3h 内可见（下次打开 Dashboard 即见红条）
3. 边界实测方法论：注入 3 条 fake failed 到 history 验证红警触发，测完还原

---

## 2026-06-27 — PR-3 Schedule 单一真相 + Settings/Articles/Reports 加固（cursor/pr-3-schedule-truth-and-cleanup）

### 实现的功能（11 commit × Coder/Reviewer/Test 子代理流水）

1. **后端死字段清理**：删 toggle route + scheduler-state.ts；settings/route.ts GET/PUT 不再读写 autoSync / cronExpression；types/api.ts 标 @deprecated
2. **ScheduleSettings UI 重构**：删整个 Built-in Timer 区块 + cron 编辑器；新增 6 预设按钮（3h/6h/12h/daily-0/daily-8/daily-16）
3. **launchd PUT 实现**：preset 枚举校验 → .bak 备份 → plutil 改写 StartCalendarInterval → plutil -lint → launchctl unload+load；三条失败链完整回滚
4. **GeneralSettings 清理**：删 Auto Sync toggle；Notion DB ID 改本地 state 由 Save 按钮提交
5. **auto_run.sh + history API**：append_history 函数旋转保留 100 条 jsonl；GET /api/pipeline/history 倒序返回
6. **usePipelineHistory + Sync Resume 重排**：PipelineHistory 8 列表格读 jsonl；usePipeline.ts 删 localStorage history 全套；Sync Bookmarks 卡删 Resume checkbox
7. **LLMSettings 跨 provider 拆分（P0 修复）**：model-options 仅返回 DeepSeek；LLMSettings 删 UI 临时覆盖区块；xAI Research Model 独立输入框写 .env XAI_MODEL；research.py 改用 config.XAI_MODEL；article_pipeline.py 加 --xai-model CLI
8. **Paths 绝对路径 + DeepSeek baseUrl helper**：toAbsolutePath 兜底；placeholder 改绝对路径风格；DeepSeek Base URL 下加 SDK 双兼容说明
9. **Articles 状态机收敛**：ArticleStatus 删 editing/reviewing/published；uploaded 真实可达（fs-data 已支持）；Written Run 二次确认 modal
10. **Reports 死代码批量删除**：删 11 文件 + 改 6 文件，净减 1525 行；/reports HTTP 404
11. **BUGS.md 维护 + coordinator last_run 修复**：B056-B061 移入已修复（实际 PR-1 已修）；B026 标 obsolete；B-SYNC-DEEP-TIMESTAMP-MISLEADING 修复（coordinator.py 每次跑完都更新 last_run）

### 遇到的错误

1. ScheduleSettings 删 Built-in Timer 后 GeneralSettings 还读 autoSync → Commit 1 用 @deprecated 降级，Commit 4 才彻底删 UI
2. model-options API 早期返回 grok 选项 → P0 bug 触发路径，Commit 7 闭环删除
3. Append-Only 测试发现 `key={i}` 数组下标作 React key（PR-3 范围外，留观察）
4. BUGS.md 中 B056-B061 状态偏移：在「待修复」和「已修复」表都登记 → Commit 11 一次性清理

### 解决方案

1. 多代理流水（Coder → Reviewer → Tester）每 commit 严格验证后入库；fix loop 上限 1 次
2. P0 修复采用「UI 边界 + API 边界」双闭环：UI 删 grok 选项 + API 不返 grok 选项
3. BUGS.md 状态字段统一在 Commit 11，避免多 commit 重复维护
4. coordinator.py last_run bug：在 elapsed 计算后无条件更新 state["last_run"]，不依赖 if bid 分支

---

## 2026-06-27 — PR-1 Data Truthification（cursor/pr-1-data-truthification，已合并）

### 实现的功能

1. **数据契约 v3**：`twitter_data/bookmarks.json`（1584 条）作为书签真值源；fs-data join deep drafts（642）+ article-final（642）+ notion-finished（~642）派生 4 段生命周期 `pending / drafted / written / uploaded`。
2. **Dashboard 6 卡 + 双进度条**：Bookmarks / Deep Drafts / Articles (Local) / In Notion / Pending Rewrite / Last Sync；rewrite + notionUpload 显示「本批 + 全局」双进度条，**默认展开**不再藏在节点详情后。
3. **Bookmarks 列表 lifecycle**：5 选项过滤（All / 待生成报告 / 已生成报告 / 已成文 / 已上传 Notion）；Tweet 列消除「主推文/媒体」section header 占位；Tags 显示 article-final frontmatter 的 `tags`，最多 3 个 + 「+N」溢出。
4. **Bookmark 详情**：纯 tweet ID URL（兼容旧 basename）；面包屑 + 主推文卡片 + 可折叠深度报告 + 3 跳转（Open on X / 查看成品文章 / Notion 已上传）。
5. **Articles uploaded 状态升级**：fs-data 用 `notion-finished-state.json` 把 written → uploaded，642 篇 article 显示 Uploaded。
6. **Articles 翻页 + Run 二次确认**：底部 Previous / Page N / Next；点 Written/Uploaded 状态的 Run 弹出 **in-page modal**（避开 Cursor 内置浏览器 `window.confirm` 拦截）。
7. **Article 详情面包屑 + Toolbar 分组**：Save 与 Upload to Notion 之间加竖线 divider。
8. **Settings 5 项 UX 修复**：Schedule 4 步管线清单（与 auto_run.sh 一致）+ LLM Tab 区分 .env 持久化与 localStorage 临时覆盖 + ToggleRow 统一组件 + Save 350ms min loading + Logs 筛选双行。
9. **notion-stats .env 引号 bug 修复**：parseEnv 剥离首尾单/双引号，catch 加 console.error 暴露错误。
10. **多代理工作流**：Commander/Reviewer (Claude 4.7 Opus) + Coder (GLM 5.2) + Tester (Composer 2.5 fast)，4 stage 每 stage Reviewer + Tester 双签。
11. **PR-1 共 8 commits + 验收后 3 fix commits**：`e494381` Stage1 → `c699687` Stage2 → `fefafe7` Stage3 → `43e55b6` Stage4 → `29c217e` window.confirm→modal → `5e92cc6` 双进度条默认显示 → `5b16f74` Settings UX 5 项 → `6c0feaa` Toggle thumb 3px 内边距 → main 上 `notion-stats` 引号 fix。

### 遇到的错误

1. **Cursor 内置浏览器 window.confirm 不触发**：`window.confirm` 在 Cursor Simple Browser / 部分扩展环境下可能被静默拦截，导致 B-ARTC-RUN-CONFIRM 二次确认无法触发。改为受控 React modal + `data-testid="run-confirm-modal"`。
2. **Dashboard 双进度条藏得太深**：原设计只在用户点节点圆形时才在详情面板展开，默认 4 节点全绿无法暴露「本批 100% / 全局 41%」差异。改为节点行下方加 always-visible 面板，仅渲染 `progressGlobal !== progress` 的阶段。
3. **Toggle 视觉对齐问题**：thumb 16×16 在 36×20 椭圆里 ON 状态距右沿仅 4px，shadow 散开后视觉「贴边/挤出」。改为 14×14 + 上下左右 3px 对称内边距。
4. **PR-1 merge 后 totalArticlesNotion=0 回归**：`.env` 用 `NOTION_TOKEN="ntn_xxx"`（带双引号），`notion-stats.ts` 的 `parseEnv` 直接取 `=` 之后字符串不去引号，发给 Notion API 是 `"ntn_xxx"`（含引号），401 unauthorized；catch 块静默吞错成 null，Dashboard 兜底为 0。修复 parseEnv 剥离首尾单/双引号 + catch 块加 console.error。
5. **Schedule Tab pipeline steps 过时**：显示 3 步（缺 `sync_bookmarks.sh`），与 auto_run.sh 实际 4 步不一致。改为 4 步 + 中文注释。

### 解决方案

1. 不依赖浏览器全局 API，改用受控 React 组件；同时加 `data-run-button` / `data-article-status` 便于 e2e 排查。
2. 默认渲染条件用 `progressGlobal !== progress` 过滤，避免 twitterSync / deepReports 无全局概念的两阶段冗余显示。
3. 抽 `ToggleRow` 组件 + shrink-0 w-9 容器确保多处复用对齐严格一致；thumb 14×14 + 3px 对称内边距。
4. parseEnv 与 dotenv/POSIX 习惯对齐；catch 块输出错误消息到 launchd stderr 日志，下次 Notion API 故障可直接 tail 看到。
5. 与 `auto_run.sh` 实际执行顺序严格一致，每步加中文注释方便用户理解。

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

## 2026-06-27 — PR-2 人工验收反馈修复（日志误判 / Activity / Articles UX）

### 我们实现了哪些功能？

1. **日志级别真值解析**：新增 `pipeline-log.ts` + `pipe-output-to-logger.ts`，从 Python `[INFO]`/`[ERROR]` 标签解析级别，不再因 `errors: 0`、`deep_failed: 0` 子串误判为 Error。
2. **三处 pipeline route 共用**：`coordinator`、`article-pipeline/run`、`notion-upload` 统一调用共享 `pipeOutputToLogger`。
3. **Sync Terminal 着色**：`parseLogColor` 改为读 `[LEVEL]` 标签，Stop 按钮加红框高亮。
4. **ActivityFeed 时间**：`activity/route.ts` 合并 DB + fs 派生活动，按 timestamp 倒序，修复只显示 53d 前旧 sync 的问题。
5. **Articles 模型下拉**：每行 Run 旁增加与顶部工具栏联动的模型 `<select>`，顶部加「Run model」标签。

### 我们遇到了哪些错误？

1. Logs / Terminal 大量红色 Error，内容实为 `[INFO]`（Stats 字典含 `errors`/`failed` 子串）。
2. Dashboard Recent Activity 显示「53d ago」——DB 有 2 条 2025-05 旧数据，未合并较新的 fs `auto_run` 事件。
3. Articles 用户期望 Run 旁有模型下拉（原先仅在顶部工具栏）。
4. `coordinator/route.ts` 移除 `createLog` import 后 build 失败（该 route 仍直接写 createLog）。

### 我们是如何解决这些错误的？

1. 实现 `parseStdoutLogLevel()` 优先匹配 `\[(INFO|WARNING|ERROR)\]`。
2. `mergeActivities()` 合并 `listActivities` + `listFsActivities` 去重排序。
3. 每行 Run 旁复用 `pipelineModel` state 的下拉框。
4. 保留 `coordinator` 对 `createLog` 的直接 import。

---

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
