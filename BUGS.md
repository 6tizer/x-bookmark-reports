# 代码审查跟踪

> 本文件记录所有代码审查发现的问题，便于跟踪修复状态。
> 每次代码审查后更新此文件。

---

## 待修复

> UI 审计 P0/P1 详见 [docs/UI_AUDIT_2026-06-27.md](./docs/UI_AUDIT_2026-06-27.md)。
> P2/P3 不计入 BUGS.md，保留在审计文档中随修复 PR 处理。

| ID   | 文件     | 问题描述                                                                                                                                                           | 严重性    | 发现日期       | 状态       |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | -------- |
| B026 | app.py | `_run_deep_batch_inner` 完整复制了 `BookmarkCoordinator.run_deep` 的核心逻辑。**注：app.py 已于 2026-06-27 删除，本条作废** | MEDIUM | 2026-04-28 | obsolete |
| B-TITLE-SECTION-HEADER-LEAK | ui/src/lib/fs-data.ts | Articles 列表出现标题「外部链接详情」——deep draft 的 section header 被 extractTitle() 误当标题；DEEP_DRAFT_SECTION_HEADERS 跳过集合有「外部链接」但缺「外部链接详情」（与 PR-1 修过的「主推文」同类）。修复：往 Set 加词条 | LOW | 2026-07-07 | 待修复 |
| B-UPLOAD-PACING-AMPLIFY | bin/upload_to_notion.py | 上传节奏过保守放大积压：每篇 `sleep(3)` + 每 10 篇暂停 600s（`_BATCH_PAUSE_SECONDS`），且 SKIP-DUP（仅查重不上传）也吃同样节奏 → ~910 篇积压需 ~15h 才能走完 Step 4。Notion 官方限速 3 req/s，远宽于此。修复方向：SKIP-DUP 不 sleep；batch_pause 降到 30–60s 或按 429 自适应 | MEDIUM | 2026-08-11 | 待修复 |
| B-SEARXNG-SINGLE-ENGINE | SearXNG 实例（100.99.184.51:8888） | 实例后端只有 google cse 一个引擎（免费 100 查询/天）。超限后 SearXNG 返回 HTTP 200 + 0 结果（不报错、不熔断）→ 每篇研究都 fallback 到 Firecrawl。08-11 事故中 935/949 次搜索 0 结果，Firecrawl 496 次调用（1 credit/次）在 13:40 烧完免费版 500 credits（用户下午收到额度告警邮件）。修复方向：SearXNG 加免费引擎（duckduckgo/brave/bing 等）；research.py 对连续 0 结果告警 | HIGH | 2026-08-11 | 待修复 |


---

## 已修复


| ID   | 文件                                 | 问题描述                                                                                                   | 严重性    | 发现日期       | 修复日期       | 修复说明                                                    |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ | ---------- | ---------- | ------------------------------------------------------- |
| B-RECONCILE-ARCHIVE-BLIND | bin/reconcile_deep_state.py | 孤儿判定只扫 `output/` 顶层，未计入 `output/归档/`；942 篇归档草稿被误判孤儿 → 08-11 全量重跑 19.5h，阻塞 Notion 上传、跳过 6 次 launchd、耗尽 xAI/Firecrawl 额度 | HIGH | 2026-08-11 | 2026-08-11 | `list_disk_tweet_ids` 增加 `output/归档/` 递归扫描；验证归档 942 id 全覆盖，不再误判 |
| B-SYNC-REWRITE-STALE | ui/src/lib/fs-data.ts + PipelineOverview | Idle+failed 时 rewrite 仍标 running | MEDIUM | 2026-08-11 | 2026-08-11 | 状态机改为 running/completed/partial/pending；UI 橙色 partial |
| B-ARTICLES-TOTAL-MIXED | ui articles API/page | 页头 total 与 Dashboard 口径混用 | MEDIUM | 2026-08-11 | 2026-08-11 | API 附加 `stats:{drafts,finished,failed}`；页头拆分显示 |
| B-LOG-STALE | ui logs route + log-reader | auto_run 只写文件不进 SQLite，Logs 停在旧数据 | HIGH | 2026-08-11 | 2026-08-11 | 合并 `logs/bookmark-auto.log`；加 logs.timestamp 索引 |
| B-TITLE-PLACEHOLDER-LEAK | lib/article_pipeline/rewrite.py | 成品标题可为「素材不足」等占位词 | MEDIUM | 2026-08-11 | 2026-08-11 | 占位标题回退 meta.title / 否则 failed；修复 2 篇 frontmatter |
| B-DEEP-STATE-ORPHANS | output/.deep-run-state.json | completed_ids=2105 vs 磁盘 1163 | MEDIUM | 2026-08-11 | 2026-08-11 | `bin/reconcile_deep_state.py`：942→orphaned_ids，bak.20260811 |
| B-NOTION-COUNT-DRIFT | ui StatCards | Notion 总记录与本管线已上传口径混淆 | LOW | 2026-08-11 | 2026-08-11 | 文案改为「Notion 总记录（含历史）· 本管线已上传 N」（不改数据） |
| B-HEALTH-XAI-ONLY | /api/health | apiStatus 仅 xAI | LOW | 2026-08-11 | 2026-08-11 | 扩展 searxng/firecrawl/exa |
| B-RETTIWT-LOCAL-NULL | /api/system/rettiwt | localVersion=null（PATH/--version） | LOW | 2026-08-11 | 2026-08-11 | PATH fallback + 读 package.json（CLI 无 --version） |
| B-DOCS-CONTEXT-STALE | PROJECT_CONTEXT.md | §五研究栈文档过期 | LOW | 2026-08-11 | 2026-08-11 | 改为 SearXNG 主→Firecrawl 备→Exa 可选 |
| B-SEARCH-ENV-MISSING | .env / Settings | 无 SEARXNG/FIRECRAWL 配置 | MEDIUM | 2026-08-11 | 2026-08-11 | 已写入 SEARXNG_BASE_URL + FIRECRAWL_API_KEY；研究链路实测 OK |
| B-FIRECRAWL-KEY-MASK | ui settings API/UI | 空 key 显示 **** | LOW | 2026-08-11 | 2026-08-11 | maskApiKey 空→""；Firecrawl 不再兜底 **** |
| B001 | github_client.py                   | `GitHubNotFound` 未被 fallback 捕获，gh CLI 404 时不会尝试 urllib                                                | MEDIUM | 2026-03-30 | 2026-03-30 | 添加 `GitHubNotFound` 到异常捕获元组                             |
| B002 | github_client.py                   | URL 提取可被伪造 URL 绕过（如 `evil.com/?github.com/owner/repo`）                                                 | MEDIUM | 2026-03-30 | 2026-03-30 | 使用 `urllib.parse.urlparse` 验证 netloc                    |
| B003 | github_client.py                   | `GitHubParseError` 是死代码，从未抛出                                                                           | LOW    | 2026-03-30 | 2026-03-30 | 移除未使用的异常类                                               |
| B004 | github_client.py                   | owner/repo 缺少输入验证                                                                                      | LOW    | 2026-03-30 | 2026-03-30 | 添加正则验证 `^[a-zA-Z0-9_-]+$`                               |
| B005 | coordinator.py                     | URL 提取需处理 dict 类型的 entities.urls                                                                       | MEDIUM | 2026-03-30 | 2026-03-30 | 添加 `_extract_url_value` 方法统一处理                          |
| B006 | coordinator.py                     | `/i/articles/` 复数形式需支持                                                                                 | MEDIUM | 2026-03-30 | 2026-03-30 | 更新正则 `article[s]?` 使 s 可选                               |
| B007 | bin/coordinator.py                 | `from lib.config import DEFAULT_BOOKMARKS_PATH` 错误导入，`DEFAULT_BOOKMARKS_PATH` 定义在 `lib/coordinator.py` | HIGH   | 2026-03-31 | 2026-03-31 | 改为 `from lib.coordinator import DEFAULT_BOOKMARKS_PATH` |
| B008 | article_client.py / coordinator.py | `/twitter/article` 响应与 OpenAPI 不一致等                                                                    | HIGH   | 2026-03-31 | 2026-03-31 | 按 OpenAPI 解析 `contents`/作者；fallback 等                   |
| B009 | external_client.py                 | HTML 内容未清理，CSS/JS 代码被保留                                                                                | MEDIUM | 2026-03-31 | 2026-03-31 | 重写 HTML 解析逻辑                                            |
| B010 | article_client.py                  | 缓存目录未创建，写入失败                                                                                           | MEDIUM | 2026-03-31 | 2026-03-31 | 在 _set_cached 方法中添加 cache_path.parent.mkdir()           |
| B011 | coordinator.py                     | 纯文本推文分类为 unknown                                                                                       | MEDIUM | 2026-03-31 | 2026-03-31 | 修改 classify_bookmark 返回 "quoted"                        |
| B012 | external_client.py                 | CSS/style 块仍残留在输出中                                                                                     | MEDIUM | 2026-03-31 | 2026-03-31 | 正则 + HTMLParser                                         |
| B013 | replies_client.py                  | API 响应键名 "data" vs "tweets"                                                                            | HIGH   | 2026-03-31 | 2026-03-31 | 兼容 tweets/data；分页；429 重试                                |
| B014 | bin/coordinator.py                 | 批量模式无条件打印失败警告                                                                                          | MEDIUM | 2026-04-01 | 2026-04-01 | 仅在 `stats['errors'] > 0` 时打印                            |
| B015 | report_builder.py / coordinator.py | Article 互动统计误用键                                                                                        | HIGH   | 2026-04-01 | 2026-04-01 | coordinator 合并书签互动；报告兼容字段                               |
| B016 | report_builder.py                  | Replies 汇总误用 bookmark 键                                                                                | HIGH   | 2026-04-01 | 2026-04-01 | bookmark_id；作者推断                                        |
| B017 | config.py                          | 必填变量导致 import 崩溃                                                                                       | HIGH   | 2026-04-01 | 2026-04-01 | `_optional_env`；`.env.example`                          |
| B018 | github_client.py                   | urllib README base64 误解码                                                                               | MEDIUM | 2026-04-01 | 2026-04-01 | urllib 路径 `decode_base64=False`                         |
| B019 | external_client.py                 | 重定向与重试耦合导致退避过长                                                                                         | MEDIUM | 2026-04-01 | 2026-04-01 | while 跟踪重定向；内层独立重试                                      |
| B020 | bin/coordinator.py                 | `--id` 分支无用导入                                                                                          | LOW    | 2026-04-01 | 2026-04-01 | 删除无用导入                                                  |
| B021 | replies_client.py                  | 429/500 重试耗尽后 `last_err` 仍为 None，分页继续                                                                  | HIGH   | 2026-04-28 | 2026-04-28 | 各 HTTP 分支赋值 `last_err`                                  |
| B022 | lib/coordinator.py                 | 纯文本 fallback 读顶层 author 字段                                                                             | HIGH   | 2026-04-28 | 2026-04-28 | 从 `tweetBy` 读取 fullName/userName                        |
| B023 | bin/upload_to_notion.py            | `NOTION_DB_ID` 硬编码默认值                                                                                  | HIGH   | 2026-04-28 | 2026-04-28 | 默认空串；live 模式校验必填                                        |
| B024 | quoted_client.py                   | 未使用 PROXY                                                                                              | MEDIUM | 2026-04-28 | 2026-04-28 | ProxyHandler + opener                                   |
| B025 | lib/coordinator.py                 | 首个 external URL 遮挡后续 github                                                                            | MEDIUM | 2026-04-28 | 2026-04-28 | 两遍扫描：高优先级后再 external                                    |
| B027 | lib/report_builder.py              | `_parse_timestamp` fallback 无时区                                                                        | MEDIUM | 2026-04-28 | 2026-04-28 | `datetime.now(timezone.utc)`                            |
| B028 | lib/config.py                      | import 时 subprocess `gh api user`                                                                      | MEDIUM | 2026-04-28 | 2026-04-28 | `get_gh_username()` 懒加载；`get_config()` 合并 author        |
| B029 | lib/external_client.py             | `_unshorten` 仅用 GET                                                                                    | LOW    | 2026-04-28 | 2026-04-28 | HEAD 优先；403/405/501 时单次 GET fallback                    |
| B030 | requirements.txt                   | 无版本锁定                                                                                                  | LOW    | 2026-04-28 | 2026-04-28 | `>=current,<next_major` 约束                              |
| B031 | lib/report_builder.py              | `_clean_html_content` 与 external 重复                                                                    | LOW    | 2026-04-28 | 2026-04-28 | 使用公共 `html_to_text`，删除重复方法                              |
| B032 | lib/external_client.py             | `_fetch` 内 3xx 分支死代码                                                                                   | LOW    | 2026-04-28 | 2026-04-28 | 移除成功响应路径上的 3xx 分支                                       |
| B033 | lib/coordinator.py                 | 调用 `_unshorten` 私有方法                                                                                   | LOW    | 2026-04-28 | 2026-04-28 | `ExternalClient.unshorten()` 公开封装                       |
| B035 | ui (Next dev) + Cursor | 系统 HTTP 代理导致 127.0.0.1:3001 走代理→502；损坏的 `.next` 导致 `Cannot find module './NNN.js'`→500 白屏 | MEDIUM | 2026-05-02 | 2026-05-02 | 工作区 `http.noProxy` + `NO_PROXY`；`npm run dev:clean`；`ui/TROUBLESHOOTING.txt` |
| B036 | ui/src/lib/fs-data.ts | `next build` 失败：未使用 `articleBasenameNoExt` / `meta`；`for..of` 遍历 `Set` 在未开 `downlevelIteration` 的 TS 目标下报错 | LOW | 2026-05-04 | 2026-05-04 | 删除死代码；`const { body }`；`Array.from(tweetIds)` 再遍历 |
| B037 | bin/article_pipeline.py | `run-batch` 默认不 resume，导致 UI 点击「Run Pipeline」重新处理所有 942 篇草稿 | HIGH | 2026-05-04 | 2026-05-05 | `--resume` 默认 True；加 `--no-resume` 选项；UI 默认传 resume=true |
| B038 | ui/src/app/api/article-pipeline/run/route.ts | 未 kill 同类旧进程，多实例并发写 .article-pipeline-state.json 导致状态损坏 | HIGH | 2026-05-05 | 2026-05-05 | 添加 `killExistingPythonProcesses()` 仅 kill article_pipeline 进程 |
| B039 | ui/src/app/api/pipeline/coordinator/route.ts | 「Sync Bookmarks」只触发 coordinator.py，未执行 sync_bookmarks.sh 拉取新书签 | HIGH | 2026-05-05 | 2026-05-05 | execSync 先跑 sync_bookmarks.sh，再 spawn coordinator.py |
| B040 | ui/src/app/api/pipeline/coordinator/route.ts | bash -c 中含空格的路径未加引号，导致执行失败（`is a directory` 等错误） | HIGH | 2026-05-05 | 2026-05-05 | syncScript 和 py 路径用单引号包裹 |
| B041 | lib/article_pipeline/research.py | Exa `choices[0]` 取错：早期 choices content 为空，只有最后非空才是研究结果 | HIGH | 2026-05-05 | 2026-05-05 | `reversed(exa_resp.choices)` 找最后非空 choice |
| B042 | lib/article_pipeline/research.py | Exa API 不稳定（空响应/5xx），无重试机制导致该步骤静默失败 | MEDIUM | 2026-05-05 | 2026-05-05 | 加最多 2 次重试，间隔 3s |
| B043 | auto_run.sh | 旧 3 步管线（sync + deep + upload drafts），未含 article_pipeline，上传草稿而非成品 | HIGH | 2026-05-05 | 2026-05-05 | 增加 Step 3 (article_pipeline.py)；Step 4 改 --mode finished；改用 .venv/bin/python3 |
| B044 | bin/upload_to_notion.py | 无 Notion 去重检查，重复执行会创建相同 source_url 的多个页面 | HIGH | 2026-05-05 | 2026-05-05 | 上传前查 Notion DB `文章链接` 属性，已存在则 [SKIP-DUP] |
| B045 | ui/src/lib/fs-data.ts | `countDeepDrafts()` 扫描 `output/归档/` 目录，归档后 Dashboard 仍显示旧数量 | MEDIUM | 2026-05-05 | 2026-05-05 | 移除 `scanDir(ARCHIVE_DIR)`；删除未使用的 ARCHIVE_DIR 常量 |
| B046 | ui/src/lib/db.ts | `isDbEmpty()` 语义错误：检查的是 `bookmarks` 表而非 `logs` 表，导致 DB 有真实日志时 Activity Feed / Logs Viewer 仍显示 mock 数据 | HIGH | 2026-06-27 | 2026-06-27 | PR-1 重构 fs-data 真值源 + lifecycle join；Logs route 真值化留 B052 处理 |
| B047 | ui/src/app/api/dashboard/stats/route.ts | `totalBookmarks` 取 `output/bookmark-deep-*.md` 文件数（642）而非 `bookmarks.json` 真实条数（1584），Dashboard 卡片严重失真 | HIGH | 2026-06-27 | 2026-06-27 | PR-1：`countTotalBookmarks()` 读 `twitter_data/bookmarks.json`，6 卡拆分显示 |
| B048 | ui/src/lib/fs-data.ts | Bookmarks 页 `listFsBookmarks()` 读 `output/` 深度草稿而非 `bookmarks.json` | HIGH | 2026-06-27 | 2026-06-27 | PR-1：`listAllBookmarks()` 改用 `bookmarks.json` + 4 段 lifecycle join |
| B049 | ui/src/components/settings/ScheduleSettings.tsx | Cron 调度设置只写 SQLite，不写 launchd plist | HIGH | 2026-06-27 | 2026-06-27 | PR-1 验收范围外，B049 实际由 B056 跟踪，移到 B056 |
| B050 | ui/src/components/settings/LLMSettings.tsx | Pipeline Default Model 跨 provider 模型 bug | HIGH | 2026-06-27 | 2026-06-27 | PR-1：LLM Tab 副标区分「.env 持久化」vs「localStorage 临时 --model 覆盖」，B050 实际由 B057 跟踪 |
| B051 | ui/src/app/api/dashboard/activity/route.ts | Activity Feed 受 `isDbEmpty()` 影响（B046）永远返回空数组 | MEDIUM | 2026-06-27 | 2026-06-27 | PR-1 重构 fs 真值源后该路径不再被 hit |
| B056 | ui/src/components/settings/ScheduleSettings.tsx | Schedule Tab 「Pipeline steps executed」显示 3 步过时清单（缺 `sync_bookmarks.sh`） | LOW | 2026-06-27 | 2026-06-27 | PR-1 Settings UX polish：升级为 4 步与 auto_run.sh 一致 + 中文注释 |
| B057 | ui/src/components/settings/LLMSettings.tsx | DeepSeek > Model 与 Pipeline Default Model 缺少文案区分 | LOW | 2026-06-27 | 2026-06-27 | PR-1：DeepSeek > Model 加副标「持久化 .env」；底部改名「UI 临时模型覆盖」+ 详细说明 |
| B058 | ui/src/components/settings/GeneralSettings.tsx | Notion Upload Live / Auto Sync 两个 toggle 视觉错位 | LOW | 2026-06-27 | 2026-06-27 | PR-1：抽 ToggleRow 组件 + thumb 14×14 + 3px 对称内边距 |
| B059 | ui/src/components/settings/GeneralSettings.tsx | Save Changes 反馈不可见 | LOW | 2026-06-27 | 2026-06-27 | PR-1：handleSave 加 350ms minimum delay |
| B060 | ui/src/components/settings/LogViewer.tsx | Logs 筛选条 Component + Level 挤在同一行 | LOW | 2026-06-27 | 2026-06-27 | PR-1：分两个 flex-wrap 容器 space-y-2 |
| B061 | ui/src/lib/notion-stats.ts | parseEnv 不剥离 .env 值首尾引号，NOTION_TOKEN 带引号发给 Notion API 导致 401，totalArticlesNotion=0 静默兜底；catch 吞错无日志 | HIGH | 2026-06-27 | 2026-06-27 | parseEnv 剥离单/双引号；catch 加 console.error 输出错误消息 |
| B052 | ui/src/app/api/logs/route.ts | Logs Viewer 在 DB 模式下仍返回 mock 数据，未读取 SQLite `logs` 表 | MEDIUM | 2026-06-27 | 2026-06-27 | PR-2 Stage 1：拆 isDbEmpty + logs route 直接读 DB（7447 条），新增 /api/logs/components |
| B053 | ui/src/app/sync/page.tsx | Sync Terminal 依赖 SSE 流，但后端 `child_process.spawn` 未做 stdout 转发，UI 看不到实时输出 | MEDIUM | 2026-06-27 | 2026-06-27 | PR-2 Stage 3：新增 /api/logs/stream SSE + SyncTerminal EventSource 订阅 + currentOperation 生命周期 |
| B054 | ui/src/app/api/schedule/launchd/route.ts | 缺 GET 方法，前端无法读取当前 launchd 调度详情（频率/下次触发时间），Settings Schedule Tab 显示空白 | MEDIUM | 2026-06-27 | 2026-06-27 | PR-2 Stage 5：launchd GET 用 plutil 解析 8 个日历触发点（每 3h） |
| B055 | ui/src/app/articles/page.tsx | 模型列表硬编码且过期，未从 `/api/settings` 动态读取当前可用模型 | MEDIUM | 2026-06-27 | 2026-06-27 | PR-2 Stage 6：新增 /api/settings/model-options；Articles 删 MODEL_OPTIONS，每行 Run 旁加模型下拉 |
| B-CRON-DEAD | ui/src/components/settings/ScheduleSettings.tsx + api/schedule/* | Schedule 三套并行死配置（cron env / Built-in Timer / launchd plist）互不通；用户改 cron 不生效 | HIGH | 2026-06-27 | 2026-06-27 | PR-3：删 Built-in Timer + Auto Sync + cron env，仅保留 launchd 为单一真相，新增 6 预设按钮 + PUT 编辑 plist |
| B-BUILTIN-TIMER-CONFUSING | ui/src/components/settings/ScheduleSettings.tsx | Built-in Timer 区域与 launchd 并行存在让用户困惑 | MEDIUM | 2026-06-27 | 2026-06-27 | PR-3 Commit 2：删除整个 Built-in Timer UI 区块 |
| B-AUTO-SYNC-DEAD | ui/src/components/settings/GeneralSettings.tsx | AutoSync 写 .env 但无人读，dead config | MEDIUM | 2026-06-27 | 2026-06-27 | PR-3 Commit 1+4：UI + .env 双删 |
| B-SYNC-HISTORY-NO-PERSISTENCE | ui/src/components/sync/PipelineHistory.tsx + auto_run.sh | History 仅 localStorage，重启丢失 | MEDIUM | 2026-06-27 | 2026-06-27 | PR-3 Commit 5+6：auto_run.sh append auto_run_history.jsonl + GET /api/pipeline/history + usePipelineHistory hook |
| B-PIPELINE-MODEL-CROSS-PROVIDER | lib/article_pipeline/rewrite.py + LLMSettings.tsx | UI 选 grok 后被塞进 DeepSeek 客户端导致 rewrite 失败 | HIGH | 2026-06-27 | 2026-06-27 | PR-3 Commit 7：model-options API 仅返回 DeepSeek；LLMSettings 删 UI 临时覆盖区块；xAI Model 拆出独立输入框写 .env XAI_MODEL |
| B-NOTION-DBID-NO-SAVE-BTN | ui/src/components/settings/GeneralSettings.tsx | Notion DB ID onChange 每字符 PUT | MEDIUM | 2026-06-27 | 2026-06-27 | PR-3 Commit 4：改本地 state，由 Save Changes 按钮统一提交 |
| B-XAI-MODEL-MISSING | ui/src/components/settings/LLMSettings.tsx | xAI Model 无 UI 输入框 | MEDIUM | 2026-06-27 | 2026-06-27 | PR-3 Commit 7：xAI 区块新增 Research Model input |
| B-SYNC-RESUME | ui/src/components/sync/PipelineActions.tsx | Sync Bookmarks 卡 Resume 选项语义错乱 | MEDIUM | 2026-06-27 | 2026-06-27 | PR-3 Commit 6：删除（sync_bookmarks.sh 本身增量，无 --resume） |
| B-DEEPSEEK-BASE | ui/src/components/settings/LLMSettings.tsx | DeepSeek baseUrl 默认值不一致 + 用户混淆是否需 /v1 | LOW | 2026-06-27 | 2026-06-27 | PR-3 Commit 8：保留默认 /v1，新增 helper text 说明 SDK 双兼容 |
| B-PATH-STYLE-INCONSISTENT | ui/src/components/settings/GeneralSettings.tsx | 三路径风格不一（相对/绝对/家目录） | LOW | 2026-06-27 | 2026-06-27 | PR-3 Commit 8：GET 时 toAbsolutePath 兜底；UI placeholder 全绝对路径风格 |
| B-PUB-STATUS | ui/src/types/api.ts + ui/src/app/articles/page.tsx | editing/reviewing/published 在 fs 数据层根本不存在 | LOW | 2026-06-27 | 2026-06-27 | PR-3 Commit 9：ArticleStatus 收敛为 6 项 |
| B-ARTC-UPLOADED-NEVER-WRITTEN | ui/src/lib/fs-data.ts | uploaded 状态在 fs 不产出 | LOW | 2026-06-27 | 2026-06-27 | PR-1 Stage 4 已修复（fs-data 整合 .notion-finished-state.json）；PR-3 Commit 9 实测验证 642 条 uploaded 真实可达 |
| B-ARTC-RUN-CONFIRM | ui/src/app/articles/page.tsx | Written 状态点 Run 不弹确认，可能覆盖 | LOW | 2026-06-27 | 2026-06-27 | PR-2 已实现 confirmingArticle modal；PR-3 Commit 9 沿用 |
| B-NAV-REPORTS | ui/src/app/reports/* + ui/src/app/api/reports/* + ui/src/hooks/useReports.ts + ui/src/components/reports/* | Reports 入口已删但代码大量残留（10+ 文件） | LOW | 2026-06-27 | 2026-06-27 | PR-3 Commit 10：批量删除 11 个文件 + 6 个文件清理引用，净减 1525 行；/reports HTTP 404 |
| B-REPORTS-PAGE | ui/src/app/reports/page.tsx | /reports 僵尸路由可访问 | LOW | 2026-06-27 | 2026-06-27 | PR-3 Commit 10：路由删除 |
| B-PIPELINE-FAIL-FAST | bin/article_pipeline.py | run-batch 单篇失败（如 DeepSeek 400）导致整个 batch exit 1，7-4~7-7 事故 52 篇积压 2 天 | HIGH | 2026-07-07 | 2026-07-07 | PR-5 Commit 1：failed 默认跳过（--retry-failed 显式重试）；仅全部失败才 exit 1 |
| B-AUTORUN-STEP3-FAIL-FAST | auto_run.sh | Step 3 失败直接 exit 1 跳过 Step 4，已 written 文章积压不上传 | HIGH | 2026-07-07 | 2026-07-07 | PR-5 Commit 2：记录 ARTICLE_EXIT 不退出，继续 Step 4；article 失败但 upload 成功时状态降级 partial |
| B-DEEPSEEK-CONTENT-RISK-AMBIGUITY | lib/article_pipeline/rewrite.py + bin/article_pipeline.py | DeepSeek 内容审核拒绝（Content Exists Risk）是永久性拒绝，却标 failed 与临时失败混淆 | MEDIUM | 2026-07-07 | 2026-07-07 | PR-5 Commit 3：新增 ContentPolicyError，run_write 标 status=skipped；UI 加 skipped 状态（灰色 badge） |
| B-NO-HEALTH-MONITOR | ui | 流水线连续失败 2 天无任何告警，用户后知后觉 | MEDIUM | 2026-07-07 | 2026-07-07 | PR-5 Commit 4：/api/health 端点（failStreak/积压/xAI 状态）+ HealthBanner 顶部警告条（60s 轮询） |
| B062 | auto_run.sh | `append_history` 轮转方向写反：`sed -i '' "100,$d"` 是「删第 100 行到末尾」= 保留最旧 99 行、砍掉刚 append 的最新记录。文件一到 101 行就把新记录砍回 99，history 实质冻结在旧数据（最新只停在侥幸落第 100 行的记录）。B-SYNC-HISTORY-NO-PERSISTENCE(PR-3) 同批引入。真实的 07-24 07:22 `+27/+27/+27` 手动运行记录即被此逻辑吃掉 | MEDIUM | 2026-07-24 | 2026-07-24 | 改为 `tail -n 100 > .tmp && mv` 保留最新 100 行；105 行自测确认留最新、丢最旧 |
| B-DEEPSEEK-MODEL-EOL | lib/config.py + .env + ui | DeepSeek 平台 7-24~7-26 迁移期下线 `deepseek-reasoner`（API 报「supported API model names are deepseek-v4-pro or deepseek-v4-flash」），期间 22 篇 rewrite 400 标 failed 后永久跳过；Notion 缺口。旧模型名已废弃 | HIGH | 2026-08-10 | 2026-08-10 | 全链路换 `deepseek-v4-flash`（.env / config.py / settings route / model-options / LLMSettings / .env.example）；重跑救回 22 篇 |
| B-REWRITE-EMPTY-CONTENT | lib/article_pipeline/rewrite.py | v4-flash/pro 是 reasoning 模型，`max_tokens=4096` 全被 `reasoning_content` 吃光导致正文 `content=0`（finish_reason=length/stop），rewrite 不检查空就保存 → Notion 出现一批正文 0 字空页面（21 篇） | HIGH | 2026-08-10 | 2026-08-10 | max_tokens 4096→16384（实测 reasoning≈6.4k + 正文≈0.9k）；新增空正文防御抛错标 failed 不保存 |
| B-UPLOAD-NO-MIN-LENGTH | bin/upload_to_notion.py | 上传前不校验正文字数，空/过短成品照样建 Notion 空页 | MEDIUM | 2026-08-10 | 2026-08-10 | `upload_finished_file` 加 MIN_BODY_CHARS=300 门槛，偏短 `[SKIP-SHORT]` 返回 failed 不上传 |
| B-EXA-RESEARCH-RETIRED | lib/article_pipeline/research.py | Exa Research API 已退役（410 Gone, tag=RESEARCH_RETIRED），research 步骤 xAI(403 无额度)+Exa(410 退役)双挂，实际拿不到研究内容（仅 fallback 289 字） | MEDIUM | 2026-08-10 | 2026-08-10 | research 栈迁移：SearXNG 主 + Firecrawl 备 + Exa `/search` 可选（替代退役的 exa-research）；xAI 保留 fail-soft；实测 SearXNG 3014 字符、13 来源 |


---

## 审查清单

### 新文件审查清单（必查项）

#### 1. 正确性

- API 调用格式是否正确？
- URL/header 参数是否匹配文档？
- 缓存路径和 TTL 是否正确？
- 错误处理是否覆盖所有代码路径？

#### 2. 一致性

- 重试/退避策略是否与其他 client 一致？
- 缓存结构是否一致？
- 异常类命名是否一致？
- 日志格式是否一致？

#### 3. URL 提取（针对解析类）

- 基础 URL 格式是否正确？（`https://github.com/owner/repo`）
- 带子路径是否正确？（`/pull/123`, `/issues/789`）
- 裸 `owner/repo` 是否支持？
- 查询字符串和 hash 是否正确剥离？
- 是否防止注入攻击？

#### 4. 安全性

- subprocess 调用是否使用列表参数（防注入）？
- 超时是否正确设置？
- 敏感信息是否泄露到日志？

#### 5. 完整性

- 必需方法是否都已实现？
- docstring 是否准确？
- 单元测试是否覆盖关键路径？

---

## 已知限制


| 文件                 | 限制                                       | 备注              |
| ------------------ | ---------------------------------------- | --------------- |
| external_client.py | `_unshorten` 对某些短链服务可能失败                 | t.co 通常正常工作     |
| coordinator.py     | `classify_url` 无法区分 `needs_api_check` 类型 | 需要实际 API 调用才能确定 |


---

## 更新日志

- **2026-08-11**: 逻辑/数据/文档修复批次 — 完成 P0–P3：rewrite `partial` 状态机、Articles stats 口径、Logs 合并 bookmark-auto.log、rewrite 坏标题防御+2 篇数据修复、deep-state reconcile（942 orphans）、Notion 文案、health apiStatus 扩展、rettiwt package.json 版本、PROJECT_CONTEXT 研究栈同步。详见 Progress.md。
- **2026-08-11**: 浏览器点选验收 — cursor-ide-browser 恢复后逐页走通；确认 Settings Search 区块上线；新登记 B-SYNC-REWRITE-STALE（Rewrite 误标 Running）。详见验收文档 §5。
- **2026-08-11**: UI 验收 — 管线正常（最近 auto_run success +3）；生产 UI 过期已 rebuild/重启；Glass 打开各页供人工复看。新登记 B-LOG-STALE / B-SEARCH-ENV-MISSING / B-ARTICLES-TOTAL-MIXED / B-DEEP-STATE-ORPHANS 等（详见 `docs/UI_ACCEPTANCE_2026-08-11.md`）。
- **2026-08-10**: research 栈迁移 — 决策对齐后实施：xAI 403（额度尽）+ Exa Research 410（退役）双挂 → 迁移为 SearXNG 主（自托管 CQA Tokyo，实测 20 条/0.7s）+ Firecrawl 备（Keyless，2 credits/10 条）+ Exa `/search` 可选（每月 $10 免费额度）。改动 research.py / config.py / .env.example + Settings UI 新增 Search 区块。B-EXA-RESEARCH-RETIRED 转已修复。
- **2026-08-10**: 内容质量排查 + 修复 — 用户反馈 Notion 内容异常。排查发现：(1) DeepSeek 平台迁移期下线旧模型名导致 22 篇 failed（B-DEEPSEEK-MODEL-EOL），换 deepseek-v4-flash 救回；(2) v4 reasoning 模型 max_tokens=4096 被 reasoning_content 吃光导致 21 篇正文 0 字空文章（B-REWRITE-EMPTY-CONTENT），改 16384 + 空正文防御；(3) upload 无字数门槛（B-UPLOAD-NO-MIN-LENGTH），加 300 字门槛。清理：删 20 篇 Notion 空页 + 21 篇本地空文件 + 重跑全部救回。全量扫 Notion 2044 页确认仅剩 1 篇测试数据偏短。附带发现 B-EXA-RESEARCH-RETIRED（Exa Research 退役，待决策）。
- **2026-07-24**: 内容管线停摆排查 — 根因 `rettiwt-api` 7.0.3 解析不了 X 新响应、静默返回空 → sync 每次 0 条 → 下游空转报 success（同 2026-04 v4 教训）。升级 7.1.2 后恢复，补跑 +27 书签→+27 报告→+27 成品→+27 Notion。附带发现并修复 B062（auto_run.sh history 轮转方向写反，冻结历史）。
- **2026-07-07**: PR-5 (流水线 fail-soft 加固 + 健康检查) — 7-4~7-7 事故复盘修复：单篇 DeepSeek 400 (Content Exists Risk) 引发 batch fail-fast → auto_run Step 4 跳过 → 52 篇积压 2 天。修复 B-PIPELINE-FAIL-FAST / B-AUTORUN-STEP3-FAIL-FAST / B-DEEPSEEK-CONTENT-RISK-AMBIGUITY（新增 skipped 状态）/ B-NO-HEALTH-MONITOR（/api/health + HealthBanner）。
- **2026-06-28**: PR-4 (P3 清理 + Article 详情页 P0 回归修复) 合并 — 修复 NEW-ARTICLE-DETAIL-GROK (P0 回归) / B-SYNC-ACTIONS-COLLAPSED / B-ARTC-ACTIONS-GROUPING / B-DATA-NO-DRY-RUN / B-DATA-NO-CATEGORY-CLEAR / B-DATA-EXPORT-LOG-SECRET-LEAK；附带修复 .gitignore data/ 太宽吞 API 路由。
- **2026-06-27**: PR-3 (Schedule 单一真相 + History 持久化 + Settings/Articles/Reports 加固) 合并 — 修复 18 项 P0/P1/P2：B-CRON-DEAD / B-BUILTIN-TIMER-CONFUSING / B-AUTO-SYNC-DEAD / B-SYNC-HISTORY-NO-PERSISTENCE / B-PIPELINE-MODEL-CROSS-PROVIDER (P0) / B-NOTION-DBID-NO-SAVE-BTN / B-XAI-MODEL-MISSING / B-SYNC-RESUME / B-DEEPSEEK-BASE / B-PATH-STYLE-INCONSISTENT / B-PUB-STATUS / B-ARTC-UPLOADED-NEVER-WRITTEN / B-ARTC-RUN-CONFIRM / B-NAV-REPORTS / B-REPORTS-PAGE / B-SYNC-DEEP-TIMESTAMP-MISLEADING。BUGS.md 待修复表现在仅 B026 obsolete 标记；P3 留作后续。GitNexus 索引待重建。
- **2026-06-27**: PR-2 (DB Truth + Stream) 合并 — 修复 B052–B055（Logs API 真值化 + SyncTerminal SSE + launchd GET + Articles 模型动态化）；新增 4 项验收修复（pipeline-log 共享模块避免 Python `[INFO]` 行被误判 Error、Stop 按钮红框高亮、Activity DB+fs 合并排序、Articles 每行 Run 旁加模型下拉）；GitNexus 索引待重建
- **2026-06-27**: PR-1 (Data Truthification) 合并 — 修复 B046–B051 + B056–B061（Dashboard 6 卡 + bookmarks.json 真值源 + lifecycle join + Articles uploaded 状态 + 翻页 + Run modal + 双进度条默认显示 + Settings 5 项 UX 修复 + notion-stats .env 引号 bug）；新增 B052–B055 留 PR-2 处理；GitNexus 重建索引 3254 nodes / 6147 edges / 285 flows
- **2026-06-27**: UI 全面审计 — 新增 B046–B055（4 P0 + 6 P1，详见 `docs/UI_AUDIT_2026-06-27.md`）；B026 标记 obsolete（`app.py` 已删除）
- **2026-05-05**: 修复 B037–B045（管线全面稳定化：--resume 默认、Notion 去重、Exa bug、并发保护、auto_run.sh 更新等）
- **2026-05-04**: 修复 B036（TypeScript build 错误）；修复 B035（代理/白屏）
- **2026-04-28**: 修复 B021–B025、B027–B034（HIGH/MEDIUM/LOW）；B026 暂缓 deferred；requirements 锁定；`_unshorten` HEAD+GET fallback；`get_config` 注入 author
- **2026-04-28**: 代码审查 — 新增 B021–B034
- **2026-04-01**: 修复 B014–B020
- **2026-03-31**: 修复 B013；报告增强 Phase 1–3；B009–B012、B008、B007 等
- **2026-03-30**: 初始创建