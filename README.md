# Twitter Bookmark Reports

Twitter 书签报告生成系统 — 自动处理 Twitter/X 书签数据，获取 Article 原文、引用推文、GitHub README 和外部链接内容，生成可读的 Markdown 报告。

---

## 功能介绍

本系统从 Twitter 书签数据中提取并处理以下类型的内容：

| 类型 | 描述 | 数据来源 |
|------|------|----------|
| **Article** | Twitter 长篇文章原文 | TwitterAPI.io API |
| **Quoted Tweet** | 引用的推文 | FxTwitter API |
| **GitHub** | GitHub 仓库的 README | GitHub REST API |
| **External** | 其他外部链接内容 | 直接抓取 |

**核心功能**：

- 自动分类书签类型（Article / Quoted / GitHub / External）
- 多级缓存机制，减少 API 调用
- 支持增量运行和全量运行
- 生成 Markdown 格式报告
- 处理 t.co 短链自动解析

---

## 目录结构

```
x-bookmark-reports/
├── bin/
│   └── coordinator.py          # 主入口脚本
├── lib/
│   ├── __init__.py
│   ├── config.py               # 配置管理（.env 读取）
│   ├── article_client.py       # TwitterAPI.io Article API 客户端
│   ├── quoted_client.py        # FxTwitter API 客户端
│   ├── github_client.py        # GitHub API 客户端（使用 gh CLI）
│   ├── external_client.py      # 外部链接抓取客户端
│   └── report_builder.py       # Markdown 报告生成器
├── cache/                      # API 响应缓存（按类型分组）
│   ├── articles/              # Article 缓存（TTL: 7天）
│   ├── quoted/                # Quoted Tweet 缓存（TTL: 3天）
│   └── github/                # GitHub README 缓存（TTL: 12小时）
├── output/                     # 报告输出目录
│   ├── index.json              # 最新报告索引
│   └── index.md                # 最新报告索引
├── data/                       # 运行日志
│   └── run.log
├── .env                        # 环境配置
├── .env.example                # 配置示例
└── README.md                   # 本文档
```

### lib/ 文件说明

| 文件 | 功能 |
|------|------|
| `config.py` | 加载 `.env` 配置，定义 URL 路由规则、缓存 TTL 等 |
| `article_client.py` | 调用 TwitterAPI.io 获取 Article 正文 |
| `quoted_client.py` | 调用 FxTwitter 获取引用推文全文 |
| `github_client.py` | 使用 gh CLI 获取 GitHub 仓库 README |
| `external_client.py` | 抓取外部网页内容，支持 t.co 短链解析 |
| `report_builder.py` | 组装处理结果为 Markdown 报告 |

---

## 配置说明

### .env 变量清单

在项目根目录创建 `.env` 文件（或复制 `.env.example`）：

```bash
# Twitter API 配置（来自 .env.twitter）
API_KEY=                        # Twitter API Key（可选，用于兼容）
PROXY=http://127.0.0.1:7897    # 代理服务器（可选）

# TwitterAPI.io API（必填，用于获取 Article）
TWITTER_API_IO_KEY=your_api_key_here
TWITTER_API_BASE_URL=https://api.twitterapi.io

# GitHub 配置（必填，用于 gh CLI）
GITHUB_OWNER=your_github_username
GITHUB_REPO=your_repo_name
GITHUB_BRANCH=main
```

### 配置说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `API_KEY` | 可选 | Twitter 原始 API Key |
| `PROXY` | 可选 | HTTP 代理地址，如 `http://127.0.0.1:7897` |
| `TWITTER_API_IO_KEY` | **必填** | TwitterAPI.io API Key，从 [twitterapi.io/dashboard](https://twitterapi.io/dashboard) 获取 |
| `GITHUB_OWNER` | **必填** | GitHub 用户名（用于 gh CLI） |
| `GITHUB_REPO` | **必填** | GitHub 仓库名 |
| `GITHUB_BRANCH` | 可选 | GitHub 分支，默认 `main` |

---

## 使用命令

### 基本用法

```bash
cd "/Users/tizer_mac_studio/work/Cursor/Twitter Bookmark/x-bookmark-reports"
```

### 运行命令

| 命令 | 说明 |
|------|------|
| `python3 bin/coordinator.py` | 增量运行（跳过已缓存的） |
| `python3 bin/coordinator.py --full` | 全量运行（忽略缓存） |
| `python3 bin/coordinator.py --limit 10` | 仅处理前 10 条书签 |
| `python3 bin/coordinator.py --id TWEET_ID` | 测试单条书签 |
| `python3 bin/coordinator.py --format html` | 输出 HTML 格式报告 |

### 命令行参数

| 参数 | 说明 |
|------|------|
| `--full` | 全量运行，跳过缓存 |
| `--limit N` | 限制处理数量为 N 条 |
| `--id TWEET_ID` | 仅处理指定 ID 的书签（测试用） |
| `--format md\|html` | 报告格式，默认 markdown |
| `--bookmarks PATH` | 指定书签 JSON 文件路径 |
| `--output PATH` | 指定输出目录 |

### 输出示例

```
==================================================
PROCESSING COMPLETE
==================================================
Total processed: 50
  - Articles: 12
  - Quoted tweets: 8
  - GitHub links: 15
  - External links: 15
  - Errors: 2

Report: output/bookmark-report-20260331_120000.md
Data: output/processed-bookmarks-20260331_120000.json
Time: 23.5s
```

---

## 缓存说明

### cache/ 目录结构

```
cache/
├── articles/          # Article API 响应缓存
├── quoted/           # FxTwitter API 响应缓存
└── github/           # GitHub README 缓存
```

### 缓存 TTL（生存时间）

| 类型 | TTL | 说明 |
|------|-----|------|
| Article | 7 天 | 推文内容相对稳定 |
| Quoted Tweet | 3 天 | 互动数据变化较快 |
| GitHub README | 12 小时 | 代码仓库内容可能更新 |
| External | 24 小时 | 外部网页内容变化不确定 |

### 缓存管理

- 缓存文件命名：`{tweet_id}.json` 或 `{md5_hash}.json`
- 增量运行时自动读取缓存
- `--full` 参数可强制忽略缓存重新获取

---

## 输出说明

### output/ 目录结构

```
output/
├── index.json              # 最新处理结果索引
├── index.md                # 最新报告索引
├── bookmark-report-*.md    # 完整 Markdown 报告
└── processed-bookmarks-*.json  # 原始处理数据
```

### 报告格式

**Markdown 报告** (`bookmark-report-*.md`)：

```markdown
# Twitter Bookmark Report

**Author**: your_username
**Generated**: 2026-03-31

## 目录
1. [Article] 文章标题
2. [Quoted] 推文摘要
...

## Articles

### 1. 文章标题
- **作者**: @username
- **日期**: 2026-03-28
- **链接**: https://x.com/i/article/xxx

正文内容...

---

## Quoted Tweets
...
```

**JSON 数据** (`processed-bookmarks-*.json`)：

```json
{
  "generated_at": "2026-03-31T12:00:00+00:00",
  "bookmarks": [...],
  "stats": {
    "total": 50,
    "articles": 12,
    "quoted": 8,
    "github": 15,
    "external": 15,
    "errors": 2
  },
  "errors": [...]
}
```

---

## 依赖环境

### 系统要求

- Python 3.9+
- gh CLI（用于 GitHub API 认证）

### 安装 gh CLI

```bash
brew install gh
gh auth login
```

### Python 依赖

```bash
pip install python-dotenv requests
```

---

## 故障排除

### 常见问题

1. **API Key 缺失**
   ```
   ValueError: Missing required environment variable: TWITTER_API_IO_KEY
   ```
   → 检查 `.env` 文件是否正确配置

2. **GitHub API 限流**
   ```
   Rate limit exceeded for GitHub API
   ```
   → 运行 `gh auth login` 增加 API 配额（60 → 5000 次/小时）

3. **代理连接失败**
   ```
   ConnectionError: Proxy connection failed
   ```
   → 检查 `PROXY` 配置或设置为空

---

## 相关文档

- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) - 项目详细上下文
- [WORKFLOW.md](./WORKFLOW.md) - 工作流规范
- [BUGS.md](./BUGS.md) - Bug 跟踪
- [TASK_SUMMARY.md](./TASK_SUMMARY.md) - 任务输出模板
