# BEST low-code workflow reference

Use this reference after `$best-lowcode` / `/best-lowcode` has been explicitly invoked.
Before implementation, also read [runtime-implementation.md](runtime-implementation.md); it is the
authoritative AI-only rule set for Runtime ownership, capability ordering, coverage statuses,
fallback records, and verification.

The MCP-first sequence is `best_get_context`, `best_validate_selection`,
`best_preview_change`, and `best_verify`. Every MCP call includes the absolute `projectRoot`.
When the MCP server cannot be used, CLI fallback is allowed only for its matching commands:
`<best-cli> get-context`, `<best-cli> validate-selection`, `<best-cli> preview-change`, and
`<best-cli> verify`. Use the platform-specific `<best-cli>` defined in the parent Skill; never use
a bare `best` command. State the MCP failure and fallback in the final result.

If the matching CLI command is unavailable or cannot execute, stop immediately. Report the MCP and
CLI failures to the user and request a repaired BEST toolchain; do not implement the feature with
handwritten components, Ant Design, or an improvised local replacement.

Run a capability audit before validation. The audit must include every relevant native capability
and classify each atomic requirement as `native-supported`, `slot-supported`,
`extension-required`, or `runtime-not-supported`.

Pass the complete capability set to `best_validate_selection`. Do not pass only the capabilities
initially suggested by the request.

For every non-native requirement, produce a fallback record:

- requirement
- attempted Runtime capability
- limitation
- slot/extension evaluation
- selected fallback

Call `best_preview_change` only after the capability audit is complete and the Runtime coverage
plan has been written in the conversation.

Use native Runtime capabilities whenever the audit marks a requirement `native-supported`.

Use a local Slot when the Runtime owns the surrounding page behavior but the content needs custom
rendering.

Use a Runtime extension when the missing behavior is reusable and belongs in the Runtime
abstraction.

Use handwritten components only when the audit marks the requirement `runtime-not-supported`, or
when an extension would be disproportionate to a one-off business interaction. Record the reason in
the final report.

`<best-cli> preview-change` takes a candidate file and returns the same non-writing validation/diff
result as `best_preview_change`.

Use `best_configure_project` to propose a missing or changed project configuration. The current
Agent selects paths from the project and the explicit low-code request, presents the returned diff,
then calls the tool with `write: true` only after the user confirms. CLI fallback is `<best-cli> init`
with the same `--allowed-paths`, `--manifest-paths`, and `--verification-commands` JSON arrays.
Runtime installation remains a user-approved project dependency change.
