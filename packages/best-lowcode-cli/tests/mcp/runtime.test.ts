import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkProjectRuntime } from '../../src/mcp/runtime'
import { createBestLowcodeMcpService } from '../../src/mcp/service'

describe('project runtime diagnostics', () => {
  it('asks the project maintainer to install an undeclared Runtime', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-runtime-'))
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'app' }))

    await expect(checkProjectRuntime(root)).resolves.toEqual([
      expect.objectContaining({
        code: 'runtime.missing',
        recovery: expect.objectContaining({ command: 'pnpm add best-lowcode-runtime' })
      })
    ])
  })

  it('accepts a Runtime declared in any supported dependency field', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-runtime-'))
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ devDependencies: { 'best-lowcode-runtime': 'workspace:*' } })
    )

    await expect(checkProjectRuntime(root)).resolves.toEqual([])
  })

  it('accepts a Runtime declared by an app package below an allowed path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-runtime-'))
    await mkdir(join(root, 'apps', 'rps', 'src', 'pages'), { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ private: true }))
    await writeFile(
      join(root, 'apps', 'rps', 'package.json'),
      JSON.stringify({ dependencies: { 'best-lowcode-runtime': '^0.2.3' } })
    )

    await expect(checkProjectRuntime(root, ['apps/rps/src/pages'])).resolves.toEqual([])
  })

  it('blocks MCP task preparation until the project declares its Runtime', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-runtime-'))
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'app' }))
    await writeFile(
      join(root, 'best.lowcode.config.json'),
      JSON.stringify({ version: 1, allowedPaths: ['src'], manifestPaths: ['lowcode.manifest.json'] })
    )
    await writeFile(join(root, 'lowcode.manifest.json'), '{"version":1}\n')

    await expect(createBestLowcodeMcpService(root).prepareTask('新增客户管理页面')).resolves.toMatchObject({
      task: undefined,
      diagnostics: [expect.objectContaining({ code: 'runtime.missing' })]
    })
  })
})
