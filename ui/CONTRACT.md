# x-bookmark-reports UI — API & Data Contract v1.0

> **DEPRECATED PARTIAL**: 本契约冻结于 Phase 1（2026-04-28），仅作历史保留。
> 当前 API 以 `ui/src/app/api/` 实际代码为准（共 32 个 route）。
> 已知差异：pipeline routes（`/api/pipeline/coordinator`、`/api/article-pipeline/run`、`/api/pipeline/notion-upload`）、`/api/settings/plaintext-key`、`/api/schedule/launchd`（缺 GET，见 B054）、`/api/data/*` 等均不在本契约中。
> 完整审计见 [`../docs/UI_AUDIT_2026-06-27.md`](../docs/UI_AUDIT_2026-06-27.md)。

> **Status**: FINAL — Immutable after Phase 1  
> **Version**: 1.0  
> **Date**: 2026-04-28  

## 1. 通用约定

### 1.1 响应格式
所有 API 响应必须返回统一 JSON 结构：

```typescript
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;      // 大写下划线格式
    message: string;   // 人类可读
    detail?: string;   // 原始错误/堆栈
  };
}
```

### 1.2 HTTP 状态码
| 状态码 | 含义 |
|--------|------|
| 200 | 成功（业务成功返回 `success: true`） |
| 400 | 参数错误（`success: false`，如缺少必填字段） |
| 401 | 未授权（API_KEY 无效或缺失） |
| 404 | 资源不存在 |
| 500 | 服务端内部错误 |

> 注：脚本执行错误（如 Rettiwt 超时）返回 200，但 `success: false` 并附带标准化 error 对象。

### 1.3 时间格式
所有时间字段使用 ISO 8601：`2024-01-15T08:30:00.000Z`

### 1.4 分页
列表接口统一支持分页：

```typescript
interface PaginationQuery {
  page?: number;      // 默认 1
  limit?: number;     // 默认 20，最大 100
  sort?: string;      // 如 "bookmarkedAt:desc"
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
```

### 1.5 安全配置
- `API_KEY` 在 GET 响应中必须脱敏，格式：`abc****xyz`（保留前3后3字符）
- `API_KEY` 更新使用独立接口 `PUT /api/settings/api-key`
- 前端编辑时建议 base64 编码传输，服务端解码存储

---

## 2. 模块接口定义

### 2.1 Dashboard 仪表盘

#### GET `/api/dashboard/stats`
返回仪表盘统计卡片数据。

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "lastSyncAt": "2024-01-15T08:30:00.000Z",
    "totalBookmarks": 156,
    "newThisWeek": 12,
    "pendingCount": 23,
    "reportCount": 45,
    "pipeline": {
      "sync": { "status": "completed", "lastRun": "2024-01-15T08:30:00.000Z" },
      "read": { "status": "completed", "lastRun": "2024-01-15T08:35:00.000Z" },
      "report": { "status": "running", "progress": 67 },
      "article": { "status": "pending" }
    }
  }
}
```

#### GET `/api/dashboard/activity`
返回最近活动日志（操作记录）。

**Query**: `?limit=20`

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "act_001",
        "type": "sync" | "read" | "report" | "article" | "setting",
        "action": "started" | "completed" | "failed" | "updated",
        "message": "增量同步完成，新增 12 条书签",
        "metadata": { "syncJobId": "sync_001", "newCount": 12 },
        "timestamp": "2024-01-15T08:30:00.000Z"
      }
    ],
    "total": 128
  }
}
```

---

### 2.2 Bookmarks 书签管理

#### GET `/api/bookmarks`
书签列表，支持分页、筛选、搜索。

**Query**:
```
?page=1&limit=20&search=keyword&status=synced&tag=ai&sort=bookmarkedAt:desc
```

| 参数 | 说明 |
|------|------|
| `search` | 全文搜索（作者、摘要、内容） |
| `status` | `synced` / `read` / `reported` / `articled` |
| `tag` | 按标签筛选 |
| `urlCategory` | `article` / `code` / `social` / `media` / `other` |
| `author` | 按作者筛选 |
| `sort` | `bookmarkedAt:desc` / `likes:desc` 等 |

**Response** `200`: `PaginatedResponse<Bookmark>`

#### GET `/api/bookmarks/[id]`
书签详情。

**Response** `200`: `{ success: true, data: BookmarkDetail }`

```typescript
interface BookmarkDetail extends Bookmark {
  fullText: string;        // 完整推文原文
  replies: ReplyThread[];   // 回复线程
  externalLinks: ExternalLink[];
  reports: { basic?: ReportSummary; enhanced?: ReportSummary };
}
```

#### POST `/api/bookmarks/[id]/read`
触发 x_reader.py（基础版读取）。

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "jobId": "read_001",
    "status": "queued",
    "bookmarkId": "1234567890"
  }
}
```

**Error Codes**: `READER_TIMEOUT`, `READER_INVALID_URL`, `READER_PYTHON_ERROR`

#### POST `/api/bookmarks/[id]/read-enhanced`
触发 x-tweet-reader（增强版读取）。

**Response**: 同 `/api/bookmarks/[id]/read`

**Error Codes**: `ENHANCED_READER_TIMEOUT`, `ENHANCED_READER_FETCH_ERROR`, `ENHANCED_READER_BROWSER_ERROR`

#### POST `/api/bookmarks/batch-read`
批量触发读取（基础版）。

**Body**:
```json
{ "ids": ["id1", "id2", "id3"], "type": "basic" }
```

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "jobId": "batch_read_001",
    "status": "queued",
    "total": 3,
    "completed": 0
  }
}
```

#### PUT `/api/bookmarks/[id]/tags`
更新书签标签。

**Body**: `{ "tags": ["ai", "llm", "paper"] }`

#### PUT `/api/bookmarks/[id]/status`
更新处理状态。

**Body**: `{ "status": "read" }`

---

### 2.3 Sync 同步控制

#### POST `/api/sync`
启动同步任务。

**Body**:
```json
{ "mode": "incremental" | "full" }
```

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "jobId": "sync_001",
    "status": "queued",
    "mode": "incremental",
    "startedAt": "2024-01-15T08:30:00.000Z"
  }
}
```

#### GET `/api/sync/[jobId]`
查询同步任务状态。

**Response** `200`: `{ success: true, data: SyncJob }`

#### GET `/api/sync/[jobId]/stream`
SSE 实时进度推送。

**Event Stream**:
```
event: progress
data: {"type":"progress","payload":{"percent":45,"stage":"fetching","logs":["[08:30:15] 正在获取书签..."],"newCount":12,"totalCount":156}}

event: complete
data: {"type":"complete","payload":{"newCount":12,"totalCount":156,"completedAt":"2024-01-15T08:31:00.000Z"}}

event: error
data: {"type":"error","payload":{"code":"SYNC_RETTIWT_TIMEOUT","message":"Rettiwt API 响应超时","detail":"Request timed out after 30s"}}
```

**SSE Event Types**:
| Type | Payload |
|------|---------|
| `progress` | `{ percent, stage, logs[], newCount?, totalCount? }` |
| `complete` | `{ newCount, totalCount, completedAt }` |
| `error` | `{ code, message, detail? }` |

#### GET `/api/sync/history`
同步历史列表。

**Response** `200`: `PaginatedResponse<SyncJob>`

---

### 2.4 Reports 报告中心

#### GET `/api/reports`
报告库列表。

**Query**: `?bookmarkId=&author=&type=basic&search=`

**Response** `200`: `PaginatedResponse<Report>`

#### GET `/api/reports/[id]`
报告详情（含 Markdown 全文）。

**Response** `200`: `{ success: true, data: Report }`

#### PUT `/api/reports/[id]`
更新报告内容。

**Body**:
```json
{ "content": "# 更新后的 Markdown...", "saveMode": "overwrite" | "version" }
```

**Response** `200`: `{ success: true, data: { id, version, updatedAt } }`

#### GET `/api/reports/[id]/versions`
获取报告版本历史。

**Response** `200`: `{ success: true, data: ReportVersion[] }`

#### GET `/api/reports/[id]/export?format=md|pdf`
导出报告。

**Response**: `Content-Type: text/markdown` 或 `application/pdf`

#### GET `/api/reports/[id]/compare?with=[otherId]`
对比两份报告（基础版 vs 增强版）。

**Response** `200`: `{ success: true, data: { left: Report, right: Report, diff: DiffResult } }`

---

### 2.5 Articles 文章工厂

#### GET `/api/articles`
文章草稿列表。

**Query**: `?status=draft&search=`

**Response** `200`: `PaginatedResponse<Article>`

#### GET `/api/articles/[id]`
文章详情。

**Response** `200`: `{ success: true, data: Article }`

#### POST `/api/articles`
从报告创建草稿。

**Body**:
```json
{ "reportId": "report_001", "title": "AI 新进展分析" }
```

#### PUT `/api/articles/[id]`
更新文章内容。

**Body**:
```json
{ "title": "...", "content": "...", "status": "editing" }
```

#### GET `/api/articles/[id]/versions`
版本历史（Notion 风格时间线）。

**Response** `200`: `{ success: true, data: ArticleVersion[] }`

#### POST `/api/articles/[id]/publish`
发布文章。

**Body**:
```json
{ "format": "markdown" | "html" | "wechat" }
```

---

### 2.6 Settings 系统设置

#### GET `/api/settings`
获取配置（脱敏）。

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "apiKey": "abc****xyz",
    "proxy": "http://127.0.0.1:7897",
    "dataPath": "/path/to/data",
    "autoSync": false,
    "cronExpression": "0 */6 * * *"
  }
}
```

#### PUT `/api/settings`
更新一般配置。

**Body**:
```json
{ "proxy": "...", "dataPath": "...", "autoSync": true, "cronExpression": "0 */6 * * *" }
```

#### PUT `/api/settings/api-key`
更新 API_KEY。

**Body**:
```json
{ "apiKey": "base64EncodedNewKey" }
```

> 服务端解码 base64 后写入 `.env.twitter`。

#### POST `/api/settings/test-connection`
连通性测试。

**Response** `200`:
```json
{ "success": true, "data": { "reachable": true, "latency": 245 } }
```

---

### 2.7 Logs 日志中心

#### GET `/api/logs`
系统日志。

**Query**: `?component=sync|x-reader|x-tweet-reader|agent&level=info&limit=50`

**Response** `200`: `PaginatedResponse<LogEntry>`

```typescript
interface LogEntry {
  id: string;
  component: string;
  level: "info" | "warn" | "error";
  message: string;
  detail?: string;
  timestamp: string;
}
```

---

## 3. 错误码表

| 错误码 | 模块 | 说明 |
|--------|------|------|
| `SYNC_RETTIWT_ERROR` | Sync | Rettiwt API 通用错误 |
| `SYNC_RETTIWT_TIMEOUT` | Sync | Rettiwt API 超时 |
| `SYNC_AUTH_FAILED` | Sync | Twitter 认证失败 |
| `SYNC_INVALID_MODE` | Sync | 同步模式参数错误 |
| `READER_TIMEOUT` | Reader | 基础读取器超时 |
| `READER_INVALID_URL` | Reader | 无效的推文 URL |
| `READER_PYTHON_ERROR` | Reader | Python 脚本执行错误 |
| `ENHANCED_READER_TIMEOUT` | Enhanced | 增强读取器超时 |
| `ENHANCED_READER_FETCH_ERROR` | Enhanced | 数据获取失败 |
| `ENHANCED_READER_BROWSER_ERROR` | Enhanced | Camoufox 浏览器错误 |
| `REPORT_NOT_FOUND` | Report | 报告不存在 |
| `REPORT_SAVE_ERROR` | Report | 报告保存失败 |
| `ARTICLE_NOT_FOUND` | Article | 文章不存在 |
| `SETTINGS_INVALID_KEY` | Settings | API_KEY 格式无效 |
| `SETTINGS_SAVE_ERROR` | Settings | 配置保存失败 |
| `DB_CONNECTION_ERROR` | System | 数据库连接错误 |
| `INTERNAL_ERROR` | System | 通用内部错误 |

---

## 4. 数据模型（TypeScript 类型）

> 完整类型定义见 `src/types/api.ts`。

### 核心类型速查

```typescript
// Bookmark
interface Bookmark {
  id: string;              // tweet_id
  url: string;
  author: { name: string; handle: string; avatar?: string };
  text: string;            // 前200字摘要
  bookmarkedAt: string;    // ISO 8601
  syncBatchId: string;
  status: "synced" | "read" | "reported" | "articled";
  tags: string[];
  urlCategory: "article" | "code" | "social" | "media" | "other";
  stats: { likes: number; replies: number; bookmarks: number; views: number };
  reportPath?: string;
  enhancedReportPath?: string;
}

// SyncJob
interface SyncJob {
  id: string;
  mode: "incremental" | "full";
  status: "queued" | "running" | "completed" | "failed";
  progress: number;        // 0-100
  stage: "auth" | "fetching" | "parsing" | "storing" | "done";
  logs: string[];
  error?: { code: string; message: string; detail?: string };
  startedAt: string;
  completedAt?: string;
  newCount: number;
  totalCount: number;
}

// Report
interface Report {
  id: string;
  bookmarkId: string;
  type: "basic" | "enhanced";
  title: string;
  content: string;         // Markdown 全文
  generatedAt: string;
  wordCount: number;
  urlSummary: { url: string; title: string; category: string }[];
}
```

---

## 5. 变更日志

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-04-28 | 初始版本，覆盖 6 大模块全部接口 |
