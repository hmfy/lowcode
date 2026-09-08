---
name: best-lowcode
description: Use only when the user explicitly asks to implement a feature with BEST low-code or invokes this skill directly.
---

# BEST low-code

Use this skill only because the user explicitly selected BEST low-code for the current request. Do
not apply it merely because a request happens to be CRUD-like.

The default workflow uses the registered `best-lowcode` MCP server. Use the CLI only when MCP is
unavailable or a tool call fails; state that fallback reason in the final report. Never invoke a
bare `best` command: the installer keeps DevTools outside `PATH`.

For every `<best-cli>` command below, use the platform-specific executable:

- macOS/Linux shell: `~/.best-lowcode/bin/best`
- Windows PowerShell: `& "$env:USERPROFILE\.best-lowcode\best.cmd"`

## Toolchain availability is a stopping condition

When MCP is unavailable or its invocation fails, try the matching `<best-cli>` command once. If the
CLI is also unavailable or cannot execute, stop the low-code implementation: do not write business
code, substitute Ant Design or another handwritten UI, invent a local workflow, or report the
feature as complete. Tell the user which MCP/CLI capability failed and ask them to restore the
BEST toolchain before continuing.

Only use a Runtime extension, local Slot, or handwritten implementation after `best_prepare_task`
or `<best-cli> prepare` explicitly reports `extension-required` and the user chooses that option. Tool
unavailability is not evidence that an extension is required and never authorizes a handwritten
fallback.

1. Call `best_configure_project(projectRoot, allowedPaths, manifestPaths, verificationCommands)`
   without `write` when configuration is missing or the request needs a new permitted path. Inspect
   the project and the user's request to select the candidate paths; present the returned diff and
   obtain confirmation before repeating the call with `write: true`. If MCP is unavailable, use
   `<best-cli> init` with the same JSON-array options, preview first, then use `--write` after approval.
2. Confirm the target project has `best-lowcode-runtime` in its dependencies. If it is missing,
   explain that the project must install it (for example `pnpm add best-lowcode-runtime`) and do
   not install it without the user's approval.
3. Call `best_prepare_task(projectRoot, request)`. If MCP is unavailable, run `<best-cli> prepare
   <request>` from the project root instead.
4. Inspect the returned Config, Manifest, capability definitions, and `requirementCoverage`. Select
   only capability IDs that are declared there and only target paths inside the returned allowlist.
5. Call `best_validate_selection(projectRoot, request, relatedCapabilities, allowedPaths)`. If MCP
   is unavailable, run `<best-cli> validate-selection <request> --related-capabilities '<json-array>'
   --allowed-paths '<json-array>'`. Stop and ask the user if this returns diagnostics or `questions`.
6. Before changing a Schema or Manifest, call `best_preview_change`. Implement the returned
   `AgentTask`: the visible CRUD page must use `BestProvider` and `BestCrudPage`, with `schema.ts`,
   `adapter.ts`, `registry.ts`, and `index.tsx` for a new page. If MCP is unavailable, run
   `<best-cli> preview-change <target-path> --candidate-file <path> --language <auto|ts|json>` instead.
7. Call `best_verify`, then the `AgentTask.verificationCommands` and relevant project checks before
   reporting completion. If MCP is unavailable, run `<best-cli> verify` instead.

Never invent services, dictionaries, actions, slots, access rules, API parameters, or filesystem
paths. When a requested feature is marked `extension-required`, ask the user to choose a Runtime
extension, a permitted local Slot, or an explicitly authorized handwritten implementation.

For MCP/CLI parity and configuration boundaries, read [workflow.md](references/workflow.md).
