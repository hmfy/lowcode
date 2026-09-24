# BEST Low-code 提交前能力清单核对

## 能力清单同步要求

每次提交前，只要本次变更涉及 Runtime、DevTools、MCP、Schema、页面生成或能力定义，必须核对以下两处是否同步：

1. Runtime 能力源头：
   - `packages/best-lowcode-runtime/src/lowcode/capabilities.ts`
   - `semanticCapabilities`
   - `builtinDescriptions`
   - `runtimeCapabilityManifest.capabilities`
2. DevTools/MCP 对外消费结果：
   - `packages/best-lowcode-devtools/src/mcp/adapters/best-lowcode.ts`
   - `packages/best-lowcode-devtools/src/mcp/server.ts` 的 `best_get_capabilities`
   - `bestLowcodeAdapter.capabilities()` 返回的 manifest 必须来自当前 Runtime，不得维护另一份重复的 capability key、label、description 列表。

核对内容必须包括：

- capability key 无遗漏、无重复、无意外新增；
- label、description 与 Runtime 源头一致；
- `schemaPath`、`example` 等扩展字段未被 DevTools 丢失；
- `getBuiltinCapabilities()` 使用的 key 集合与 Runtime manifest 中的内置能力一致；
- `best_get_capabilities` 返回的 runtime、manifest version 和 capabilities 与 Runtime 构建产物一致。

如果发现 DevTools 存在独立的手写能力列表，必须优先移除重复来源，改为消费 Runtime manifest；不能通过手工补一项来维持同步。

## 提交前验证

能力清单相关变更提交前至少执行：

```bash
pnpm typecheck
pnpm --filter best-lowcode-runtime test -- --run
pnpm --filter best-lowcode-devtools test -- --run
pnpm --filter best-lowcode-runtime build
pnpm --filter best-lowcode-devtools build
git diff --check
```

如果能力清单新增、删除或修改，必须在测试中增加或更新对应 key 的断言，并在最终回复中说明两处清单的核对结果。
