# 代码审查跟踪

> 本文件记录所有代码审查发现的问题，便于跟踪修复状态。
> 每次代码审查后更新此文件。

---

## 待修复

> UI 审计 P0/P1 详见 [docs/UI_AUDIT_2026-06-27.md](./docs/UI_AUDIT_2026-06-27.md)。
> P2/P3 不计入 BUGS.md，保留在审计文档中随修复 PR 处理。

| ID   | 文件     | 问题描述                                                                                                                                                           | 严重性    | 发现日期       | 状态       |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | -------- |
| B026 | app.py | `_run_deep_batch_inner`（L363-555）完整复制了 `BookmarkCoordinator.run_deep` 的核心逻辑，任何 bug 修复需同步两处，维护风险高。**暂缓**：建议后续改为 `run_deep` 注入进度/stop 回调，一次性重构并配合 Streamlit 回归测试。**注：app.py 已于 2026-06-27 删除，本条作废** | MEDIUM | 2026-04-28 | deferred-obsolete |
| B052 | ui/src/app/api/logs/route.ts | Logs Viewer 在 DB 模式下仍返回 mock 数据，未读取 SQLite `logs` 表。注：PR-1 已用 fs 真值源替换 isDbEmpty() 分支，但 Logs 路由仍走旧逻辑，需 PR-2 解锁 DB 日志写入路径并接真值。 | MEDIUM | 2026-06-27 | 待修复 |
| B053 | ui/src/app/sync/page.tsx | Sync Terminal 依赖 SSE 流，但后端 `child_process.spawn` 未做 stdout 转发，UI 看不到实时输出 | MEDIUM | 2026-06-27 | 待修复 |
| B054 | ui/src/app/api/schedule/launchd/route.ts | 缺 GET 方法，前端无法读取当前 launchd 调度详情（频率/下次触发时间），Settings Schedule Tab 显示空白 | MEDIUM | 2026-06-27 | 待修复 |
| B055 | ui/src/app/articles/page.tsx | 模型列表硬编码且过期，未从 `/api/settings` 动态读取当前可用模型 | MEDIUM | 2026-06-27 | 待修复 |
| B056 | ui/src/components/settings/ScheduleSettings.tsx | Schedule Tab 「Pipeline steps executed」显示 3 步过时清单（缺 `sync_bookmarks.sh`），与 auto_run.sh 实际 4 步不一致 | LOW | 2026-06-27 | 待修复 |
| B057 | ui/src/components/settings/LLMSettings.tsx | DeepSeek > Model 与 Pipeline Default Model 两个下拉缺少文案区分，用户混淆持久化 .env 与浏览器临时覆盖 | LOW | 2026-06-27 | 待修复 |
| B058 | ui/src/components/settings/GeneralSettings.tsx | Notion Upload Live / Auto Sync 两个 toggle 视觉错位（thumb 16×16 在 36×20 椭圆里 ON 距右沿仅 4px，shadow 散开后视觉「贴边/挤出」） | LOW | 2026-06-27 | 待修复 |
| B059 | ui/src/components/settings/GeneralSettings.tsx | Save Changes 反馈不可见：后端响应 <100ms 时「Saving...」一闪而过 | LOW | 2026-06-27 | 待修复 |
| B060 | ui/src/components/settings/LogViewer.tsx | Logs 筛选条 Component + Level 挤在同一 flex-wrap 容器，宽度足够时不换行，视觉拥挤 | LOW | 2026-06-27 | 待修复 |
| B061 | ui/src/lib/notion-stats.ts | parseEnv 不剥离 .env 值的首尾引号，NOTION_TOKEN="ntn_xxx" 被带引号发送给 Notion API 导致 401，Dashboard totalArticlesNotion=0 静默兜底；catch 块吞错无日志 | HIGH | 2026-06-27 | 待修复 |


---

## 已修复


| ID   | 文件                                 | 问题描述                                                                                                   | 严重性    | 发现日期       | 修复日期       | 修复说明                                                    |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ | ---------- | ---------- | ------------------------------------------------------- |
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

- **2026-06-27**: PR-1 (Data Truthification) 合并 — 修复 B046–B051 + B056–B061（Dashboard 6 卡 + bookmarks.json 真值源 + lifecycle join + Articles uploaded 状态 + 翻页 + Run modal + 双进度条默认显示 + Settings 5 项 UX 修复 + notion-stats .env 引号 bug）；新增 B052–B055 留 PR-2 处理；GitNexus 重建索引 3254 nodes / 6147 edges / 285 flows
- **2026-06-27**: UI 全面审计 — 新增 B046–B055（4 P0 + 6 P1，详见 `docs/UI_AUDIT_2026-06-27.md`）；B026 标记 obsolete（`app.py` 已删除）
- **2026-05-05**: 修复 B037–B045（管线全面稳定化：--resume 默认、Notion 去重、Exa bug、并发保护、auto_run.sh 更新等）
- **2026-05-04**: 修复 B036（TypeScript build 错误）；修复 B035（代理/白屏）
- **2026-04-28**: 修复 B021–B025、B027–B034（HIGH/MEDIUM/LOW）；B026 暂缓 deferred；requirements 锁定；`_unshorten` HEAD+GET fallback；`get_config` 注入 author
- **2026-04-28**: 代码审查 — 新增 B021–B034
- **2026-04-01**: 修复 B014–B020
- **2026-03-31**: 修复 B013；报告增强 Phase 1–3；B009–B012、B008、B007 等
- **2026-03-30**: 初始创建