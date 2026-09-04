import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCli } from '../src/cli'
import { findDefaultProjectRoot } from '../src/project-root'

function createIo() {
  const output: string[] = []
  return {
    io: {
      stdout: (value: string) => output.push(value),
      stderr: (value: string) => output.push(value)
    },
    output
  }
}

describe('best CLI', () => {
  it('previews init files without writing them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-cli-'))
    const { io, output } = createIo()
    await expect(runCli(['init', '--cwd', root], io)).resolves.toBe(0)
    expect(JSON.parse(output[0] ?? '{}').written).toBe(false)
    await expect(readFile(join(root, 'best.lowcode.config.json'), 'utf8')).rejects.toThrow()
  })

  it('writes configuration only when explicitly requested', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-cli-'))
    const { io } = createIo()
    await expect(runCli(['init', '--write', '--cwd', root], io)).resolves.toBe(0)
    await expect(readFile(join(root, 'best.lowcode.config.json'), 'utf8')).resolves.toContain(
      '"src"'
    )
    await expect(readFile(join(root, 'lowcode.manifest.json'), 'utf8')).resolves.toContain(
      'services'
    )
  })

  it('previews Codex low-code rules without writing AGENTS.md', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-cli-'))
    const { io, output } = createIo()
    await expect(runCli(['agent', 'init', '--targets', 'codex', '--cwd', root], io)).resolves.toBe(
      0
    )
    const result = JSON.parse(output[0] ?? '{}')
    expect(result.written).toBe(false)
    expect(result.files[0].action).toBe('create')
    await expect(readFile(join(root, 'AGENTS.md'), 'utf8')).rejects.toThrow()
  })

  it('rejects unsupported agent init arguments', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-cli-'))
    const { io, output } = createIo()
    await expect(runCli(['agent', 'init', 'codex', '--cwd', root], io)).resolves.toBe(1)
    expect(output.join('')).toContain('Usage:')
  })

  it('rejects unknown semantic providers before preparing a task', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-cli-'))
    const { io, output } = createIo()
    await expect(
      runCli(['prepare', '新增页面', '--semantic', 'unknown', '--cwd', root], io)
    ).resolves.toBe(1)
    expect(output.join('')).toContain('Usage:')
  })

  it('finds the workspace root when invoked from a filtered package directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-cli-'))
    const packageDirectory = join(root, 'packages', 'best-lowcode-cli')
    await mkdir(packageDirectory, { recursive: true })
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: []\n')
    await expect(findDefaultProjectRoot(packageDirectory)).resolves.toBe(root)
  })

  it('prefers a nearest low-code config over a workspace root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-cli-'))
    const projectDirectory = join(root, 'apps', 'rps')
    await mkdir(join(projectDirectory, 'scripts'), { recursive: true })
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: []\n')
    await writeFile(join(projectDirectory, 'best.lowcode.config.json'), '{}')
    await expect(findDefaultProjectRoot(join(projectDirectory, 'scripts'))).resolves.toBe(
      projectDirectory
    )
  })
})
