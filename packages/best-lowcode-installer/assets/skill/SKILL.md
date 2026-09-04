---
name: best-lowcode
description: Use only when the user explicitly asks to implement a feature with BEST low-code or invokes this skill directly.
---

# BEST low-code

Use this skill only because the user explicitly selected BEST low-code for the current request. Do
not apply it merely because a request happens to be CRUD-like.

The default workflow uses the registered `best-lowcode` MCP server. Use the globally installed
`best` CLI only when MCP is unavailable or a tool call fails; state that fallback reason in the
final report.

1. Call `best_configure_project(projectRoot, allowedPaths, manifestPaths, verificationCommands)`
   without `write` when configuration is missing or the request needs a new permitted path. Inspect
   the project and the user's request to select the candidate paths; present the returned diff and
   obtain confirmation before repeating the call with `write: true`. If MCP is unavailable, use
   `best init` with the same JSON-array options, preview first, then use `--write` after approval.
2. Confirm the target project has `best-lowcode-runtime` in its dependencies. If it is missing,
   explain that the project must install it (for example `pnpm add best-lowcode-runtime`) and do
   not install it without the user's approval.
3. Call `best_prepare_task(projectRoot, request)`. If MCP is unavailable, run `best prepare
   <request>` from the project root instead.
4. Inspect the returned Config, Manifest, capability definitions, and `requirementCoverage`. Select
   only capability IDs that are declared there and only target paths inside the returned allowlist.
5. Call `best_validate_selection(projectRoot, request, relatedCapabilities, allowedPaths)`. If MCP
   is unavailable, run `best validate-selection <request> --related-capabilities '<json-array>'
   --allowed-paths '<json-array>'`. Stop and ask the user if this returns diagnostics or `questions`.
6. Before changing a Schema or Manifest, call `best_preview_change`. Implement the returned
   `AgentTask`: the visible CRUD page must use `BestProvider` and `BestCrudPage`, with `schema.ts`,
   `adapter.ts`, `registry.ts`, and `index.tsx` for a new page. If MCP is unavailable, run
   `best preview-change <target-path> --candidate-file <path> --language <auto|ts|json>` instead.
7. Call `best_verify`, then the `AgentTask.verificationCommands` and relevant project checks before
   reporting completion. If MCP is unavailable, run `best verify` instead.

Never invent services, dictionaries, actions, slots, access rules, API parameters, or filesystem
paths. When a requested feature is marked `extension-required`, ask the user to choose a Runtime
extension, a permitted local Slot, or an explicitly authorized handwritten implementation.

For MCP/CLI parity and configuration boundaries, read [workflow.md](references/workflow.md).
