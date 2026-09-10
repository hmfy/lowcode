import { mkdir, mkdtemp, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bestLowcodeAdapter } from '../../src/mcp/adapters/best-lowcode'
import { createBestLowcodeMcpService } from '../../src/mcp/service'

async function createProject(schema: string) {
  const root = await mkdtemp(join(tmpdir(), 'best-lowcode-schema-scan-'))
  await mkdir(join(root, 'apps/rps/src/pages/client-ledger'), { recursive: true })
  await writeFile(
    join(root, 'best.lowcode.config.json'),
    JSON.stringify({
      version: 1,
      allowedPaths: ['apps/rps/src/pages'],
      manifestPaths: ['apps/rps/lowcode.manifest.json']
    })
  )
  await writeFile(
    join(root, 'apps/rps/lowcode.manifest.json'),
    JSON.stringify({
      version: 1,
      services: { 'rps.client-ledger.list': {} },
      dictionaries: ['rps.client-ledger.currency'],
      actions: ['rps.client-ledger.view-transactions'],
      slots: ['rps.client-ledger.amount']
    })
  )
  await writeFile(join(root, 'apps/rps/src/pages/client-ledger/schema.ts'), schema)
  await writeFile(
    join(root, 'apps/rps/src/pages/client-ledger/registry.ts'),
    `import { listClientLedger, viewTransactions } from './adapter'
export const clientLedgerRegistry = {
  listServices: { 'rps.client-ledger.list': listClientLedger },
  actions: { 'rps.client-ledger.view-transactions': viewTransactions }
}\n`
  )
  await writeFile(
    join(root, 'apps/rps/src/pages/client-ledger/adapter.ts'),
    `export async function listClientLedger() { return { items: [], total: 0 } }
export async function viewTransactions() { return undefined }
`
  )
  await writeFile(
    join(root, 'apps/rps/src/pages/client-ledger/index.tsx'),
    "import { BestCrudPage, BestProvider } from 'best-lowcode-runtime'\nimport { clientLedgerRegistry } from './registry'\nimport { pageSchema } from './schema'\nexport function ClientLedgerPage() { return <BestProvider registry={clientLedgerRegistry}><BestCrudPage schema={pageSchema} /></BestProvider> }\n"
  )
  await writeFile(
    join(root, 'apps/rps/src/routes.tsx'),
    "import { Route } from 'react-router-dom'\nimport { ClientLedgerPage } from './pages/client-ledger'\nexport const routes = <Route path=\"client-ledger\" element={<ClientLedgerPage />} />\n"
  )
  return root
}

const schemaPrefix = `
import { CRUD_SCHEMA_ID, CRUD_SCHEMA_VERSION, type CrudPageSchema } from 'best-lowcode-runtime'
`

function schemaWith(references: string) {
  return `${schemaPrefix}
export const pageSchema = {
  $schema: CRUD_SCHEMA_ID,
  version: CRUD_SCHEMA_VERSION,
  id: 'client-ledger',
  kind: 'crud',
  title: '客户账簿',
  dataSource: { list: 'rps.client-ledger.list' },
  search: [{ field: 'currency', label: '币种', component: 'select', dict: 'rps.client-ledger.currency' }],
  table: {
    rowKey: 'id',
    columns: [{ field: 'amount', title: '金额', format: 'money', slot: 'rps.client-ledger.amount' }],
    actions: [{ id: 'detail', label: '详情', effect: 'runAction', action: 'rps.client-ledger.view-transactions' }]
  },
  ${references}
} satisfies CrudPageSchema
`
}

describe('TypeScript schema verification', () => {
  it('accepts schema references registered in Manifest or built-ins', async () => {
    const service = createBestLowcodeMcpService(
      await createProject(
        schemaWith("toolbar: [{ id: 'create', label: '新增', effect: 'openCreate' }]")
      ),
      bestLowcodeAdapter
    )
    await expect(service.verify()).resolves.toMatchObject({ ok: true, diagnostics: [] })
  })

  it('reports fields missing from a list service output contract', async () => {
    const root = await createProject(schemaWith(''))
    await writeFile(
      join(root, 'apps/rps/lowcode.manifest.json'),
      JSON.stringify({
        version: 1,
        services: {
          'rps.client-ledger.list': {
            inputSchema: {
              type: 'object',
              properties: { filters: { type: 'object', properties: { currency: { type: 'string' } } } }
            },
            outputSchema: {
              type: 'object',
              properties: {
                items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } },
                total: { type: 'integer' }
              }
            }
          }
        },
        dictionaries: ['rps.client-ledger.currency'],
        actions: ['rps.client-ledger.view-transactions'],
        slots: ['rps.client-ledger.amount']
      })
    )
    const result = await createBestLowcodeMcpService(root, bestLowcodeAdapter).verify()
    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'schema.contract.field.unknown',
        path: 'apps/rps/src/pages/client-ledger/schema.ts/table/columns/0/field'
      })
    )
  })

  it('reports unknown schema references with the source path', async () => {
    const service = createBestLowcodeMcpService(
      await createProject(
        schemaWith(
          "toolbar: [{ id: 'export', label: '导出', effect: 'runAction', action: 'rps.client-ledger.export' }]"
        )
      ),
      bestLowcodeAdapter
    )
    const result = await service.verify()
    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'schema.reference.unknown',
        message: 'Schema 引用了未注册能力：rps.client-ledger.export',
        path: 'apps/rps/src/pages/client-ledger/schema.ts/toolbar/0/action'
      })
    )
  })

  it('reports field components that are not built-in capabilities', async () => {
    const service = createBestLowcodeMcpService(
      await createProject(schemaWith('').replace("component: 'select'", "component: 'richText'")),
      bestLowcodeAdapter
    )
    const result = await service.verify()
    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'schema.reference.unknown',
        message: 'Schema 引用了未注册能力：builtin.field.richText',
        path: 'apps/rps/src/pages/client-ledger/schema.ts/search/0/component'
      })
    )
  })

  it('rejects non-static Schema syntax with the same parser used by preview', async () => {
    const service = createBestLowcodeMcpService(
      await createProject(schemaWith('').replace("title: '客户账簿'", 'title: getTitle()')),
      bestLowcodeAdapter
    )
    const result = await service.verify()
    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'schema.static.unsupported' })
    )
  })

  it('resolves schema declarations from their top-level lexical scope', async () => {
    const source = `${schemaWith('')
      .replace(
        "dataSource: { list: 'rps.client-ledger.list' }",
        'dataSource: { list: serviceId }'
      )}
const serviceId = 'rps.client-ledger.list'
function unrelatedHelper() { const serviceId = 'rps.client-ledger.unregistered'; return serviceId }
`

    await expect(
      createBestLowcodeMcpService(await createProject(source), bestLowcodeAdapter).verify()
    ).resolves.toMatchObject({ ok: true, diagnostics: [] })
  })

  it('ignores page-like values declared inside an unrelated function', async () => {
    const source = `${schemaWith('')}
function unrelatedHelper() {
  const localTemplate = { kind: 'tabs', tabs: [] }
  return localTemplate
}
`

    await expect(
      createBestLowcodeMcpService(await createProject(source), bestLowcodeAdapter).verify()
    ).resolves.toMatchObject({ ok: true, diagnostics: [] })
  })

  it('rejects a CRUD Schema whose page does not use the BEST runtime structure', async () => {
    const root = await createProject(schemaWith(''))
    await writeFile(
      join(root, 'apps/rps/src/pages/client-ledger/index.tsx'),
      'export function ClientLedgerPage() { return <div>普通组件库页面</div> }\n'
    )
    const result = await createBestLowcodeMcpService(root, bestLowcodeAdapter).verify()

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'architecture.component.missing',
        path: 'apps/rps/src/pages/client-ledger/index.tsx'
      })
    )
  })

  it('rejects a CRUD Schema whose registry is missing', async () => {
    const root = await createProject(schemaWith(''))
    await unlink(join(root, 'apps/rps/src/pages/client-ledger/registry.ts'))
    const result = await createBestLowcodeMcpService(root, bestLowcodeAdapter).verify()

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'architecture.file.missing',
        path: 'apps/rps/src/pages/client-ledger/registry.ts'
      })
    )
  })

  it('rejects a hidden BestCrudPage without coupling validation to a UI library', async () => {
    const root = await createProject(schemaWith(''))
    await writeFile(
      join(root, 'apps/rps/src/pages/client-ledger/index.tsx'),
      "import { Table } from 'antd'\nimport { BestCrudPage, BestProvider } from 'best-lowcode-runtime'\nexport function ClientLedgerPage() { return <BestProvider><div aria-hidden><BestCrudPage schema={{} as never} /></div><Table columns={[]} /></BestProvider> }\n"
    )
    const result = await createBestLowcodeMcpService(root, bestLowcodeAdapter).verify()

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'architecture.runtime.hidden' })])
    )
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'architecture.page.bypass' })
    )
  })

  it('accepts a tabbed low-code page that owns nested CRUD pages', async () => {
    const root = await createProject(schemaWith(''))
    await writeFile(
      join(root, 'apps/rps/src/pages/client-ledger/schema.ts'),
      `
import {
  CRUD_SCHEMA_ID,
  CRUD_SCHEMA_VERSION,
  TABBED_PAGE_SCHEMA_ID,
  TABBED_PAGE_SCHEMA_VERSION,
  type CrudPageSchema,
  type TabbedPageSchema
} from 'best-lowcode-runtime'

export const ledgerSchema = {
  $schema: CRUD_SCHEMA_ID,
  version: CRUD_SCHEMA_VERSION,
  id: 'client-ledger',
  kind: 'crud',
  title: '客户账簿',
  dataSource: { list: 'rps.client-ledger.list' },
  table: { rowKey: 'id', columns: [{ field: 'id', title: '账簿 ID' }] }
} satisfies CrudPageSchema

export const ledgerTabsSchema = {
  $schema: TABBED_PAGE_SCHEMA_ID,
  version: TABBED_PAGE_SCHEMA_VERSION,
  id: 'client-ledger-tabs',
  kind: 'tabs',
  tabs: [{ key: 'ledger', label: '客户账簿', content: { type: 'crud', schema: ledgerSchema } }]
} satisfies TabbedPageSchema
`
    )
    await writeFile(
      join(root, 'apps/rps/src/pages/client-ledger/index.tsx'),
      "import { BestProvider, BestTabbedPage } from 'best-lowcode-runtime'\nimport { clientLedgerRegistry } from './registry'\nimport { ledgerTabsSchema } from './schema'\nexport function ClientLedgerPage() { return <BestProvider registry={clientLedgerRegistry}><BestTabbedPage schema={ledgerTabsSchema} /></BestProvider> }\n"
    )

    await expect(
      createBestLowcodeMcpService(root, bestLowcodeAdapter).verify()
    ).resolves.toMatchObject({ ok: true, diagnostics: [] })
  })

  it('rejects a page when index.tsx does not bind its registry to BestProvider', async () => {
    const root = await createProject(schemaWith(''))
    await writeFile(
      join(root, 'apps/rps/src/pages/client-ledger/index.tsx'),
      "import { BestCrudPage, BestProvider } from 'best-lowcode-runtime'\nimport { pageSchema } from './schema'\nexport function ClientLedgerPage() { return <BestProvider registry={{}}><BestCrudPage schema={pageSchema} /></BestProvider> }\n"
    )

    const result = await createBestLowcodeMcpService(root, bestLowcodeAdapter).verify()

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'architecture.registry.unbound' })
    )
  })

  it('rejects a page when its runtime is outside the bound BestProvider', async () => {
    const root = await createProject(schemaWith(''))
    await writeFile(
      join(root, 'apps/rps/src/pages/client-ledger/index.tsx'),
      "import { BestCrudPage, BestProvider } from 'best-lowcode-runtime'\nimport { clientLedgerRegistry } from './registry'\nimport { pageSchema } from './schema'\nexport function ClientLedgerPage() { return <><BestProvider registry={clientLedgerRegistry} /><BestCrudPage schema={pageSchema} /></> }\n"
    )

    const result = await createBestLowcodeMcpService(root, bestLowcodeAdapter).verify()

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'architecture.registry.unbound' })
    )
  })

  it('rejects a schema service that is not mapped to an adapter import', async () => {
    const root = await createProject(schemaWith(''))
    await writeFile(
      join(root, 'apps/rps/src/pages/client-ledger/registry.ts'),
      "export const clientLedgerRegistry = { listServices: { 'rps.client-ledger.list': async () => ({ items: [], total: 0 }) } }\n"
    )

    const result = await createBestLowcodeMcpService(root, bestLowcodeAdapter).verify()

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'architecture.adapter.service.unmapped' })
    )
  })

  it('rejects a registry whose mapping belongs only to an unused registry object', async () => {
    const root = await createProject(schemaWith(''))
    await writeFile(
      join(root, 'apps/rps/src/pages/client-ledger/registry.ts'),
      `import { listClientLedger } from './adapter'
const unusedRegistry = { listServices: { 'rps.client-ledger.list': listClientLedger } }
export const clientLedgerRegistry = { listServices: {} }
`
    )

    const result = await createBestLowcodeMcpService(root, bestLowcodeAdapter).verify()

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'architecture.registry.service.missing' })
    )
  })

  it('ignores an inner registry variable that shadows the exported registry', async () => {
    const root = await createProject(schemaWith(''))
    await writeFile(
      join(root, 'apps/rps/src/pages/client-ledger/registry.ts'),
      `import { listClientLedger } from './adapter'
export const clientLedgerRegistry = { listServices: {} }
function unrelatedHelper() {
  const clientLedgerRegistry = { listServices: { 'rps.client-ledger.list': listClientLedger } }
  return clientLedgerRegistry
}
`
    )

    const result = await createBestLowcodeMcpService(root, bestLowcodeAdapter).verify()

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'architecture.registry.service.missing' })
    )
  })

  it('checks every Provider branch that renders the same schema', async () => {
    const root = await createProject(schemaWith(''))
    await writeFile(
      join(root, 'apps/rps/src/pages/client-ledger/registry.ts'),
      `import { listClientLedger } from './adapter'
export const goodRegistry = { listServices: { 'rps.client-ledger.list': listClientLedger } }
export const badRegistry = { listServices: {} }
`
    )
    await writeFile(
      join(root, 'apps/rps/src/pages/client-ledger/index.tsx'),
      "import { BestCrudPage, BestProvider } from 'best-lowcode-runtime'\nimport { badRegistry, goodRegistry } from './registry'\nimport { pageSchema } from './schema'\nexport function ClientLedgerPage() { return <><BestProvider registry={goodRegistry}><BestCrudPage schema={pageSchema} /></BestProvider><BestProvider registry={badRegistry}><BestCrudPage schema={pageSchema} /></BestProvider></> }\n"
    )

    const result = await createBestLowcodeMcpService(root, bestLowcodeAdapter).verify()

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'architecture.registry.service.missing' })
    )
  })

  it('rejects an inline CRUD tab service that is not mapped to an adapter import', async () => {
    const root = await createProject(schemaWith(''))
    await writeFile(
      join(root, 'apps/rps/src/pages/client-ledger/schema.ts'),
      `
import {
  CRUD_SCHEMA_ID,
  CRUD_SCHEMA_VERSION,
  TABBED_PAGE_SCHEMA_ID,
  TABBED_PAGE_SCHEMA_VERSION,
  type TabbedPageSchema
} from 'best-lowcode-runtime'

export const ledgerTabsSchema = {
  $schema: TABBED_PAGE_SCHEMA_ID,
  version: TABBED_PAGE_SCHEMA_VERSION,
  id: 'client-ledger-tabs',
  kind: 'tabs',
  tabs: [{
    key: 'ledger',
    label: '客户账簿',
    content: {
      type: 'crud',
      schema: {
        $schema: CRUD_SCHEMA_ID,
        version: CRUD_SCHEMA_VERSION,
        id: 'client-ledger',
        kind: 'crud',
        title: '客户账簿',
        dataSource: { list: 'rps.client-ledger.list' },
        table: { rowKey: 'id', columns: [{ field: 'id', title: '账簿 ID' }] }
      }
    }
  }]
} satisfies TabbedPageSchema
`
    )
    await writeFile(
      join(root, 'apps/rps/src/pages/client-ledger/index.tsx'),
      "import { BestProvider, BestTabbedPage } from 'best-lowcode-runtime'\nimport { clientLedgerRegistry } from './registry'\nimport { ledgerTabsSchema } from './schema'\nexport function ClientLedgerPage() { return <BestProvider registry={clientLedgerRegistry}><BestTabbedPage schema={ledgerTabsSchema} /></BestProvider> }\n"
    )
    await writeFile(
      join(root, 'apps/rps/src/pages/client-ledger/registry.ts'),
      "export const clientLedgerRegistry = { listServices: { 'rps.client-ledger.list': async () => ({ items: [], total: 0 }) } }\n"
    )

    const result = await createBestLowcodeMcpService(root, bestLowcodeAdapter).verify()

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'architecture.adapter.service.unmapped' })
    )
  })

  it('rejects a registry-to-adapter binding when adapter.ts is absent', async () => {
    const root = await createProject(schemaWith(''))
    await unlink(join(root, 'apps/rps/src/pages/client-ledger/adapter.ts'))

    const result = await createBestLowcodeMcpService(root, bestLowcodeAdapter).verify()

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'architecture.adapter.file.missing' })
    )
  })

  it('rejects a low-code page that is not mounted by a React Router route', async () => {
    const root = await createProject(schemaWith(''))
    await unlink(join(root, 'apps/rps/src/routes.tsx'))

    const result = await createBestLowcodeMcpService(root, bestLowcodeAdapter).verify()

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'architecture.route.unmounted' })
    )
  })
})
