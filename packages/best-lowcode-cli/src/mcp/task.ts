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
  // A runtime exposing field slots can still express a repeatable group through a controlled slot.
  // The dedicated capability marks the preferred built-in implementation.
  const hasRepeatable = builtInCapabilities.includes('builtin.field.repeatable') || hasSlots
  const coverage: RequirementCoverage[] = []
  if (/筛选|查询|列表|分页|table|search/i.test(normalized)) {
    coverage.push({
      requirement: '列表、筛选与分页',
      status: 'supported',
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
      status: hasSlots ? 'supported' : 'extension-required',
      implementation: {
        schemaPaths: ['/form/*/visibleWhen', '/form/*/disabledWhen'],
        registryKeys: hasSlots ? ['dictionaries', 'slots'] : [],
        runtimeFeatures: ['conditional form fields']
      },
      reason: hasSlots ? undefined : '当前 Runtime 没有可注册的自定义字段能力'
    })
  }
  if (/新增.*编辑|编辑.*新增|create.*edit|edit.*create|密码.*编辑/i.test(normalized)) {
    coverage.push({
      requirement: '新增、编辑模式差异字段',
      status: 'supported',
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
      status: hasSlots ? 'supported' : 'extension-required',
      implementation: {
        schemaPaths: ['/form/*/component'],
        registryKeys: hasSlots ? ['slots'] : [],
        runtimeFeatures: ['custom field slot']
      },
      reason: hasSlots ? undefined : '需要先扩展 Runtime 的 custom field slot'
    })
  }
  if (/阶梯|规则组|动态行|子表单|repeatable/i.test(normalized)) {
    coverage.push({
      requirement: '可重复规则组',
      status: hasRepeatable ? 'supported' : 'extension-required',
      implementation: {
        schemaPaths: ['/form/*/itemFields', '/form/*/minItems', '/form/*/maxItems'],
        registryKeys: [],
        runtimeFeatures: ['repeatable field group']
      },
      reason: hasRepeatable ? undefined : '当前 Runtime 未提供可重复字段组组件'
    })
  }
  if (/接口映射|字段映射|payload|序列化|响应解包|adapter/i.test(normalized)) {
    coverage.push({
      requirement: '数据适配与提交转换',
      status: 'supported',
      implementation: {
        schemaPaths: [],
        registryKeys: ['services'],
        runtimeFeatures: ['CrudDataAdapter']
      }
    })
  }
  if (/详情|授权列表|detail|drawer/i.test(normalized)) {
    coverage.push({
      requirement: '详情及详情扩展区',
      status: hasSlots ? 'supported' : 'extension-required',
      implementation: {
        schemaPaths: ['/detail/fields/*/slot'],
        registryKeys: hasSlots ? ['slots'] : [],
        runtimeFeatures: ['detail slot']
      },
      reason: hasSlots ? undefined : '需要先扩展 Runtime 的 detail slot'
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

export function prepareTask(
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
          `${item.requirement}当前不可由 Runtime 表达：${item.reason}。请选择扩展 Runtime 或明确授权手写实现。`
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
