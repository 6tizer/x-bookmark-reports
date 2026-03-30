# 代码审查跟踪

> 本文件记录所有代码审查发现的问题，便于跟踪修复状态。
> 每次代码审查后更新此文件。

---

## 待修复

| ID | 文件 | 问题描述 | 严重性 | 发现日期 | 状态 |
|----|------|----------|--------|----------|------|

---

## 已修复

| ID | 文件 | 问题描述 | 严重性 | 发现日期 | 修复日期 | 修复说明 |
|----|------|----------|--------|----------|----------|----------|
| B001 | github_client.py | `GitHubNotFound` 未被 fallback 捕获，gh CLI 404 时不会尝试 urllib | MEDIUM | 2026-03-30 | 2026-03-30 | 添加 `GitHubNotFound` 到异常捕获元组 |
| B002 | github_client.py | URL 提取可被伪造 URL 绕过（如 `evil.com/?github.com/owner/repo`）| MEDIUM | 2026-03-30 | 2026-03-30 | 使用 `urllib.parse.urlparse` 验证 netloc |
| B003 | github_client.py | `GitHubParseError` 是死代码，从未抛出 | LOW | 2026-03-30 | 2026-03-30 | 移除未使用的异常类 |
| B004 | github_client.py | owner/repo 缺少输入验证 | LOW | 2026-03-30 | 2026-03-30 | 添加正则验证 `^[a-zA-Z0-9_-]+$` |
| B005 | coordinator.py | URL 提取需处理 dict 类型的 entities.urls | MEDIUM | 2026-03-30 | 2026-03-30 | 添加 `_extract_url_value` 方法统一处理 |
| B006 | coordinator.py | `/i/articles/` 复数形式需支持 | MEDIUM | 2026-03-30 | 2026-03-30 | 更新正则 `article[s]?` 使 s 可选 |
| B007 | bin/coordinator.py | `from lib.config import DEFAULT_BOOKMARKS_PATH` 错误导入，`DEFAULT_BOOKMARKS_PATH` 定义在 `lib/coordinator.py` | HIGH | 2026-03-31 | 2026-03-31 | 改为 `from lib.coordinator import DEFAULT_BOOKMARKS_PATH` |

---

## 审查清单

### 新文件审查清单（必查项）

#### 1. 正确性
- [ ] API 调用格式是否正确？
- [ ] URL/header 参数是否匹配文档？
- [ ] 缓存路径和 TTL 是否正确？
- [ ] 错误处理是否覆盖所有代码路径？

#### 2. 一致性
- [ ] 重试/退避策略是否与其他 client 一致？
- [ ] 缓存结构是否一致？
- [ ] 异常类命名是否一致？
- [ ] 日志格式是否一致？

#### 3. URL 提取（针对解析类）
- [ ] 基础 URL 格式是否正确？（`https://github.com/owner/repo`）
- [ ] 带子路径是否正确？（`/pull/123`, `/issues/789`）
- [ ] 裸 `owner/repo` 是否支持？
- [ ] 查询字符串和 hash 是否正确剥离？
- [ ] 是否防止注入攻击？

#### 4. 安全性
- [ ] subprocess 调用是否使用列表参数（防注入）？
- [ ] 超时是否正确设置？
- [ ] 敏感信息是否泄露到日志？

#### 5. 完整性
- [ ] 必需方法是否都已实现？
- [ ] docstring 是否准确？
- [ ] 单元测试是否覆盖关键路径？

---

## 已知限制

| 文件 | 限制 | 备注 |
|------|------|------|
| external_client.py | `_unshorten` 对某些短链服务可能失败 | t.co 通常正常工作 |
| coordinator.py | `classify_url` 无法区分 `needs_api_check` 类型 | 需要实际 API 调用才能确定 |

---

## 更新日志

- **2026-03-31**: 修复 B007 - bin/coordinator.py 导入路径错误
- **2026-03-31**: 添加 B007 - bin/coordinator.py 导入路径错误
- **2026-03-30**: 初始创建，记录 github_client.py 和 coordinator.py 修复项
