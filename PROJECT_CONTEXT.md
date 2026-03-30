# Twitter Bookmark 报告生成系统 — 项目上下文

> 本文件供 Subagent 了解项目实际情况。数据截止 2026-03-30。
> 每次开发迭代前先读此文件。

---

## 一、项目位置与现有结构

```
/Users/tizer_mac_studio/work/Cursor/Twitter Bookmark/
├── twitter_data/
│   └── bookmarks.json          ← 书签数据源（必读）
├── .env.twitter                 ← API_KEY 和 PROXY（敏感）
├── sync_bookmarks.sh            ← 书签同步脚本（已有）
├── README.md                    ← 项目主文档
├── x-reader/                    ← 已有工具目录
├── x-tweet-fetcher/
├── x-tweet-reader/
└── x-bookmark-reports/         ← 【本次新建】报告生成系统根目录
```

**重要**：项目名含空格（`Twitter Bookmark`），Shell 命令中涉及路径必须加引号。

---

## 二、书签数据详情（bookmarks.json）

- **路径**：`/Users/tizer_mac_studio/work/Cursor/Twitter Bookmark/twitter_data/bookmarks.json`
- **格式**：JSON 数组，共 **359 条**书签记录
- **时间范围**：2024-12-20 ~ 2026-03-28
- **排序**：**不是**按时间排序，**不是**按 ID 排序，随意排列
- **作者数**：213 位

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 推文 ID（19位数字字符串） |
| `fullText` | string | 推文全文 |
| `createdAt` | string | 格式 `Sat Mar 28 02:04:44 +0000 2026` |
| `lang` | string | 语言代码 zh/en |
| `tweetBy` | dict | 作者信息（userName, fullName, id 等） |
| `entities` | dict | 含 `hashtags`, `mentionedUsers`, `urls` |
| `entities.urls` | **list[str]** | URL 字符串数组（**不是 dict**） |
| `media` | list[dict] | 图片/视频，含 `url`, `type`, `thumbnailUrl` |
| `quoted` | dict \| null | 引用的推文，结构同主推文 |
| `quoted.entities.urls` | **list[str]** | 同上 |
| `bookmarkCount`, `likeCount`, `retweetCount`, `replyCount`, `viewCount` | int | 互动数据 |

### `entities.urls` 格式（关键！）

URL 字段**统一是字符串数组**，不是 dict。格式分三种：

1. `http://x.com/i/article/{article_id}` → X Article
2. `https://t.co/xxx` → 未展开短链（需 FxTwitter 解析）
3. 其他外部 URL

**代码判断**：

```python
for url in bookmark.get('entities', {}).get('urls', []):
    if isinstance(url, str):
        if '/i/article/' in url:
            article_id = url.split('/i/article/')[-1].split('?')[0]
        elif url.startswith('https://t.co') or url.startswith('http://t.co'):
            # t.co 短链
        else:
            # 其他外部链接
```

---

## 三、书签内容分类统计

| 类型 | 数量 | 说明 |
|------|------|------|
| X Article 书签 | 72 条 | 含 `/i/article/` URL |
| 引用推文（quoted） | 82 条 | 含 `quoted` 字段 |
| 含 GitHub 链接 | 40 条 | 外部链接含 github.com |
| 含其他外部链接 | 38 条 | 非 X、非 GitHub 的外部链接 |
| 有媒体（图片/视频） | 196 条 | 含 media 字段 |
| 纯文字（无外链无媒体） | 65 条 | 仅 fullText |
| 总计 | 359 条 | |

**引用推文中 Article 情况**：
- quoted 推文共 82 条
- 其中 35 条 fullText 为 t.co 短链
- **这 35 条全部**含 `/i/article/` URL → 都走 TwitterAPI.io，**不走 FxTwitter**

---

## 四、Article ID 关键说明

```
书签的 tweet_id ≠ Article 自己的 ID

书签 tweet_id：书签那条推文自己的 ID
Article ID：从 /i/article/{article_id} URL 提取的独立 ID

两者是不同的 19 位数字！
```

**实际需要处理的 unique Article ID 数量**：

| 来源 | 数量 |
|------|------|
| 书签 entities.urls 中的 Article | 72 个 |
| quoted.entities.urls 中的 Article | 31 个 |
| 重复（同一 Article 被多人书签） | 5 个 |
| **总计 unique Article ID** | **98 个** |

---

## 五、外部 API 清单

### 1. TwitterAPI.io（Article 正文，必填）

- **用途**：获取 98 个 unique Article 的正文
- **Endpoint**：`GET https://api.twitterapi.io/twitter/article?tweet_id={article_id}`
- **Header**：`x-api-key: {API_KEY}`
- **认证**：必填，从 [twitterapi.io/dashboard](https://twitterapi.io/dashboard) 获取
- **费用**：100 credits/article ≈ $0.001/article
  - 98 个 Article ≈ $0.098
- **响应结构**（重要）：
  ```json
  {
    "article": {
      "author": {...},
      "title": "标题",
      "preview_text": "预览",
      "cover_media_img_url": "封面图 URL",
      "contents": [
        {"type": "unstyled", "text": "正文段落"},
        {"type": "header-one", "text": "一级标题"},
        {"type": "markdown", "text": "Markdown 内容"},
        {"type": "image", "url": "图片 URL", "width": 1200, "height": 800},
        {"type": "gif", "url": "mp4 URL", "previewUrl": "预览图"},
        {"type": "divider", "text": ""}
      ],
      "replyCount": 0, "likeCount": 0, "quoteCount": 0, "viewCount": 0,
      "createdAt": "Fri Mar 28 09:01:12 +0000 2025"
    },
    "status": "success"
  }
  ```

### 2. FxTwitter（普通引用推文）

- **用途**：获取 fullText 为 t.co 的引用推文正文（非 Article 情况，**实际不存在**，仅作 fallback）
- **Endpoint**：`GET https://api.fxtwitter.com/status/{tweet_id}`（无需认证）
- **响应**：`{"code":200, "tweet": {"raw_text": {"text": "完整正文"}, ...}}`
- **免费**，无需 API key

### 3. GitHub REST API（README）

- **用途**：获取 GitHub 仓库 README 内容
- **Endpoint**：`GET https://api.github.com/repos/{owner}/{repo}/readme`
- **Header**：`Accept: application/vnd.github.v3.raw`
- **认证**：无认证 60次/小时；用 gh CLI 认证后 5000次/小时
- **免费**

---

## 六、系统环境

| 项目 | 当前状态 |
|------|---------|
| Python | 3.9.6（Mac 系统自带） |
| gh CLI | **未安装**，需要 `brew install gh && gh auth login` |
| xfetch | **未安装**，需要 `brew install xfetch`（若有的话） |
| 代理 | `http://127.0.0.1:7897`（在 `.env.twitter` 中） |
| Node.js | v24.14.0（书签同步脚本用，与报告系统无关） |

**Python 版本注意**：代码必须兼容 Python 3.9，禁止使用：
- `match/case`（Python 3.10+）
- `:=` walrus operator（Python 3.8 起支持，**可用**）
- `str.removeprefix()`（Python 3.9+，**可用**）

---

## 七、报告系统目录结构

```
x-bookmark-reports/              ← 新建根目录
├── bin/
│   └── coordinator.py           ← 主入口
├── lib/
│   ├── __init__.py
│   ├── config.py                ← 配置（从 .env.twitter 读 PROXY）
│   ├── article_client.py        ← TwitterAPI.io
│   ├── quoted_client.py         ← FxTwitter
│   ├── github_client.py         ← gh CLI
│   ├── external_client.py       ← urllib
│   └── report_builder.py       ← Markdown 组装
├── cache/                       ← API 缓存（gitignore）
│   ├── articles/
│   ├── quoted/
│   └── github/
├── output/                      ← 报告输出（gitignore）
│   ├── index.json
│   └── index.md
└── .env.example                 ← 配置示例（TWITTER_API_IO_KEY）
```

**报告文件命名**：`output/{tweet_id}.md`

---

## 八、coordinator.py 入口命令

```bash
cd "/Users/tizer_mac_studio/work/Cursor/Twitter Bookmark/x-bookmark-reports"
python3 bin/coordinator.py              # 增量（跳过 done/cached）
python3 bin/coordinator.py --full        # 全量
python3 bin/coordinator.py --id 2037365525542797367  # 单条测试
```

---

## 九、当前计划执行清单

1. ✅ 计划已制定（见 `.cursor/plans/` 目录）
2. ⬜ 初始化 git 仓库和目录骨架
3. ⬜ 安装系统工具（gh CLI, xfetch）
4. ⬜ 实现 config.py
5. ⬜ 实现 article_client.py
6. ⬜ 实现 quoted_client.py
7. ⬜ 实现 github_client.py
8. ⬜ 实现 external_client.py
9. ⬜ 实现 report_builder.py
10. ⬜ 实现 coordinator.py
11. ⬜ 端到端测试 + 生成第一份报告
12. ⬜ 更新 README.md

---

## 十、进阶功能（不在本次计划内）

- **去重**：SimHash/MinHash 对高度相似报告合并
- **自动归类**：sentence-transformers + HDBSCAN 按主题聚类

---

## 十一、工作流规范

详细规范请见以下文件：

| 文件 | 职责 |
|------|------|
| `WORKFLOW.md` | 工作流详细规范 |
| `BUGS.md` | Bug 跟踪（必读） |
| `TASK_SUMMARY.md` | Subagent 输出模板 |
| `.cursor/rules/workflow.mdc` | Cursor IDE 规则 |

### 快速指南

1. **代码审查** → 在 `BUGS.md` 记录发现
2. **Bug 修复** → 更新 `BUGS.md` 状态
3. **Subagent 调用** → 使用 `TASK_SUMMARY.md` 模板
4. **验证** → 必须运行验证脚本
