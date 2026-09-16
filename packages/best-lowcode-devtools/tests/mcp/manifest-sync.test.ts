import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCli } from '../../src/cli'
import { createBestLowcodeMcpService } from '../../src/mcp/service'

async function createProject() {
  const root = await mkdtemp(join(tmpdir(), 'best-lowcode-manifest-sync-'))
  const page = join(root, 'apps/rps/src/pages/bank-accounts')
  await mkdir(page, { recursive: true })
  await writeFile(
    join(root, 'best.lowcode.config.json'),
    JSON.stringify({
      version: 1,
      allowedPaths: ['apps/rps/src/pages'],
      manifestPaths: ['apps/rps/lowcode.manifest.json']
    })
  )
  await mkdir(join(root, 'apps/rps'), { recursive: true })
  await writeFile(
    join(root, 'apps/rps/lowcode.manifest.json'),
    JSON.stringify({
      version: 1,
      services: { 'rps.existing': { description: '保留现有描述' } },
      slots: ['rps.existing.slot']
    })
  )
  await writeFile(
    join(page, 'schema.ts'),
    `export const schema = {
      $schema: 'https://best.dev/schema/crud/v1', version: 1, kind: 'crud', id: 'bank', title: '银行账户',
      dataSource: { list: 'rps.bank.list' },
      search: [{ field: 'status', label: '状态', component: 'select', dict: 'rps.bank.status' }],
      table: { rowKey: 'id', columns: [{ field: 'status', title: '状态', slot: 'rps.bank.status' }], actions: [{ id: 'view', label: '查看', effect: 'runAction', action: 'rps.bank.view', access: 'rps.bank.view' }] }
    }`
  )
  await writeFile(
    join(page, 'index.tsx'),
    `import { BestCrudPage, BestProvider } from 'best-lowcode-runtime'
      import { registry } from './registry'
      export function Page() { return <BestProvider registry={registry}><BestCrudPage schema={{} as never} /></BestProvider> }`
  )
  await writeFile(
    join(page, 'registry.ts'),
    `import { listBankAccounts, viewBankAccount } from './services'
      export const registry = {
        listServices: { 'rps.bank.list': listBankAccounts },
        services: {},
        dictionaries: { 'rps.bank.status': [] },
        actions: { 'rps.bank.view': viewBankAccount },
        slots: { 'rps.bank.status': () => null }
      }`
  )
  await writeFile(
    join(page, 'services.ts'),
    `export const listBankAccounts = async () => ({})
      export const viewBankAccount = () => {}`
  )
  return root
}

describe('Manifest discovery', () => {
  it('previews the whole-project candidate without writing the Manifest', async () => {
    const root = await createProject()
    const result = await createBestLowcodeMcpService(root).discoverManifest()
    expect(result).toMatchObject({
      written: false,
      pages: ['apps/rps/src/pages/bank-accounts'],
      diagnostics: []
    })
    expect(result.preview?.diff.after).toContain('rps.bank.list')
    expect(result.preview?.diff.after).toContain('rps.bank.status')
    expect(result.preview?.diff.after).toContain('rps.bank.view')
    await expect(
      readFile(join(root, 'apps/rps/lowcode.manifest.json'), 'utf8')
    ).resolves.not.toContain('rps.bank.list')
  })

  it('writes only after --write and preserves existing Manifest entries', async () => {
    const root = await createProject()
    const output: string[] = []
    const exitCode = await runCli(['manifest', 'sync', '--discover', '--write', '--cwd', root], {
      stdout: (value) => output.push(value),
      stderr: (value) => output.push(value)
    })
    expect(exitCode).toBe(0)
    expect(JSON.parse(output.join(''))).toMatchObject({ ok: true, written: true })
    await expect(readFile(join(root, 'apps/rps/lowcode.manifest.json'), 'utf8')).resolves.toContain(
      '保留现有描述'
    )
    const repeat = await createBestLowcodeMcpService(root).discoverManifest()
    expect(repeat).toMatchObject({ written: false, diagnostics: [] })
    expect(repeat.preview?.diff.after).toBe(repeat.preview?.diff.before)
  })
})
