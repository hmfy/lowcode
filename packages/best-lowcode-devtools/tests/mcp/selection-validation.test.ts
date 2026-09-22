import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBestLowcodeMcpService } from '../../src/mcp/service'

async function createProject() {
  const root = await mkdtemp(join(tmpdir(), 'best-lowcode-selection-'))
  await writeFile(
    join(root, 'best.lowcode.config.json'),
    JSON.stringify({
      version: 1,
      allowedPaths: ['apps/rps/src/pages/client-ledger'],
      manifestPaths: ['lowcode.manifest.json']
    })
  )
  await writeFile(
    join(root, 'lowcode.manifest.json'),
    JSON.stringify({
      version: 1,
      services: {
        'rps.client-ledger.list': { description: '查询客户账簿分页数据' }
      }
    })
  )
  return root
}

describe('selection validation', () => {
  it('validates a deterministic task without starting a host-specific semantic resolver', async () => {
    const service = createBestLowcodeMcpService(await createProject())

    const result = await service.validateSelection('调整 rps.client-ledger.list 的查询条件', {
      relatedCapabilities: ['rps.client-ledger.list'],
      allowedPaths: ['apps/rps/src/pages/client-ledger'],
      targetPageDir: 'apps/rps/src/pages/client-ledger'
    })

    expect(result.task?.relatedCapabilities).toEqual(['rps.client-ledger.list'])
    expect(result.diagnostics).toEqual([])
  })

  it('leaves ambiguous requests for the current Agent to select before validation', async () => {
    const service = createBestLowcodeMcpService(await createProject())

    const result = await service.validateSelection('调整客户管理功能', { relatedCapabilities: [], allowedPaths: ['apps/rps/src/pages/client-ledger'] })

    expect(result.task).toBeUndefined()
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'selection.page.required', level: 'error' })
    )
  })

  it('accepts an Agent selection and excludes Manifest paths from business write paths', async () => {
    const service = createBestLowcodeMcpService(await createProject())

    const result = await service.validateSelection('给客户账簿增加日期范围查询', {
      relatedCapabilities: ['rps.client-ledger.list'],
      allowedPaths: ['apps/rps/src/pages/client-ledger', 'lowcode.manifest.json'],
      targetPageDir: 'apps/rps/src/pages/client-ledger'
    })

    expect(result.diagnostics).toEqual([])
    expect(result.task?.relatedCapabilities).toEqual(['rps.client-ledger.list'])
    expect(result.task?.allowedPaths).toEqual(['apps/rps/src/pages/client-ledger'])
  })

  it('accepts a precise child path under a configured allowlist directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-selection-child-path-'))
    await writeFile(
      join(root, 'best.lowcode.config.json'),
      JSON.stringify({ version: 1, allowedPaths: ['src'], manifestPaths: ['lowcode.manifest.json'] })
    )
    await writeFile(
      join(root, 'lowcode.manifest.json'),
      JSON.stringify({ version: 1, services: { 'customer.list': { description: '查询客户列表' } } })
    )
    const service = createBestLowcodeMcpService(root)

    const result = await service.validateSelection('调整客户列表', {
      relatedCapabilities: ['customer.list'],
      allowedPaths: ['src/pages/customers'],
      targetPageDir: 'src/pages/customers'
    })

    expect(result.diagnostics).toEqual([])
    expect(result.task?.allowedPaths).toEqual(['src/pages/customers'])
    expect(result.task?.pageContext).toMatchObject({
      pageName: 'customers',
      pageDir: 'src/pages/customers'
    })
    expect(result.task?.questions).toEqual([])
  })

  it('rejects invented capabilities and disallowed paths instead of falling back', async () => {
    const service = createBestLowcodeMcpService(await createProject())

    const result = await service.validateSelection('给客户账簿增加日期范围查询', {
      relatedCapabilities: ['invented.service'],
      allowedPaths: ['outside', '../outside', '/tmp/outside']
    })

    expect(result.task).toBeUndefined()
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'selection.capability.unknown', level: 'error' }),
        expect.objectContaining({ code: 'selection.path.disallowed', level: 'error' })
      ])
    )
  })

  it('uses the explicit selected path instead of inferring a page name from prose', async () => {
    const service = createBestLowcodeMcpService(await createProject())

    const result = await service.validateSelection('新增 customer-list 页面', {
      relatedCapabilities: [],
      allowedPaths: ['apps/rps/src/pages/client-ledger'],
      targetPageDir: 'apps/rps/src/pages/client-ledger'
    })

    expect(result.task?.relatedCapabilities).toEqual([])
    expect(result.task?.pageContext).toMatchObject({
      pageName: 'client-ledger',
      pageDir: 'apps/rps/src/pages/client-ledger',
      recommendedTemplate: 'crud'
    })
    expect(result.task?.blockedQuestions).toEqual([])
  })

  it('does not let technical prose override the selected page directory', async () => {
    const service = createBestLowcodeMcpService(await createProject())

    const result = await service.validateSelection(
      '将 SharedProTable 页面迁移为 BEST CRUD 页面，ClientLedger page 只是组件描述',
      {
        relatedCapabilities: ['rps.client-ledger.list'],
        allowedPaths: ['apps/rps/src/pages/client-ledger'],
        targetPageDir: 'apps/rps/src/pages/client-ledger'
      }
    )

    expect(result.task?.pageContext).toMatchObject({
      pageName: 'client-ledger',
      pageDir: 'apps/rps/src/pages/client-ledger'
    })
    expect(result.task?.blockedQuestions).toEqual([])
  })

  it('accepts an explicitly selected CRUD page with arbitrary nesting', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-selection-nested-page-'))
    await writeFile(
      join(root, 'best.lowcode.config.json'),
      JSON.stringify({ version: 1, allowedPaths: ['apps'], manifestPaths: ['lowcode.manifest.json'] })
    )
    await writeFile(join(root, 'lowcode.manifest.json'), JSON.stringify({ version: 1 }))
    const service = createBestLowcodeMcpService(root)
    const targetPageDir = 'apps/cis/src/pages/transfer-order/transfer-order-list'

    const result = await service.validateSelection('新增调拨单列表', {
      relatedCapabilities: [],
      allowedPaths: [targetPageDir],
      targetPageDir
    })

    expect(result.diagnostics).toEqual([])
    expect(result.task?.pageContext).toMatchObject({
      pageName: 'transfer-order-list',
      pageDir: targetPageDir
    })
    expect(result.task?.questions).toEqual([])
  })

  it('rejects a target page outside the selected allowed paths', async () => {
    const service = createBestLowcodeMcpService(await createProject())

    const result = await service.validateSelection('重构调拨单列表', {
      relatedCapabilities: ['rps.client-ledger.list'],
      allowedPaths: ['apps/rps/src/pages/client-ledger'],
      targetPageDir: 'apps/cis/src/pages/transfer-order/transfer-order-list'
    })

    expect(result.task).toBeUndefined()
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'selection.page.disallowed', level: 'error' })
    )
  })
})
