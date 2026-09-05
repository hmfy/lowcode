# best-lowcode-devtools

`best-lowcode-devtools` is the command-line and MCP entry for controlled BEST low-code development.
Its internal MCP modules share configuration loading, Manifest reading, task preparation,
candidate preview, and verification with the CLI; they do not implement a second set of low-code
rules.

For AI-first page development, read [LOWCODE_AI_GUIDE.md](./LOWCODE_AI_GUIDE.md) before creating
or modifying low-code pages.

## Install

Use the one-command installer to install the explicit Skill, global DevTools, and user-level MCP
registrations for Codex, Cursor, and Claude Code:

```bash
npx -y best-lowcode-installer
```

It registers MCP with each host's own CLI rather than editing configuration files directly. The
Skill defaults to MCP; the `best` CLI is the documented fallback when MCP is unavailable.

## Commands

```bash
pnpm --filter best-lowcode-devtools best page create customer-list --kind crud --dir apps/demo/src/pages
pnpm --filter best-lowcode-devtools best init --allowed-paths '["apps/demo/src/pages"]'
pnpm --filter best-lowcode-devtools best init --allowed-paths '["apps/demo/src/pages"]' --write
pnpm --filter best-lowcode-devtools best page create customer-list --kind crud --dir apps/demo/src/pages --title 客户列表 --write
pnpm --filter best-lowcode-devtools best prepare "新增客户账簿筛选条件"
pnpm --filter best-lowcode-devtools best validate-selection "给客户账簿增加日期范围查询" --related-capabilities '["rps.client-ledger.list"]' --allowed-paths '["apps/rps/src/pages/client-ledger"]'
pnpm --filter best-lowcode-devtools best preview-change apps/rps/src/pages/client-ledger/schema.ts --candidate-file /tmp/schema.ts --language ts
pnpm --filter best-lowcode-devtools best verify
pnpm --filter best-lowcode-devtools best manifest sync --discover
pnpm --filter best-lowcode-devtools best manifest sync --discover --write
pnpm --filter best-lowcode-devtools best mcp serve
```

All commands write structured JSON to standard output. `prepare` and `verify` return a non-zero
exit code when diagnostics contain errors, so they are suitable for CI.

| Command | Behavior | Writes files |
| --- | --- | --- |
| `best page create <name> --kind crud` | Previews a standard CRUD page scaffold with `schema.ts`, `api.ts`, `registry.ts`, and `index.tsx`. | No |
| `best init [options]` | Previews the project Config/Manifest candidate. | No |
| `best init [options] --write` | Writes the reviewed Config candidate and only missing empty Manifests. | Yes |
| `best page create <name> --kind crud --write` | Creates the CRUD page scaffold, but refuses to overwrite existing files. | Yes |
| `best prepare <request>` | Produces a controlled `AgentTask` from the config and Manifest. | No |
| `best validate-selection <request> ...` | Validates Agent-selected capabilities and paths, then produces a controlled `AgentTask`. | No |
| `best preview-change <target-path> --candidate-file <path>` | Validates a candidate Schema or Manifest file and returns a diff without writing it. | No |
| `best verify` | Validates config, Manifests, and injected primary-package rules. | No |
| `best manifest sync --discover` | Discovers `BestCrudPage` pages under `allowedPaths` and previews safe Manifest additions. | No |
| `best manifest sync --discover --write` | Applies the reviewed candidate Manifest additions. | Yes |
| `best mcp serve` | Starts the internal stdio MCP server for Codex, Cursor, or Claude Code. | No |

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

### Agent selection validation

`best prepare <request>` only reads the project Config, Manifest, and built-in capabilities. It
does not start Codex, Cursor, Claude, or any other model CLI. The current Agent interprets the
request, then calls `best validate-selection` (or MCP `best_validate_selection`) with its selected
capability IDs and paths. DevTools rejects unknown capabilities and paths outside the allowlist
before returning an `AgentTask`.

The returned `AgentTask` includes deterministic execution hints for agents:
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

## Explicit Skill activation

The installer copies `best-lowcode` into each host's user Skill directory. It is explicit-only:
invoke `$best-lowcode` in Codex, `/best-lowcode` in Claude Code, or explicitly select it in
Cursor only for requirements that the user has chosen to build with BEST low-code. It never writes
rules into the target project's `AGENTS.md`.

## MCP server

The internal MCP server exposes `best_configure_project`, `best_get_context`, `best_prepare_task`,
`best_validate_selection`, `best_preview_change`, `best_discover_manifest`, and `best_verify`.
Use `best_configure_project` without `write` to preview a path/Manifest proposal; only call it with
`write: true` after the user has confirmed that diff.
`best_preview_change` accepts
JSON for compatibility and, for `schema.ts`, safely parses the static TypeScript Schema without
executing it. In automatic mode, `.ts` and `.tsx` candidates are parsed as TypeScript first and
fall back to JSON only when no valid static Schema can be extracted. It has no shell, arbitrary
network, or arbitrary file-write tool.

For a global MCP process, omit a fixed repository `cwd`. Every tool call must provide the absolute
`projectRoot` of the project being worked on; the server validates it and loads that project's
configuration and Manifest for the call:

```toml
[mcp_servers.best-lowcode]
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

## Project configuration

DevTools proposes and maintains `best.lowcode.config.json` and its empty Manifest through
`best_configure_project` (or CLI `best init`). The Skill selects paths from the explicit request,
shows the candidate diff, and writes only after user confirmation. Business services, permission
functions, API URLs, keys, and registry source code must not be included in the Manifest.

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
| Project configuration | Is supplied and reviewed by the project template or maintainer | May add runtime-supported fixture templates. |
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
