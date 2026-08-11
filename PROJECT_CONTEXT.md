# Twitter Bookmark 报告系统 — 项目上下文

> 本文件供 Subagent 了解项目实际情况。数据截止 2026-06-27。
> 每次开发迭代前先读此文件。

---

## 一、项目位置与结构

```
/Users/tizer_mac_studio/work/Cursor/Twitter Bookmark/
├── twitter_data/
│   └── bookmarks.json          ← 书签数据源（主数据，不提交 git）
├── sync_bookmarks.sh            ← 书签同步脚本（rettiwt-api v7）
└── x-bookmark-reports/         ← 本系统根目录
    ├── auto_run.sh              ← launchd 定时脚本（每 3 小时）
    ├── Open Dashboard UI.command ← 双击启动 Next.js UI（macOS）
    ├── bin/
    │   ├── coordinator.py       ← 深度报告生成主入口
    │   ├── article_pipeline.py  ← 成品文章管线 CLI
    │   └── upload_to_notion.py  ← Notion 上传脚本（含去重保护）
    ├── lib/
    │   ├── config.py
    │   ├── coordinator.py
    │   ├── report_builder.py
    │   ├── article_client.py / quoted_client.py / github_client.py / external_client.py
    │   └── article_pipeline/   ← 成品管线子模块
    │       ├── state.py / metadata.py / research.py / rewrite.py
    │       └── prompts/
    ├── ui/                      ← Next.js Dashboard
    │   ├── src/app/             ← 页面路由 + API routes（Next.js App Router）
    │   ├── src/components/      ← React 组件
    │   ├── src/lib/
    │   │   ├── fs-data.ts       ← 文件系统数据层（读 output/ 目录）
    │   │   └── db.ts            ← SQLite 数据库访问层
    │   └── data/x_bookmarks.db  ← SQLite DB（日志、书签元数据、设置）
    ├── docs/                    ← 项目文档（审计、变更日志、归档）
    │   ├── UI_AUDIT_2026-06-27.md ← UI 全面审计报告
    │   ├── CHANGELOG.md         ← 变更日志
    │   └── archive/             ← 过期规划归档
    ├── logs/                    ← 运行日志（gitignore，持久化）
    │   └── bookmark-auto.log    ← auto_run.sh 日志
    ├── output/                  ← 管线产出（gitignore）
    │   ├── bookmark-deep-*.md   ← 深度报告草稿
    │   ├── article-final/       ← 成品文章 .md
    │   ├── article-research/    ← 研究结果 .json
    │   ├── 归档/                 ← 历史文件归档（不计入统计）
    │   ├── .deep-run-state.json
    │   ├── .article-pipeline-state.json
    │   ├── .notion-finished-state.json
    │   └── auto_run_state.json  ← auto_run.sh 最近一次执行状态
    ├── cache/                   ← API 响应缓存（gitignore）
    ├── Progress.md              ← 工作日志（按迭代记录）
    ├── README.md / WORKFLOW.md / BUGS.md / TASK_SUMMARY.md
    └── AGENTS.md / CLAUDE.md    ← GitNexus 自动生成
```

**重要**：项目名含空格（`Twitter Bookmark`），Shell 命令中涉及路径必须加引号。

---

## 二、书签数据详情（bookmarks.json）

- **路径**：`/Users/tizer_mac_studio/work/Cursor/Twitter Bookmark/twitter_data/bookmarks.json`
- **格式**：JSON 数组，当前约 **1584 条**书签记录（每次 sync 追加到数组头部）
- **排序**：数组靠前 ≈ 最近加入的书签，不严格按时间排序

### 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 推文 ID（19 位数字字符串） |
| `fullText` | string | 推文全文 |
| `createdAt` | string | **两种格式并存**（见 schema 兼容说明） |
| `lang` | string | 语言代码 zh/en |
| `tweetBy` | dict | 作者信息（userName, fullName 等） |
| `entities.urls` | **list[str]** | URL 字符串数组（**不是 dict**） |
| `media` | list[dict] | 图片/视频 |
| `quoted` | dict | 引用推文 |

### schema 兼容说明（两种 createdAt 格式并存）

| rettiwt 版本 | `createdAt` 格式 | 样例 |
|---|---|---|
| v4（旧版 567 条） | Twitter native | `Thu Apr 16 22:43:55 +0000 2026` |
| v7（2026-04-20 升级后） | ISO 8601 | `2026-04-20T01:30:35.000Z` |

**已处理双格式的位置**：
- `lib/report_builder.py::_parse_datetime`
- `bin/upload_to_notion.py::_parse_published_at`

---

## 三、管线全流程

```
Step 0: 代理检测（可选 --force 跳过）
        → 检查 http://127.0.0.1:7897 是否可达

Step 1: sync_bookmarks.sh
        → 从 Twitter 拉取新书签，prepend 到 bookmarks.json

Step 2: python3 bin/coordinator.py --deep-batch
        → 读 bookmarks.json，生成深度报告草稿
        → 输出：output/bookmark-deep-{tweet_id}.md
        → 进度：output/.deep-run-state.json

Step 3: .venv/bin/python3 bin/article_pipeline.py run-batch
        → 对每篇深度草稿执行：元数据解析 → 研究搜索 → DeepSeek 成文
        → 输出：output/article-final/{tweet_id}.md + output/article-research/{tweet_id}.json
        → 进度：output/.article-pipeline-state.json

Step 4: .venv/bin/python3 bin/upload_to_notion.py --mode finished --live
        → 上传成品文章到 Notion（已有 source_url 则跳过，防重复）
        → 进度：output/.notion-finished-state.json
```

**自动化**：`launchd (com.tizer.bookmark-auto)` 每 3 小时运行 `auto_run.sh` 执行完整 4 步流程。

**UI 手动触发**：Sync 页面分别触发「同步书签」（Step 1+2）、「Run Pipeline」（Step 3）、「Upload to Notion」（Step 4）。

---

## 四、状态文件说明

| 文件 | 用途 | 重置影响 |
|---|---|---|
| `output/.deep-run-state.json` | 记录已生成深度报告的 tweet_id 集合 | 清空后 coordinator 将重新处理所有书签 |
| `output/.article-pipeline-state.json` | 记录每篇文章在成品管线中的状态（pending/research/written） | 清空后管线从头处理所有草稿 |
| `output/.notion-finished-state.json` | 记录已上传成品文章的 tweet_id | 即使清空，upload 也会通过 Notion DB 去重 |
| `output/auto_run_state.json` | `auto_run.sh` 最近一次执行的状态（status/step/计数/错误） | 清空后下次 launchd 触发会重新写入 |

**注意**：多个进程同时写同一状态文件会导致内容损坏。API routes 在启动新进程前会 kill 同类型的旧进程。

---

## 五、外部 API 清单

### 1. TwitterAPI.io（Article 正文）
- **用途**：获取 X Article 正文
- **Endpoint**：`GET https://api.twitterapi.io/twitter/article?tweet_id={article_id}`
- **认证**：`x-api-key: {TWITTER_API_IO_KEY}`
- **费用**：100 credits/article ≈ $0.001/article

### 2. FxTwitter（普通引用推文，免费）
- **Endpoint**：`GET https://api.fxtwitter.com/status/{tweet_id}`（无需认证）

### 3. GitHub REST API（README）
- **Endpoint**：`GET https://api.github.com/repos/{owner}/{repo}/readme`

### 4. TwitterAPI.io（推文回复）
- **Endpoint**：`GET https://api.twitterapi.io/twitter/tweet/replies`

### 5. 研究搜索栈（SearXNG 主 → Firecrawl 备 → Exa 可选）
文章研究阶段的检索优先级：

| 优先级 | 服务 | 配置 | 行为 |
|---|---|---|---|
| 主 | **SearXNG** | `SEARXNG_BASE_URL` | 自建聚合搜索；有结果时优先采用 |
| 备 | **Firecrawl** | `FIRECRAWL_API_KEY` / `FIRECRAWL_BASE_URL` | SearXNG 无结果时爬取补充 |
| 可选 | **Exa `/search`** | `EXA_API_KEY` / `EXA_BASE_URL` | 向量/语义搜索补充 |
| 可选 | **xAI Responses** | `XAI_API_KEY` | `web_search` + `x_search`；额度不足时 fail-soft |

> 说明：历史上以「Exa Research API / xAI 为主研究」；现已切换为 **SearXNG 主链路**，Exa 走 `/search`（非 research chat）作为可选补充。

### 6. Exa Search API（可选补充）
- **Endpoint**：`https://api.exa.ai/search`（或兼容 baseUrl）
- **认证**：`EXA_API_KEY`
- **注意**：旧 `exa-research` chat completions 路径已降级；若仍启用需取最后一个非空 choice，并有重试（最多 2 次，间隔 3s）

### 7. DeepSeek（文章成文）
- **Endpoint**：`https://api.deepseek.com/v1`（OpenAI 兼容）
- **模型**：`deepseek-chat`

### 8. Notion API（上传）
- **Endpoint**：`https://api.notion.com/v1/`
- **认证**：`Authorization: Bearer {NOTION_TOKEN}`
- **去重**：上传前查 `文章链接`（source_url）属性，已存在则跳过

---

## 六、系统环境

| 项目 | 当前状态 |
|---|---|
| Python（系统） | 3.9.6（`/usr/bin/python3`，用于 coordinator / upload） |
| Python（venv） | `/Users/.../x-bookmark-reports/.venv/bin/python3`（含 openai，用于 article_pipeline） |
| Node.js | v24.14.0 |
| rettiwt-api | v7.0.1（全局，`~/.local/bin/rettiwt`，书签同步用） |
| gh CLI | v2.89.0（已认证 account: 6tizer） |
| 代理 | `http://127.0.0.1:7897`（在 `.env` 中配置） |

**Python 版本注意**：代码必须兼容 Python 3.9，禁止使用：
- `match/case`（Python 3.10+）
- `str | None` 类型注解（Python 3.10+，需用 `Optional[str]`）

---

## 七、UI API Routes（Next.js）

| Route | 作用 |
|---|---|
| `POST /api/pipeline/coordinator` | 触发 sync_bookmarks.sh + coordinator.py --deep-batch |
| `POST /api/article-pipeline/run` | 触发 article_pipeline.py run-batch（默认 --resume） |
| `GET /api/article-pipeline/progress` | 查询成品管线实时进度 |
| `POST /api/pipeline/notion-upload` | 触发 upload_to_notion.py --mode finished --live |
| `GET /api/dashboard/stats` | 返回 Dashboard 统计数据 |
| `GET /api/dashboard/activity` | 返回 Activity Feed（受 `isDbEmpty()` 影响，见 B046） |
| `GET /api/settings` | 读取设置（从 .env + SQLite） |
| `POST /api/settings` | 保存设置 |
| `GET /api/settings/plaintext-key` | 按 key 名查询明文 API Key（前端 eye 按钮用） |
| `GET /api/schedule/launchd` | 查询 launchd 当前调度（待补，见 B054） |
| `POST /api/schedule/launchd` | 写入 launchd plist 并 reload |
| `GET /api/logs` | 查询日志（SQLite + `logs/bookmark-auto.log` 合并） |
| `GET /api/health` | 流水线健康：launchd / 积压 / `apiStatus`（xai/searxng/firecrawl/exa） |
| `GET /api/data/*` | 数据管理（导出 / 清理 / 备份） |
| `GET /api/system/rettiwt` | 检查 rettiwt 环境 |
| `GET /api/articles` | 列出成品文章 |
| `GET /api/articles/[id]` | 获取单篇文章详情 |
| `PUT /api/articles/[id]/publish` | 更新文章发布状态 |

---

## 八、launchd 定时任务

- **Plist**：`~/Library/LaunchAgents/com.tizer.bookmark-auto.plist`
- **脚本**：`auto_run.sh`（项目根目录）
- **频率**：每 3 小时（00:00 / 03:00 / 06:00 / 09:00 / 12:00 / 15:00 / 18:00 / 21:00）
- **日志**：`logs/bookmark-auto.log`（项目内，gitignore，重启不丢）
- **状态**：`output/auto_run_state.json`（最近一次执行状态）

管理命令：
```bash
launchctl unload ~/Library/LaunchAgents/com.tizer.bookmark-auto.plist
launchctl load ~/Library/LaunchAgents/com.tizer.bookmark-auto.plist
launchctl list | grep bookmark
tail -f logs/bookmark-auto.log     # 实时查看日志
cat output/auto_run_state.json     # 查看最近一次状态
```

---

## 九、重要注意事项

### 9.1 路径引号
项目路径含空格，bash 命令必须引用：
```bash
cd "/Users/tizer_mac_studio/work/Cursor/Twitter Bookmark/x-bookmark-reports"
bash -c "'$SCRIPT_PATH' && ..."  # 单引号包住含空格路径
```

### 9.2 Notion 去重
`upload_to_notion.py` 在每次上传前会查询 Notion DB 的 `文章链接` 属性。
若该 source_url 已存在则打印 `[SKIP-DUP]` 跳过，不会创建重复页面。

**重要事实**：`output/归档/` 的 943 篇草稿对应内容早已全部在 Notion（2026-04 起分批上传）。
本地 `.notion-*-state.json` 曾多次重置，**本地 state ≠ Notion 真实集合**；
判断是否已上传只能以 source_url 查 Notion 为准。详见 `.cursor/rules/facts.mdc`。

### 9.3 archive 目录不计入统计
`output/归档/` 目录下的历史文件不会被 `countDeepDrafts()` 扫描，不影响 Dashboard 计数。

### 9.4 Exa API 行为
`exa-research` 返回多个 choices，前面的 choices 是中间搜索步骤（content 为空），
真正的研究结果在最后一个非空 choice。代码已处理，并有 2 次重试机制（3s 间隔）。

### 9.5 并发进程保护
每个 API route 在启动新子进程前，会用 `pgrep` + `kill -9` 终止同类型的旧进程，
防止多个实例并发写入共享状态文件。

### 9.6 Settings 五 Tab（2026-06-27 改造）
UI Settings 页面包含 5 个 Tab：
- **General**：Notion DB ID、Auto Sync 开关、代理、数据路径
- **LLM & Web Search**：DeepSeek / xAI / Exa / SearXNG / Firecrawl + 模型选择 + baseUrl（带明文 eye 切换）
- **Schedule**：launchd 调度（cron 编辑器 + 当前调度显示）
- **Logs**：日志查看器（DB + bookmark-auto.log 合并）
- **Data**：数据导出 / 清理 / 备份

### 9.7 UI 审计与待修问题
`docs/UI_AUDIT_2026-06-27.md` 记录了 31+ 个 UI Bug（4 P0 / 6 P1 / 9 P2）。
P0/P1 已写入 `BUGS.md` 待修复表（B046–B055）。修复按 4 阶段 PR 路线图推进：
- PR-1：数据源真值化（B046/B047/B048）
- PR-2：DB 日志/活动解锁（B051/B052/B053）
- PR-3：调度单一源 + 历史持久化（B049/B054）
- PR-4：UI 硬化与清理（B050/B055 + P2/P3）

---

## 十、里程碑（Changelog 视角）

### 2026-06-27 — UI 审计 + 文档整理

**主要变更**：
1. **UI 全面审计**：`docs/UI_AUDIT_2026-06-27.md`，31+ bug（4 P0 / 6 P1 / 9 P2）
2. **文档整理**：归档 `UI-ADJUSTMENT-PLAN.md`；删除 Streamlit legacy（`app.py` + `start.command`）
3. **新建工作日志**：`Progress.md`（根目录）+ `docs/CHANGELOG.md`
4. **核心文档对齐**：`PROJECT_CONTEXT.md` / `README.md` / `WORKFLOW.md` 更新至当前状态
5. **`BUGS.md` 补全**：B046–B055（UI 审计 P0/P1）
6. **`ui/` 文档更新**：重写 `ui/README.md`；`ui/CONTRACT.md` 加 DEPRECATED PARTIAL 标注

### 2026-05-05 — 管线全面重构与稳定化

**主要变更**：
1. **4 步管线固化**：sync → deep draft → article pipeline → upload finished（原 3 步）
2. **auto_run.sh 更新**：加入 `article_pipeline.py` 步骤；改用 `.venv/bin/python3` 运行含 openai 依赖的脚本
3. **launchd 调频**：8 小时改为每 3 小时
4. **Notion 去重保护**：上传前查 source_url，防止重复创建页面
5. **Exa bug 修复**：`choices[0]` → 遍历取最后非空；加入重试
6. **并发进程保护**：各 API route 精准 kill 同类进程
7. **Sync Bookmarks UI**：正确执行 `sync_bookmarks.sh` 后再启动 `coordinator.py`
8. **归档目录**：历史文件归档到 `output/归档/`，不计入 Dashboard 统计
9. **默认 --resume**：`article_pipeline.py run-batch` 默认启用续跑，防止重复处理

### 2026-04-20 — rettiwt-api v4→v7 升级

详见 [此前 PROJECT_CONTEXT.md 第十二节]。

---

## 十一、工作流规范

| 文件 | 职责 |
|---|---|
| `WORKFLOW.md` | 工作流详细规范 |
| `BUGS.md` | Bug 跟踪（必读） |
| `TASK_SUMMARY.md` | Subagent 输出模板 |
| `Progress.md` | 工作日志（按迭代记录功能/错误/解决方案） |
| `docs/CHANGELOG.md` | 变更日志（从 BUGS 已修复 + 里程碑提取） |
| `docs/UI_AUDIT_2026-06-27.md` | UI 全面审计报告（P0/P1/P2 详解 + PR 路线图） |
| `.cursor/rules/workflow.mdc` | Cursor IDE 规则 |
