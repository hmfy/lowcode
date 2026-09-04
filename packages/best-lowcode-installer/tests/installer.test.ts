import { access, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEVTOOLS_PACKAGE,
  installBestLowcode,
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

  it('does not replace an existing MCP registration and isolates a missing host', async () => {
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
      { host: 'cursor', skill: 'installed', mcp: 'skipped', message: 'agent 未安装或不在 PATH 中' },
      { host: 'claude-code', skill: 'installed', mcp: 'installed' }
    ])
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
