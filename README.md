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

浏览器打开 `http://localhost:3000`，6 个页面：

| 页面 | 内容 |
|------|------|
| Dashboard | 总量统计 (485 书签 / 74 报告 / 411 待处理) + Pipeline 状态 |
| Bookmarks | 书签列表 (作者、推文标题、互动数据) |
| Sync | 同步控制中心 (增量/全量同步、日志、环境配置) |
| Reports | 深度报告草稿列表 (从 `output/` 读取) |
| Articles | 成品文章列表 (从 `bookmark-articles/` 读取) |
| Settings | 代理/数据目录/Auto Sync 开关 |

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
│   └── upload_to_notion.py     # Notion 批量上传脚本
├── lib/
│   ├── article_client.py       # TwitterAPI.io Article API 客户端
│   ├── quoted_client.py        # FxTwitter API 客户端
│   ├── github_client.py        # GitHub API 客户端
│   ├── external_client.py      # 外部链接抓取客户端
│   └── report_builder.py       # Markdown 报告生成器
├── cache/                      # API 响应缓存
├── output/                     # 深度报告草稿 (.md)
└── .env                        # 环境配置（不提交）
```

---

## 🔧 数据管道 (Python 后端)

### 功能介绍

| 类型 | 描述 | 数据来源 |
|------|------|----------|
| **Article** | Twitter 长篇文章原文 | TwitterAPI.io API |
| **Quoted Tweet** | 引用的推文和纯文字推文 | FxTwitter API / 本地数据 |
| **GitHub** | GitHub 仓库的 README | GitHub REST API |
| **External** | 其他外部链接内容 | 直接抓取 |

**核心功能**：自动分类书签类型、多级缓存、增量/全量运行、t.co 短链解析、HTML 内容清理、回复抓取。

### 运行命令

| 命令 | 说明 |
|------|------|
| `python3 bin/coordinator.py` | 增量运行 |
| `python3 bin/coordinator.py --full` | 全量运行（忽略缓存） |
| `python3 bin/coordinator.py --limit 10` | 仅处理前 10 条 |
| `python3 bin/coordinator.py --deep-batch` | 批量深度报告，每条单独文件 |
| `bash auto_run.sh` | 手动执行全流程（同步 + 生成 + 上传） |

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
