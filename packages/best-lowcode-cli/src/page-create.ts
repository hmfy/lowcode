import { access, mkdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import {
  type Diagnostic,
  diagnostic,
  hasErrors,
  loadProjectConfig,
  resolveAllowedPath
} from './mcp'

export type PageCreateOptions = {
  capabilityPrefix?: string
  dir?: string
  kind?: 'crud'
  name: string
  title?: string
  write?: boolean
}

export type PageCreateFile = {
  path: string
  content: string
  exists: boolean
}

export type PageCreateResult = {
  written: boolean
  pageName: string
  targetDir: string
  files: PageCreateFile[]
  diagnostics: Diagnostic[]
}

const DEFAULT_SCHEMA_FILE = 'schema.ts'

function isSafePath(value: string) {
  return (
    value.length > 0 &&
    !value.startsWith('/') &&
    !value.includes('\0') &&
    !value.split(/[\\/]+/).includes('..')
  )
}

function isSafePageName(value: string) {
  return /^[a-z][a-z0-9-]*$/i.test(value)
}

function pascalCase(value: string) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('')
}

function camelCase(value: string) {
  const pascal = pascalCase(value)
  return `${pascal[0]?.toLowerCase() ?? ''}${pascal.slice(1)}`
}

function displayTitle(value: string) {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ')
}

function tsString(value: string) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

function tsModulePath(fileName: string) {
  return `./${fileName.replace(/\.tsx?$/, '')}`
}

async function exists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function inferPageRoot(allowedPaths: string[]) {
  const pagesPath = allowedPaths.find((path) => path.endsWith('/src/pages') || path === 'src/pages')
  if (pagesPath) return pagesPath
  const srcPath = allowedPaths.find((path) => path === 'src' || path.endsWith('/src'))
  if (srcPath) return join(srcPath, 'pages')
  const appPath = allowedPaths.find((path) => path.startsWith('apps/') || path === 'apps')
  return appPath ? join(appPath, 'src/pages') : (allowedPaths[0] ?? '')
}

function schemaFileName(pattern?: string) {
  if (!pattern || pattern.includes('*')) return DEFAULT_SCHEMA_FILE
  const name = basename(pattern)
  return name.endsWith('.ts') ? name : DEFAULT_SCHEMA_FILE
}

function createSchemaTemplate(input: {
  capabilityPrefix: string
  schemaVariable: string
  title: string
}) {
  return `import {
  CRUD_SCHEMA_ID,
  CRUD_SCHEMA_VERSION,
  type CrudPageSchema
} from 'best-lowcode-runtime'

export const ${input.schemaVariable} = {
  $schema: CRUD_SCHEMA_ID,
  version: CRUD_SCHEMA_VERSION,
  id: ${tsString(input.capabilityPrefix.replaceAll('.', '-'))},
  kind: 'crud',
  title: ${tsString(input.title)},
  dataSource: {
    list: ${tsString(`${input.capabilityPrefix}.list`)},
    remove: ${tsString(`${input.capabilityPrefix}.remove`)}
  },
  search: [
    { field: 'keyword', label: '关键词', component: 'input', placeholder: '请输入' },
    { field: 'status', label: '状态', component: 'select', dict: ${tsString(`${input.capabilityPrefix}.status`)} }
  ],
  table: {
    rowKey: 'id',
    columns: [
      { field: 'id', title: 'ID', width: 120 },
      { field: 'name', title: '名称', width: 180 },
      { field: 'status', title: '状态', width: 120, dict: ${tsString(`${input.capabilityPrefix}.status`)} },
      { field: 'created_at', title: '创建时间', width: 180, format: 'datetime' }
    ],
    actions: [{ id: 'remove', label: '删除', effect: 'remove', confirm: '确认删除该记录？' }]
  }
} satisfies CrudPageSchema
`
}

function createAdapterTemplate(input: { itemType: string }) {
  return `export type ${input.itemType} = {
  id: string
  name: string
  status?: string
  created_at?: string
}

import type { BestListQuery, BestListResult } from 'best-lowcode-runtime'

/** Map the backend request/response contract at this application boundary only. */
export async function list${input.itemType.replace(/Item$/, '')}(
  query: BestListQuery,
  options?: { signal?: AbortSignal }
): Promise<BestListResult<${input.itemType}>> {
  void query
  void options
  return { items: [], total: 0 }
}

export async function remove${input.itemType}(params: Record<string, unknown>): Promise<void> {
  void params
}
`
}

function createRegistryTemplate(input: {
  capabilityPrefix: string
  itemType: string
  registryVariable: string
}) {
  const listFunction = `list${input.itemType.replace(/Item$/, '')}`
  const removeFunction = `remove${input.itemType}`
  return `import type { BestProviderProps } from 'best-lowcode-runtime'
import { ${listFunction}, ${removeFunction} } from './adapter'

export const ${input.registryVariable} = {
  listServices: {
    ${tsString(`${input.capabilityPrefix}.list`)}: ${listFunction}
  },
  services: {
    ${tsString(`${input.capabilityPrefix}.remove`)}: ${removeFunction}
  },
  dictionaries: {
    ${tsString(`${input.capabilityPrefix}.status`)}: [
      { label: '启用', value: 'enabled' },
      { label: '停用', value: 'disabled' }
    ]
  },
  actions: {},
  slots: {},
  access: () => true
} satisfies BestProviderProps['registry']
`
}

function createIndexTemplate(input: {
  componentName: string
  registryVariable: string
  schemaModulePath: string
  schemaVariable: string
}) {
  return `import 'best-lowcode-runtime/style.css'
import { BestCrudPage, BestProvider } from 'best-lowcode-runtime'
import { ${input.registryVariable} } from './registry'
import { ${input.schemaVariable} } from '${input.schemaModulePath}'

export default function ${input.componentName}() {
  return (
    <BestProvider registry={${input.registryVariable}}>
      <BestCrudPage schema={${input.schemaVariable}} />
    </BestProvider>
  )
}
`
}

function createCrudTemplates(options: {
  capabilityPrefix: string
  name: string
  schemaFile: string
  title: string
}) {
  const baseName = pascalCase(options.name)
  const componentName = `${baseName}Page`
  const itemType = `${baseName}Item`
  const registryVariable = `${camelCase(options.name)}Registry`
  const schemaVariable = `${camelCase(options.name)}Schema`
  return [
    {
      name: options.schemaFile,
      content: createSchemaTemplate({
        capabilityPrefix: options.capabilityPrefix,
        schemaVariable,
        title: options.title
      })
    },
    { name: 'adapter.ts', content: createAdapterTemplate({ itemType }) },
    {
      name: 'registry.ts',
      content: createRegistryTemplate({
        capabilityPrefix: options.capabilityPrefix,
        itemType,
        registryVariable
      })
    },
    {
      name: 'index.tsx',
      content: createIndexTemplate({
        componentName,
        registryVariable,
        schemaModulePath: tsModulePath(options.schemaFile),
        schemaVariable
      })
    }
  ]
}

export async function createPage(
  rootDir: string,
  options: PageCreateOptions
): Promise<PageCreateResult> {
  const diagnostics: Diagnostic[] = []
  const configResult = await loadProjectConfig(rootDir)
  diagnostics.push(...configResult.diagnostics)
  if (hasErrors(diagnostics) || !configResult.config) {
    return { written: false, pageName: options.name, targetDir: '', files: [], diagnostics }
  }
  if (options.kind && options.kind !== 'crud') {
    diagnostics.push(diagnostic('error', 'page.kind', '当前仅支持 CRUD 页面模板', options.kind))
  }
  if (!isSafePageName(options.name)) {
    diagnostics.push(
      diagnostic(
        'error',
        'page.name',
        '页面名称只能包含字母、数字和短横线，并以字母开头',
        options.name
      )
    )
  }
  const pageRoot = options.dir ?? inferPageRoot(configResult.config.allowedPaths)
  if (!isSafePath(pageRoot)) {
    diagnostics.push(diagnostic('error', 'page.dir', '页面目录必须是安全的相对路径', pageRoot))
  }
  const targetDir = join(pageRoot, options.name)
  const resolvedTarget = resolveAllowedPath(rootDir, configResult.config.allowedPaths, targetDir)
  if (!resolvedTarget) {
    diagnostics.push(
      diagnostic('error', 'page.allowedPath', '目标页面目录不在 allowedPaths 范围内', targetDir)
    )
  }
  const capabilityPrefix = options.capabilityPrefix ?? options.name
  if (!/^[a-zA-Z][a-zA-Z0-9.-]*$/.test(capabilityPrefix)) {
    diagnostics.push(
      diagnostic(
        'error',
        'page.capabilityPrefix',
        '能力前缀只能包含字母、数字、点和短横线，并以字母开头',
        capabilityPrefix
      )
    )
  }
  const templates = createCrudTemplates({
    capabilityPrefix,
    name: options.name,
    schemaFile: schemaFileName(configResult.config.schemaFilePattern),
    title: options.title ?? displayTitle(options.name)
  })
  const files = await Promise.all(
    templates.map(async (template) => {
      const path = join(targetDir, template.name)
      return {
        path,
        content: template.content,
        exists: await exists(resolve(rootDir, path))
      }
    })
  )
  if (options.write && files.some((file) => file.exists)) {
    diagnostics.push(
      diagnostic('error', 'page.exists', '页面脚手架会覆盖已有文件，请更换页面名或手动合并')
    )
  }
  if (hasErrors(diagnostics) || !options.write || !resolvedTarget) {
    return { written: false, pageName: options.name, targetDir, files, diagnostics }
  }
  await mkdir(resolvedTarget, { recursive: true })
  await Promise.all(
    files.map((file) => writeFile(resolve(rootDir, file.path), file.content, 'utf8'))
  )
  return { written: true, pageName: options.name, targetDir, files, diagnostics }
}
