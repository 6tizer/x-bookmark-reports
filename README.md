# x-bookmark-reports

Twitter 书签 → 深度报告 → 成品文章的全自动流水线系统。自动抓取、分类、清洗书签内容，AI 加工为深度文章，提供 Next.js Dashboard 可视化管控，并定时上传 Notion。

---

## 🚀 快速启动

### Dashboard UI (Next.js)

```bash
cd ui/
npm install
npm run build   # 生产构建
npm start       # 启动（端口 3001）
# 或开发模式：
npm run dev
```

浏览器打开 `http://localhost:3001`，5 个主页面：

| 页面 | 内容 |
|---|---|
| Dashboard | 管线统计卡片 + 4 节点 Pipeline 状态图 |
| Bookmarks | 书签列表（作者、标题、互动数据） |
| Sync | Pipeline 控制中心（触发各阶段、查看日志） |
| Articles | 成品文章列表 |
| Settings | General / LLM & Web Search / Schedule / Logs / Data 五 Tab |

> 若 Cursor 内置浏览器 502/白屏：`npm run dev:clean` 清除缓存后重试，或用 `http://127.0.0.1:3001`（绕过系统代理）。

---

## 📁 目录结构

```
x-bookmark-reports/
├── auto_run.sh                 # launchd 定时任务入口（每 3 小时）
├── Open Dashboard UI.command   # 双击启动 Next.js UI（macOS）
├── bin/
│   ├── coordinator.py          # 深度报告生成主入口
│   ├── article_pipeline.py     # 成品文章管线 CLI（研究 + 成文）
│   └── upload_to_notion.py     # Notion 上传脚本（草稿 + 成品）
├── lib/
│   ├── config.py               # 配置（从 .env 读取）
│   ├── coordinator.py          # 书签处理核心逻辑
│   ├── article_client.py       # TwitterAPI.io Article 客户端
│   ├── quoted_client.py        # FxTwitter 引用推文客户端
│   ├── github_client.py        # GitHub README 客户端
│   ├── external_client.py      # 外部链接抓取客户端
│   ├── report_builder.py       # Markdown 报告生成器
│   └── article_pipeline/       # 成品文章管线模块
│       ├── state.py            # 管线状态（幂等、可续跑）
│       ├── metadata.py         # 深度报告元数据解析
│       ├── research.py         # xAI + Exa 双路搜索研究
│       ├── rewrite.py          # DeepSeek 文章成文
│       └── prompts/            # System prompt 模板
├── ui/                         # Next.js Dashboard ★
│   ├── src/
│   │   ├── app/                # 页面路由 + API routes
│   │   ├── components/         # UI 组件
│   │   ├── lib/
│   │   │   ├── fs-data.ts      # 文件系统数据层
│   │   │   └── db.ts           # SQLite 数据库（日志、设置）
│   │   └── types/              # TypeScript 类型定义
│   └── data/
│       └── x_bookmarks.db      # SQLite DB（日志、书签、设置）
├── docs/                       # 项目文档
│   ├── UI_AUDIT_2026-06-27.md  # UI 审计报告（31+ bug）
│   ├── CHANGELOG.md            # 变更日志
│   └── archive/                # 过期规划归档
├── logs/                       # 运行日志（gitignore，持久化）
│   └── bookmark-auto.log       # auto_run.sh 日志
├── output/                     # 管线产出（gitignore）
│   ├── bookmark-deep-*.md      # 深度报告草稿
│   ├── article-final/          # 成品文章 (.md)
│   ├── article-research/       # 研究结果 (.json)
│   ├── .deep-run-state.json    # 深度报告进度
│   ├── .article-pipeline-state.json  # 成品管线进度
│   ├── .notion-finished-state.json   # Notion 上传进度
│   └── auto_run_state.json     # auto_run.sh 最近一次状态
├── cache/                      # API 响应缓存（gitignore）
├── Progress.md                 # 工作日志（按迭代记录）
├── .env                        # 环境配置（不提交）
└── .env.example                # 配置示例
```

---

## 🔄 完整管线流程

```
Twitter 书签
    │
    ▼  sync_bookmarks.sh
bookmarks.json（增量同步）
    │
    ▼  coordinator.py --deep-batch
深度报告草稿（bookmark-deep-*.md）
    │
    ▼  article_pipeline.py run-batch
成品文章（output/article-final/*.md）
研究结果（output/article-research/*.json）
    │
    ▼  upload_to_notion.py --mode finished --live
Notion DB（状态=已发布）
```

每 3 小时由 `launchd (com.tizer.bookmark-auto)` 自动触发全流程，也可在 UI Sync 页面手动触发各阶段。

---

## ⚙️ 环境配置

在项目根目录创建 `.env`：

```bash
# 必填
TWITTER_API_IO_KEY=your_key      # TwitterAPI.io（书签 Article 获取）
NOTION_TOKEN=secret_xxx          # Notion Integration Token
NOTION_DB_ID=your_db_id          # Notion 数据库 ID

# AI 模型（成品管线必填）
DEEPSEEK_API_KEY=your_key        # DeepSeek（文章成文）
XAI_API_KEY=your_key             # xAI Grok（搜索研究）
EXA_API_KEY=your_key             # Exa（补充研究，可选）

# 可选
PROXY=http://127.0.0.1:7897
BOOKMARKS_PATH=../twitter_data/bookmarks.json
XAI_MODEL=grok-4.3
DEEPSEEK_MODEL=deepseek-chat
NOTION_UPLOAD_LIVE=true          # 默认 false（dry-run）
```

---

## 🐍 Python 后端命令

### 深度报告（coordinator.py）

```bash
# 增量生成深度报告（跳过已完成）
python3 bin/coordinator.py --deep-batch

# 全量重新生成
python3 bin/coordinator.py --full

# 单条测试
python3 bin/coordinator.py --id <tweet_id>
```

### 成品文章管线（article_pipeline.py）

```bash
# 查看管线状态
.venv/bin/python3 bin/article_pipeline.py status

# 批量处理（默认 resume，跳过已完成）
.venv/bin/python3 bin/article_pipeline.py run-batch

# 处理单篇
.venv/bin/python3 bin/article_pipeline.py run-one --id <tweet_id>

# 只跑研究步骤
.venv/bin/python3 bin/article_pipeline.py research-only --id <tweet_id>

# 只跑成文步骤
.venv/bin/python3 bin/article_pipeline.py write-only --id <tweet_id>
```

### Notion 上传（upload_to_notion.py）

```bash
# 上传成品文章（dry-run）
.venv/bin/python3 bin/upload_to_notion.py --mode finished

# 真实上传（自动去重：已存在则跳过）
.venv/bin/python3 bin/upload_to_notion.py --mode finished --live

# 上传单篇
.venv/bin/python3 bin/upload_to_notion.py --mode finished --live \
  --file output/article-final/<tweet_id>.md
```

### 手动触发全流程

```bash
bash auto_run.sh --force   # 跳过代理检测，立即运行全流程
```

---

## 🤖 AI 搜索供应商

| 供应商 | 用途 | 模型 | 说明 |
|---|---|---|---|
| **xAI (Grok)** | 主力搜索 | `grok-4.3` | Responses API，含 `web_search` + `x_search` |
| **Exa** | 补充研究 | `exa-research` | 多 choices，自动取最后非空结果，2 次重试 |
| **DeepSeek** | 文章成文 | `deepseek-chat` | OpenAI 兼容 API |

---

## 🔗 相关文档

- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) — 项目详细技术上下文
- [WORKFLOW.md](./WORKFLOW.md) — 开发工作流规范
- [BUGS.md](./BUGS.md) — Bug 跟踪记录
- [Progress.md](./Progress.md) — 工作日志（按迭代记录）
- [docs/CHANGELOG.md](./docs/CHANGELOG.md) — 变更日志
- [docs/UI_AUDIT_2026-06-27.md](./docs/UI_AUDIT_2026-06-27.md) — UI 审计报告（31+ bug）
