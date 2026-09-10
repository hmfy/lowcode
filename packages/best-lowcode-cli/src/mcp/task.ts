import { posix } from 'node:path'
import { listCapabilities } from './manifest'
import type {
  AgentTask,
  CapabilityContext,
  ProjectConfig,
  RequirementCoverage,
  TaskSelection
} from './types'

export function describeCapabilities(contexts: CapabilityContext[], builtInCapabilities: string[]) {
  const serviceDescriptions = new Map(
    contexts.flatMap(({ manifest }) =>
      Object.entries(manifest.services ?? {}).map(([id, value]) => [id, value.description] as const)
    )
  )
  return [...new Set([...listCapabilities(contexts), ...builtInCapabilities])].map((id) => ({
    id,
    description: serviceDescriptions.get(id)
  }))
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function capabilityGroups(relatedCapabilities: string[], contexts: CapabilityContext[]) {
  const services = new Set<string>()
  const dictionaries = new Set<string>()
  const actions = new Set<string>()
  const slots = new Set<string>()
  const access = new Set<string>()
  for (const { manifest } of contexts) {
    for (const key of Object.keys(manifest.services ?? {})) services.add(key)
    for (const key of manifest.dictionaries ?? []) dictionaries.add(key)
    for (const key of manifest.actions ?? []) actions.add(key)
    for (const key of manifest.slots ?? []) slots.add(key)
    for (const key of manifest.access ?? []) access.add(key)
  }
  return {
    services: relatedCapabilities.filter((id) => services.has(id)),
    dictionaries: relatedCapabilities.filter((id) => dictionaries.has(id)),
    actions: relatedCapabilities.filter((id) => actions.has(id)),
    slots: relatedCapabilities.filter((id) => slots.has(id)),
    access: relatedCapabilities.filter((id) => access.has(id)),
    builtIn: relatedCapabilities.filter((id) => id.startsWith('builtin.'))
  }
}

function pageNameFromCapabilities(capabilities: string[]) {
  const pageNames = unique(
    capabilities
      .filter((id) => !id.startsWith('builtin.'))
      .map((id) => {
        const parts = id.split('.')
        return parts.length >= 3 ? parts.slice(1, -1).join('-') : undefined
      })
      .filter((value): value is string => Boolean(value))
  )
  return pageNames.length === 1 ? pageNames[0] : undefined
}

function pageNameFromRequest(request: string) {
  const commandMatch = request.match(/\bbest\s+page\s+create\s+([a-z][a-z0-9-]*)\b/i)
  if (commandMatch?.[1]) return commandMatch[1]
  const pageMatch = request.match(/\b([a-z][a-z0-9-]*)\s+(?:(?:crud\s+)?page\b|页面)/i)
  return pageMatch?.[1]
}

function isCreatePageRequest(request: string) {
  const normalized = request.toLocaleLowerCase()
  return (
    /\b(create|new|add)\b/.test(normalized) ||
    normalized.includes('新增') ||
    normalized.includes('新建') ||
    normalized.includes('创建')
  )
}

function isInfrastructureMaintenanceRequest(request: string) {
  const normalized = request.toLocaleLowerCase()
  return (
    normalized.includes('基础设施') ||
    normalized.includes('infrastructure') ||
    normalized.includes('@best/lowcode-') ||
    /(?:lowcode|低代码).*(?:runtime|cli|工具|包|package|测试|文档)/.test(normalized) ||
    /(?:runtime|cli).*(?:lowcode|低代码)/.test(normalized)
  )
}

function isLowcodeOptOutRequest(request: string) {
  const normalized = request.toLocaleLowerCase()
  return (
    normalized.includes('不用低代码') ||
    normalized.includes('不使用低代码') ||
    normalized.includes('不要低代码') ||
    normalized.includes('without low-code') ||
    normalized.includes('without lowcode') ||
    normalized.includes('no low-code') ||
    normalized.includes('no lowcode')
  )
}

function schemaFileName(pattern?: string) {
  if (!pattern || pattern.includes('*')) return 'schema.ts'
  const name = posix.basename(pattern)
  return name.endsWith('.ts') ? name : 'schema.ts'
}

function inferPageRoot(paths: string[]) {
  const exactPage = paths.find((path) => /(^|\/)src\/pages\/[^/]+$/.test(path))
  if (exactPage) return posix.dirname(exactPage)
  const pagesPath = paths.find((path) => path.endsWith('/src/pages') || path === 'src/pages')
  if (pagesPath) return pagesPath
  const srcPath = paths.find((path) => path === 'src' || path.endsWith('/src'))
  if (srcPath) return posix.join(srcPath, 'pages')
  const appPath = paths.find((path) => path.startsWith('apps/') || path === 'apps')
  return appPath ? posix.join(appPath, 'src/pages') : (paths[0] ?? '')
}

function selectedPageDirectory(paths: string[]) {
  return paths.find((path) => /(^|\/)src\/pages\/[^/]+$/.test(path))
}

function isWithinAllowedPath(targetPath: string, allowedPaths: string[]) {
  return allowedPaths.some((allowedPath) => {
    const relativePath = posix.relative(allowedPath, targetPath)
    return (
      relativePath === '' ||
      (!relativePath.startsWith('../') && relativePath !== '..' && !posix.isAbsolute(relativePath))
    )
  })
}

function requirementCoverage(
  request: string,
  builtInCapabilities: string[]
): RequirementCoverage[] {
  const normalized = request.toLocaleLowerCase()
  const hasSlots = builtInCapabilities.includes('builtin.field.slot')
  const coverage: RequirementCoverage[] = []
  if (/筛选|查询|列表|分页|table|search/i.test(normalized)) {
    coverage.push({
      requirement: '列表、筛选与分页',
      status: 'native-supported',
      implementation: {
        schemaPaths: ['/dataSource/list', '/search', '/table'],
        registryKeys: ['listServices'],
        runtimeFeatures: ['BestTable', 'BestSearch']
      }
    })
  }
  if (/联动|客户来源|dynamic|conditional/i.test(normalized)) {
    coverage.push({
      requirement: '条件联动字段',
      status: 'native-supported',
      implementation: {
        schemaPaths: ['/form/*/visibleWhen', '/form/*/disabledWhen'],
        registryKeys: ['dictionaries'],
        runtimeFeatures: ['conditional form fields']
      }
    })
  }
  if (/新增.*编辑|编辑.*新增|create.*edit|edit.*create|密码.*编辑/i.test(normalized)) {
    coverage.push({
      requirement: '新增、编辑模式差异字段',
      status: 'native-supported',
      implementation: {
        schemaPaths: ['/form/*/visibleWhen', '/form/*/disabledWhen'],
        registryKeys: [],
        runtimeFeatures: ['form mode conditions']
      }
    })
  }
  if (/阶梯定价|编辑器|复杂表单|custom renderer|自定义组件/i.test(normalized)) {
    coverage.push({
      requirement: '复杂编辑器或自定义渲染器',
      status: hasSlots ? 'slot-supported' : 'extension-required',
      implementation: {
        schemaPaths: ['/form/*/component'],
        registryKeys: hasSlots ? ['slots'] : [],
        runtimeFeatures: ['custom field slot']
      },
      reason: hasSlots ? '主体表单由 Runtime 承载，复杂字段通过 registry slot 渲染。' : '需要先扩展 Runtime 的 custom field slot',
      fallback: hasSlots
        ? {
            attemptedRuntimeCapability: ['BestForm', 'form component schema', 'registry slots'],
            limitation: '原生字段不能表达完整复杂编辑器交互。',
            slotEvaluation: '可用字段 slot 承载复杂编辑器，表单生命周期仍由 Runtime 管理。',
            selectedFallback: 'runtime-slot'
          }
        : {
            attemptedRuntimeCapability: ['BestForm', 'form component schema'],
            limitation: '当前 Runtime 没有可注册的自定义字段能力。',
            slotEvaluation: '缺少 slot 能力，不能局部承载复杂字段。',
            selectedFallback: 'runtime-extension'
          }
    })
  }
  if (/阶梯|规则组|动态行|子表单|repeatable/i.test(normalized)) {
    const status = builtInCapabilities.includes('builtin.field.repeatable')
      ? 'native-supported'
      : hasSlots
        ? 'slot-supported'
        : 'extension-required'
    coverage.push({
      requirement: '可重复规则组',
      status,
      implementation: {
        schemaPaths: ['/form/*/itemFields', '/form/*/minItems', '/form/*/maxItems'],
        registryKeys: hasSlots && !builtInCapabilities.includes('builtin.field.repeatable') ? ['slots'] : [],
        runtimeFeatures: builtInCapabilities.includes('builtin.field.repeatable')
          ? ['repeatable field group']
          : ['custom field slot']
      },
      reason:
        status === 'native-supported'
          ? undefined
          : status === 'slot-supported'
            ? 'Runtime 暂无原生 repeatable 字段，但可由字段 slot 承载动态行。'
            : '当前 Runtime 未提供可重复字段组组件，也没有 slot 承载能力',
      fallback:
        status === 'native-supported'
          ? undefined
          : {
              attemptedRuntimeCapability: ['BestForm', 'repeatable field group', 'registry slots'],
              limitation:
                status === 'slot-supported'
                  ? '原生 repeatable 字段不可用。'
                  : '原生 repeatable 字段和字段 slot 都不可用。',
              slotEvaluation:
                status === 'slot-supported'
                  ? '可用字段 slot 承载动态行，提交转换交给 adapter。'
                  : '缺少 slot 能力，不能局部承载动态行。',
              selectedFallback: status === 'slot-supported' ? 'runtime-slot' : 'runtime-extension'
            }
    })
  }
  if (/接口映射|字段映射|payload|序列化|响应解包|adapter/i.test(normalized)) {
    coverage.push({
      requirement: '数据适配与提交转换',
      status: 'native-supported',
      implementation: {
        schemaPaths: [],
        registryKeys: ['services'],
        runtimeFeatures: ['CrudDataAdapter']
      }
    })
  }
  if (/详情|授权列表|detail|drawer/i.test(normalized)) {
    const needsDetailSlot = /授权列表|企业|股东|复杂|分组|数组|图片|扩展区/i.test(normalized)
    coverage.push({
      requirement: needsDetailSlot ? '详情及详情扩展区' : '详情基础字段',
      status: needsDetailSlot ? (hasSlots ? 'slot-supported' : 'extension-required') : 'native-supported',
      implementation: {
        schemaPaths: needsDetailSlot ? ['/detail/fields/*/slot'] : ['/detail/fields', '/dataSource/detail'],
        registryKeys: needsDetailSlot && hasSlots ? ['slots'] : ['detailServices'],
        runtimeFeatures: needsDetailSlot ? ['detail slot'] : ['BestDetail']
      },
      reason: needsDetailSlot
        ? hasSlots
          ? '基础详情由 Runtime 承载，复杂区块通过 detail slot 渲染。'
          : '需要先扩展 Runtime 的 detail slot'
        : undefined,
      fallback:
        needsDetailSlot
          ? hasSlots
            ? {
                attemptedRuntimeCapability: ['BestDetail', 'detail.fields', 'dataSource.detail', 'registry slots'],
                limitation: '普通 detail.fields 难以表达复杂区块的内部布局和交互。',
                slotEvaluation: '可用 detail slot 承载复杂区块，详情打开、取数和外围布局仍由 Runtime 管理。',
                selectedFallback: 'runtime-slot'
              }
            : {
                attemptedRuntimeCapability: ['BestDetail', 'detail.fields', 'dataSource.detail'],
                limitation: '普通 detail.fields 难以表达复杂区块，且当前 Runtime 没有 detail slot。',
                slotEvaluation: '缺少 detail slot 能力。',
                selectedFallback: 'runtime-extension'
              }
          : undefined
    })
  }
  if (/kyc|审核/i.test(normalized) && /原因|动态必填|输入|表单/i.test(normalized)) {
    coverage.push({
      requirement: '带动态原因的审核操作弹窗',
      status: 'extension-required',
      implementation: {
        schemaPaths: ['/actions/*'],
        registryKeys: ['actions'],
        runtimeFeatures: ['runAction', 'confirm']
      },
      reason: 'Runtime 有动作与确认能力，但缺少带动态校验的 Action Form 抽象。',
      fallback: {
        attemptedRuntimeCapability: ['runAction', 'confirm', 'BestForm', 'BestOverlay'],
        limitation: 'confirm 不支持输入字段和动态必填原因，runAction 不应仅作为跳转到手写 UI 的桥。',
        slotEvaluation: hasSlots
          ? '现有 slot 可承载字段渲染，但缺少动作表单生命周期抽象，适合沉淀 Runtime extension。'
          : '当前 slot 能力不足以表达动作表单生命周期。',
        selectedFallback: 'runtime-extension'
      }
    })
  }
  if (/经营状态/i.test(normalized) && /关闭原因|原因输入|输入原因/i.test(normalized)) {
    coverage.push({
      requirement: '经营状态关闭原因输入',
      status: 'runtime-not-supported',
      implementation: {
        schemaPaths: ['/actions/*'],
        registryKeys: ['actions'],
        runtimeFeatures: ['confirm']
      },
      reason: 'Runtime confirm 可表达静态确认，但当前没有带输入字段的确认抽象。',
      fallback: {
        attemptedRuntimeCapability: ['confirm', 'runAction', 'BestOverlay'],
        limitation: 'confirm 不支持输入字段，runAction 不应仅作为跳转到手写 UI 的桥。',
        slotEvaluation: '局部 slot 不能补齐确认弹窗的输入、校验与提交生命周期。',
        selectedFallback: 'handwritten-component'
      }
    })
  } else if (/经营状态/i.test(normalized) && /确认|启用|停用|开启|关闭/i.test(normalized)) {
    coverage.push({
      requirement: '经营状态静态确认',
      status: 'native-supported',
      implementation: {
        schemaPaths: ['/actions/*/confirm'],
        registryKeys: ['actions'],
        runtimeFeatures: ['confirm', 'runAction']
      }
    })
  }
  return coverage
}

function buildPageContext(
  request: string,
  config: ProjectConfig,
  relatedCapabilities: string[],
  allowedPaths: string[]
): { pageContext: AgentTask['pageContext']; blockedQuestion?: string } {
  const selectedPageDir = selectedPageDirectory(allowedPaths)
  const selectedPageName = selectedPageDir ? posix.basename(selectedPageDir) : undefined
  const pageName =
    pageNameFromRequest(request) ?? pageNameFromCapabilities(relatedCapabilities) ??
    selectedPageName
  const recommendedTemplate = isCreatePageRequest(request) ? ('crud' as const) : undefined
  const manifestPath = config.manifestPaths.length === 1 ? config.manifestPaths[0] : undefined
  if (!pageName) {
    return {
      pageContext: {
        manifestPath,
        targetFiles: [],
        generatedFiles: [],
        recommendedTemplate
      }
    }
  }
  const selectedPageDirForTask =
    selectedPageDir && pageName === selectedPageName ? selectedPageDir : undefined
  const pageRoot = selectedPageDirForTask
    ? posix.dirname(selectedPageDirForTask)
    : inferPageRoot(allowedPaths.length ? allowedPaths : config.allowedPaths)
  const pageDir = selectedPageDirForTask ?? posix.join(pageRoot, pageName)
  if (!isWithinAllowedPath(pageDir, allowedPaths)) {
    return {
      pageContext: {
        pageName,
        manifestPath,
        targetFiles: [],
        generatedFiles: [],
        recommendedTemplate
      },
      blockedQuestion: `推导出的页面目录 ${pageDir} 不在 AgentTask.allowedPaths 范围内，请确认 allowedPaths 或重新指定页面目录。`
    }
  }
  const schemaPath = posix.join(pageDir, schemaFileName(config.schemaFilePattern))
  const registryPath = posix.join(pageDir, 'registry.ts')
  const indexPath = posix.join(pageDir, 'index.tsx')
  const scaffoldFiles = [schemaPath, posix.join(pageDir, 'adapter.ts'), registryPath, indexPath]
  return {
    pageContext: {
      pageName,
      pageDir,
      schemaPath,
      registryPath: recommendedTemplate ? registryPath : undefined,
      manifestPath,
      targetFiles: [schemaPath, indexPath],
      generatedFiles: recommendedTemplate ? scaffoldFiles : [],
      recommendedTemplate,
      createCommand: recommendedTemplate
        ? `best page create ${pageName} --kind crud --dir ${pageRoot}`
        : undefined
    }
  }
}

export function buildAgentTask(
  request: string,
  config: ProjectConfig,
  contexts: CapabilityContext[],
  builtInCapabilities: string[] = [],
  selection?: TaskSelection
): AgentTask {
  const normalizedRequest = request.trim().toLocaleLowerCase()
  const isInfrastructureMaintenance = isInfrastructureMaintenanceRequest(request)
  const isLowcodeOptOut = isLowcodeOptOutRequest(request)
  const describedCapabilities = describeCapabilities(contexts, builtInCapabilities)
  const requestTerms = request
    .replace(/调整|修改|新增|新建|实现|优化|功能|页面|列表/g, ' ')
    .split(/[\s,，。；;、]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
  const fallbackCapabilities = describedCapabilities
    .filter(
      ({ id, description }) =>
        normalizedRequest.includes(id.toLocaleLowerCase()) ||
        requestTerms.some((term) => Boolean(description?.includes(term)))
    )
    .map(({ id }) => id)
  const questions: string[] = []
  const canScaffoldNewPage = isCreatePageRequest(request) && Boolean(pageNameFromRequest(request))
  const hasValidatedSelection = selection !== undefined
  const selectedCapabilities = selection?.relatedCapabilities ?? fallbackCapabilities
  const relatedCapabilities = selectedCapabilities
  if (!normalizedRequest) questions.push('请提供需要实现或调整的页面需求。')
  if (
    !relatedCapabilities.length &&
    normalizedRequest &&
    hasValidatedSelection &&
    !canScaffoldNewPage &&
    !isInfrastructureMaintenance
  ) {
    questions.push('未能从需求中确定可用能力，请确认目标页面、服务、字典或动作。')
  }
  const verificationCommands = config.verificationCommands ?? []
  const coverage =
    isInfrastructureMaintenance || isLowcodeOptOut
      ? []
      : requirementCoverage(request, builtInCapabilities)
  questions.push(
    ...coverage
      .filter((item) => item.status === 'extension-required')
      .map(
        (item) =>
          `${item.requirement}需要扩展 Runtime：${item.reason}。请选择扩展 Runtime，或确认这是一次性业务交互后授权局部手写实现。`
      )
  )
  const pageContextResult = buildPageContext(
    request,
    config,
    relatedCapabilities,
    selection?.allowedPaths ?? config.allowedPaths
  )
  if (pageContextResult.blockedQuestion) questions.push(pageContextResult.blockedQuestion)
  if (
    !isInfrastructureMaintenance &&
    !isLowcodeOptOut &&
    hasValidatedSelection &&
    !pageContextResult.blockedQuestion &&
    !pageContextResult.pageContext.pageDir
  ) {
    questions.push(
      '未能确定 BEST CRUD 页面的目录；请确认目标页面名称或提供现有能力 ID，低代码链路在此之前不能实施。'
    )
  }
  return {
    version: 1,
    request,
    allowedPaths: selection?.allowedPaths ?? config.allowedPaths,
    relatedCapabilities,
    capabilityGroups: capabilityGroups(relatedCapabilities, contexts),
    requiredArchitecture:
      isInfrastructureMaintenance || isLowcodeOptOut
        ? { kind: 'none', files: [] }
        : {
            kind: 'best-crud',
            component: 'BestCrudPage',
            files: pageContextResult.pageContext.pageDir
              ? [
                  posix.join(pageContextResult.pageContext.pageDir, 'schema.ts'),
                  posix.join(pageContextResult.pageContext.pageDir, 'registry.ts'),
                  posix.join(pageContextResult.pageContext.pageDir, 'index.tsx')
                ]
              : []
          },
    requirementCoverage: coverage,
    pageContext: pageContextResult.pageContext,
    verificationCommands,
    blockedQuestions: questions,
    acceptance: [
      'MCP 配置与 Manifest 校验通过',
      ...(isInfrastructureMaintenance || isLowcodeOptOut
        ? []
        : ['页面采用 BestProvider + BestCrudPage，并包含 schema.ts 与 registry.ts']),
      ...verificationCommands
    ],
    questions
  }
}
