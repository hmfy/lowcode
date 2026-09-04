import { access, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEVTOOLS_PACKAGE,
  installBestLowcode,
  runInstallerCli,
  type CommandResult,
  type CommandRunner
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

describe('best-lowcode-installer', () => {
  it('installs global DevTools, all host Skills, and missing MCP registrations', async () => {
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
        { host: 'cursor', skill: 'installed', mcp: 'installed' },
        { host: 'claude-code', skill: 'installed', mcp: 'installed' }
      ]
    })
    expect(calls).toContainEqual(['npm', ['install', '--global', `${DEVTOOLS_PACKAGE}@latest`]])
    expect(calls).toContainEqual(['codex', ['mcp', 'add', 'best-lowcode', '--', '/opt/npm/bin/best-lowcode-mcp']])
    expect(calls).toContainEqual(['agent', ['mcp', 'add', 'best-lowcode', '--', '/opt/npm/bin/best-lowcode-mcp']])
    expect(calls).toContainEqual([
      'claude',
      ['mcp', 'add', '--transport', 'stdio', '--scope', 'user', 'best-lowcode', '--', '/opt/npm/bin/best-lowcode-mcp']
    ])
    await expect(readFile(join(homeDir, '.codex', 'skills', 'best-lowcode', 'SKILL.md'), 'utf8')).resolves.toContain(
      'default workflow uses the registered `best-lowcode` MCP server'
    )
    await expect(access(join(homeDir, '.cursor', 'skills', 'best-lowcode', 'SKILL.md'))).resolves.toBeUndefined()
    await expect(access(join(homeDir, '.claude', 'skills', 'best-lowcode', 'SKILL.md'))).resolves.toBeUndefined()
    await expect(readFile(join(homeDir, '.claude', 'skills', 'best-lowcode', 'SKILL.md'), 'utf8')).resolves.toContain(
      'disable-model-invocation: true'
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
      '2/3 正在探测 Codex、Cursor 与 Claude Code…',
      '3/3 正在安装 Skill 并配置 MCP…',
      '✓ Codex：Skill 已安装，MCP 已注册',
      '安装完成'
    ]))
  })

  it('writes progress before the JSON summary when run through the CLI', async () => {
    const stdout: string[] = []
    const exitCode = await runInstallerCli(
      [],
      { stdout: (value) => stdout.push(value), stderr: () => undefined },
      async ({ onProgress }) => {
        onProgress?.('1/3 正在安装全局 DevTools（latest）…')
        return { ok: true, devtools: 'installed', hosts: [] }
      }
    )

    expect(exitCode).toBe(0)
    expect(stdout).toEqual([
      '[best-lowcode] 1/3 正在安装全局 DevTools（latest）…\n',
      '{\n  "ok": true,\n  "devtools": "installed",\n  "hosts": []\n}\n'
    ])
  })

  it('does not replace an existing MCP registration and skips a missing host without writing its Skill', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'best-lowcode-installer-'))
    const { runner, calls } = runnerWith((command, args) => {
      if (command === 'npm' && args[0] === 'prefix') return { ok: true, stdout: '/usr/local\n', stderr: '' }
      if (command === 'agent' && args[0] === '--version') return { ok: false, stdout: '', stderr: 'not found' }
      if (command === 'codex' && args.includes('list')) return { ok: true, stdout: 'best-lowcode\n', stderr: '' }
      if (args.includes('list')) return { ok: true, stdout: 'other-server\n', stderr: '' }
      return { ok: true, stdout: '', stderr: '' }
    })

    const result = await installBestLowcode({ homeDir, runner, skillSourceDir: skillSource })

    expect(result.ok).toBe(true)
    expect(result.hosts).toEqual([
      { host: 'codex', skill: 'installed', mcp: 'already-registered' },
      { host: 'cursor', skill: 'skipped', mcp: 'skipped', message: 'agent 未安装或不在 PATH 中' },
      { host: 'claude-code', skill: 'installed', mcp: 'installed' }
    ])
    expect(calls.some(([command, args]) => command === 'codex' && args.includes('add'))).toBe(false)
    await expect(access(join(homeDir, '.cursor', 'skills', 'best-lowcode', 'SKILL.md'))).rejects.toThrow()
  })

  it('installs only the detected host Skill', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'best-lowcode-installer-'))
    const { runner } = runnerWith((command, args) => {
      if (command === 'npm' && args[0] === 'prefix') return { ok: true, stdout: '/opt/npm\n', stderr: '' }
      if ((command === 'agent' || command === 'claude') && args[0] === '--version') {
        return { ok: false, stdout: '', stderr: 'not found' }
      }
      if (args.includes('list')) return { ok: true, stdout: 'no MCP servers\n', stderr: '' }
      return { ok: true, stdout: '', stderr: '' }
    })

    const result = await installBestLowcode({ homeDir, runner, skillSourceDir: skillSource })

    expect(result.hosts).toEqual([
      { host: 'codex', skill: 'installed', mcp: 'installed' },
      { host: 'cursor', skill: 'skipped', mcp: 'skipped', message: 'agent 未安装或不在 PATH 中' },
      { host: 'claude-code', skill: 'skipped', mcp: 'skipped', message: 'claude 未安装或不在 PATH 中' }
    ])
    await expect(access(join(homeDir, '.codex', 'skills', 'best-lowcode', 'SKILL.md'))).resolves.toBeUndefined()
    await expect(access(join(homeDir, '.cursor', 'skills', 'best-lowcode', 'SKILL.md'))).rejects.toThrow()
    await expect(access(join(homeDir, '.claude', 'skills', 'best-lowcode', 'SKILL.md'))).rejects.toThrow()
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
      { host: 'cursor', skill: 'installed', mcp: 'installed' },
      { host: 'claude-code', skill: 'installed', mcp: 'installed' }
    ])
    expect(calls).toContainEqual(['codex', ['mcp', 'remove', 'best-lowcode']])
    expect(calls).toContainEqual(['codex', ['mcp', 'add', 'best-lowcode', '--', '/usr/local/bin/best-lowcode-mcp']])
  })

  it('does not re-add an MCP entry when its removal fails during repair', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'best-lowcode-installer-'))
    const { runner, calls } = runnerWith((command, args) => {
      if (command === 'npm' && args[0] === 'prefix') return { ok: true, stdout: '/usr/local\n', stderr: '' }
      if (command === 'codex' && args.includes('list')) return { ok: true, stdout: 'best-lowcode\n', stderr: '' }
      if (command === 'codex' && args.includes('remove')) return { ok: false, stdout: '', stderr: 'permission denied' }
      if (args.includes('list')) return { ok: true, stdout: 'other-server\n', stderr: '' }
      return { ok: true, stdout: '', stderr: '' }
    })

    const result = await installBestLowcode({
      homeDir,
      repairMcp: true,
      runner,
      skillSourceDir: skillSource
    })

    expect(result.ok).toBe(false)
    expect(result.hosts[0]).toEqual({
      host: 'codex',
      skill: 'installed',
      mcp: 'failed',
      message: 'codex MCP 移除失败：permission denied'
    })
    expect(calls.some(([command, args]) => command === 'codex' && args.includes('add'))).toBe(false)
  })

  it('stops before touching host configuration when global DevTools installation fails', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'best-lowcode-installer-'))
    const { runner, calls } = runnerWith(() => ({ ok: false, stdout: '', stderr: 'network unavailable' }))

    const result = await installBestLowcode({ homeDir, runner, skillSourceDir: skillSource })

    expect(result).toMatchObject({ ok: false, devtools: 'failed', hosts: [] })
    expect(calls).toEqual([['npm', ['install', '--global', `${DEVTOOLS_PACKAGE}@latest`]]])
  })
})
