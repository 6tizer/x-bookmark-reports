# UI 验收记录 — 2026-08-11

> 验收人：Commander（Cursor Grok）  
> 方式：管线/API/数据层核对 + 重建生产 UI + Glass 打开各页（`cursor-ide-browser` MCP 当前不可用，无法截图点选；页面已留在 Glass 供人工复看）  
> UI 地址：http://127.0.0.1:3001/

---

## 0. 开工前发现并已处理

| 项 | 说明 |
|---|---|
| 生产构建过期 | `.next` 时间戳 2026-08-10 05:48，源码 Settings（SearXNG/Firecrawl）在 17:37 更新后未 rebuild → API 返回 `searxngBaseUrl: null` |
| 处理 | `ui` 下 `npm run build` + `launchctl kickstart` 重启 `com.xbookmarkreports.dashboard`；重建后 Settings API 字段正常 |

---

## 1. 系统运作状态（结论：管线正常）

| 检查项 | 结果 |
|---|---|
| Dashboard HTTP | 200（launchd `next start` :3001） |
| 最近 auto_run | **success**（`2026-08-10T16:08:52Z` / 本地 08-11 00:08）：sync +3 → deep +3 → article +3 → Notion +3 |
| `/api/health` | `healthy: true`，`recentFailStreak: 0` |
| launchd 调度 | 每 3h 日历点（0/3/6/9/12/15/18/21），与规划一致 |
| Python research 模块 | 可 import；`SEARXNG_BASE_URL` 当前为空（见不一致项） |

### 数据真值对照

| 指标 | 文件系统 / 状态 | UI / API | 一致？ |
|---|---|---|---|
| Bookmarks | bookmarks.json **2105** | `totalBookmarks=2105` | ✅ |
| Deep Drafts 文件 | **1163** | `totalDrafts=1163` | ✅ |
| Articles 本地文件 | article-final **1131** | `totalArticlesLocal=1131` | ✅ |
| Notion 本地 state | uploaded **1131** | `totalArticlesNotion=1129` | ⚠️ 差 2 |
| Deep completed_ids | **2105** | Pending Rewrite **942**（=2105−1163） | ⚠️ 见 B-DEEP-STATE-ORPHANS |
| Articles 列表 total | pipeline entries **1163** | 页头/列表 total=1163（含 failed 31） | ⚠️ 与「本地成品 1131」口径不同 |

---

## 2. 页面结构 vs 规划

侧栏（SSR 可见）：`/` Dashboard · `/bookmarks` · `/sync` · `/articles` · `/settings`  
（Reports 已按规划移除，`/reports` 不应再出现）

| 页面 | 规划要点 | 验收 |
|---|---|---|
| Dashboard | 6 卡 + Pipeline + Activity | 卡标签与 StatCards 规划一致；Activity 有最近 auto_run |
| Bookmarks | 读 bookmarks.json + lifecycle | total=2105，含 author/lifecycle/hasDeepDraft |
| Sync | Pipeline Control Center：Overview / Actions / Terminal / History | 路由与组件齐全；History API 有近期成功记录 |
| Articles | 成品列表 + 状态 + Run | 列表可用；total 口径见不一致 |
| Settings | General / LLM & Web Search / Schedule / Logs / Data | LLM 含 **Search (SearXNG / Firecrawl)** + **Exa (可选补充)**（重建后） |

---

## 3. 与规划不一致（先记录，未改代码）

| ID | 严重性 | 区域 | 现象 | 相对规划 |
|---|---|---|---|---|
| B-LOG-STALE | HIGH | Settings → Logs | DB 有 12320 条，但最新时间戳停在 **2026-06-27**；今日管线无对应 log | B052 修了「读 DB」，但 auto_run/近月运行未再写入 SQLite，Logs 对日常运维仍不可用 |
| B-SEARCH-ENV-MISSING | MEDIUM | Config / Settings | `.env` **无** `SEARXNG_BASE_URL` / `FIRECRAWL_*`；UI 主路 URL 空 | 规划：SearXNG 主 → Firecrawl 备；当前会跳过 SearXNG，仅依赖 Firecrawl Keyless（+ 可选 Exa） |
| B-ARTICLES-TOTAL-MIXED | MEDIUM | Articles | 列表 total=**1163**（=草稿/管线条目，含 failed/skipped），Dashboard「Articles (Local)」=**1131** | 两处「文章数」口径不一致，易误解 |
| B-DEEP-STATE-ORPHANS | MEDIUM | Dashboard / Deep | `completed_ids=2105` 但仅 1163 个 draft 文件；942 个 id「已完成」却无 md | Pending Rewrite=942 表象正确，但 deep-state 与文件库存长期漂移 |
| B-NOTION-COUNT-DRIFT | LOW | Dashboard | UI Notion=1129，本地 `.notion-finished-state`=1131 | 差 2，可能 Notion API 计数延迟/过滤 |
| B-FIRECRAWL-KEY-MASK | LOW | Settings → LLM | 无 `FIRECRAWL_API_KEY` 时仍显示 `****` | 空 key 应显示未配置，避免误以为已填 |
| B-HEALTH-XAI-ONLY | LOW | HealthBanner | `apiStatus` 仅 `xai: unknown`，未反映 SearXNG/Firecrawl | 研究栈已换，健康检查未跟上 |
| B-RETTIWT-LOCAL-NULL | LOW | Dashboard | `localVersion: null`，更新提示逻辑基本不触发 | Rettiwt 状态卡信息不完整 |
| B-DOCS-CONTEXT-STALE | LOW | PROJECT_CONTEXT.md | §五仍写 Exa Research / xAI 为主研究 | 与 08-10 已上线 SearXNG→Firecrawl→Exa Search 不一致 |
| （环境） | — | 验收工具 | `cursor-ide-browser` MCP 不可用 | 无法做点击级视觉回归；页面已用 Glass/`open` 打开 |

### 明确一致（相对近期规划）

- Dashboard 书签数 = bookmarks.json（B047 修复仍有效）
- Bookmarks 列表真值源 = bookmarks.json（B048）
- Schedule = launchd 每 3h（B-CRON-DEAD 修复仍有效）
- Settings LLM 含 SearXNG/Firecrawl/Exa 区块（需生产 rebuild，本次已补）
- 导航无 Reports

---

## 4. 建议你人工重点看的点

1. **Settings → LLM & Web Search**：确认 Search / Exa 文案与字段是否符合预期；SearXNG URL 是否要填 tailnet 地址  
2. **Dashboard**：6 卡数字、Pending Rewrite 942、Activity 时间线  
3. **Articles**：列表总数 1163 vs 卡片 1131；failed（31）条目展示  
4. **Settings → Logs**：是否接受「停在 6 月」的现状  
5. **Sync**：History 最近 `+3/+3/+3` 是否显示正确  

UI 保持运行：http://127.0.0.1:3001/ （当前建议从 Settings 看新 Search 区块，再自行点侧栏）

---

## 5. 浏览器点选验收（2026-08-11 01:35，cursor-ide-browser 恢复后）

方式：`browser_navigate` + snapshot/screenshot + CDP `innerText`。Browser 已 unlock，Dashboard 留在前台。

| 页面 | 视觉/交互结论 | 备注 |
|---|---|---|
| Dashboard | ✅ 6 卡数字正确；Pipeline 4 步；Activity 有近 1h auto_run | Notion 1129 vs 本地 1131；Activity 仍夹杂 44d/98d 旧条目 |
| Bookmarks | ✅ 加载后 **2105 total**；lifecycle/筛选/分页正常 | 首屏短暂闪「0 total」（加载态） |
| Sync | ✅ Actions / Terminal / History(+3/+3/+3) 正常 | **Rewrite 节点误标 Running**（API `pipeline.rewrite.status=running`，进度 97%），与 Dashboard「Idle」矛盾 |
| Articles | ✅ 文案写明 `1163 articles (deep drafts + pipeline)`；Failed 筛选得 31 条（0 words）；详情页正文正常 | 侧栏 badge=1131 ≠ 页头 1163；见坏标题如「素材不足」「密码保护」 |
| Settings → General | ✅ API Keys / Paths / Proxy / Save | — |
| Settings → LLM | ✅ DeepSeek / xAI / **Search (SearXNG/Firecrawl)** / **Exa(可选补充)** 与规划一致 | SearXNG URL 空；Firecrawl Key 显示 `****`（未配置） |
| Settings → Schedule | ✅ Last Run Success；每 3h 八点；4 步清单正确 | — |
| Settings → Logs | ❌ 显示 12321 条但内容停在 **2026-06-27** | 与 B-LOG-STALE 一致 |
| Settings → Data | ✅ Export / Preview / Clear 警示文案在 | — |

### 浏览器新增确认

- **B-SYNC-REWRITE-STALE**：`/api/dashboard/stats` → `pipeline.rewrite.status: "running"` 在管线 Idle 时仍为 running（Sync 页 Pipeline Status 误导）。
- Articles 坏标题（「素材不足」「密码保护」）与既有 **B-TITLE-SECTION-HEADER-LEAK** 同类，需一并清。
