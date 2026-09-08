# BEST low-code workflow reference

Use this reference after `$best-lowcode` / `/best-lowcode` has been explicitly invoked.

The MCP-first sequence is `best_prepare_task`, `best_validate_selection`,
`best_preview_change`, and `best_verify`. Every MCP call includes the absolute `projectRoot`.
When the MCP server cannot be used, CLI fallback is allowed only for its matching commands:
`<best-cli> prepare`, `<best-cli> validate-selection`, `<best-cli> preview-change`, and
`<best-cli> verify`. Use the platform-specific `<best-cli>` defined in the parent Skill; never use
a bare `best` command. State the MCP failure and fallback in the final result.

If the matching CLI command is unavailable or cannot execute, stop immediately. Report the MCP and
CLI failures to the user and request a repaired BEST toolchain; do not implement the feature with
handwritten components, Ant Design, or an improvised local replacement. A handwritten path is
available only when the successful `prepare` result marks the requirement `extension-required` and
the user explicitly selects it.

`<best-cli> preview-change` takes a candidate file and returns the same non-writing validation/diff
result as `best_preview_change`.

Use `best_configure_project` to propose a missing or changed project configuration. The current
Agent selects paths from the project and the explicit low-code request, presents the returned diff,
then calls the tool with `write: true` only after the user confirms. CLI fallback is `<best-cli> init`
with the same `--allowed-paths`, `--manifest-paths`, and `--verification-commands` JSON arrays.
Runtime installation remains a user-approved project dependency change.
