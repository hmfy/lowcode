import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkProjectRuntime } from '../../src/mcp/runtime'
import { createBestLowcodeMcpService } from '../../src/mcp/service'
import { installFixturePackage } from '../runtime-fixture'

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
    await installFixturePackage(root)
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ devDependencies: { 'best-lowcode-runtime': 'workspace:*' } })
    )

    await expect(checkProjectRuntime(root)).resolves.toEqual([])
  })

  it('accepts a Runtime declared by an app package below an allowed path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-runtime-'))
    await mkdir(join(root, 'apps', 'rps', 'src', 'pages'), { recursive: true })
    await installFixturePackage(join(root, 'apps', 'rps'))
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

    await expect(createBestLowcodeMcpService(root).getContext()).resolves.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'runtime.missing' })]
    })
  })

  it('rejects a declaration without installed files and uses the project package manager', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-runtime-'))
    await writeFile(join(root, 'package.json'), JSON.stringify({ packageManager: 'npm@10.0.0', dependencies: { 'best-lowcode-runtime': '^0.2.4' } }))
    expect(await checkProjectRuntime(root)).toEqual([expect.objectContaining({
      code: 'runtime.notInstalled', path: root, recovery: expect.objectContaining({ command: 'npm install best-lowcode-runtime' })
    })])
  })

  it('checks Runtime compatibility and its installed peer versions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-runtime-'))
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { 'best-lowcode-runtime': '*' } }))
    await installFixturePackage(root, 'best-lowcode-runtime', '1.0.0')
    expect(await checkProjectRuntime(root)).toEqual([expect.objectContaining({ code: 'runtime.incompatible' })])
    await installFixturePackage(root, 'best-lowcode-runtime', '0.2.4', {
      peerDependencies: { react: '^19.0.0', antd: '^6.0.0', optional: '*' },
      peerDependenciesMeta: { optional: { optional: true } }
    })
    await installFixturePackage(root, 'react', '18.0.0')
    expect((await checkProjectRuntime(root)).map((item) => item.code)).toEqual(['runtime.peerIncompatible', 'runtime.peerMissing'])
    await installFixturePackage(root, 'react', '19.2.4')
    await installFixturePackage(root, 'antd', '6.2.1')
    expect(await checkProjectRuntime(root)).toEqual([])
  })

  it('resolves an import-only Runtime without loading its UI code', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-runtime-'))
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { 'best-lowcode-runtime': '*' } }))
    await installFixturePackage(root, 'best-lowcode-runtime', '0.2.4', { exports: { '.': { import: './index.js' } } })
    await writeFile(join(root, 'node_modules/best-lowcode-runtime/index.js'), 'throw new Error("UI must not execute")')
    expect(await checkProjectRuntime(root)).toEqual([])
  })
})
