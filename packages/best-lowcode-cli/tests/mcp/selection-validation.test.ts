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
  it('prepares a deterministic task without starting a host-specific semantic resolver', async () => {
    const service = createBestLowcodeMcpService(await createProject())

    const result = await service.prepareTask('调整 rps.client-ledger.list 的查询条件')

    expect(result.task?.relatedCapabilities).toEqual(['rps.client-ledger.list'])
    expect(result.diagnostics).toEqual([])
  })

  it('leaves ambiguous requests for the current Agent to select before validation', async () => {
    const service = createBestLowcodeMcpService(await createProject())

    const result = await service.prepareTask('调整客户管理功能')

    expect(result.task?.relatedCapabilities).toEqual([])
    expect(result.task?.questions).toEqual([])
  })

  it('accepts an Agent selection and excludes Manifest paths from business write paths', async () => {
    const service = createBestLowcodeMcpService(await createProject())

    const result = await service.validateSelection('给客户账簿增加日期范围查询', {
      relatedCapabilities: ['rps.client-ledger.list'],
      allowedPaths: ['apps/rps/src/pages/client-ledger', 'lowcode.manifest.json']
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
      allowedPaths: ['src/pages/customers']
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

  it('allows an empty selection for a new scaffold request', async () => {
    const service = createBestLowcodeMcpService(await createProject())

    const result = await service.validateSelection('新增 customer-list 页面', {
      relatedCapabilities: [],
      allowedPaths: ['apps/rps/src/pages/client-ledger']
    })

    expect(result.task?.relatedCapabilities).toEqual([])
    expect(result.task?.pageContext).toMatchObject({
      pageName: 'customer-list',
      recommendedTemplate: 'crud'
    })
    expect(result.task?.blockedQuestions).toContain(
      '推导出的页面目录 apps/rps/src/pages/customer-list 不在 AgentTask.allowedPaths 范围内，请确认 allowedPaths 或重新指定页面目录。'
    )
  })
})
