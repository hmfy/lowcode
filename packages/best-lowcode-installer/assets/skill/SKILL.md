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

Use a local Slot when the audit reports `slot-supported`. Use a Runtime extension when
`best_validate_selection` reports `extension-required` and the user chooses that option. Use
handwritten React/Ant Design only when the audit reports `runtime-not-supported`, or when the user
explicitly accepts a one-off fallback for an `extension-required` requirement. Tool unavailability
is not evidence that an extension is required and never authorizes a handwritten fallback.

1. Call `best_configure_project(projectRoot, allowedPaths, manifestPaths, verificationCommands)`
   without `write` when configuration is missing or the request needs a new permitted path. Inspect
   the project and the user's request to select the candidate paths; present the returned diff and
   obtain confirmation before repeating the call with `write: true`. If MCP is unavailable, use
   `<best-cli> init` with the same JSON-array options, preview first, then use `--write` after approval.
2. Confirm the target project has `best-lowcode-runtime` in its dependencies. If it is missing,
   explain that the project must install it (for example `pnpm add best-lowcode-runtime`) and do
   not install it without the user's approval.
3. Call `best_get_context(projectRoot)` and inspect the returned Config, Manifest, and Runtime capabilities.
4. Run a capability audit. Select the complete set of relevant capability IDs declared in the
   context and only target paths inside the returned allowlist; do not pass only the capabilities
   initially suggested by the request.
5. Call `best_validate_selection(projectRoot, request, relatedCapabilities, allowedPaths)`. If MCP
   is unavailable, run `<best-cli> validate-selection <request> --related-capabilities '<json-array>'
   --allowed-paths '<json-array>'`. Stop and ask the user if this returns diagnostics or `questions`.
6. Before calling `best_preview_change`, write a Runtime coverage plan in the conversation. Include
   the Runtime owner for each page area and, for every non-native requirement, record the attempted
   Runtime capability, the corresponding Schema/API, the limitation, whether a Slot can satisfy it,
   and the selected fallback.
7. Before changing a Schema or Manifest, call `best_preview_change`. Implement the returned
   `AgentTask`: the visible CRUD page must use `BestProvider` and `BestCrudPage`, with `schema.ts`,
   `adapter.ts`, `registry.ts`, and `index.tsx` for a new page. If MCP is unavailable, run
   `<best-cli> preview-change <target-path> --candidate-file <path> --language <auto|ts|json>` instead.
8. Call `best_verify`, then the `AgentTask.verificationCommands` and relevant project checks before
   reporting completion. If MCP is unavailable, run `<best-cli> verify` instead.

Never invent services, dictionaries, actions, slots, access rules, API parameters, or filesystem
paths. When a requested feature is marked `extension-required`, ask the user to choose a Runtime
extension or confirm that a one-off handwritten implementation is acceptable. When a requested
feature is marked `runtime-not-supported`, record the fallback reason in the final report.

For MCP/CLI parity and configuration boundaries, read [workflow.md](references/workflow.md).
