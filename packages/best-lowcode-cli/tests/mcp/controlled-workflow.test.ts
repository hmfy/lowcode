import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bestLowcodeAdapter } from '../../src/mcp/adapters/best-lowcode'
import { createBestLowcodeMcpService } from '../../src/mcp/service'

async function createProject() {
  const root = await mkdtemp(join(tmpdir(), 'best-lowcode-workflow-'))
  await mkdir(join(root, 'apps/rps'), { recursive: true })
  await writeFile(
    join(root, 'best.lowcode.config.json'),
    JSON.stringify({
      version: 1,
      allowedPaths: ['apps/rps/src/pages/client-ledger'],
      manifestPaths: ['apps/rps/lowcode.manifest.json'],
      verificationCommands: ['node -e "process.exit(0)"']
    })
  )
  await writeFile(
    join(root, 'apps/rps/lowcode.manifest.json'),
    JSON.stringify({
      version: 1,
      services: {
        'rps.client-ledger.list': { description: '查询客户账簿分页数据' }
      }
    })
  )
  return root
}

describe('controlled low-code workflow', () => {
  it('executes configured verification commands and reports failures', async () => {
    const root = await createProject()
    await writeFile(
      join(root, 'best.lowcode.config.json'),
      JSON.stringify({
        version: 1,
        allowedPaths: ['apps/rps/src/pages/client-ledger'],
        manifestPaths: ['apps/rps/lowcode.manifest.json'],
        verificationCommands: ['node -e "process.exit(3)"']
      })
    )
    const result = await createBestLowcodeMcpService(root, bestLowcodeAdapter).verify()
    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'verification.command.failed' })
    )
  })

  it('prepares, previews, and verifies a natural-language request within its guardrails', async () => {
    const root = await createProject()
    const service = createBestLowcodeMcpService(root, bestLowcodeAdapter)

    const prepared = await service.validateSelection('给客户账簿增加日期范围查询', {
      relatedCapabilities: ['rps.client-ledger.list', 'builtin.field.dateRange'],
      allowedPaths: ['apps/rps/src/pages/client-ledger']
    })
    expect(prepared.diagnostics).toEqual([])
    expect(prepared.task).toMatchObject({
      request: '给客户账簿增加日期范围查询',
      allowedPaths: ['apps/rps/src/pages/client-ledger'],
      relatedCapabilities: ['rps.client-ledger.list', 'builtin.field.dateRange'],
      questions: [],
      acceptance: [
        'MCP 配置与 Manifest 校验通过',
        '页面采用 BestProvider + BestCrudPage，并包含 schema.ts 与 registry.ts',
        'node -e "process.exit(0)"'
      ]
    })

    const candidate = JSON.stringify({
      $schema: 'https://best.dev/schema/crud/v1',
      version: 1,
      id: 'rps.client-ledger',
      kind: 'crud',
      title: '客户账簿',
      dataSource: { list: 'rps.client-ledger.list' },
      search: [
        {
          field: 'dateRange',
          label: '日期范围',
          component: 'dateRange'
        }
      ],
      table: {
        rowKey: 'id',
        columns: [{ field: 'id', title: '账簿 ID' }]
      }
    })
    const preview = await service.previewChange(
      'apps/rps/src/pages/client-ledger/schema.json',
      candidate
    )
    expect(preview.diagnostics).toEqual([])
    expect(preview.preview).toMatchObject({
      targetPath: 'apps/rps/src/pages/client-ledger/schema.json',
      exists: false,
      diff: { before: null, after: candidate }
    })

    await expect(service.verify()).resolves.toEqual({ ok: true, diagnostics: [] })
  })

  it('previews the same static TypeScript Schema syntax verified from schema.ts', async () => {
    const root = await createProject()
    const service = createBestLowcodeMcpService(root, bestLowcodeAdapter)
    const candidate = `
      import { CRUD_SCHEMA_ID, CRUD_SCHEMA_VERSION, type CrudPageSchema } from 'best-lowcode-runtime'
      export const ledgerSchema = {
        $schema: CRUD_SCHEMA_ID,
        version: CRUD_SCHEMA_VERSION,
        id: 'rps.client-ledger',
        kind: 'crud',
        title: '客户账簿',
        dataSource: { list: 'rps.client-ledger.list' },
        table: { rowKey: 'id', columns: [{ field: 'id', title: '账簿 ID' }] }
      } satisfies CrudPageSchema
    `

    const result = await service.previewChange(
      'apps/rps/src/pages/client-ledger/schema.ts',
      candidate
    )

    expect(result.diagnostics).toEqual([])
    expect(result.preview).toMatchObject({
      targetPath: 'apps/rps/src/pages/client-ledger/schema.ts',
      diff: { after: candidate }
    })
  })

  it('falls back to JSON when a schema.ts candidate is not a static TypeScript Schema', async () => {
    const root = await createProject()
    const service = createBestLowcodeMcpService(root, bestLowcodeAdapter)
    const candidate = JSON.stringify({
      $schema: 'https://best.dev/schema/crud/v1',
      version: 1,
      id: 'rps.client-ledger',
      kind: 'crud',
      title: '客户账簿',
      dataSource: { list: 'rps.client-ledger.list' },
      table: { rowKey: 'id', columns: [{ field: 'id', title: '账簿 ID' }] }
    })

    const result = await service.previewChange(
      'apps/rps/src/pages/client-ledger/schema.ts',
      candidate
    )

    expect(result.diagnostics).toEqual([])
  })

  it('rejects non-static TypeScript Schema candidates without executing them', async () => {
    const root = await createProject()
    const service = createBestLowcodeMcpService(root, bestLowcodeAdapter)
    const result = await service.previewChange(
      'apps/rps/src/pages/client-ledger/schema.ts',
      `const buildTitle = () => '客户账簿'
       export const ledgerSchema = {
         $schema: CRUD_SCHEMA_ID,
         version: CRUD_SCHEMA_VERSION,
         id: 'rps.client-ledger',
         kind: 'crud',
         title: buildTitle(),
         dataSource: { list: 'rps.client-ledger.list' },
         table: { rowKey: 'id', columns: [] }
       }`
    )

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'schema.static.unsupported' })
    )
  })
})
