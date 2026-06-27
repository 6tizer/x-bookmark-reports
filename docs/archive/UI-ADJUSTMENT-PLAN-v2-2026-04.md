# Dashboard UI 调整计划（v2）

基于完整代码审查和真实数据情况。

## 一、真实数据现状


| 目录/文件                              | 内容                               | 数量    |
| ---------------------------------- | -------------------------------- | ----- |
| `output/`                          | Twitter 原始草稿（bookmark-deep-*.md） | 485 篇 |
| `bookmark-articles/`               | AI 改写后的成品文章                      | 74 篇  |
| `bookmark-articles/processed.json` | 记录已被 AI 处理过的草稿文件名集合              | 485 个 |
| `output/.notion-upload-state.json` | 记录已上传到 Notion 的草稿文件名集合           | 485 个 |
| `.env` NOTION_TOKEN / NOTION_DB_ID | Notion 配置                        | ✅ 已有  |


**Notion DB 字段**（来自 `bin/upload_to_notion.py`）：

- `Name` (title) — 草稿正文第一个 `**粗体`** 行
- `来源` (select: "X书签")
- `状态` (select: "待处理")
- `作者` (rich_text) — `@handle`
- `文章链接` (url) — 正文第一个 x.com 链接
- `发布时间` (date)

## 二、完整工作流

```
Twitter 书签
    ↓ launchd 定时同步（01:00/09:00/17:00）
output/ (485 原始草稿)
    ├─→ 路径 A（现有，Notion AI 5/4 起收费）
    │      ↓ upload_to_notion.py
    │   Notion DB (485 条，状态"待处理")
    │      ↓ Notion AI 在 Notion 内部改写
    │   下游工作流
    │
    └─→ 路径 B（建设中，本地替代方案）
           ↓ Hermes 链式 Cron Job（AI 改写）
       bookmark-articles/ (74 篇成品文章)
           ↓ 未来上传到 Notion
       Notion DB（替代 Notion AI）
```

两条路径的终点都是 Notion DB + 下游工作流。路径 B 是路径 A 的本地替代。

## 三、各页面现状问题（代码级）

### 1. Dashboard（`app/page.tsx` + `api/dashboard/stats/route.ts`）

**现有代码问题：**

- `StatCards` 组件显示 5 个卡片：Last Sync / Total Bookmarks / New This Week / Pending / Reports
- `getDashboardStats()` 中 `newThisWeek = totalDrafts`（所有草稿都算"本周新增"，不对）
- `pendingCount = max(0, drafts - articles)`（=411，含义不明确）
- `reportCount = articles`（用的是成品文章数，不是报告数）
- Pipeline 4 节点（Sync → Read → Report → Article）在 filesystem 模式下全部硬编码 `completed`，没有实际运行状态
- Activity Feed 在 filesystem 模式下返回空数组（`isDbEmpty()` → `items: []`）

**需调整：**

- 统计卡片改为：草稿总数(output/) / 本地成品数(bookmark-articles/) / Notion 已上传数 / 待改写数(草稿-成品)
- Pipeline 改为 3 阶段：Twitter Sync → AI Processing → Notion Upload，每阶段读取真实状态
- Activity Feed 读取 `bookmark-articles/logs/` 目录的 cron job 日志

### 2. Bookmarks（`app/bookmarks/page.tsx` + `api/bookmarks/route.ts`）

**现有代码问题：**

- 读 `output/` ✅ 正确
- 标题提取逻辑（`fs-data.ts` 第138行）：`body.split("\n").find(l => l.startsWith("**") && l.endsWith("**"))` — 只匹配 `**粗体`** 行，很多草稿正文第一行不是粗体格式，导致标题回退到文件名（如 `bookmark-deep-2038913964181016607`）
- 侧边栏 badge 硬编码为 201（`Sidebar.tsx` 第40行），实际 485
- `BookmarkTable` 有 "Read" / "Enhanced Read" / "Batch Read" 按钮，但后端 API（`api/bookmarks/[id]/read/route.ts`）在 filesystem 模式下不实际执行任何操作

**需调整：**

- 标题提取优先级：`**粗体`** → `# 标题` → `## 标题` → 第一行非空文本 → 文件名去后缀
- 侧边栏 badge 动态化
- Read/Enhanced Read 按钮在 filesystem 模式下可暂时禁用或标注为只读

### 3. Reports（`app/reports/page.tsx` + `api/reports/route.ts`）— 问题最大

**现有代码问题：**

- `reports/route.ts` 调用的是 `listFsArticles()`，即读 `bookmark-articles/`（成品文章目录）
- 和 `articles/route.ts` 读的是**完全相同的数据源**
- 页面展示和 Articles 几乎一模一样，区别仅在于标签（"Basic"/"Enhanced" vs "Published"）
- Type 筛选器（Basic/Enhanced）无意义——所有条目都被路由硬编码为 `"basic"`
- `urlSummary` 始终为空数组，所以 "X links" 永远显示 "0 links"
- 详情页（`reports/[id]/page.tsx`）有编辑器、版本对比、导出功能，但全部基于 mock/空数据

**需调整为：** 接 Notion DB，展示草稿在 Notion 中的状态

- Notion DB 存的是原始草稿（从 `output/` 上传），Notion AI 在 Notion 内部改写
- 新建 `lib/notion-client.ts`：调用 Notion API 查询 DB 列表
- 新建 `api/notion/route.ts`：提供前端数据接口
- 展示字段：标题 / 状态（待处理/处理中/已完成）/ 作者 / 发布时间 / Notion 页面链接
- 保留搜索和状态筛选
- 详情页：链接到 Notion 原页，可查看 Notion AI 改写结果

### 4. Articles（`app/articles/page.tsx` + `api/articles/route.ts`）

**现有代码问题：**

- 读 `bookmark-articles/` ✅ 正确
- 标题提取用文件名 `file.replace(/-/g, " ")`（如 "free-claude-code：白嫖 Claude Code 全套工程能力的终极方案"），但文件名里的 `-` 被全部替换成空格，如 "vllm-swift" 变成 "vllm swift"
- 路由中所有文章硬编码 `status: "published"`（第167行），但页面副标题写 "X drafts"，矛盾
- `publishedAt` 全部用 `new Date().toISOString()`（当前时间），不是真实创作时间
- 状态筛选器（Draft/Editing/Reviewing/Published）无意义——全是 Published

**需调整：**

- 标题从正文 `# 标题` 提取，fallback 到文件名
- 用 `processed.json` 对比 `bookmark-articles/`：不在 processed.json 里的 → Draft，在的 → Published
- 从文件修改时间（`fs.statSync.mtime`）获取 publishedAt
- 页面副标题从 "X drafts" 改为 "X articles"

### 5. Sync（`app/sync/page.tsx` + `api/sync/route.ts`）

**现有代码问题：**

- Incremental Sync / Full Sync 按钮调用 `startSync()`，后端走 `sync-service.ts`，实际执行 `auto_run.sh`
- 日志显示区域（`SyncTerminal`）依赖 SSE 流，但 filesystem 模式下没有实现
- 同步历史（`SyncHistory`）依赖 DB，filesystem 模式下为空
- 环境配置区（API Key / Proxy / Data Path）读 `.env`，基本可用

**需调整：**

- 暂不动，当前功能基本可用
- 后续可考虑读取 `output/.deep-run-state.json` 显示处理状态

### 6. Settings（`app/settings/page.tsx` + `api/settings/route.ts`）

**现有代码问题：**

- 有 General / Schedule / Logs / Data 四个 tab
- General 读 `.env`（proxy/dataPath/autoSync），可用
- Schedule / Logs / Data tab 内容未实际实现（没有对应组件内容）
- API Key 配置使用 base64 编码，当前配置的是 Twitter API Key

**需调整：**

- 新增 Notion 配置区块：NOTION_TOKEN + NOTION_DB_ID + Test Connection（调用 Notion API 验证）
- Settings 类型（`types/api.ts`）需扩展

### 7. 侧边栏（`components/layout/Sidebar.tsx`）

**现有代码问题：**

- Bookmarks badge 硬编码 `201`，实际 `485`
- Reports badge 硬编码 `67`，应改为 Notion DB 文章数（485）
- Articles 无 badge，应显示成品文章数（74）

**需调整：**

- 所有 badge 改为动态读取（从对应 API 获取，或从 dashboard stats 获取）
- 可在 `ClientLayout` 组件中统一获取一次 stats，传给 Sidebar

## 四、需新增的文件


| 文件                               | 用途                                 |
| -------------------------------- | ---------------------------------- |
| `ui/src/lib/notion-client.ts`    | Notion API 客户端（查询 DB 列表、获取页面属性）    |
| `ui/src/app/api/notion/route.ts` | `/api/notion` 路由，返回 Notion DB 文章列表 |
| `ui/src/hooks/useNotion.ts`      | Notion 数据的 React Hook              |


## 五、需修改的文件


| 文件                                           | 改动                                       |
| -------------------------------------------- | ---------------------------------------- |
| `ui/src/lib/fs-data.ts`                      | 修复标题提取逻辑、添加文件修改时间读取                      |
| `ui/src/app/api/reports/route.ts`            | 数据源从 `listFsArticles()` 改为 Notion API    |
| `ui/src/app/api/articles/route.ts`           | 修复标题提取、状态区分、时间读取                         |
| `ui/src/app/api/dashboard/stats/route.ts`    | 修正统计逻辑、添加 Notion 计数                      |
| `ui/src/app/api/dashboard/activity/route.ts` | 从 cron job 日志文件读取                        |
| `ui/src/components/layout/Sidebar.tsx`       | badge 动态化                                |
| `ui/src/components/layout/ClientLayout.tsx`  | 传递 stats 给 Sidebar                       |
| `ui/src/types/api.ts`                        | 扩展 Settings 类型（Notion 字段）、DashboardStats |
| `ui/src/app/reports/page.tsx`                | 适配 Notion 数据展示                           |
| `ui/src/app/reports/[id]/page.tsx`           | 改为 Notion 页面链接/摘要                        |
| `ui/src/app/articles/page.tsx`               | 修复副标题、状态筛选逻辑                             |
| `ui/src/app/settings/page.tsx`               | 新增 Notion 配置区块                           |


## 六、优先级


| 优先级    | 任务                           | 改动量 |
| ------ | ---------------------------- | --- |
| **P0** | Reports 接 Notion API（消除重复页面） | 大   |
| **P0** | 侧边栏 badge 动态化                | 小   |
| **P1** | Articles 标题/状态/时间修复          | 中   |
| **P1** | Bookmarks 标题提取修复             | 小   |
| **P2** | Dashboard 统计修正               | 中   |
| **P3** | Activity Feed 接日志            | 中   |
| **P3** | Settings 加 Notion 配置         | 中   |


## 七、需要用户确认

1. Reports 页面接 Notion DB 后，展示 Notion 里的哪些信息？（标题/状态/作者/链接够吗？）
2. Notion DB 的"状态"字段目前有哪些可选值？还是只有"待处理"？
3. 后续是否需要从 Dashboard 触发上传到 Notion 的操作？

