# best-lowcode-devtools

`best-lowcode-devtools` is the command-line and MCP entry for controlled BEST low-code development.
Its internal MCP modules share configuration loading, Manifest reading, task preparation,
candidate preview, and verification with the CLI; they do not implement a second set of low-code
rules.

For AI-first page development, read [LOWCODE_AI_GUIDE.md](./LOWCODE_AI_GUIDE.md) before creating
or modifying low-code pages.

## Install

```bash
npm install -g best-lowcode-devtools
best --help
```

Or run without a global installation:

```bash
npx best-lowcode-devtools --help
```

## Commands

```bash
pnpm --filter best-lowcode-devtools best init
pnpm --filter best-lowcode-devtools best init --write
pnpm --filter best-lowcode-devtools best page create customer-list --kind crud --dir apps/demo/src/pages
pnpm --filter best-lowcode-devtools best page create customer-list --kind crud --dir apps/demo/src/pages --title 客户列表 --write
pnpm --filter best-lowcode-devtools best prepare "新增客户账簿筛选条件"
pnpm --filter best-lowcode-devtools best prepare "给客户账簿增加日期范围查询" --semantic codex
pnpm --filter best-lowcode-devtools best verify
pnpm --filter best-lowcode-devtools best manifest sync --discover
pnpm --filter best-lowcode-devtools best manifest sync --discover --write
pnpm --filter best-lowcode-devtools best mcp serve
pnpm --filter best-lowcode-devtools best agent init --targets codex
```

All commands write structured JSON to standard output. `prepare` and `verify` return a non-zero
exit code when diagnostics contain errors, so they are suitable for CI.

| Command | Behavior | Writes files |
| --- | --- | --- |
| `best init` | Previews the project config and empty Manifest templates. | No |
| `best init --write` | Creates the config and Manifest, but refuses to overwrite either existing file. | Yes |
| `best page create <name> --kind crud` | Previews a standard CRUD page scaffold with `schema.ts`, `api.ts`, `registry.ts`, and `index.tsx`. | No |
| `best page create <name> --kind crud --write` | Creates the CRUD page scaffold, but refuses to overwrite existing files. | Yes |
| `best prepare <request>` | Produces a controlled `AgentTask` from the config and Manifest. | No |
| `best verify` | Validates config, Manifests, and injected primary-package rules. | No |
| `best manifest sync --discover` | Discovers `BestCrudPage` pages under `allowedPaths` and previews safe Manifest additions. | No |
| `best manifest sync --discover --write` | Applies the reviewed candidate Manifest additions. | Yes |
| `best mcp serve` | Starts the internal stdio MCP server for Codex or Cursor. | No |
| `best agent init --targets codex` | Previews the managed low-code rules for Codex. | No |
| `best agent init --targets codex --write` | Creates or updates only the managed rule block in `AGENTS.md`. | Yes |

Pass `--cwd <path>` to operate on another repository root. The tool never runs arbitrary shell
commands and has no arbitrary file-write command.

When run through `pnpm --filter best-lowcode-devtools`, pnpm changes the process directory to this
package. The CLI walks upward to use the nearest `best.lowcode.config.json`, or the enclosing
`pnpm-workspace.yaml` directory when no config exists. `--cwd <path>` overrides this discovery.

### Page scaffolding

`best page create <name> --kind crud` gives agents and developers a stable starting point for a
new low-code CRUD page. It uses `best.lowcode.config.json`, respects `allowedPaths`, and previews
the files by default. Pass `--write` only after reviewing the JSON output.

```bash
best page create customer-list --kind crud --dir apps/demo/src/pages --title 客户列表
best page create customer-list --kind crud --dir apps/demo/src/pages --title 客户列表 --write
```

The command creates a page directory below `--dir` and writes:

```text
apps/demo/src/pages/customer-list/
  schema.ts
  api.ts
  registry.ts
  index.tsx
```

Use `--capability-prefix <id>` when the Manifest namespace differs from the page name, for example
`--capability-prefix rps.customer-list`.

### Local Codex semantics (default)

`best prepare <request>` asks the locally authenticated Codex CLI to select from the supplied
Manifest and built-in capability IDs. Passing `--semantic codex` remains supported and is
equivalent. It runs `codex exec` in a read-only, ephemeral sandbox with a JSON output schema. It
cannot write project files, call business APIs, or return arbitrary IDs/paths: the CLI checks all
model selections against the local capability and path allowlists before returning an `AgentTask`.

If Codex is unavailable, times out, returns malformed JSON, or selects an unknown capability/path,
the command returns a `semantic.fallback` or `semantic.rejected` warning and falls back to the
deterministic ID matching behavior. The local Codex model is selected by the user's Codex CLI
configuration; this package stores no model credentials or model name.

The returned `AgentTask` also includes deterministic execution hints for agents:
`pageContext`, `capabilityGroups`, `verificationCommands`, and `blockedQuestions`. These fields
do not grant extra permission; agents must still respect `allowedPaths` and stop when
`questions` is non-empty.

### Manifest discovery

`best manifest sync --discover` scans `schemaFilePattern` files below `allowedPaths`, keeps only
pages whose sibling `index.tsx` renders `BestCrudPage`, and intersects Schema references with the
same page's registry. It only adds discovered capabilities to the configured Manifest, never
removes entries, and preserves existing service descriptions. JSON output includes the complete
before/after diff. Use `--write` only after reviewing that output.

The first version requires exactly one `manifestPaths` target. Multiple Manifests need an explicit
page-to-Manifest mapping, which is safer than guessing a destination during whole-project scans.

## Codex rule initialization

`best agent init --targets codex` emits a preview of the `AGENTS.md` change. Add `--write` to
write it. The command only manages the block between `<!-- best-lowcode:start -->` and
`<!-- best-lowcode:end -->`; any existing project instructions remain unchanged. The generated
rules require Codex to call `best_prepare_task` before any repository or browser operation for
every BEST low-code request—including one-line or style-only changes—respect its allowed paths
and questions, use the MCP tools when available, and run the declared verification before
reporting completion. CLI fallback is permitted only after MCP unavailability is explicitly
reported.

## MCP server

The internal MCP server exposes `best_get_context`, `best_prepare_task`,
`best_preview_change`, `best_discover_manifest`, and `best_verify`. `best_preview_change` accepts
JSON for compatibility and, for `schema.ts`, safely parses the static TypeScript Schema without
executing it. In automatic mode, `.ts` and `.tsx` candidates are parsed as TypeScript first and
fall back to JSON only when no valid static Schema can be extracted. It has no shell, arbitrary
network, or arbitrary file-write tool.

For a global MCP process, omit a fixed repository `cwd`. Every tool call must provide the absolute
`projectRoot` of the project being worked on; the server validates it and loads that project's
configuration and Manifest for the call:

```toml
[mcp_servers.best_lowcode]
command = "best-lowcode-mcp"
args = []
```

For example, `best_prepare_task` receives:

```json
{
  "projectRoot": "/absolute/path/to/project",
  "request": "新增客户列表筛选条件"
}
```

The legacy fixed-root form remains supported when embedding the server directly, but a global
MCP client should always pass `projectRoot` so one process can safely serve multiple projects.

## Generated files

`best init --write` creates these minimal, safe defaults:

```text
best.lowcode.config.json
lowcode.manifest.json
```

Update `allowedPaths`, `manifestPaths`, and `verificationCommands` before using the tool for an
application. Business services, permission functions, API URLs, keys, and registry source code
must not be included in the Manifest.

## Main-package integration and merge guide

### Dependency direction

```text
best-lowcode-runtime        owns React runtime, UI, Schema validation, migrations, built-in capabilities
        ↑
best-lowcode-devtools          owns CLI parsing and internal MCP orchestration
```

The CLI and internal MCP server deliberately call the same `createBestLowcodeMcpService`; this is
how CLI, MCP, and CI keep the same rules. Do not import React runtime modules or duplicate Schema
validation in this package.

### What to merge when the primary package arrives

1. The internal `src/mcp/adapters/best-lowcode.ts` adapter connects `best-lowcode-runtime/dev` for safe
   Schema validation and built-in capabilities. Extend that adapter as the primary package grows.
2. Keep `best-lowcode-runtime: workspace:*` in this CLI package; the MCP modules must not import React
   runtime modules directly.
3. The published package exposes the `best` command through compiled `dist/bin.js`; use the
   `dev:best` script only when developing this workspace package itself.

No command name needs to change after integration. The capability of each command expands through
the shared adapter:

| Command | Current baseline | After primary-package integration |
| --- | --- | --- |
| `init` | Creates config and empty Manifest templates | May add runtime-supported fixture templates. |
| `prepare` | Uses business Manifest capability IDs | Also includes primary-package built-in capabilities. |
| `verify` | Checks config and Manifests | Adds Schema, migrations, fixtures, and capability consistency checks. |

### Primary-package requirements

`best-lowcode-runtime/dev` now provides structured Schema diagnostics and serializable built-in
capabilities, and validates unknown JSON safely before treating it as a `CrudPageSchema`. Add
project/migration verification to this entry when those main-package capabilities are implemented.

### Integration verification

```bash
pnpm install
pnpm exec biome check packages/best-lowcode-react packages/best-lowcode-cli
pnpm --filter best-lowcode-devtools check
pnpm --filter best-lowcode-devtools test
pnpm --filter best-lowcode-devtools best verify
pnpm --filter best-lowcode-devtools build
pnpm --filter best-lowcode-devtools pack --dry-run
```

Add an integration test that injects a deliberately invalid Schema through the primary adapter and
asserts that `best verify` exits non-zero with a stable diagnostic code and JSON Pointer/path.

## Package contents

The published package contains only compiled `dist` files and this README. It is configured for
the official npm registry; `npm pack --dry-run` verifies the package without publishing it.

This package is currently marked `UNLICENSED`. Confirm the formal license with the code owner
before a public release.
