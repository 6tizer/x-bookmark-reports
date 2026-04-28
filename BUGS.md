# 代码审查跟踪

> 本文件记录所有代码审查发现的问题，便于跟踪修复状态。
> 每次代码审查后更新此文件。

---

## 待修复


| ID   | 文件     | 问题描述                                                                                                                                                           | 严重性    | 发现日期       | 状态       |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | -------- |
| B026 | app.py | `_run_deep_batch_inner`（L363-555）完整复制了 `BookmarkCoordinator.run_deep` 的核心逻辑，任何 bug 修复需同步两处，维护风险高。**暂缓**：建议后续改为 `run_deep` 注入进度/stop 回调，一次性重构并配合 Streamlit 回归测试 | MEDIUM | 2026-04-28 | deferred |


---

## 已修复


| ID   | 文件                                 | 问题描述                                                                                                   | 严重性    | 发现日期       | 修复日期       | 修复说明                                                    |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ | ---------- | ---------- | ------------------------------------------------------- |
| B001 | github_client.py                   | `GitHubNotFound` 未被 fallback 捕获，gh CLI 404 时不会尝试 urllib                                                | MEDIUM | 2026-03-30 | 2026-03-30 | 添加 `GitHubNotFound` 到异常捕获元组                             |
| B002 | github_client.py                   | URL 提取可被伪造 URL 绕过（如 `evil.com/?github.com/owner/repo`）                                                 | MEDIUM | 2026-03-30 | 2026-03-30 | 使用 `urllib.parse.urlparse` 验证 netloc                    |
| B003 | github_client.py                   | `GitHubParseError` 是死代码，从未抛出                                                                           | LOW    | 2026-03-30 | 2026-03-30 | 移除未使用的异常类                                               |
| B004 | github_client.py                   | owner/repo 缺少输入验证                                                                                      | LOW    | 2026-03-30 | 2026-03-30 | 添加正则验证 `^[a-zA-Z0-9_-]+$`                               |
| B005 | coordinator.py                     | URL 提取需处理 dict 类型的 entities.urls                                                                       | MEDIUM | 2026-03-30 | 2026-03-30 | 添加 `_extract_url_value` 方法统一处理                          |
| B006 | coordinator.py                     | `/i/articles/` 复数形式需支持                                                                                 | MEDIUM | 2026-03-30 | 2026-03-30 | 更新正则 `article[s]?` 使 s 可选                               |
| B007 | bin/coordinator.py                 | `from lib.config import DEFAULT_BOOKMARKS_PATH` 错误导入，`DEFAULT_BOOKMARKS_PATH` 定义在 `lib/coordinator.py` | HIGH   | 2026-03-31 | 2026-03-31 | 改为 `from lib.coordinator import DEFAULT_BOOKMARKS_PATH` |
| B008 | article_client.py / coordinator.py | `/twitter/article` 响应与 OpenAPI 不一致等                                                                    | HIGH   | 2026-03-31 | 2026-03-31 | 按 OpenAPI 解析 `contents`/作者；fallback 等                   |
| B009 | external_client.py                 | HTML 内容未清理，CSS/JS 代码被保留                                                                                | MEDIUM | 2026-03-31 | 2026-03-31 | 重写 HTML 解析逻辑                                            |
| B010 | article_client.py                  | 缓存目录未创建，写入失败                                                                                           | MEDIUM | 2026-03-31 | 2026-03-31 | 在 _set_cached 方法中添加 cache_path.parent.mkdir()           |
| B011 | coordinator.py                     | 纯文本推文分类为 unknown                                                                                       | MEDIUM | 2026-03-31 | 2026-03-31 | 修改 classify_bookmark 返回 "quoted"                        |
| B012 | external_client.py                 | CSS/style 块仍残留在输出中                                                                                     | MEDIUM | 2026-03-31 | 2026-03-31 | 正则 + HTMLParser                                         |
| B013 | replies_client.py                  | API 响应键名 "data" vs "tweets"                                                                            | HIGH   | 2026-03-31 | 2026-03-31 | 兼容 tweets/data；分页；429 重试                                |
| B014 | bin/coordinator.py                 | 批量模式无条件打印失败警告                                                                                          | MEDIUM | 2026-04-01 | 2026-04-01 | 仅在 `stats['errors'] > 0` 时打印                            |
| B015 | report_builder.py / coordinator.py | Article 互动统计误用键                                                                                        | HIGH   | 2026-04-01 | 2026-04-01 | coordinator 合并书签互动；报告兼容字段                               |
| B016 | report_builder.py                  | Replies 汇总误用 bookmark 键                                                                                | HIGH   | 2026-04-01 | 2026-04-01 | bookmark_id；作者推断                                        |
| B017 | config.py                          | 必填变量导致 import 崩溃                                                                                       | HIGH   | 2026-04-01 | 2026-04-01 | `_optional_env`；`.env.example`                          |
| B018 | github_client.py                   | urllib README base64 误解码                                                                               | MEDIUM | 2026-04-01 | 2026-04-01 | urllib 路径 `decode_base64=False`                         |
| B019 | external_client.py                 | 重定向与重试耦合导致退避过长                                                                                         | MEDIUM | 2026-04-01 | 2026-04-01 | while 跟踪重定向；内层独立重试                                      |
| B020 | bin/coordinator.py                 | `--id` 分支无用导入                                                                                          | LOW    | 2026-04-01 | 2026-04-01 | 删除无用导入                                                  |
| B021 | replies_client.py                  | 429/500 重试耗尽后 `last_err` 仍为 None，分页继续                                                                  | HIGH   | 2026-04-28 | 2026-04-28 | 各 HTTP 分支赋值 `last_err`                                  |
| B022 | lib/coordinator.py                 | 纯文本 fallback 读顶层 author 字段                                                                             | HIGH   | 2026-04-28 | 2026-04-28 | 从 `tweetBy` 读取 fullName/userName                        |
| B023 | bin/upload_to_notion.py            | `NOTION_DB_ID` 硬编码默认值                                                                                  | HIGH   | 2026-04-28 | 2026-04-28 | 默认空串；live 模式校验必填                                        |
| B024 | quoted_client.py                   | 未使用 PROXY                                                                                              | MEDIUM | 2026-04-28 | 2026-04-28 | ProxyHandler + opener                                   |
| B025 | lib/coordinator.py                 | 首个 external URL 遮挡后续 github                                                                            | MEDIUM | 2026-04-28 | 2026-04-28 | 两遍扫描：高优先级后再 external                                    |
| B027 | lib/report_builder.py              | `_parse_timestamp` fallback 无时区                                                                        | MEDIUM | 2026-04-28 | 2026-04-28 | `datetime.now(timezone.utc)`                            |
| B028 | lib/config.py                      | import 时 subprocess `gh api user`                                                                      | MEDIUM | 2026-04-28 | 2026-04-28 | `get_gh_username()` 懒加载；`get_config()` 合并 author        |
| B029 | lib/external_client.py             | `_unshorten` 仅用 GET                                                                                    | LOW    | 2026-04-28 | 2026-04-28 | HEAD 优先；403/405/501 时单次 GET fallback                    |
| B030 | requirements.txt                   | 无版本锁定                                                                                                  | LOW    | 2026-04-28 | 2026-04-28 | `>=current,<next_major` 约束                              |
| B031 | lib/report_builder.py              | `_clean_html_content` 与 external 重复                                                                    | LOW    | 2026-04-28 | 2026-04-28 | 使用公共 `html_to_text`，删除重复方法                              |
| B032 | lib/external_client.py             | `_fetch` 内 3xx 分支死代码                                                                                   | LOW    | 2026-04-28 | 2026-04-28 | 移除成功响应路径上的 3xx 分支                                       |
| B033 | lib/coordinator.py                 | 调用 `_unshorten` 私有方法                                                                                   | LOW    | 2026-04-28 | 2026-04-28 | `ExternalClient.unshorten()` 公开封装                       |
| B034 | bin/upload_to_notion.py            | `.env` 解析不剥离引号                                                                                         | LOW    | 2026-04-28 | 2026-04-28 | strip 后去除成对引号                                           |


---

## 审查清单

### 新文件审查清单（必查项）

#### 1. 正确性

- API 调用格式是否正确？
- URL/header 参数是否匹配文档？
- 缓存路径和 TTL 是否正确？
- 错误处理是否覆盖所有代码路径？

#### 2. 一致性

- 重试/退避策略是否与其他 client 一致？
- 缓存结构是否一致？
- 异常类命名是否一致？
- 日志格式是否一致？

#### 3. URL 提取（针对解析类）

- 基础 URL 格式是否正确？（`https://github.com/owner/repo`）
- 带子路径是否正确？（`/pull/123`, `/issues/789`）
- 裸 `owner/repo` 是否支持？
- 查询字符串和 hash 是否正确剥离？
- 是否防止注入攻击？

#### 4. 安全性

- subprocess 调用是否使用列表参数（防注入）？
- 超时是否正确设置？
- 敏感信息是否泄露到日志？

#### 5. 完整性

- 必需方法是否都已实现？
- docstring 是否准确？
- 单元测试是否覆盖关键路径？

---

## 已知限制


| 文件                 | 限制                                       | 备注              |
| ------------------ | ---------------------------------------- | --------------- |
| external_client.py | `_unshorten` 对某些短链服务可能失败                 | t.co 通常正常工作     |
| coordinator.py     | `classify_url` 无法区分 `needs_api_check` 类型 | 需要实际 API 调用才能确定 |


---

## 更新日志

- **2026-04-28**: 修复 B021–B025、B027–B034（HIGH/MEDIUM/LOW）；B026 暂缓 deferred；requirements 锁定；`_unshorten` HEAD+GET fallback；`get_config` 注入 author
- **2026-04-28**: 代码审查 — 新增 B021–B034
- **2026-04-01**: 修复 B014–B020
- **2026-03-31**: 修复 B013；报告增强 Phase 1–3；B009–B012、B008、B007 等
- **2026-03-30**: 初始创建