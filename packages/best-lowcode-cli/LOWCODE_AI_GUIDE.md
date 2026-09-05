# BEST Low-Code AI Guide

本文档是 AI 生成、迁移和维护 BEST 低代码页面的入口指南。目标是让页面产出稳定、可验证、可维护，而不是依赖 AI 临场猜项目结构。

## 适用范围

使用本指南处理这些任务：

- 新增低代码 CRUD 页面。
- 修改已有 `BestCrudPage` 页面。
- 维护 `schema.ts`、registry、Manifest 或低代码运行时能力。
- 将业务页面中的通用展示逻辑迁移到 `format`、`dict`、内置 action 等标准能力。

不适用这些任务：

- 纯手写 React 页面，不经过 `BestCrudPage`。
- 复杂视觉还原、图表大屏、强交互编辑器等低代码 Schema 暂未覆盖的页面。
- 需要真实业务决策但缺少接口、字段、权限或操作规则的页面。

## 一句话原则

Schema 描述页面结构，Manifest 声明可用能力，Registry 承接业务实现，Runtime 执行通用渲染和交互。

AI 不应绕过这四层边界。

对于复杂需求，先读取 `AgentTask.requirementCoverage`：`supported` 项必须由 Schema 和 registry 实现；`extension-required` 项必须先扩展 Runtime，或取得用户对手写实现的明确授权。禁止把 `BestCrudPage` 设为隐藏元素后在 `index.tsx` 手写页面主体。需要 Ant Design 的复杂编辑器或详情区块时，将其注册为 registry slot，并由 Schema 的 `component: 'slot'` 或 detail/action slot 引用。

## 标准流程

1. 准备任务。

   ```bash
   best prepare "新增客户列表页面"
   ```

   读取输出中的 Config、Manifest、内置能力和基础 `AgentTask`。当前 Agent 根据用户需求选择能力 ID 和可能修改的路径后，必须调用 `best_validate_selection` 校验；CLI 等价命令为：

   ```bash
   best validate-selection "新增客户列表页面" --related-capabilities '[]' --allowed-paths '["src"]'
   ```

   DevTools 不会启动或依赖 Codex、Cursor、Claude 等模型 CLI。不得猜测未出现在 Manifest 或内置能力中的 ID，也不得选择 Config 白名单外的路径。

2. 处理澄清问题。

   如果 `questions` 非空，停止实现并让用户确认。不要猜 service、dict、slot、action、权限或 API 参数。

   `AgentTask` 中的这些字段用于减少猜测：

   - `pageContext`：页面名、推荐模板、目标文件路径、生成文件、Manifest 路径和脚手架命令。
   - `capabilityGroups`：按 service、dictionary、action、slot、access、builtIn 分类后的相关能力。
   - `verificationCommands`：项目要求执行的验证命令。
   - `blockedQuestions`：必须先由用户确认的问题，与 `questions` 保持一致。

3. 生成页面骨架。

   ```bash
   best page create customer-list --kind crud --dir apps/demo/src/pages --title 客户列表
   ```

   默认只预览，不写文件。确认 JSON 输出后再执行：

   ```bash
   best page create customer-list --kind crud --dir apps/demo/src/pages --title 客户列表 --write
   ```

4. 补业务实现。

   在生成的 `api.ts`、`registry.ts`、`schema.ts` 中补齐接口、字段、枚举、操作和特殊展示。

5. 同步 Manifest。

   ```bash
   best manifest sync --discover
   best manifest sync --discover --write
   ```

   先看 preview diff，再写入。该命令只添加发现到的能力，不删除已有能力。

6. 验证。

   ```bash
   best verify
   pnpm typecheck
   ```

   同时执行项目 `best.lowcode.config.json` 中声明的 `verificationCommands`。

## `best page create`

命令：

```bash
best page create <name> --kind crud [--dir <pages-root>] [--title <title>] [--capability-prefix <id>] [--write]
```

行为：

- `<name>` 只能使用字母、数字和短横线，并以字母开头。
- 默认 `kind` 为 CRUD，目前只支持 `crud`。
- 默认只 preview，返回将要生成的文件内容。
- `--write` 写入文件，但已有文件时拒绝覆盖。
- `--dir` 是 pages 根目录，目标页面目录为 `<dir>/<name>`。
- 未传 `--dir` 时，会从 `allowedPaths` 推断常见页面目录。
- `--capability-prefix` 用于控制能力 ID 前缀，例如 `rps.customer-list`。

生成文件：

```text
<pages-root>/<name>/
  schema.ts
  api.ts
  registry.ts
  index.tsx
```

生成后的第一件事不是改 UI，而是把占位 service、dict、columns 和 rowKey 替换成真实业务定义。

## 四层边界

### Schema

Schema 只写可序列化、可校验的页面声明。

应该写：

- 页面标题、id、kind、version。
- list/create/update/remove/detail 等数据源能力 ID。
- 搜索字段。
- 表格列。
- 表格操作和 toolbar 操作。
- `format`、`dict`、`slot`、`action`、`access` 引用。

不应该写：

- JSX。
- 业务 fetch 实现。
- 状态映射函数。
- 权限函数。
- 复杂渲染逻辑。
- 任意未注册能力 ID。

### Manifest

Manifest 是项目能力清单，不是业务实现。

应该声明：

- `services`
- `dictionaries`
- `actions`
- `slots`
- `access`

不应该包含：

- API URL。
- token、key、cookie。
- 函数源码。
- 运行时状态。
- 页面布局细节。

内置能力不需要写入 Manifest，例如：

- `builtin.format.date`
- `builtin.format.datetime`
- `builtin.format.money`
- `builtin.format.text`
- `builtin.effect.openCreate`
- `builtin.effect.openDetail`
- `builtin.effect.openEdit`
- `builtin.effect.remove`
- `builtin.effect.runAction`
- `builtin.effect.slot`

### Registry

Registry 放业务实现，是 Schema 和真实项目之间的适配层。

应该放：

- service 函数。
- dictionary 数据。
- action 处理函数。
- slot 复杂渲染。
- access 权限判断。

不应该放：

- 可由 `format` 完成的通用日期、时间、金额文本格式化。
- 与页面无关的全局副作用。
- 未被 Schema 或 Manifest 引用的临时实现。

### Runtime

Runtime 由 `best-lowcode-runtime` 提供，负责通用行为。

当前已支持：

- CRUD 页面渲染。
- 搜索和表格。
- `date`、`datetime`、`money`、`text` 格式化。
- 字典映射。
- slot 渲染。
- action 二次确认。
- list 请求取消和过期响应抑制。
- 统一错误提示。

AI 不应在业务页面重复实现这些通用能力。

### 复杂表单的标准边界

- 新增、编辑差异字段使用 `visibleWhen: { operator: 'modeEquals', value: 'create' | 'edit' }`，不要在页面组件中判断抽屉状态。
- 依赖字段在隐藏后不应提交旧值时，设置 `clearWhenHidden: true`。
- 自定义输入使用 `component: 'slot'`；slot 会收到当前 `mode`、`values`、字段 `value` 和 `setValue`，必须通过 `setValue` 回写值。
- 阶梯价格等对象数组使用 `component: 'repeatable'` 和 `itemFields`，用 `minItems`、`maxItems` 约束行数；只有超出该模型时才使用 slot。
- 页面入口可以向 `BestCrudPage` 传入 `CrudDataAdapter`。其中 `fromList`、`fromDetail` 负责响应规范化，`toCreatePayload`、`toUpdatePayload` 负责请求转换；禁止把这些映射散落在组件和 Schema 中。

### 页面文件职责

新页面固定采用 `schema.ts + adapter.ts + registry.ts + index.tsx`：Schema 不包含业务函数；adapter 不包含 JSX；registry 不处理 API 字段协议；index 只装配 `BestProvider` 和 `BestCrudPage`。存量内联 registry 页面应在后续业务修改时迁移到独立 `registry.ts`，避免影响能力发现和自动审查。

## 能力选择规则

优先级从高到低：

1. 使用内置能力。

   通用日期、时间、金额、文本展示优先用 `format`。

2. 使用字典。

   简单枚举展示和 select 搜索优先用 `dict`。

3. 使用 action。

   有明确业务副作用的按钮使用 `runAction + action`。

删除记录使用 `effect: 'remove'`，并在 `dataSource.remove` 引用项目 registry 中的真实删除 service；运行时会二次确认、调用 service 并刷新列表。

4. 使用 slot。

   只有复杂 UI 或依赖业务上下文的展示才使用 `slot`。

5. 停止并询问。

   接口、字段、权限、状态含义、操作结果不明确时，不猜。

## 什么时候必须保留 slot

这些情况保留业务 slot：

- 状态颜色、标签、tooltip 依赖业务规则。
- 金额展示依赖币种、精度、符号或 locale。
- 单元格内有多个字段组合展示。
- 操作按钮依赖复杂 record 状态。
- 展示内容需要跳转、弹窗、复制、图片预览等交互。

这些情况不要写 slot：

- 普通日期。
- 普通 UTC 时间。
- 普通数字金额。
- 普通文本兜底。
- 简单枚举文本。

## 列表 adapter 约定

列表请求必须在应用侧 adapter 中完成。adapter 是唯一允许了解后端请求参数、响应路径和字段格式的位置；Schema、runtime 和 registry 均不得写入这些接口细节。

低代码 list service 使用稳定的、与后端无关的签名：

```ts
import type { BestListQuery, BestListResult } from 'best-lowcode-runtime'

async function listCustomers(
  query: BestListQuery,
  options?: { signal?: AbortSignal }
): Promise<BestListResult<Customer>> {
  const response = await postCustomerList({
    page: query.page,
    page_size: query.pageSize,
    keyword: query.filters.keyword
  })
  return { items: response.records, total: response.total_count }
}
```

要求：

- 接收 `query.page`、`query.pageSize`、`query.filters` 和可选的 `query.sort`。
- 支持 `options.signal`，让 runtime 可以取消过期请求。
- 只返回 `{ items, total }`，不得返回后端原始响应。
- 在 adapter 内完成 `page/pageSize` 到 `page_size`、`offset/limit` 或 cursor 等后端协议映射，并解包任意后端响应格式。
- 在 `registry.listServices` 中注册 adapter；不要在页面组件或 Schema 中处理接口映射。
- 抛出 `Error` 时尽量提供用户可读 message。
- 不在 service 中直接操作 React 状态。

## 新页面最小输入

AI 新增页面前至少需要确认：

- 页面名称。
- 路由位置或 pages 根目录。
- 页面标题。
- `rowKey`。
- list API。
- 表格字段。
- 搜索字段。
- 枚举来源。
- 操作按钮及副作用。
- 权限规则。

缺少这些信息时，用 `best prepare` 的 `questions` 或直接向用户确认。

## 生成后检查清单

Schema：

- `$schema` 使用 `CRUD_SCHEMA_ID`。
- `version` 使用 `CRUD_SCHEMA_VERSION`。
- `id` 稳定且唯一。
- `dataSource.list` 存在。
- `rowKey` 存在于列表数据。
- 每个 `dict`、`slot`、`action`、`access` 都能在 Manifest 或内置能力中找到。
- 通用日期时间使用 `format: 'datetime'`。

Registry：

- service ID 与 Schema 一致。
- dictionary ID 与 Schema 一致。
- action/slot/access ID 与 Schema 一致。
- service 支持 `AbortSignal`。
- 不复制通用格式化逻辑。

Manifest：

- `best manifest sync --discover` 的 diff 合理。
- `--write` 后重复执行 discover 应该 `written: false` 或 diff 为空。
- 不删除未知业务能力，除非确认不再被任何页面引用。

验证：

- `best verify` 通过。
- 项目类型检查通过。
- 涉及交互或视觉时，用浏览器打开页面验证。

## 常见错误和处理

`config.missing`

先调用 `best_configure_project`（MCP）或 `best init`（CLI）生成候选 Config/Manifest，检查
`allowedPaths`、`manifestPaths`、`schemaFilePattern` 是否符合项目结构，并向用户展示 diff。
只有获得用户确认后才使用 `write: true` 或 `--write` 写入。

`page.allowedPath`

目标目录不在 `allowedPaths` 中。不要绕过限制，先修改配置并让用户确认范围。

`page.exists`

脚手架会覆盖已有文件。更换页面名，或手动合并，不要强行覆盖。

`manifest.missingSlot`、`manifest.missingAction`、`manifest.missingDictionary`

先运行：

```bash
best manifest sync --discover
```

确认 diff 后再 `--write`。如果能力不该存在，回到 Schema 删除引用。

`schema.format`

使用了不支持的格式。当前仅使用：

- `date`
- `datetime`
- `money`
- `text`

## AI 禁止事项

- 不在 `schema.ts` 写 JSX 或函数实现。
- 不编造 service、dict、slot、action、access ID。
- 不跳过 `best prepare`、`best verify`。
- 不越过 `allowedPaths` 写文件。
- 不用 slot 重复实现通用 format。
- 不把密钥、接口地址、cookie 写入 Manifest。
- 不在未确认接口字段时生成看似完整的业务逻辑。
- 不提交或推送，除非用户明确要求。

## 推荐产出顺序

新页面：

1. `best prepare`
2. `best page create`
3. 补 `api.ts`
4. 补 `registry.ts`
5. 补 `schema.ts`
6. `best manifest sync --discover`
7. `best manifest sync --discover --write`
8. `best verify`
9. 项目类型检查和必要浏览器验证

改旧页面：

1. `best prepare`
2. 读取现有 schema、registry、Manifest
3. 判断是否属于内置能力、dict、slot、action 或 runtime
4. 最小修改
5. `best verify`
6. 项目类型检查和必要浏览器验证
