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
  it('rejects the removed AGENTS.md initialization command', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-cli-'))
    const { io, output } = createIo()
    await expect(runCli(['agent', 'init', '--cwd', root], io)).resolves.toBe(1)
    expect(output.join('')).toContain('Usage:')
  })

  it('previews and writes a user-confirmed project configuration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-cli-'))
    const preview = createIo()
    await expect(
      runCli(['init', '--allowed-paths', '["apps/rps/src/pages"]', '--cwd', root], preview.io)
    ).resolves.toBe(0)
    const previewResult = JSON.parse(preview.output[0] ?? '{}')
    expect(previewResult.written).toBe(false)
    expect(previewResult.files[0]).toMatchObject({ action: 'create' })
    await expect(readFile(join(root, 'best.lowcode.config.json'), 'utf8')).rejects.toThrow()

    const write = createIo()
    await expect(
      runCli(
        ['init', '--allowed-paths', '["apps/rps/src/pages"]', '--write', '--cwd', root],
        write.io
      )
    ).resolves.toBe(0)
    await expect(readFile(join(root, 'best.lowcode.config.json'), 'utf8')).resolves.toContain(
      'apps/rps/src/pages'
    )
    await expect(readFile(join(root, 'lowcode.manifest.json'), 'utf8')).resolves.toContain('"services"')
  })

  it('rejects the removed semantic provider option', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-cli-'))
    const { io, output } = createIo()
    await expect(
      runCli(['prepare', '新增页面', '--semantic', 'unknown', '--cwd', root], io)
    ).resolves.toBe(1)
    expect(output.join('')).toContain('Usage:')
  })

  it('previews a candidate file without writing the target file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-cli-'))
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ dependencies: { 'best-lowcode-runtime': 'workspace:*' } })
    )
    await writeFile(
      join(root, 'best.lowcode.config.json'),
      JSON.stringify({ version: 1, allowedPaths: ['src'], manifestPaths: ['lowcode.manifest.json'] })
    )
    await writeFile(join(root, 'lowcode.manifest.json'), '{"version":1}\n')
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'candidate.json'), '{"version":1,"services":{"customer.list":{}}}\n')
    const { io, output } = createIo()

    await expect(
      runCli(
        [
          'preview-change',
          'lowcode.manifest.json',
          '--candidate-file',
          'candidate.json',
          '--language',
          'json',
          '--cwd',
          root
        ],
        io
      )
    ).resolves.toBe(0)

    expect(JSON.parse(output[0] ?? '{}').preview.diff.before).toContain('"version"')
    await expect(readFile(join(root, 'lowcode.manifest.json'), 'utf8')).resolves.toBe('{"version":1}\n')
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
