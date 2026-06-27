# 工作流规范

> 本文档定义 x-bookmark-reports 项目的开发工作流规范。
> 确保主 agent 和 subagent 之间高效协作，避免信息断层。

---

## 1. 核心原则

### 1.1 信息持久化

- 所有重要发现必须写入文件（`BUGS.md`）
- 避免仅依赖 agent transcript 的临时信息
- 审查结果必须结构化记录，便于后续查阅

### 1.2 Subagent 标准化

- 每个 subagent 任务必须使用 `TASK_SUMMARY.md` 模板输出摘要
- 摘要包含：完成项、新发现问题、验证结果、后续建议
- 主 agent 汇总摘要到 `BUGS.md`

### 1.3 状态跟踪

- Bug 状态：`待修复` → `修复中` → `已修复`
- 每次状态变更需更新 `BUGS.md`
- 修复后运行验证脚本确认

---

## 2. 开发流程

### 2.1 新功能开发

```
主 agent
  │
  ├─1─▶ 创建/读取 TASK_SUMMARY.md 模板
  │
  ├─2─▶ 调用 subagent 执行任务
  │       │
  │       └─▶ subagent 按模板输出摘要
  │
  ├─3─▶ 汇总摘要到 BUGS.md
  │
  └─4─▶ 更新 PROJECT_CONTEXT.md（如需要）
```

### 2.2 代码审查流程

```
主 agent
  │
  ├─1─▶ 调用 subagent 进行审查
  │       │
  │       └─▶ subagent 输出审查报告（按 TASK_SUMMARY 格式）
  │
  ├─2─▶ 审查发现 → BUGS.md（待修复）
  │
  ├─3─▶ 调用修复 subagent
  │       │
  │       └─▶ subagent 输出修复摘要
  │
  └─4─▶ 验证 → BUGS.md（已修复）
```

### 2.3 多文件并行修复

```
主 agent
  │
  ├─▶ 调用 subagent 修复 file1.py
  │       └─▶ 输出摘要 A
  │
  ├─▶ 调用 subagent 修复 file2.py
  │       └─▶ 输出摘要 B
  │
  └─▶ 汇总 A + B → BUGS.md
```

---

## 3. 文件职责


| 文件 | 职责 | 更新频率 |
|---|---|---|
| `PROJECT_CONTEXT.md` | 项目全局上下文（技术栈、API、管线说明） | 重大变更时 |
| `BUGS.md` | Bug 跟踪 | 每次审查/修复后 |
| `TASK_SUMMARY.md` | Subagent 输出模板 | 仅作为模板引用 |
| `Progress.md` | 工作日志（按迭代记录功能/错误/解决方案） | 每个迭代结束 |
| `docs/CHANGELOG.md` | 变更日志（从 BUGS 已修复 + 里程碑提取） | 重大变更时 |
| `docs/UI_AUDIT_*.md` | UI 审计报告（按日期归档） | 每次 UI 审计后 |
| `README.md` | 对外快速上手文档 | 功能/管线变更时 |
| `.cursor/rules/workflow.mdc` | Cursor IDE 规则 | 需要时更新 |


---

## 4. Subagent 调用规范

### 4.1 职责划分（重要）


| 谁来做          | 职责                     |
| ------------ | ---------------------- |
| **Subagent** | 执行任务、报告发现、更新摘要         |
| **主 agent**  | 汇总发现、更新 BUGS.md、决策是否记录 |


**核心原则**：Subagent 只报告，主 agent 决策并执行文件更新。

### 4.2 任务描述要求

调用 subagent 时，必须提供：

1. **任务目标**：明确要做什么
2. **上下文文件**：相关文件路径列表
3. **预期情况**：明确文件存在/不存在等边界情况
4. **BUGS.md 问题**：引用待修复的 BUG 编号（如有）
5. **验证方法**：如何验证成功
6. **输出格式**：使用 TASK_SUMMARY.md 模板

### 4.2 示例：调用修复任务

```markdown
## 任务：修复 github_client.py 的 fallback 逻辑

### 上下文文件
- lib/github_client.py（待修复文件）
- BUGS.md（当前问题列表）

### 问题
BUGS.md 中的 B001: `GitHubNotFound` 未被 fallback 捕获

### 预期情况
- lib/github_client.py：已存在，需修改
- BUGS.md：已存在，需更新状态

### 验证
```bash
cd "/Users/tizer_mac_studio/work/Cursor/Twitter Bookmark/x-bookmark-reports"
python3 -c "from lib.github_client import GitHubClient; ..."
```

### 输出

按 TASK_SUMMARY.md 格式输出摘要。

```

### 4.3 示例：调用审查任务

```markdown
## 任务：审查 coordinator.py

### 上下文文件
- lib/coordinator.py
- BUGS.md

### 预期情况
- lib/coordinator.py：已存在，需审查
- BUGS.md：已存在，需检查相关条目

### 审查清单
- [ ] URL 提取是否正确处理 dict 类型？
- [ ] Tweet ID 提取是否覆盖所有 URL 格式？
- [ ] ...

### 输出
按 TASK_SUMMARY.md 格式输出审查报告。
如有新发现，在"发现的新问题"中列出。
```

### 4.4 示例：调用文档任务

```markdown
## 任务：更新 README.md

### 上下文文件
- README.md
- lib/config.py

### 预期情况
- README.md：**当前不存在，需创建**
- 如存在则更新，不存在则创建

### 输出
按 TASK_SUMMARY.md 格式输出摘要。
```

---

## 5. 验证流程

### 5.1 验证清单

修复完成后，必须执行：

1. **导入测试**：`python3 -c "from lib.xxx import ..."`
2. **基本功能测试**：核心方法调用
3. **边界条件测试**：空输入、异常输入
4. **回归测试**：确保未破坏现有功能

### 5.2 验证脚本标准格式

```bash
cd "/Users/tizer_mac_studio/work/Cursor/Twitter Bookmark/x-bookmark-reports"
python3 -c "
# 1. 导入测试
from lib.xxx import ...

# 2. 基本功能
client = XxxClient()
...

# 3. 边界条件
...

print('验证通过!')
"
```

---

## 6. 文档维护

### 6.1 BUGS.md 更新规则

- **审查发现** → 添加到"待修复"表格，状态=`待修复`
- **开始修复** → 状态改为`修复中`，添加修复人/日期
- **修复完成** → 移动到"已修复"表格
- **拒绝修复** → 移到"已知限制"或"不会修复"

### 6.2 版本更新

重大版本更新时，清理 BUGS.md：

- 归档历史记录到 CHANGELOG.md
- 保留当前活跃问题

---

## 7. 常见问题处理

### Q1: Subagent 找不到之前审查的问题？

**A**: 检查 BUGS.md，所有审查发现必须记录在此。

### Q2: Subagent 修复后忘记更新 BUGS.md？

**A**: 主 agent 负责汇总，主 agent 应在调用修复任务后主动更新。

### Q3: 多个 subagent 并行执行？

**A**: 主 agent 负责汇总各自的摘要，确保无遗漏。

### Q4: 任务描述的文件状态与实际不符？

**A**: 在任务描述中添加"预期情况"字段，明确文件存在/不存在状态。Subagent 执行时在摘要中记录实际状态。

### Q5: Subagent 报告"无需更新 BUGS.md"但实际有新问题？

**A**: 主 agent 收到摘要后，主动检查代码变更是否涉及 BUGS.md 中的待修复项，不依赖 subagent 的判断。

---

## 8. 附录

### 8.1 严重性定义


| 级别     | 定义                 | 处理优先级 |
| ------ | ------------------ | ----- |
| HIGH   | 致命错误，功能完全不可用       | 立即修复  |
| MEDIUM | 功能受限，但有 workaround | 尽快修复  |
| LOW    | 小问题，不影响核心功能        | 计划修复  |


### 8.2 状态定义


| 状态   | 定义         |
| ---- | ---------- |
| 待修复  | 问题已记录，等待修复 |
| 修复中  | 正在修复       |
| 已修复  | 修复完成，验证通过  |
| 不会修复 | 已知限制，暂不处理  |


---

---

## 9. 管线运维参考

### 9.1 完整管线（4 步）

```bash
# Step 1: 同步书签
bash sync_bookmarks.sh

# Step 2: 生成深度报告
python3 bin/coordinator.py --deep-batch

# Step 3: 成品文章（需 .venv 的 Python）
.venv/bin/python3 bin/article_pipeline.py run-batch

# Step 4: 上传 Notion（含去重保护）
.venv/bin/python3 bin/upload_to_notion.py --mode finished --live
```

### 9.2 手动触发全流程

```bash
bash auto_run.sh --force   # 跳过代理检测
```

### 9.3 查看自动任务状态

```bash
launchctl list | grep bookmark                                  # 查看 launchd 状态
cat output/auto_run_state.json                                  # 查看最近一次执行状态
tail -f logs/bookmark-auto.log                                  # 实时查看日志
```

### 9.4 常见故障排查

| 现象 | 可能原因 | 处理 |
|---|---|---|
| Dashboard 数量不对 | 旧 build 缓存 | `npm run dev:clean` 重启 |
| coordinator 重复处理 | .deep-run-state.json 被覆盖 | 检查是否有 launchd 并发进程 |
| Exa 步骤空结果 | choices[0] 为空（正常现象） | 代码已取最后非空 choice |
| Notion 重复页面 | upload 去重未生效 | 检查 source_url 属性是否存在 |
| article_pipeline 找不到 openai | 用了系统 Python | 改用 `.venv/bin/python3` |

---

*本文档应与 BUGS.md 和 TASK_SUMMARY.md 配合使用。*