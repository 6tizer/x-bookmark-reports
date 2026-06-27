# 变更日志 (CHANGELOG)

> 本文件按时间倒序记录项目重大变更，从 `BUGS.md` 已修复表 + `PROJECT_CONTEXT.md` 里程碑提取。
> 详细 Bug 修复记录见 [../BUGS.md](../BUGS.md)，工作日志见 [../Progress.md](../Progress.md)。

---

## 2026-06-27 — 文档整理 + UI 全面审计

**主要变更**：

1. 归档 `UI-ADJUSTMENT-PLAN.md` → `docs/archive/UI-ADJUSTMENT-PLAN-v2-2026-04.md`
2. 删除 Streamlit legacy：`app.py` + `start.command`
3. 新建 `Progress.md`（根目录）+ `docs/CHANGELOG.md`
4. 提交 `docs/UI_AUDIT_2026-06-27.md`（31+ bug，4 P0 / 6 P1 / 9 P2）
5. 更新 `PROJECT_CONTEXT.md` / `README.md` / `WORKFLOW.md` 至 2026-06-27 状态
6. `BUGS.md` 补 B046–B055（UI 审计 P0/P1）
7. 重写 `ui/README.md` 反映当前 Next.js UI
8. `ui/CONTRACT.md` 顶部加 DEPRECATED PARTIAL 警告

**审计发现的 P0 问题**（待修复）：

- B046 `isDbEmpty()` 语义错误
- B047 Dashboard `totalBookmarks` 取错数据源
- B048 Bookmarks 页读 deep drafts 而非 bookmarks.json
- B049 Cron 调度设置不写 launchd
- B050 跨 provider 模型 bug（xAI Grok 喂给 DeepSeek API）

---

## 2026-06-27 — auto_run.sh 日志持久化

**主要变更**：

- `auto_run.sh` 日志从 `/tmp/bookmark-auto.log` 改为 `logs/bookmark-auto.log`
- `launchd` plist 同步更新 `StandardOutPath` / `StandardErrorPath`
- `.gitignore` 加入 `logs/`

**影响**：重启后日志不再丢失，运维可 `tail -f logs/bookmark-auto.log` 实时查看。

---

## 2026-05-05 — 管线全面重构与稳定化（B037–B045）

**主要变更**：

1. **4 步管线固化**：sync → deep draft → article pipeline → upload finished（原 3 步）
2. **`auto_run.sh` 更新**：加入 `article_pipeline.py` 步骤；改用 `.venv/bin/python3` 运行含 openai 依赖的脚本
3. **`launchd` 调频**：8 小时改为每 3 小时
4. **Notion 去重保护**：上传前查 `文章链接` (source_url) 属性，已存在则 `[SKIP-DUP]` 跳过
5. **Exa bug 修复**：`choices[0]` → 遍历取最后非空 choice；加入 2 次重试（3s 间隔）
6. **并发进程保护**：各 API route 用 `pgrep` + `kill -9` 精准终止同类旧进程
7. **Sync Bookmarks UI 修复**：`sync_bookmarks.sh` 先于 `coordinator.py` 执行
8. **归档目录**：`output/归档/` 不再计入 Dashboard 统计
9. **默认 `--resume`**：`article_pipeline.py run-batch` 默认续跑，防止重复处理

**修复 Bug**：B037 / B038 / B039 / B040 / B041 / B042 / B043 / B044 / B045

---

## 2026-05-04 — UI build / 代理修复（B035–B036）

**主要变更**：

- B035 工作区 `http.noProxy` + `NO_PROXY`；`npm run dev:clean` 解决 502 / 白屏
- B036 修复 TypeScript build 错误（`articleBasenameNoExt` / `for..of` Set 遍历）

---

## 2026-04-28 — 代码审查与修复（B021–B034）

**主要变更**：

- B021 `replies_client.py` 429/500 重试耗尽后 `last_err` 赋值
- B022 `lib/coordinator.py` 纯文本 fallback 从 `tweetBy` 读作者
- B023 `bin/upload_to_notion.py` `NOTION_DB_ID` 默认空串，live 模式校验
- B024 `quoted_client.py` 使用 `PROXY`（ProxyHandler + opener）
- B025 `lib/coordinator.py` 两遍扫描：高优先级 URL 后再 external
- B027 `lib/report_builder.py` `_parse_timestamp` fallback 用 `datetime.now(timezone.utc)`
- B028 `lib/config.py` `get_gh_username()` 懒加载，避免 import 时 subprocess
- B029 `lib/external_client.py` HEAD 优先，403/405/501 时 GET fallback
- B030 `requirements.txt` 锁定 `>=current,<next_major`
- B031 `lib/report_builder.py` 使用公共 `html_to_text`
- B032 `lib/external_client.py` 移除 3xx 死代码
- B033 `lib/coordinator.py` `ExternalClient.unshorten()` 公开封装
- B026 `app.py` `_run_deep_batch_inner` 重复逻辑 — **deferred**

---

## 2026-04-20 — rettiwt-api v4→v7 升级

**主要变更**：

- `createdAt` 字段从 Twitter native 格式改为 ISO 8601
- `lib/report_builder.py::_parse_datetime` 与 `bin/upload_to_notion.py::_parse_published_at` 双格式兼容
- 旧版 567 条 + 新版增量并存

---

## 2026-04-01 — 报告增强 Phase 1–3（B014–B020）

**主要变更**：

- B014 `bin/coordinator.py` 仅在 `stats['errors'] > 0` 时打印失败警告
- B015 `report_builder.py` / `coordinator.py` Article 互动统计字段修正
- B016 `report_builder.py` Replies 汇总用 `bookmark_id`，作者推断
- B017 `config.py` `_optional_env`，避免必填变量 import 崩溃
- B018 `github_client.py` urllib 路径 `decode_base64=False`
- B019 `external_client.py` 重定向与重试解耦
- B020 `bin/coordinator.py` `--id` 分支删除无用导入

---

## 2026-03-31 — 报告增强 Phase 1（B008–B013）

**主要变更**：

- B008 `article_client.py` / `coordinator.py` 按 OpenAPI 解析 `contents` 与作者
- B009 `external_client.py` 重写 HTML 解析逻辑
- B010 `article_client.py` 缓存目录自动创建
- B011 `coordinator.py` 纯文本分类为 `quoted`
- B012 `external_client.py` 正则 + HTMLParser 清理 CSS/style
- B013 `replies_client.py` 兼容 `tweets`/`data`，429 重试

---

## 2026-03-30 — 初始创建（B001–B007）

**主要变更**：

- B001 `github_client.py` `GitHubNotFound` 加入 fallback 异常捕获
- B002 URL 提取用 `urllib.parse.urlparse` 验证 netloc
- B003 移除未使用的 `GitHubParseError`
- B004 owner/repo 正则验证 `^[a-zA-Z0-9_-]+$`
- B005 `coordinator.py` `_extract_url_value` 处理 dict 类型 `entities.urls`
- B006 `/i/articles/` 复数形式支持
- B007 `bin/coordinator.py` 修正 `DEFAULT_BOOKMARKS_PATH` 导入路径
