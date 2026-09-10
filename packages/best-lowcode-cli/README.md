# best-lowcode-devtools

CLI and MCP backend for the explicit `best-lowcode` Skill.

AI implementation rules are not maintained in this package README. The executable rules live in
the installer Skill assets:

- `packages/best-lowcode-installer/assets/skill/SKILL.md`
- `packages/best-lowcode-installer/assets/skill/references/workflow.md`
- `packages/best-lowcode-installer/assets/skill/references/runtime-implementation.md`

## Commands

All commands write structured JSON to stdout.

```bash
best init [options]
best get-context
best validate-selection <request> --related-capabilities <json-array> --allowed-paths <json-array>
best preview-change <target-path> --candidate-file <path> [--language auto|ts|json]
best verify
best page create <name> --kind crud [--dir <pages-root>] [--title <title>] [--write]
best manifest sync --discover [--write]
best mcp serve
```

Use `--cwd <path>` to operate on a repository root other than the current working directory.

## Package Contents

The published package contains compiled `dist` files and this README. Runtime behavior is enforced
by the shared MCP service implementation, not by this document.
