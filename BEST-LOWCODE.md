# BEST low-code 开发规则

## 适用范围

所有 CRUD、列表、表单、筛选、表格操作需求默认使用 BEST low-code。
只有用户明确要求不用低代码，或任务明确不适合 CRUD Schema 时，才允许普通 React 实现。

## 开始前

涉及 `BestCrudPage`、`schema.ts`、`adapter.ts`、`registry.ts`、`lowcode.manifest.json`，
或用户提出新增/修改 CRUD 列表、表单、筛选、表格操作时，第一步必须调用
`best_prepare_task(projectRoot, request)`；必要时调用 `best_get_context(projectRoot)`。
必须读取返回的 `AgentTask.requirementCoverage` 和 `builtinCapabilityDefinitions`，按推荐实现逐项落地。
按返回的 `AgentTask` 实施；若 `questions` 非空或存在 `extension-required`，必须停止并向用户确认。
不得猜测 service、dictionary、slot、action、权限、路径或 API 参数。

## 实现中

新建 CRUD 页面必须采用 `schema.ts + adapter.ts + registry.ts + index.tsx`：
schema.ts 描述结构；adapter.ts 处理请求/响应和字段转换；registry.ts 提供 Service、Dictionary、Action、Slot、Access；index.tsx 只装配 BestProvider + BestCrudPage。
BestCrudPage 必须是页面实际可见主体和数据流入口；禁止隐藏、零尺寸、屏幕外渲染或旁路渲染。
禁止用手写 Table、Form、ProTable 或完整 CRUD Modal 替代 Runtime；不得用本地 CRUD 状态维护第二套列表或表单。
业务辅助弹窗可以存在，但不得承担主列表、主表单或 CRUD 数据流。

能力选择优先级：
1. Schema 内置字段；2. 字典和条件表达式；3. Runtime Action；4. Runtime 公共组件；5. 局部 Slot；6. Runtime 扩展；7. 手写业务组件。
只要上一级能力可以满足需求，就不得选择下一级方案。Slot 只能替换单个字段、列、详情区块或局部操作，不得替代整个 CRUD 页面。

## 写入前

Schema 或 Manifest 修改前调用 `best_preview_change`。
若 `extension-required`，必须让用户选择扩展 Runtime、使用局部 Slot，或明确授权手写实现。
手写业务组件必须记录用户授权、无法使用 Runtime 的原因、实现范围，以及是否应沉淀为公共能力。

## 完成后

完成后先调用 `best_verify`，再执行 AgentTask.verificationCommands、类型检查、测试、构建和必要的浏览器验证。
构建通过不等于 low-code 验收通过；必须确认页面实际由 BestCrudPage 渲染，数据、表单和操作来自 Schema/Registry。
验证失败时不得声称完成；未经用户明确要求，不提交、推送或合并代码。

## 例外与工具回退

MCP 不可用时才回退 CLI，并在最终报告中说明回退原因。
