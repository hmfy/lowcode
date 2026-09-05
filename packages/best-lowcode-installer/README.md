# BEST low-code installer

Install the globally shared DevTools, explicit BEST low-code Skills, and user-level MCP entries
for Codex and Cursor:

```bash
npx -y best-lowcode-installer
```

The installer prints line-based progress for DevTools installation, host detection, and each
Skill/MCP configuration step, then prints the full JSON result for scripting.

The installer copies Skills to `~/.codex/skills` and `~/.cursor/skills`. It first prefers the
native host CLI for MCP registration. If only the desktop client is detected, it uses a
host-specific fallback:

- **Codex:** safely merges the `best-lowcode` entry into `~/.codex/config.toml`, saves the
  prior file as `config.toml.best-lowcode.bak`, and asks the user to restart Codex.
- **Cursor:** opens Cursor's official MCP installation deeplink. The user reviews the command in
  Cursor and clicks **Install** once. If the link cannot be opened, the JSON result includes
  `mcpInstallUrl` for manual use.

The installer detects each host CLI first, then its client configuration or platform application
path. Progress and JSON output list only the detected hosts that it configures.

Run the same command again to update the global DevTools and overwrite the bundled Skills. Existing
MCP entries are intentionally preserved. If the `best-lowcode` MCP entry is unavailable or its
command needs to be refreshed, use the explicit repair mode:

```bash
npx -y best-lowcode-installer@latest --repair-mcp
```

Repair mode updates DevTools and Skills as usual, then refreshes only the MCP entry named
`best-lowcode`. Other MCP entries are untouched.

Cursor's normal fallback preserves its native confirmation. For headless or managed-device setup,
you can explicitly merge the entry into `~/.cursor/mcp.json` instead:

```bash
npx -y best-lowcode-installer@latest --cursor-config-fallback
```

The fallback validates JSON, preserves other MCP servers, saves a `.best-lowcode.bak` backup, and
uses an atomic file replacement. It supports macOS and Windows; on Windows, the installer uses the
global `best-lowcode-mcp.cmd` shim and opens Cursor through PowerShell without shell-parsing the
deeplink.

The Skill is explicit-only. Invoke `$best-lowcode` in Codex or explicitly select it in Cursor when
a requirement should use BEST low-code. It defaults to the
registered MCP server and falls back to the `best` CLI only if MCP is unavailable.

On first use, the Skill asks DevTools to propose `best.lowcode.config.json` and an empty Manifest
from the current project and requested low-code scope. It presents the diff and writes only after
the user confirms, so users do not maintain those files by hand.

The target project must install `best-lowcode-runtime` itself. The Skill reports a missing Runtime
and gives an installation command, but does not install project dependencies automatically.
