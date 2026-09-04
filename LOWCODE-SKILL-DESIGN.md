# BEST Low-Code Skill 迁移设计

## 1. 目标与结论

将 BEST low-code 从“项目初始化时写入根目录提示词，再由项目提示词强制约束 AI”迁移为“安装一个 Skill，在需要时由用户显式指定”。

目标体验：

```text
安装一次 best-lowcode Skill
        ↓
用户在具体任务中显式指定：使用 best-lowcode Skill
        ↓
Skill 读取当前项目配置与 Manifest
        ↓
Skill 编排 prepare → 澄清 → 实施 → preview → verify
```

本设计采用以下决策：

- Skill 是用户入口，默认不对普通 CRUD 或普通 React 任务生效。
- 彻底移除 `best init` 和 `best agent init` 的提示词初始化职责，不保留运行时兼容入口。
- 不把低代码规则写入用户项目的 `AGENTS.md`，也不要求项目根目录存在由 CLI 生成的提示词。
- `best-lowcode-devtools` 保留为执行后端：MCP、`prepare`、`preview`、`verify`、Manifest 发现和页面脚手架继续复用。
- Skill 包含可执行脚本/命令约定，但不复制 Schema 校验、Manifest 解析或 Runtime 能力；单一事实源仍是 `best-lowcode-runtime` 与 `best-lowcode-devtools`。
- 现有项目不提供自动迁移 codemod；需要用户按迁移清单手动删除旧初始化产物并安装 Skill。

## 2. 当前实现基线

### 2.1 入口与职责

证据来自 `packages/best-lowcode-cli/src/cli.ts`：

| 当前入口 | 当前职责 | 迁移后的定位 |
| --- | --- | --- |
| `best init [--write]` | 生成 `best.lowcode.config.json` 与 `lowcode.manifest.json` 模板 | 移除；配置由项目/模板显式维护 |
| `best agent init --targets codex [--write]` | 写入 `AGENTS.md` 中的 managed rule block | 移除；规则进入 Skill |
| `best prepare <request>` | 读取配置与 Manifest，生成 `AgentTask` | Skill 的任务准备后端 |
| `best page create ...` | 预览/生成 CRUD 页面骨架 | Skill 的可选脚手架命令 |
| `best manifest sync --discover` | 发现页面能力并预览/写入 Manifest | Skill 的可选同步步骤 |
| `best verify` | 校验配置、Schema、Manifest、Runtime 及声明的验证命令 | Skill 的必经验收步骤 |
| `best mcp serve` | 提供 `best_get_context`、`best_prepare_task`、`best_preview_change`、`best_discover_manifest`、`best_verify` | Skill 优先调用的工具后端 |

### 2.2 规则与能力来源

- `BEST-LOWCODE.md` 是当前项目级规则全文，覆盖适用范围、四层边界、能力优先级、写入前预览和完成后验证。
- `packages/best-lowcode-cli/LOWCODE_AI_GUIDE.md` 是面向 AI 的长篇操作指南，已包含标准工作流、页面职责、Schema/Manifest/Registry/Runtime 边界及验证要求。
- `packages/best-lowcode-cli/src/agent-init.ts` 只生成很短的 Codex 规则片段，本身不是能力实现。
- `packages/best-lowcode-cli/src/mcp/service.ts` 是工作流编排核心，负责读取上下文、语义准备、候选预览、Manifest 发现与验证。
- `packages/best-lowcode-cli/src/mcp/task.ts` 负责 `AgentTask`、能力分组、需求覆盖判断、路径白名单与阻塞问题。
- `packages/best-lowcode-cli/src/templates.ts` 只提供默认配置与空 Manifest 模板。

因此迁移重点是“规则载体和触发方式”变化，而不是重写 Runtime 或 MCP。

## 3. 目标 Skill 形态

建议目录：

```text
skills/best-lowcode/
  SKILL.md
  agents/openai.yaml
  references/
    workflow.md
    schema-boundaries.md
    migration.md
  scripts/
    check-project.mjs
    prepare-task.mjs
    verify-project.mjs
```

### 3.1 `SKILL.md` frontmatter

建议使用稳定、可被用户搜索的名称与显式触发描述：

```yaml
---
name: best-lowcode
description: Use BEST low-code to build or modify CRUD pages when the user explicitly asks to use this skill; orchestrates schema, registry, manifest, runtime, MCP preparation, preview, and verification.
---
```

描述中必须强调“用户显式指定”，避免把当前 `BEST-LOWCODE.md` 的“所有 CRUD 默认低代码”继续变成隐式全局规则。

### 3.2 Skill 主流程

`SKILL.md` 只保留决策和编排；详细字段契约放在 references 中。

1. 确认任务已显式指定 BEST low-code Skill。
2. 确认当前项目根目录，并读取 `best.lowcode.config.json`、Manifest 和 Runtime 上下文。
3. 优先调用 MCP `best_prepare_task(projectRoot, request)`；MCP 不可用时才运行 `best prepare`，并在结果中记录回退。
4. 读取 `requirementCoverage`、`capabilityGroups`、`pageContext`、`allowedPaths`、`verificationCommands` 和 `questions`。
5. `questions` 非空、能力为 `extension-required`、路径不在白名单或接口/权限/字段不明确时，停止修改并向用户确认。
6. 新页面先使用 `best page create` 预览，再按确认结果写入；已有页面直接在 Schema、adapter、registry、index 的职责边界内修改。
7. 修改 Schema 或 Manifest 前调用 `best_preview_change`；先审查 diff，再写入。
8. 需要新增能力时优先更新 Runtime/Manifest/Registry 的既有扩展点，不直接手写第二套 CRUD 数据流。
9. 完成后依次执行 `best_verify`、`AgentTask.verificationCommands`、类型检查、测试、构建和必要的真实浏览器验证。
10. 最终报告说明使用的 Skill、能力选择、验证命令、失败归因及仍待确认事项。

### 3.3 显式触发示例

推荐用户表达：

```text
使用 best-lowcode Skill，在 src/pages/customers 中新增客户 CRUD 页面。
使用 BEST low-code Skill 修改现有客户列表的筛选条件。
这次需求明确采用 lowcode，请按 best-lowcode Skill 流程执行。
```

以下任务不应自动激活该 Skill：

- 用户未指定 low-code 的普通 React 页面。
- 纯视觉还原、图表大屏、编辑器等当前 Schema 不覆盖的页面。
- Runtime、CLI、Skill 本身的基础设施维护任务，除非用户明确要求用该 Skill 验证低代码行为。

## 4. 脚本与工具边界

Skill 可以提供轻量脚本，统一安装检查和命令调用体验，但脚本不得成为第二套规则实现。

### 4.1 `check-project.mjs`

只读检查：

- 解析当前项目根目录。
- 检查 `best.lowcode.config.json` 是否存在、JSON 是否有效。
- 检查 `manifestPaths` 指向的 Manifest 是否存在且可解析。
- 输出缺失项、建议命令和项目根目录。

脚本不应创建文件。配置缺失时输出“请由项目模板或用户手动创建”，不再调用 `best init --write`。

### 4.2 `prepare-task.mjs`

调用已安装的 `best-lowcode-devtools`：

- 默认执行 `best prepare --cwd <projectRoot> <request>`。
- 若 MCP 客户端可用，Skill 指令优先使用 MCP `best_prepare_task`，脚本仅作 CLI fallback。
- 保留结构化 JSON 原样输出，不在脚本内重新匹配能力或推导路径。

### 4.3 `verify-project.mjs`

调用 `best verify --cwd <projectRoot>`，并在需要时串联项目配置中的验证命令。脚本只负责编排、退出码传播和错误摘要。

### 4.4 不应放入 Skill 的内容

- Runtime 的 Schema 类型与渲染逻辑。
- Manifest 能力发现和静态 TypeScript 解析。
- 业务 API、权限、字典或服务实现。
- 任何 token、URL、cookie 或项目机密。
- 直接改写用户项目文件的通用脚本。

## 5. CLI 调整范围

### 5.1 删除项

实现阶段删除：

- `packages/best-lowcode-cli/src/init.ts`
- `packages/best-lowcode-cli/src/agent-init.ts`
- `src/cli.ts` 中 `init` 与 `agent init` 分支及 usage 文案
- `src/index.ts` 中 `initializeProject`、`initializeCodexAgentRules` 的导出
- `tests/agent-init.test.ts` 及与初始化命令绑定的测试

同时从 `packages/best-lowcode-cli/README.md`、`LOWCODE_AI_GUIDE.md` 和相关诊断恢复文案中移除 `best init --write`、`best agent init --write` 的推荐。

### 5.2 保留项

保留并继续作为 Skill 后端：

- `best prepare`
- `best page create`
- `best manifest sync --discover`
- `best verify`
- `best mcp serve`
- `best-lowcode-mcp` 的工具协议与 `projectRoot` 参数校验

### 5.3 配置初始化的新原则

CLI 不再负责创建项目配置。项目模板、脚手架或文档可以提供示例文件，但必须由用户/项目维护者决定：

- `allowedPaths`
- `manifestPaths`
- `schemaFilePattern`
- `verificationCommands`

这样 Skill 只消费项目声明，不会在用户未授权时写入项目根目录。

## 6. 迁移方案

### 6.1 新项目

1. 安装 `best-lowcode` Skill。
2. 在项目模板中手动提供并评审 `best.lowcode.config.json` 与 Manifest。
3. 配置 Codex/MCP 的 `best-lowcode-devtools` 服务。
4. 具体任务中显式指定 Skill。

### 6.2 已有项目

本设计不提供自动 codemod，建议手动执行：

1. 安装 Skill。
2. 备份并删除 `AGENTS.md` 中 `<!-- best-lowcode:start -->` 到 `<!-- best-lowcode:end -->` 的托管规则块；保留其他项目规则。
3. 保留已有 `best.lowcode.config.json` 与 Manifest，逐项审查白名单和验证命令。
4. 删除对 `best init` / `best agent init` 的 CI 或 onboarding 依赖。
5. 用一次显式 Skill 任务执行 `check-project`、`prepare` 和 `verify`。
6. 在团队开发规范中约定：只有需求明确标注 low-code 时才激活 Skill。

## 7. 兼容与版本策略

- 按本次决策，目标版本直接移除 `init`、`agent init`、相关导出和测试；旧命令不保留运行时兼容层。
- 如果发布流程要求先经过一个过渡版本，只允许增加一次性的 deprecation warning，不得继续写入 `AGENTS.md` 或创建配置文件；随后仍按 major 版本完成移除。
- 旧命令在移除后返回清晰错误：“初始化入口已移除，请安装并显式指定 best-lowcode Skill”。
- 本次设计不提供自动迁移 codemod，也不设计长期兼容层。
- MCP 工具协议和 `AgentTask` 结构保持向后兼容，除非后续单独设计版本升级。

## 8. 验证计划

实现 Skill 后，至少验证：

### Skill 包

- frontmatter 可解析，名称为 `best-lowcode`，描述明确要求显式触发。
- 未指定 Skill 的普通 CRUD 任务不会进入该流程（通过人工/回归提示词测试确认）。
- 指定 Skill 后能读取项目根目录、配置和 Manifest，并输出结构化任务。

### CLI/MCP

```bash
pnpm --filter best-lowcode-devtools check
pnpm --filter best-lowcode-devtools test
pnpm --filter best-lowcode-devtools build
pnpm --filter best-lowcode-devtools best verify --cwd <fixture>
```

- `best init` 与 `best agent init` 不再出现在 usage、README、诊断恢复建议和公开导出中。
- `best prepare`、`best preview_change`、`best_verify` 的能力与路径白名单行为不变。
- 配置缺失时，错误恢复建议指向“手动提供配置/Manifest”，不能指向已删除命令。

### 端到端

使用一个 fixture 项目验证：

1. 显式指定 Skill，新增 CRUD 页面。
2. `questions` 非空时确实暂停，不写文件。
3. Schema/Manifest 写入前产生可审查 diff。
4. `best_verify`、类型检查、测试、构建和浏览器验证全部执行并正确传播退出码。
5. 不显式指定 Skill 的普通页面任务不受 BEST low-code 规则影响。

## 9. 风险与取舍

| 风险 | 缓解措施 |
| --- | --- |
| 用户忘记显式指定 Skill，导致 CRUD 不再自动走 low-code | 在 Skill README、项目模板和 PR 模板中提供明确调用示例 |
| 不同项目的配置质量不一致 | `check-project` + `best_verify` 作为 Skill 前置/后置检查 |
| CLI 与 Skill 规则漂移 | Skill 只编排，规则引用同一份 references；能力实现继续由 MCP service 单一承载 |
| 旧项目依赖 AGENTS 托管块 | 提供手动迁移清单，并在 major 版本给出清晰错误 |
| Skill 脚本被误用为任意写文件工具 | 脚本只读/编排，所有写入仍由用户确认后的具体 CLI/MCP 操作完成 |

## 10. 实施顺序

1. 在仓库新增 `skills/best-lowcode`，先把 `BEST-LOWCODE.md` 与 `LOWCODE_AI_GUIDE.md` 的规则拆分为主 Skill 和 references。
2. 增加安装说明、显式触发示例和三个只做检查/编排的脚本。
3. 更新 CLI README、诊断恢复文案和 MCP 文档，去除初始化入口叙述。
4. 删除 `init`/`agent init` 实现、导出与测试。
5. 运行类型检查、单元测试、构建、`git diff --check` 和 fixture 端到端验证。
6. 独立审查最终 diff，确认未残留根目录提示词写入路径、未改变 MCP 能力语义，再决定是否提交。
