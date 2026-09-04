import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCli } from '../src/cli'

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

async function createProject() {
  const root = await mkdtemp(join(tmpdir(), 'best-lowcode-page-create-'))
  await writeFile(
    join(root, 'best.lowcode.config.json'),
    JSON.stringify({
      version: 1,
      allowedPaths: ['apps/demo/src/pages'],
      manifestPaths: ['apps/demo/lowcode.manifest.json'],
      schemaFilePattern: 'schema.ts',
      verificationCommands: ['pnpm typecheck']
    })
  )
  return root
}

describe('best page create', () => {
  it('previews a CRUD page scaffold without writing files', async () => {
    const root = await createProject()
    const { io, output } = createIo()

    await expect(
      runCli(['page', 'create', 'customer-list', '--title', '客户列表', '--cwd', root], io)
    ).resolves.toBe(0)

    const result = JSON.parse(output.join(''))
    expect(result).toMatchObject({
      ok: true,
      written: false,
      pageName: 'customer-list',
      targetDir: 'apps/demo/src/pages/customer-list'
    })
    expect(result.files.map((file: { path: string }) => file.path)).toEqual([
      'apps/demo/src/pages/customer-list/schema.ts',
      'apps/demo/src/pages/customer-list/adapter.ts',
      'apps/demo/src/pages/customer-list/registry.ts',
      'apps/demo/src/pages/customer-list/index.tsx'
    ])
    expect(result.files[0].content).toContain("title: '客户列表'")
    expect(result.files[0].content).toContain("remove: 'customer-list.remove'")
    expect(result.files[1].content).toContain('export async function listCustomerList')
    expect(result.files[1].content).toContain('BestListResult<CustomerListItem>')
    expect(result.files[2].content).toContain("'customer-list.remove': removeCustomerListItem")
    await expect(
      readFile(join(root, 'apps/demo/src/pages/customer-list/schema.ts'), 'utf8')
    ).rejects.toThrow()
  })

  it('writes scaffold files only when requested', async () => {
    const root = await createProject()
    const { io, output } = createIo()

    await expect(
      runCli(
        [
          'page',
          'create',
          'order-list',
          '--capability-prefix',
          'demo.order-list',
          '--write',
          '--cwd',
          root
        ],
        io
      )
    ).resolves.toBe(0)

    expect(JSON.parse(output.join('')).written).toBe(true)
    await expect(
      readFile(join(root, 'apps/demo/src/pages/order-list/schema.ts'), 'utf8')
    ).resolves.toContain("list: 'demo.order-list.list'")
    await expect(
      readFile(join(root, 'apps/demo/src/pages/order-list/index.tsx'), 'utf8')
    ).resolves.toContain('<BestCrudPage schema={orderListSchema} />')
  })

  it('refuses to overwrite existing scaffold files', async () => {
    const root = await createProject()
    const pageDir = join(root, 'apps/demo/src/pages/report-list')
    await mkdir(pageDir, { recursive: true })
    await writeFile(join(pageDir, 'schema.ts'), 'export const existing = true\n')
    const { io, output } = createIo()

    await expect(
      runCli(['page', 'create', 'report-list', '--write', '--cwd', root], io)
    ).resolves.toBe(1)

    const result = JSON.parse(output.join(''))
    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'page.exists' }))
    await expect(readFile(join(pageDir, 'schema.ts'), 'utf8')).resolves.toBe(
      'export const existing = true\n'
    )
  })

  it('rejects target directories outside allowed paths', async () => {
    const root = await createProject()
    const { io, output } = createIo()

    await expect(
      runCli(['page', 'create', 'audit-list', '--dir', 'apps/other/src/pages', '--cwd', root], io)
    ).resolves.toBe(1)

    const result = JSON.parse(output.join(''))
    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'page.allowedPath' }))
  })
})
