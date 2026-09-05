# BEST low-code installer

Install the globally shared DevTools, explicit BEST low-code Skills, and user-level MCP entries
for Codex, Cursor, and Claude Code:

```bash
npx -y best-lowcode-installer
```

The installer prints concise terminal progress for DevTools installation, host detection, and each
Skill/MCP configuration step, then prints the full JSON result for scripting.

The installer uses each host's own CLI to register `best-lowcode-mcp`; it does not edit MCP
configuration files directly. It copies the Skill to `~/.codex/skills`, `~/.cursor/skills`, and
`~/.claude/skills`. The installer detects each host CLI first and writes a Skill only for an
installed host. Missing host CLIs are reported independently and do not prevent the other hosts
from being configured.

Run the same command again to update the global DevTools and overwrite the bundled Skills. Existing
MCP entries are intentionally preserved. If the `best-lowcode` MCP entry is unavailable or its
command needs to be refreshed, use the explicit repair mode:

```bash
npx -y best-lowcode-installer@latest --repair-mcp
```

Repair mode updates DevTools and Skills as usual, then uses each available host's native CLI to
remove and re-add only the MCP entry named `best-lowcode`. Other MCP entries are untouched.

The Skill is explicit-only. Invoke `$best-lowcode` in Codex, `/best-lowcode` in Claude Code, or
explicitly select it in Cursor when a requirement should use BEST low-code. It defaults to the
registered MCP server and falls back to the `best` CLI only if MCP is unavailable.

On first use, the Skill asks DevTools to propose `best.lowcode.config.json` and an empty Manifest
from the current project and requested low-code scope. It presents the diff and writes only after
the user confirms, so users do not maintain those files by hand.

The target project must install `best-lowcode-runtime` itself. The Skill reports a missing Runtime
and gives an installation command, but does not install project dependencies automatically.
