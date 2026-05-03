# Twitter Bookmark 报告生成系统 — 项目上下文

> 本文件供 Subagent 了解项目实际情况。数据截止 2026-04-20。
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
- **格式**：JSON 数组，共 **654 条**书签记录
- **时间范围**：2024-11-19 ~ 2026-04-20
- **排序**：**不是**按时间排序，**不是**按 ID 排序。`sync_bookmarks.sh` 每次把本轮新增 prepend 到数组开头，所以**数组靠前 ≈ 最近加入书签的**，但不严格
- **作者数**：363 位

### 字段说明


| 字段                                                                      | 类型            | 说明                                                             |
| ----------------------------------------------------------------------- | ------------- | -------------------------------------------------------------- |
| `id`                                                                    | string        | 推文 ID（19位数字字符串）                                                |
| `fullText`                                                              | string        | 推文全文                                                           |
| `createdAt`                                                             | string        | **两种格式并存**（见下方 schema 兼容说明）                                    |
| `lang`                                                                  | string        | 语言代码 zh/en                                                     |
| `tweetBy`                                                               | dict          | 作者信息（userName, fullName, id 等）                                 |
| `entities`                                                              | dict          | 含 `hashtags`, `mentionedUsers`, `urls`                         |
| `entities.urls`                                                         | **list[str]** | URL 字符串数组（**不是 dict**）                                         |
| `media`                                                                 | list[dict]    | 图片/视频，含 `url`, `type`, `thumbnailUrl`。v7 仍返回此字段（不在 entities 里） |
| `quoted`                                                                | dict          | null                                                           |
| `quoted.entities.urls`                                                  | **list[str]** | 同上                                                             |
| `bookmarkCount`, `likeCount`, `retweetCount`, `replyCount`, `viewCount` | int           | 互动数据                                                           |
| `conversationId`, `url`                                                 | string        | v7 新增字段（可选，下游可忽略）                                              |


### schema 兼容说明（2026-04-20 rettiwt v4 → v7 升级）

数据库里 `createdAt` 字段**有两种格式并存**，下游必须同时接受：


| rettiwt 版本                | `createdAt` 格式 | 样例                               | 条目数（当前 654） |
| ------------------------- | -------------- | -------------------------------- | ----------- |
| v4（2026-04-17 及之前的 567 条） | Twitter native | `Thu Apr 16 22:43:55 +0000 2026` | 567         |
| v7（2026-04-20 升级后的 87 条）  | ISO 8601       | `2026-04-20T01:30:35.000Z`       | 87          |


**已处理双格式的位置**（新增解析逻辑需同步）：

- `lib/report_builder.py::_parse_datetime` — 先试 ISO，失败再试 Twitter native
- `bin/upload_to_notion.py::_parse_published_at` — 同上

**tweetBy 对象**在 v7 里多出 `isFollowed`、`isFollowing`、`location`、`pinnedTweets`、`profileImage`、`statusesCount`、`userName` 等字段，非破坏性。

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

## 三、书签内容分类统计（2026-04-20 实时计数）


| 类型             | 数量        | 说明                                |
| -------------- | --------- | --------------------------------- |
| X Article 书签   | 164 条     | 主推文 entities.urls 含 `/i/article/` |
| 引用推文（quoted）   | 167 条     | 含 `quoted` 字段                     |
| 含 GitHub 链接    | 58 条      | 外部链接含 github.com                  |
| 含其他外部链接        | 97 条      | 非 X、非 GitHub 的外部链接                |
| 有媒体（图片/视频）     | 325 条     | 含 media 字段                        |
| 纯文字（无外链无媒体无引用） | 49 条      | 仅 fullText                        |
| **总计**         | **654 条** |                                   |


> 以上类别可能重叠（例如同一条既含 Article 也含媒体）。

**引用推文中 Article 情况**：

- quoted 推文共 167 条
- 其中有 `/i/article/` URL 的走 TwitterAPI.io，普通 t.co 走 FxTwitter fallback

---

## 四、Article ID 关键说明

```
书签的 tweet_id ≠ Article 自己的 ID

书签 tweet_id：书签那条推文自己的 ID
Article ID：从 /i/article/{article_id} URL 提取的独立 ID

两者是不同的 19 位数字！
```

**实际需要处理的 unique Article ID 数量**（2026-04-20 实时计数）：


| 来源                              | 数量        |
| ------------------------------- | --------- |
| 书签 entities.urls 中的 Article     | 164 个     |
| quoted.entities.urls 中的 Article | 62 个      |
| 两者重叠                            | 12 个      |
| **总计 unique Article ID**        | **214 个** |


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

### 4. TwitterAPI.io（推文回复）

- **用途**：获取推文回复
- **Endpoint**：`GET https://api.twitterapi.io/twitter/tweet/replies`
- **参数**：`tweetId`（必填）、`cursor`（可选分页）
- **Header**：`x-api-key: {API_KEY}`
- **认证**：必填（使用 TWITTER_API_IO_KEY）
- **响应结构**：
  ```json
  {
    "data": [
      {
        "tweet_id": "xxx",
        "author": {"username": "xxx", "name": "xxx"},
        "text": "回复内容",
        "like_count": 10,
        "retweet_count": 2,
        "created_at": "2026-03-20"
      }
    ],
    "next_cursor": "xxx",
    "has_next_page": true
  }
  ```

---

## 六、系统环境


| 项目              | 当前状态                                           |
| --------------- | ---------------------------------------------- |
| Python          | 3.9.6（Mac 系统自带）                                |
| gh CLI          | ✅ 已安装 v2.89.0，**已认证**（account: 6tizer）         |
| xfetch          | ❌ 不存在，跳过（PROJECT_CONTEXT 中标注可能有误）              |
| 代理              | `http://127.0.0.1:7897`（在 `.env.twitter` 中）    |
| Node.js         | v24.14.0                                       |
| **rettiwt-api** | **v7.0.1**（全局安装于 `~/.local/bin/rettiwt`，书签同步用） |


**rettiwt-api 升级历史**（见第十二节）：2026-04-20 从 v4.2.0 升到 v7.0.1，原因是 v4 反序列化新版 Twitter bookmarks 响应失败（静默返回 `{}`）。升级路径已验证兼容：API_KEY 无需重生、`sync_bookmarks.sh` CLI 兼容。

**如再次出现"同步 +0 数天"的沉默失败**，第一步先检查 rettiwt 版本：`npm view rettiwt-api version`。

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
2. ✅ 初始化 git 仓库和目录骨架
3. ✅ 安装系统工具（gh CLI v2.89.0 已安装并认证）
4. ✅ 实现 config.py
5. ✅ 实现 article_client.py
6. ✅ 实现 quoted_client.py
7. ✅ 实现 github_client.py
8. ✅ 实现 external_client.py
9. ✅ 实现 report_builder.py
10. ✅ 实现 coordinator.py
11. ✅ 端到端测试 + 生成第一份报告
12. ✅ 更新 README.md
13. ✅ **报告增强 Phase 1.1: Article 格式增强（Statistics/Media/Hashtags/Mentions）**
14. ✅ **报告增强 Phase 1.2: ExternalLinks HTML 内容清理**
15. ✅ **报告增强 Phase 1.3: HTML 清理工具方法**
16. ✅ **报告增强 Phase 2: Header 增强（Summary/Statistics）**
17. ✅ **报告增强 Phase 3: Replies Client 集成（TwitterAPI.io）**
18. ✅ **Bug 修复: HTML 清理缓存问题、缓存目录创建、纯文本分类**
19. ✅ **Bug 修复: B012 - external_client.py CSS/style 块未清理**
20. ✅ **Bug 修复: B013 - replies_client.py API 响应键名不匹配**

---

## 十、进阶功能（不在本次计划内）

- **去重**：SimHash/MinHash 对高度相似报告合并
- **自动归类**：sentence-transformers + HDBSCAN 按主题聚类

---

## 十一、报告增强功能（2026-03-31）

### 已实现功能


| 功能                    | 说明                                    | 文件                                    |
| --------------------- | ------------------------------------- | ------------------------------------- |
| Article 格式增强          | 显示 Engagement、Media、Hashtags、Mentions | report_builder.py                     |
| ExternalLinks HTML 清理 | 自动移除 CSS/JS，提取纯文本                     | external_client.py, report_builder.py |
| Summary 区块            | 显示书签分类统计                              | report_builder.py                     |
| Statistics 区块         | 显示互动数据汇总                              | report_builder.py                     |
| Replies 区块            | 显示推文回复列表                              | replies_client.py, report_builder.py  |


### 使用方法

```bash
# 生成报告（不含回复）
python3 bin/coordinator.py --full

# 生成报告（含回复）
python3 bin/coordinator.py --full --replies
```

---

## 十二、里程碑（Changelog 视角）

### 2026-04-20 rettiwt-api v4→v7 升级 + sync 容错加固

**触发**：用户发现 `sync_log.txt` 连续 3 天（4/17 ~ 4/20）都是"新增: 0"，实际每天都有手动加书签。

**根因链**（3 层嵌套 bug）：

1. `rettiwt-api` **v4.2.0** 已无法反序列化新版 Twitter bookmarks 响应，返回空对象 `{}`（认证成功、但所有数据被吃掉）。
2. `rettiwt-api` **v7** 把 cursor 字段从 `.next.value` 改成 `.next`（直接字符串），`sync_bookmarks.sh` 里 `.next.value` 永远取不到。
3. `sync_bookmarks.sh` 的增量策略是"**遇到第一条已知就停**"，中途失败导致的 gap 后，穿插在已知之间的未知条目永远补不回来。

**修复清单**：


| 位置                                         | 改动                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------- |
| 全局 `rettiwt-api`                           | 4.2.0 → 7.0.1（`npm install -g --prefix ~/.local rettiwt-api@7.0.1`）  |
| `sync_bookmarks.sh` L138                   | cursor 提取改为双兼容：`if .next type=="string" then .next else .next.value` |
| `sync_bookmarks.sh` 增量逻辑                   | 改为"**连续 `CONSECUTIVE_KNOWN_STOP=2` 页全为已知**"才停止                       |
| `upload_to_notion.py::_parse_published_at` | 同时接受 Twitter native 和 ISO 8601 格式                                    |
| `report_builder.py::_parse_datetime`       | 本来已双格式兼容，无需改                                                         |


**成效验证**：

- 单次 sync 捡回 67 条缺失书签（567→654）
- 随后 `auto_run.sh` 手动触发：`+87/87` 深度报告（27.4 min，0 failed）、`+87` Notion 页面（86 OK + 1 PARTIAL，2h 8min）
- 总计 2h 36min 跑通端到端

**值得记录的外部行为观察**：

- Notion 数据库侧有**自动编译工作流**（"未编译到 Wiki" → "已编译到 Wiki"），能把仅有 properties、无正文的 partial 页面**自愈**为完整文章。
因此 `upload_to_notion.py` 报 `[PARTIAL]` 时，对应 Notion 页面**通常不是空页**，无需人工修复。这是 workspace 层的行为，**不应写入代码假设**。

---

## 十三、工作流规范

详细规范请见以下文件：


| 文件                           | 职责            |
| ---------------------------- | ------------- |
| `WORKFLOW.md`                | 工作流详细规范       |
| `BUGS.md`                    | Bug 跟踪（必读）    |
| `TASK_SUMMARY.md`            | Subagent 输出模板 |
| `.cursor/rules/workflow.mdc` | Cursor IDE 规则 |


### 快速指南

1. **代码审查** → 在 `BUGS.md` 记录发现
2. **Bug 修复** → 更新 `BUGS.md` 状态
3. **Subagent 调用** → 使用 `TASK_SUMMARY.md` 模板
4. **验证** → 必须运行验证脚本

