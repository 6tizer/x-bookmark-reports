# x-bookmark-reports

Twitter 书签 → 报告 → 成品文章的全流程系统。自动抓取、分类、清洗书签内容，AI 加工为深度文章，提供 Notion 风格的可视化 Dashboard。

---

## 🚀 快速启动

### Dashboard UI (Next.js)

```bash
cd ui/
npm install
npm run dev
```

也可在仓库根目录执行（Next 的当前工作目录为 `x-bookmark-reports/` 时同样有效）：

```bash
cd ui && npm install && npm run dev
# 或从 monorepo 根目录：在含 ui/package.json 的目录下执行 npm run dev --prefix ui
```

浏览器打开 `http://localhost:3001`（与本机 3000 上其他服务错开），6 个页面：

若 Cursor 内置浏览器 **502 / 白屏**：`Cmd+Shift+P` → **Developer: Reload Window**；仍不行见 `ui/TROUBLESHOOTING.txt`，并在 `ui/` 执行 **`npm run dev:clean`**。


| 页面        | 内容                                            |
| --------- | --------------------------------------------- |
| Dashboard | 总量统计 (485 书签 / 74 报告 / 411 待处理) + Pipeline 状态 |
| Bookmarks | 书签列表 (作者、推文标题、互动数据)                           |
| Sync      | 同步控制中心 (增量/全量同步、日志、环境配置)                      |
| Reports   | 深度报告草稿列表 (从 `output/` 读取)                     |
| Articles  | 成品文章列表 (从 `bookmark-articles/` 读取)            |
| Settings  | 代理/数据目录/Auto Sync 开关                          |


Dashboard 从本地文件系统直接读取 `output/` (草稿) 和 `bookmark-articles/` (成品文章)，无需数据库。

---

## 📁 目录结构

```
x-bookmark-reports/
├── app.py                      # Streamlit Web UI (旧版)
├── auto_run.sh                 # 自动化流水线（同步 + 生成 + 上传）
├── sync_bookmarks.sh           # Twitter 书签增量同步脚本
├── ui/                         # Next.js Dashboard UI ★
│   ├── src/
│   │   ├── app/                # 页面路由 (6 页面)
│   │   ├── components/         # UI 组件
│   │   ├── lib/fs-data.ts      # 文件系统数据层 (读取 output/ + bookmark-articles/)
│   │   ├── hooks/              # React Hooks
│   │   └── store/              # Zustand 状态管理
│   ├── package.json
│   └── tailwind.config.ts
├── bin/
│   ├── coordinator.py          # 主入口脚本（报告生成）
│   ├── upload_to_notion.py     # Notion 批量上传脚本（草稿 + 成品）
│   └── article_pipeline.py     # 成文管线 CLI（研究 + 改写）
├── lib/
│   ├── article_client.py       # TwitterAPI.io Article API 客户端
│   ├── quoted_client.py        # FxTwitter API 客户端
│   ├── github_client.py        # GitHub API 客户端
│   ├── external_client.py      # 外部链接抓取客户端
│   ├── report_builder.py       # Markdown 报告生成器
│   ├── config.py               # 配置（含 Article Pipeline LLM 配置）
│   └── article_pipeline/       # 成文管线模块
│       ├── state.py            # 管线状态管理
│       ├── metadata.py         # 深度报告元数据解析
│       ├── research.py         # x.ai + Exa 双路检索
│       ├── rewrite.py          # DeepSeek 成文
│       └── prompts/            # System prompt 模板
├── cache/                      # API 响应缓存
├── output/                     # 深度报告草稿 (.md)
│   ├── article-final/          # 成品文章 (.md)
│   └── article-research/       # 研究结果 (.json)
└── .env                        # 环境配置（不提交）
```

---

## 🔧 数据管道 (Python 后端)

### 功能介绍


| 类型               | 描述                | 数据来源                 |
| ---------------- | ----------------- | -------------------- |
| **Article**      | Twitter 长篇文章原文    | TwitterAPI.io API    |
| **Quoted Tweet** | 引用的推文和纯文字推文       | FxTwitter API / 本地数据 |
| **GitHub**       | GitHub 仓库的 README | GitHub REST API      |
| **External**     | 其他外部链接内容          | 直接抓取                 |


**核心功能**：自动分类书签类型、多级缓存、增量/全量运行、t.co 短链解析、HTML 内容清理、回复抓取。

### 运行命令


| 命令                                        | 说明                    |
| ----------------------------------------- | --------------------- |
| `python3 bin/coordinator.py`              | 增量运行                  |
| `python3 bin/coordinator.py --full`       | 全量运行（忽略缓存）            |
| `python3 bin/coordinator.py --limit 10`   | 仅处理前 10 条             |
| `python3 bin/coordinator.py --deep-batch` | 批量深度报告，每条单独文件         |
| `bash auto_run.sh`                        | 手动执行全流程（同步 + 生成 + 上传） |


---

## Article Pipeline — 本地成文管线

深度报告草稿经过 **研究搜索 + DeepSeek 成文** 转为成品文章，上传 Notion 时状态直接为「已发布」。

### 前置条件

在 `.env` 中配置以下 API Key：

```bash
DEEPSEEK_API_KEY=your_key     # 文章改写（DeepSeek，OpenAI 兼容）
XAI_API_KEY=your_key          # 研究搜索（x.ai grok）
# EXA_API_KEY=your_key        # 可选：Exa 补充搜索
```

### 运行命令

```bash
# 查看管线状态
python3 bin/article_pipeline.py status

# 处理单篇文章（完整流程：元数据 → 研究 → 成文）
python3 bin/article_pipeline.py run-one --id <tweet_id>

# 批量处理（跳过已完成）
python3 bin/article_pipeline.py run-batch --resume

# 只跑研究步骤
python3 bin/article_pipeline.py research-only --id <tweet_id>

# 只跑成文步骤（需要已有研究结果）
python3 bin/article_pipeline.py write-only --id <tweet_id>
```

### 成品上传到 Notion

```bash
# 预览（dry-run）
python3 bin/upload_to_notion.py --mode finished

# 真实上传
python3 bin/upload_to_notion.py --mode finished --live

# 上传单篇
python3 bin/upload_to_notion.py --mode finished --file output/article-final/<tweet_id>.md
```

### 产出目录

| 目录 | 内容 |
|------|------|
| `output/article-final/` | 成品 Markdown 文件 |
| `output/article-research/` | 研究搜索结果 JSON |
| `output/.article-pipeline-state.json` | 管线状态（幂等、可续跑） |

### 搜索供应商

| 供应商 | 用途 | 模型 |
|--------|------|------|
| x.ai | Web + X 搜索（Responses API，server-side agentic） | `grok-4.3` |
| Exa | 补充深度研究（可选） | `exa-research` |
| DeepSeek | 文章改写 | `deepseek-chat` |


---

## ⚙️ 配置

```bash
# .env
TWITTER_API_IO_KEY=your_api_key_here   # 必填
PROXY=http://127.0.0.1:7897            # 可选
BOOKMARKS_PATH=../twitter_data/bookmarks.json  # 书签文件路径
```

---

## 🔗 相关文档

- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) — 项目详细上下文
- [WORKFLOW.md](./WORKFLOW.md) — 工作流规范
- [BUGS.md](./BUGS.md) — Bug 跟踪

