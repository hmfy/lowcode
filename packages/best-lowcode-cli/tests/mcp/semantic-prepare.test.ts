import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBestLowcodeMcpService } from '../../src/mcp/service'

async function createProject() {
  const root = await mkdtemp(join(tmpdir(), 'best-lowcode-semantic-'))
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

describe('semantic prepare', () => {
  it('uses Codex semantic selection by default', async () => {
    const service = createBestLowcodeMcpService(await createProject(), undefined, async () => ({
      relatedCapabilities: ['rps.client-ledger.list'],
      allowedPaths: ['apps/rps/src/pages/client-ledger'],
      questions: []
    }))
    const result = await service.prepareTask('给客户账簿增加日期范围查询')
    expect(result.task?.relatedCapabilities).toEqual(['rps.client-ledger.list'])
    expect(result.diagnostics).toEqual([])
  })

  it('allows the semantic selector to name the configured Manifest without adding it to task paths', async () => {
    const service = createBestLowcodeMcpService(await createProject(), undefined, async () => ({
      relatedCapabilities: ['rps.client-ledger.list'],
      allowedPaths: ['apps/rps/src/pages/client-ledger', 'lowcode.manifest.json'],
      questions: []
    }))
    const result = await service.prepareTask('给客户账簿增加日期范围查询')
    expect(result.diagnostics).toEqual([])
    expect(result.task?.allowedPaths).toEqual(['apps/rps/src/pages/client-ledger'])
  })

  it('uses a valid Codex semantic selection after allowlist validation', async () => {
    const service = createBestLowcodeMcpService(await createProject(), undefined, async () => ({
      relatedCapabilities: ['rps.client-ledger.list'],
      allowedPaths: ['apps/rps/src/pages/client-ledger'],
      questions: []
    }))
    const result = await service.prepareTask('给客户账簿增加日期范围查询', { semantic: 'codex' })
    expect(result.task?.relatedCapabilities).toEqual(['rps.client-ledger.list'])
    expect(result.task?.questions).toEqual([])
    expect(result.diagnostics).toEqual([])
  })

  it('rejects invented selections and falls back to deterministic matching', async () => {
    const service = createBestLowcodeMcpService(await createProject(), undefined, async () => ({
      relatedCapabilities: ['invented.service'],
      allowedPaths: ['outside'],
      questions: []
    }))
    const result = await service.prepareTask('给客户账簿增加日期范围查询', { semantic: 'codex' })
    expect(result.task?.relatedCapabilities).toEqual([])
    expect(result.task?.questions).toContain(
      '未能从需求中确定可用能力，请确认目标页面、服务、字典或动作。'
    )
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'semantic.rejected', level: 'warning' })
    )
  })

  it('does not keep fuzzy existing capabilities for a new scaffold request', async () => {
    const service = createBestLowcodeMcpService(await createProject(), undefined, async () => ({
      relatedCapabilities: ['rps.client-ledger.list'],
      allowedPaths: ['apps/rps/src/pages/client-ledger'],
      questions: ['customer-list 页面需展示哪些字段？', '是否复用 `rps.client-ledger.list`？']
    }))
    const result = await service.prepareTask('新增 best page create customer-list 页面')
    expect(result.task?.relatedCapabilities).toEqual([])
    expect(result.task?.capabilityGroups.services).toEqual([])
    expect(result.task?.pageContext).toMatchObject({
      pageName: 'customer-list',
      recommendedTemplate: 'crud'
    })
    expect(result.task?.pageContext.generatedFiles).toEqual([])
    expect(result.task?.blockedQuestions).toEqual([
      '推导出的页面目录 apps/rps/src/pages/customer-list 不在 AgentTask.allowedPaths 范围内，请确认 allowedPaths 或重新指定页面目录。'
    ])
  })

  it('drops fuzzy reuse questions for explicit new scaffold requests', async () => {
    const service = createBestLowcodeMcpService(await createProject(), undefined, async () => ({
      relatedCapabilities: [],
      allowedPaths: ['apps/rps/src/pages/client-ledger'],
      questions: ['是否复用现有客户管理列表能力？']
    }))
    const result = await service.prepareTask('新增 customer-list 页面')
    expect(result.task?.relatedCapabilities).toEqual([])
    expect(result.task?.questions).toEqual([
      '推导出的页面目录 apps/rps/src/pages/customer-list 不在 AgentTask.allowedPaths 范围内，请确认 allowedPaths 或重新指定页面目录。'
    ])
  })

  it('drops fuzzy existing capability mapping questions for explicit new scaffold requests', async () => {
    const service = createBestLowcodeMcpService(await createProject(), undefined, async () => ({
      relatedCapabilities: [],
      allowedPaths: ['apps/rps/src/pages/client-ledger'],
      questions: [
        '“customer-list” 是否对应现有客户管理列表能力 `rps.client-management.list`？若是，是否还需要账户状态、国家、业务状态筛选和操作能力？',
        'customer-list 页面需展示哪些字段？'
      ]
    }))
    const result = await service.prepareTask('新增 customer-list 页面')
    expect(result.task?.relatedCapabilities).toEqual([])
    expect(result.task?.questions).toEqual([
      '推导出的页面目录 apps/rps/src/pages/customer-list 不在 AgentTask.allowedPaths 范围内，请确认 allowedPaths 或重新指定页面目录。'
    ])
  })

  it('drops semantic questions for explicit new scaffold requests without explicit capability ids', async () => {
    const service = createBestLowcodeMcpService(await createProject(), undefined, async () => ({
      relatedCapabilities: [],
      allowedPaths: ['apps/rps/src/pages/client-ledger'],
      questions: [
        '“customer-list”是新页面脚手架，还是需要复用“客户管理”分页数据能力？如需复用，请明确确认使用的能力 ID。',
        '“新增 customer-list 页面”是否需要接入现有客户管理分页数据能力 `rps.client-management.list`？',
        'customer-list 页面需展示哪些字段？'
      ]
    }))
    const result = await service.prepareTask('新增 customer-list 页面')
    expect(result.task?.relatedCapabilities).toEqual([])
    expect(result.task?.questions).toEqual([
      '推导出的页面目录 apps/rps/src/pages/customer-list 不在 AgentTask.allowedPaths 范围内，请确认 allowedPaths 或重新指定页面目录。'
    ])
  })
})
