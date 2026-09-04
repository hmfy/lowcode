import type { Dirent } from 'node:fs'
import { access, readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import { resolveAllowedPath } from './config'
import { diagnostic } from './diagnostics'
import { findCapabilityDefinition, listCapabilities } from './manifest'
import { parseStaticCrudSchemas, type StaticSchemaValue } from './static-schema'
import type { CapabilityContext, Diagnostic, LowcodeAdapter, ProjectConfig } from './types'

function jsxName(tagName: ts.JsxTagNameExpression) {
  return ts.isIdentifier(tagName) ? tagName.text : undefined
}

function hasHiddenAttribute(opening: ts.JsxOpeningLikeElement) {
  return opening.attributes.properties.some((property) => {
    if (!ts.isJsxAttribute(property)) return false
    const name = ts.isIdentifier(property.name) ? property.name.text : property.name.getText()
    if (name === 'hidden' || name === 'aria-hidden') return true
    if (name !== 'style' || !property.initializer || !ts.isJsxExpression(property.initializer))
      return false
    const expression = property.initializer.expression
    return (
      !!expression &&
      ts.isObjectLiteralExpression(expression) &&
      expression.properties.some(
        (item) =>
          ts.isPropertyAssignment(item) &&
          ts.isIdentifier(item.name) &&
          item.name.text === 'display' &&
          ts.isStringLiteral(item.initializer) &&
          item.initializer.text === 'none'
      )
    )
  })
}

function scanPageArchitecture(content: string, fileName: string) {
  const source = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  let hasProvider = false
  let hasCrudPage = false
  let hiddenCrudPage = false
  function visit(node: ts.Node, hiddenAncestor = false) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      const name = jsxName(opening.tagName)
      const hidden = hiddenAncestor || hasHiddenAttribute(opening)
      if (name === 'BestProvider') hasProvider = true
      if (name === 'BestCrudPage') {
        hasCrudPage = true
        hiddenCrudPage ||= hidden
      }
      ts.forEachChild(node, (child) => visit(child, hidden))
      return
    }
    ts.forEachChild(node, (child) => visit(child, hiddenAncestor))
  }
  visit(source)
  return { hasProvider, hasCrudPage, hiddenCrudPage }
}

async function collectSchemaFiles(rootDir: string, allowedPath: string, pattern: string) {
  const base = resolveAllowedPath(rootDir, [allowedPath], allowedPath)
  if (!base) return []
  const files: string[] = []
  async function visit(directory: string) {
    let entries: Dirent<string>[]
    try {
      entries = await readdir(directory, { encoding: 'utf8', withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const filePath = resolve(directory, entry.name)
      if (entry.isDirectory()) await visit(filePath)
      else if (entry.isFile() && entry.name === pattern) files.push(filePath)
    }
  }
  await visit(base)
  return files
}

function collectReferences(
  value: StaticSchemaValue,
  path: string,
  references: Array<{ id: string; path: string }>,
  parentKey?: string
) {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      collectReferences(item, `${path}/${index}`, references, parentKey)
    }
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}/${key}`
    if (typeof child === 'string') {
      if (key === 'component') references.push({ id: `builtin.field.${child}`, path: childPath })
      else if (key === 'effect') references.push({ id: `builtin.effect.${child}`, path: childPath })
      else if (key === 'format') references.push({ id: `builtin.format.${child}`, path: childPath })
      else if (
        parentKey === 'dataSource' &&
        (key === 'list' || key === 'detail' || key === 'create' || key === 'update')
      ) {
        references.push({ id: child, path: childPath })
      } else if (key === 'dict' || key === 'action' || key === 'slot' || key === 'access') {
        references.push({ id: child, path: childPath })
      }
    }
    collectReferences(child, childPath, references, key)
  }
}

function propertiesOf(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const properties = (value as Record<string, unknown>).properties
  return properties && typeof properties === 'object' && !Array.isArray(properties)
    ? (properties as Record<string, unknown>)
    : undefined
}

function nestedProperties(value: unknown, path: string[]): Record<string, unknown> | undefined {
  let current = value
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return propertiesOf(current)
}

function validateContractField(
  field: string,
  properties: Record<string, unknown> | undefined,
  path: string,
  diagnostics: Diagnostic[]
) {
  if (!properties || Object.hasOwn(properties, field)) return
  diagnostics.push(
    diagnostic('error', 'schema.contract.field.unknown', `字段 ${field} 不在 Manifest service 契约中`, path)
  )
}

function validateSchemaFieldList(
  value: unknown,
  properties: Record<string, unknown> | undefined,
  basePath: string,
  diagnostics: Diagnostic[]
) {
  if (!Array.isArray(value)) return
  value.forEach((item, index) => {
    const field = item && typeof item === 'object' && !Array.isArray(item)
      ? (item as Record<string, unknown>).field
      : undefined
    if (typeof field === 'string') {
      validateContractField(field, properties, `${basePath}/${index}/field`, diagnostics)
    }
  })
}

function serviceFields(
  contexts: CapabilityContext[],
  serviceId: unknown,
  direction: 'input' | 'output',
  outputList = false
) {
  if (typeof serviceId !== 'string') return undefined
  const definition = findCapabilityDefinition(contexts, serviceId)
  const schema = definition?.[`${direction}Schema`]
  return outputList
    ? nestedProperties(schema, ['properties', 'items', 'items']) ?? propertiesOf(schema)
    : nestedProperties(schema, ['properties', 'filters']) ?? propertiesOf(schema)
}

function validateSchemaContracts(
  schema: StaticSchemaValue,
  contexts: CapabilityContext[],
  diagnostics: Diagnostic[],
  relativePath: string
) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return
  const dataSource = schema.dataSource
  if (!dataSource || typeof dataSource !== 'object' || Array.isArray(dataSource)) return
  const source = dataSource as Record<string, unknown>
  const listId = source.list
  if (typeof listId !== 'string') return
  const inputFields = serviceFields(contexts, listId, 'input')
  const outputFields = serviceFields(contexts, listId, 'output', true)
  validateSchemaFieldList(schema.search, inputFields, `${relativePath}/search`, diagnostics)
  const columns = schema.table && typeof schema.table === 'object' && !Array.isArray(schema.table)
    ? (schema.table as Record<string, unknown>).columns
    : undefined
  validateSchemaFieldList(columns, outputFields, `${relativePath}/table/columns`, diagnostics)
  const rowKey = schema.table && typeof schema.table === 'object' && !Array.isArray(schema.table)
    ? (schema.table as Record<string, unknown>).rowKey
    : undefined
  const rowKeys = Array.isArray(rowKey) ? rowKey : [rowKey]
  rowKeys.forEach((field, index) => {
    if (typeof field === 'string') validateContractField(field, outputFields, `${relativePath}/table/rowKey${Array.isArray(rowKey) ? `/${index}` : ''}`, diagnostics)
  })
  const form = schema.form
  const formFields = serviceFields(contexts, source.create, 'input') ?? serviceFields(contexts, source.update, 'input')
  validateSchemaFieldList(form, formFields, `${relativePath}/form`, diagnostics)
  const detailFields = schema.detail && typeof schema.detail === 'object' && !Array.isArray(schema.detail)
    ? (schema.detail as Record<string, unknown>).fields
    : undefined
  const detailOutput = serviceFields(contexts, source.detail, 'output')
  validateSchemaFieldList(detailFields, detailOutput, `${relativePath}/detail/fields`, diagnostics)
}

export async function scanTypeScriptSchemas(
  rootDir: string,
  config: ProjectConfig,
  contexts: CapabilityContext[],
  builtInCapabilities: string[],
  adapter?: LowcodeAdapter
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = []
  const pattern = config.schemaFilePattern ?? 'schema.ts'
  const capabilityIds = new Set([...listCapabilities(contexts), ...builtInCapabilities])
  const files = (
    await Promise.all(
      config.allowedPaths.map((allowedPath) => collectSchemaFiles(rootDir, allowedPath, pattern))
    )
  ).flat()

  for (const filePath of files) {
    const relativePath = relative(rootDir, filePath).split(sep).join('/')
    const pageDir = resolve(filePath, '..')
    const registryPath = resolve(pageDir, 'registry.ts')
    const indexPath = resolve(pageDir, 'index.tsx')
    const isRuntimeSource = relativePath.startsWith('packages/best-lowcode-react/')
    for (const required of isRuntimeSource ? [] : [indexPath]) {
      try {
        await access(required)
      } catch {
        const requiredName = 'index.tsx'
        diagnostics.push(
          diagnostic(
            'error',
            'architecture.file.missing',
            `BEST CRUD 页面缺少必需文件：${requiredName}。必须使用 BestCrudPage + schema.ts + registry.ts 链路，不能降级为组件库实现。`,
            relative(rootDir, required).split(sep).join('/')
          )
        )
      }
    }
    try {
      if (isRuntimeSource) throw new Error('runtime source is not a page')
      const indexContent = await readFile(indexPath, 'utf8')
      const architecture = scanPageArchitecture(indexContent, relativePath)
      if (!architecture.hasCrudPage || !architecture.hasProvider) {
        diagnostics.push(
          diagnostic(
            'error',
            'architecture.component.missing',
            'BEST CRUD 页面入口必须渲染 BestProvider 与 BestCrudPage，禁止使用常规组件库页面替代。',
            relative(rootDir, indexPath).split(sep).join('/')
          )
        )
      }
      try {
        await access(registryPath)
      } catch {
        const hasInlineRegistry = /\b(?:listServices|dictionaries|actions|slots|access)\s*:/.test(
          indexContent
        )
        diagnostics.push(
          diagnostic(
            hasInlineRegistry ? 'warning' : 'error',
            hasInlineRegistry ? 'architecture.registry.migrate' : 'architecture.file.missing',
            hasInlineRegistry
              ? '检测到 index.tsx 内联 registry；新页面应使用独立 registry.ts，存量页面请在下一次业务修改时迁移。'
              : 'BEST CRUD 页面缺少必需文件：registry.ts。必须使用 BestCrudPage + schema.ts + registry.ts 链路。',
            relative(rootDir, hasInlineRegistry ? indexPath : registryPath)
              .split(sep)
              .join('/')
          )
        )
      }
      if (architecture.hiddenCrudPage) {
        diagnostics.push(
          diagnostic(
            'error',
            'architecture.runtime.hidden',
            'BestCrudPage 不能被 hidden、aria-hidden 或 display: none 包裹；可见页面必须由 Runtime 渲染。',
            relative(rootDir, indexPath).split(sep).join('/')
          )
        )
      }
    } catch {
      // The missing-file diagnostic above is the actionable error.
    }
    let content: string
    try {
      content = await readFile(filePath, 'utf8')
    } catch (error) {
      diagnostics.push(
        diagnostic(
          'error',
          'schema.scan.read',
          `无法读取 Schema：${error instanceof Error ? error.message : '未知错误'}`,
          relativePath
        )
      )
      continue
    }
    const result = parseStaticCrudSchemas(content, relativePath)
    diagnostics.push(...result.diagnostics)
    const schemas = result.schemas
    for (const schema of schemas) {
      if (adapter?.validateSchema) {
        const schemaDiagnostics = await adapter.validateSchema(schema)
        diagnostics.push(
          ...schemaDiagnostics.map((item) => ({
            ...item,
            path: item.path ? `${relativePath}${item.path}` : relativePath
          }))
        )
      }
      validateSchemaContracts(schema, contexts, diagnostics, relativePath)
      const references: Array<{ id: string; path: string }> = []
      collectReferences(schema, '', references)
      for (const reference of references) {
        if (!capabilityIds.has(reference.id)) {
          diagnostics.push(
            diagnostic(
              'error',
              'schema.reference.unknown',
              `Schema 引用了未注册能力：${reference.id}`,
              `${relativePath}${reference.path}`
            )
          )
        }
      }
    }
  }
  return diagnostics
}
