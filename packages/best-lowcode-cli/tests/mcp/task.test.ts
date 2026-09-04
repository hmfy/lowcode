import { describe, expect, it } from 'vitest'
import { prepareTask } from '../../src/mcp/task'

describe('prepareTask', () => {
  it('limits its context to manifest capabilities', () => {
    const task = prepareTask(
      '调整 rps.client-ledger.list 的查询条件',
      {
        version: 1,
        allowedPaths: ['apps/rps/src/pages'],
        manifestPaths: ['apps/rps/lowcode.manifest.json']
      },
      [
        {
          manifestPath: 'apps/rps/lowcode.manifest.json',
          manifest: { version: 1, services: { 'rps.client-ledger.list': {} } }
        }
      ]
    )
    expect(task.relatedCapabilities).toEqual(['rps.client-ledger.list'])
    expect(task.capabilityGroups).toMatchObject({
      services: ['rps.client-ledger.list'],
      dictionaries: [],
      actions: [],
      slots: [],
      access: [],
      builtIn: []
    })
    expect(task.requiredArchitecture).toEqual({
      kind: 'best-crud',
      component: 'BestCrudPage',
      files: [
        'apps/rps/src/pages/client-ledger/schema.ts',
        'apps/rps/src/pages/client-ledger/registry.ts',
        'apps/rps/src/pages/client-ledger/index.tsx'
      ]
    })
    expect(task.pageContext).toMatchObject({
      pageName: 'client-ledger',
      pageDir: 'apps/rps/src/pages/client-ledger',
      schemaPath: 'apps/rps/src/pages/client-ledger/schema.ts',
      manifestPath: 'apps/rps/lowcode.manifest.json',
      targetFiles: [
        'apps/rps/src/pages/client-ledger/schema.ts',
        'apps/rps/src/pages/client-ledger/index.tsx'
      ],
      generatedFiles: []
    })
    expect(task.verificationCommands).toEqual([])
    expect(task.blockedQuestions).toEqual([])
    expect(task.questions).toEqual([])
    expect(task.acceptance).toContain(
      '页面采用 BestProvider + BestCrudPage，并包含 schema.ts 与 registry.ts'
    )
  })

  it('allows an explicit low-code opt-out without requiring the BEST CRUD architecture', () => {
    const task = prepareTask(
      '新增 customer-list 页面，不用低代码',
      {
        version: 1,
        allowedPaths: ['apps/demo/src/pages'],
        manifestPaths: ['apps/demo/lowcode.manifest.json']
      },
      []
    )

    expect(task.requiredArchitecture).toEqual({ kind: 'none', files: [] })
  })

  it('blocks default low-code work until it can determine the target page directory', () => {
    const task = prepareTask(
      '调整客户管理功能',
      {
        version: 1,
        allowedPaths: ['apps/demo/src/pages'],
        manifestPaths: ['apps/demo/lowcode.manifest.json']
      },
      []
    )

    expect(task.questions).toContain(
      '未能确定 BEST CRUD 页面的目录；请确认目标页面名称或提供现有能力 ID，低代码链路在此之前不能实施。'
    )
  })

  it('adds scaffold context for a new CRUD page request', () => {
    const task = prepareTask(
      '新增 customer-list 页面',
      {
        version: 1,
        allowedPaths: ['apps/demo/src/pages'],
        manifestPaths: ['apps/demo/lowcode.manifest.json'],
        verificationCommands: ['pnpm -C apps/demo exec tsc -b']
      },
      []
    )
    expect(task.pageContext).toMatchObject({
      pageName: 'customer-list',
      pageDir: 'apps/demo/src/pages/customer-list',
      registryPath: 'apps/demo/src/pages/customer-list/registry.ts',
      recommendedTemplate: 'crud',
      createCommand: 'best page create customer-list --kind crud --dir apps/demo/src/pages',
      manifestPath: 'apps/demo/lowcode.manifest.json',
      targetFiles: [
        'apps/demo/src/pages/customer-list/schema.ts',
        'apps/demo/src/pages/customer-list/index.tsx'
      ],
      generatedFiles: [
        'apps/demo/src/pages/customer-list/schema.ts',
        'apps/demo/src/pages/customer-list/adapter.ts',
        'apps/demo/src/pages/customer-list/registry.ts',
        'apps/demo/src/pages/customer-list/index.tsx'
      ]
    })
    expect(task.verificationCommands).toEqual(['pnpm -C apps/demo exec tsc -b'])
    expect(task.blockedQuestions).toEqual([])
    expect(task.questions).toEqual([])
  })

  it('maps supported complex requirements to schema and registry coverage', () => {
    const task = prepareTask(
      '新增 customer-list 页面，支持客户来源联动、阶梯定价编辑器和详情授权列表',
      {
        version: 1,
        allowedPaths: ['apps/demo/src/pages'],
        manifestPaths: ['apps/demo/lowcode.manifest.json']
      },
      [],
      ['builtin.field.slot']
    )

    expect(task.questions).toEqual([])
    expect(task.requirementCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requirement: '条件联动字段', status: 'supported' }),
        expect.objectContaining({ requirement: '复杂编辑器或自定义渲染器', status: 'supported' }),
        expect.objectContaining({ requirement: '详情及详情扩展区', status: 'supported' })
      ])
    )
  })

  it('blocks implementation when a requirement needs unsupported Runtime capability', () => {
    const task = prepareTask(
      '新增 customer-list 页面，支持阶梯定价编辑器',
      {
        version: 1,
        allowedPaths: ['apps/demo/src/pages'],
        manifestPaths: ['apps/demo/lowcode.manifest.json']
      },
      []
    )

    expect(task.requirementCoverage).toContainEqual(
      expect.objectContaining({
        requirement: '复杂编辑器或自定义渲染器',
        status: 'extension-required'
      })
    )
    expect(task.questions.join('\n')).toContain('请选择扩展 Runtime 或明确授权手写实现。')
  })

  it('derives src/pages as the page root for the default src allowPath', () => {
    const task = prepareTask(
      '新增 customer-list 页面',
      {
        version: 1,
        allowedPaths: ['src'],
        manifestPaths: ['lowcode.manifest.json']
      },
      []
    )
    expect(task.pageContext.pageDir).toBe('src/pages/customer-list')
  })

  it('allows package infrastructure maintenance without business capabilities', () => {
    const task = prepareTask(
      '维护 best-lowcode-runtime runtime 和 best-lowcode-devtools 测试',
      {
        version: 1,
        allowedPaths: ['packages/best-lowcode-react', 'packages/best-lowcode-cli'],
        manifestPaths: ['apps/rps/lowcode.manifest.json']
      },
      [],
      [],
      {
        relatedCapabilities: [],
        allowedPaths: ['packages/best-lowcode-react', 'packages/best-lowcode-cli'],
        questions: ['未能从需求中确定可用能力，请确认目标页面、服务、字典或动作。']
      }
    )

    expect(task.questions).toEqual([])
    expect(task.relatedCapabilities).toEqual([])
    expect(task.allowedPaths).toEqual(['packages/best-lowcode-react', 'packages/best-lowcode-cli'])
  })

  it('locates an existing page from a human-readable Manifest service description', () => {
    const task = prepareTask(
      '调整客户管理功能',
      {
        version: 1,
        allowedPaths: ['apps/rps/src/pages'],
        manifestPaths: ['apps/rps/lowcode.manifest.json']
      },
      [
        {
          manifestPath: 'apps/rps/lowcode.manifest.json',
          manifest: {
            version: 1,
            services: { 'rps.client-management.list': { description: '查询客户管理分页数据' } }
          }
        }
      ]
    )
    expect(task.pageContext.pageDir).toBe('apps/rps/src/pages/client-management')
    expect(task.questions).toEqual([])
  })

  it('reports mode, adapter and repeatable-group requirements as supported runtime capabilities', () => {
    const task = prepareTask(
      '新增 customer-list 页面，新增编辑密码差异、阶梯规则组和 payload 字段映射',
      {
        version: 1,
        allowedPaths: ['apps/demo/src/pages'],
        manifestPaths: ['apps/demo/lowcode.manifest.json']
      },
      [],
      ['builtin.field.slot', 'builtin.field.repeatable']
    )
    expect(task.requirementCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requirement: '新增、编辑模式差异字段', status: 'supported' }),
        expect.objectContaining({ requirement: '可重复规则组', status: 'supported' }),
        expect.objectContaining({ requirement: '数据适配与提交转换', status: 'supported' })
      ])
    )
  })
})
