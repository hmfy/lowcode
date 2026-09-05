import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEVTOOLS_PACKAGE,
  installBestLowcode,
  runInstallerCli,
  type CommandResult,
  type CommandRunner,
  type HostDetector
} from '../src'

const skillSource = join(process.cwd(), 'assets', 'skill')

function runnerWith(
  handler: (command: string, args: string[]) => CommandResult
): { runner: CommandRunner; calls: Array<[string, string[]]> } {
  const calls: Array<[string, string[]]> = []
  return {
    calls,
    runner: async (command, args) => {
      calls.push([command, args])
      return handler(command, args)
    }
  }
}

const clientOnly: HostDetector = async () => 'client'
const codexOnly: HostDetector = async (host) => (host.id === 'codex' ? 'cli' : 'unavailable')

describe('best-lowcode-installer', () => {
  it('installs global DevTools, both host Skills, and missing MCP registrations through host CLIs', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'best-lowcode-installer-'))
    const { runner, calls } = runnerWith((command, args) => {
      if (command === 'npm' && args[0] === 'prefix') return { ok: true, stdout: '/opt/npm\n', stderr: '' }
      if (args.includes('list')) return { ok: true, stdout: 'no MCP servers\n', stderr: '' }
      return { ok: true, stdout: '', stderr: '' }
    })

    const result = await installBestLowcode({ homeDir, runner, skillSourceDir: skillSource })

    expect(result).toMatchObject({
      ok: true,
      devtools: 'installed',
      mcpCommand: '/opt/npm/bin/best-lowcode-mcp',
      hosts: [
        { host: 'codex', skill: 'installed', mcp: 'installed' },
        { host: 'cursor', skill: 'installed', mcp: 'installed' }
      ]
    })
    expect(calls).toContainEqual(['npm', ['install', '--global', `${DEVTOOLS_PACKAGE}@latest`]])
    expect(calls).toContainEqual(['codex', ['mcp', 'add', 'best-lowcode', '--', '/opt/npm/bin/best-lowcode-mcp']])
    expect(calls).toContainEqual(['agent', ['mcp', 'add', 'best-lowcode', '--', '/opt/npm/bin/best-lowcode-mcp']])
    await expect(readFile(join(homeDir, '.codex', 'skills', 'best-lowcode', 'SKILL.md'), 'utf8')).resolves.toContain(
      'default workflow uses the registered `best-lowcode` MCP server'
    )
    await expect(access(join(homeDir, '.cursor', 'skills', 'best-lowcode', 'SKILL.md'))).resolves.toBeUndefined()
  })

  it('writes a Codex config fallback and opens the Cursor deeplink on macOS when only clients are detected', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'best-lowcode-installer-'))
    await mkdir(join(homeDir, '.codex'), { recursive: true })
    await writeFile(join(homeDir, '.codex', 'config.toml'), 'model = "gpt-5"\n', 'utf8')
    const { runner, calls } = runnerWith((command, args) => {
      if (command === 'npm' && args[0] === 'prefix') return { ok: true, stdout: '/opt/npm\n', stderr: '' }
      return { ok: true, stdout: '', stderr: '' }
    })

    const result = await installBestLowcode({
      homeDir,
      hostDetector: clientOnly,
      platform: 'darwin',
      runner,
      skillSourceDir: skillSource
    })

    expect(result).toMatchObject({
      ok: true,
      hosts: [
        { host: 'codex', skill: 'installed', mcp: 'installed' },
        { host: 'cursor', skill: 'installed', mcp: 'pending-user-install' }
      ]
    })
    await expect(readFile(join(homeDir, '.codex', 'config.toml'), 'utf8')).resolves.toBe(
      'model = "gpt-5"\n\n[mcp_servers.best-lowcode]\ncommand = "/opt/npm/bin/best-lowcode-mcp"\nargs = []\n'
    )
    await expect(readFile(join(homeDir, '.codex', 'config.toml.best-lowcode.bak'), 'utf8')).resolves.toBe(
      'model = "gpt-5"\n'
    )
    const opened = calls.find(([command]) => command === 'open')
    expect(opened?.[1][0]).toMatch(/^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=best-lowcode&config=/)
    expect(result.hosts[1].mcpInstallUrl).toBe(opened?.[1][0])
  })

  it('opens Cursor deeplinks through PowerShell on Windows and uses a cmd shim for the MCP command', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'best-lowcode-installer-'))
    const { runner, calls } = runnerWith((command, args) => {
      if (command === 'npm' && args[0] === 'prefix') return { ok: true, stdout: 'C:\\Users\\me\\AppData\\Roaming\\npm\n', stderr: '' }
      return { ok: true, stdout: '', stderr: '' }
    })

    const result = await installBestLowcode({
      homeDir,
      hostDetector: clientOnly,
      platform: 'win32',
      runner,
      skillSourceDir: skillSource
    })

    expect(result.mcpCommand).toBe('C:\\Users\\me\\AppData\\Roaming\\npm\\best-lowcode-mcp.cmd')
    expect(calls).toContainEqual([
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Start-Process -FilePath $args[0]',
        expect.stringMatching(/^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=best-lowcode&config=/)
      ]
    ])
    await expect(readFile(join(homeDir, '.codex', 'config.toml'), 'utf8')).resolves.toContain(
      'command = "C:\\\\Users\\\\me\\\\AppData\\\\Roaming\\\\npm\\\\best-lowcode-mcp.cmd"'
    )
  })

  it('uses the explicit Cursor config fallback without overwriting other servers', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'best-lowcode-installer-'))
    await mkdir(join(homeDir, '.cursor'), { recursive: true })
    await writeFile(
      join(homeDir, '.cursor', 'mcp.json'),
      `${JSON.stringify({ mcpServers: { existing: { command: 'existing-mcp' } } }, null, 2)}\n`,
      'utf8'
    )
    const { runner, calls } = runnerWith((command, args) => {
      if (command === 'npm' && args[0] === 'prefix') return { ok: true, stdout: '/usr/local\n', stderr: '' }
      return { ok: true, stdout: '', stderr: '' }
    })

    const result = await installBestLowcode({
      cursorConfigFallback: true,
      homeDir,
      hostDetector: async (host) => (host.id === 'cursor' ? 'client' : 'unavailable'),
      runner,
      skillSourceDir: skillSource
    })

    expect(result.hosts).toEqual([
      {
        host: 'cursor',
        skill: 'installed',
        mcp: 'installed',
        message: '已写入 Cursor MCP 配置，请重新加载 Cursor 以加载 BEST 工具'
      }
    ])
    await expect(readFile(join(homeDir, '.cursor', 'mcp.json'), 'utf8')).resolves.toBe(
      `${JSON.stringify(
        {
          mcpServers: {
            existing: { command: 'existing-mcp' },
            'best-lowcode': { command: '/usr/local/bin/best-lowcode-mcp', args: [] }
          }
        },
        null,
        2
      )}\n`
    )
    expect(calls.some(([command]) => command === 'open')).toBe(false)
  })

  it('repairs only the BEST Codex TOML table when the CLI is unavailable', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'best-lowcode-installer-'))
    await mkdir(join(homeDir, '.codex'), { recursive: true })
    await writeFile(
      join(homeDir, '.codex', 'config.toml'),
      '[mcp_servers.best-lowcode]\ncommand = "old-best"\n\n[mcp_servers.other]\ncommand = "other"\n',
      'utf8'
    )
    const { runner } = runnerWith((command, args) => {
      if (command === 'npm' && args[0] === 'prefix') return { ok: true, stdout: '/opt/npm\n', stderr: '' }
      return { ok: true, stdout: '', stderr: '' }
    })

    const result = await installBestLowcode({
      homeDir,
      hostDetector: async (host) => (host.id === 'codex' ? 'client' : 'unavailable'),
      repairMcp: true,
      runner,
      skillSourceDir: skillSource
    })

    expect(result.hosts[0]).toMatchObject({ host: 'codex', mcp: 'repaired' })
    await expect(readFile(join(homeDir, '.codex', 'config.toml'), 'utf8')).resolves.toBe(
      '[mcp_servers.other]\ncommand = "other"\n\n[mcp_servers.best-lowcode]\ncommand = "/opt/npm/bin/best-lowcode-mcp"\nargs = []\n'
    )
  })

  it('reports installation progress in clear stages', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'best-lowcode-installer-'))
    const { runner } = runnerWith((command, args) => {
      if (command === 'npm' && args[0] === 'prefix') return { ok: true, stdout: '/opt/npm\n', stderr: '' }
      if (args.includes('list')) return { ok: true, stdout: 'no MCP servers\n', stderr: '' }
      return { ok: true, stdout: '', stderr: '' }
    })
    const progress: string[] = []

    await installBestLowcode({
      homeDir,
      onProgress: (message) => progress.push(message),
      runner,
      skillSourceDir: skillSource
    })

    expect(progress).toEqual(expect.arrayContaining([
      '1/3 正在安装全局 DevTools（latest）…',
      '✓ 全局 DevTools 已安装',
      '2/3 正在探测 Codex 与 Cursor…',
      '3/3 正在安装 Skill 并配置 MCP…',
      '✓ Codex：Skill 已安装，MCP 已注册',
      '安装完成'
    ]))
  })

  it('writes progress before the JSON summary when run through the CLI', async () => {
    const stdout: string[] = []
    let cursorConfigFallback: boolean | undefined
    const exitCode = await runInstallerCli(
      ['--cursor-config-fallback'],
      { stdout: (value) => stdout.push(value), stderr: () => undefined },
      async ({ cursorConfigFallback: configuredFallback, onProgress }) => {
        cursorConfigFallback = configuredFallback
        onProgress?.('1/3 正在安装全局 DevTools（latest）…')
        return { ok: true, devtools: 'installed', hosts: [] }
      }
    )

    expect(exitCode).toBe(0)
    expect(cursorConfigFallback).toBe(true)
    expect(stdout).toEqual([
      '[best-lowcode] 1/3 正在安装全局 DevTools（latest）…\n',
      '{\n  "ok": true,\n  "devtools": "installed",\n  "hosts": []\n}\n'
    ])
  })

  it('writes line-based progress for interactive terminals', async () => {
    const stdout: string[] = []
    const exitCode = await runInstallerCli(
      [],
      { stdout: (value) => stdout.push(value), stderr: () => undefined },
      async ({ onProgress }) => {
        onProgress?.('1/3 正在安装全局 DevTools（latest）…')
        onProgress?.('✓ 全局 DevTools 已安装')
        onProgress?.('2/3 正在探测 Codex 与 Cursor…')
        onProgress?.('3/3 正在安装 Skill 并配置 MCP…')
        onProgress?.('安装完成')
        return { ok: true, devtools: 'installed', hosts: [] }
      }
    )

    expect(exitCode).toBe(0)
    expect(stdout.join('')).toContain('[best-lowcode] 安装完成\n')
    expect(stdout.join('')).not.toContain('%')
    expect(stdout.join('')).toContain('{\n  "ok": true')
  })

  it('re-registers only existing BEST MCP entries when repairMcp is enabled', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'best-lowcode-installer-'))
    const { runner, calls } = runnerWith((command, args) => {
      if (command === 'npm' && args[0] === 'prefix') return { ok: true, stdout: '/usr/local\n', stderr: '' }
      if (command === 'codex' && args.includes('list')) return { ok: true, stdout: 'best-lowcode\n', stderr: '' }
      if (args.includes('list')) return { ok: true, stdout: 'other-server\n', stderr: '' }
      return { ok: true, stdout: '', stderr: '' }
    })

    const result = await installBestLowcode({
      homeDir,
      repairMcp: true,
      runner,
      skillSourceDir: skillSource
    })

    expect(result.hosts).toEqual([
      { host: 'codex', skill: 'installed', mcp: 'repaired' },
      { host: 'cursor', skill: 'installed', mcp: 'installed' }
    ])
    expect(calls).toContainEqual(['codex', ['mcp', 'remove', 'best-lowcode']])
    expect(calls).toContainEqual(['codex', ['mcp', 'add', 'best-lowcode', '--', '/usr/local/bin/best-lowcode-mcp']])
  })

  it('skips unavailable hosts without writing their Skills', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'best-lowcode-installer-'))
    const { runner } = runnerWith(() => ({ ok: true, stdout: '', stderr: '' }))
    const progress: string[] = []

    const result = await installBestLowcode({
      homeDir,
      hostDetector: async () => 'unavailable',
      onProgress: (message) => progress.push(message),
      runner,
      skillSourceDir: skillSource
    })

    expect(result.hosts).toEqual([])
    expect(progress.join('\n')).not.toContain('未安装')
    await expect(access(join(homeDir, '.codex', 'skills', 'best-lowcode', 'SKILL.md'))).rejects.toThrow()
    await expect(access(join(homeDir, '.cursor', 'skills', 'best-lowcode', 'SKILL.md'))).rejects.toThrow()
  })

  it('stops before touching host configuration when global DevTools installation fails', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'best-lowcode-installer-'))
    const { runner, calls } = runnerWith(() => ({ ok: false, stdout: '', stderr: 'network unavailable' }))

    const result = await installBestLowcode({ homeDir, hostDetector: codexOnly, runner, skillSourceDir: skillSource })

    expect(result).toMatchObject({ ok: false, devtools: 'failed', hosts: [] })
    expect(calls).toEqual([['npm', ['install', '--global', `${DEVTOOLS_PACKAGE}@latest`]]])
  })
})
