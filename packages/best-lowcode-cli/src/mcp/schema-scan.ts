import type { Dirent } from 'node:fs'
import { access, readdir, readFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
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
  let hasTabbedPage = false
  let hiddenRuntimePage = false
  function visit(node: ts.Node, hiddenAncestor = false) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      const name = jsxName(opening.tagName)
      const hidden = hiddenAncestor || hasHiddenAttribute(opening)
      if (name === 'BestProvider') hasProvider = true
      if (name === 'BestCrudPage') {
        hasCrudPage = true
        hiddenRuntimePage ||= hidden
      }
      if (name === 'BestTabbedPage') {
        hasTabbedPage = true
        hiddenRuntimePage ||= hidden
      }
      ts.forEachChild(node, (child) => visit(child, hidden))
      return
    }
    ts.forEachChild(node, (child) => visit(child, hiddenAncestor))
  }
  visit(source)
  return { hasProvider, hasCrudPage, hasTabbedPage, hiddenRuntimePage }
}

function schemaRuntimeComponent(schema: StaticSchemaValue): RuntimePageComponent {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return 'BestCrudPage'
  return schema.kind === 'tabs' || schema.$schema === 'https://best.dev/schema/tabs/v1'
    ? 'BestTabbedPage'
    : 'BestCrudPage'
}

type RuntimePageComponent = 'BestCrudPage' | 'BestTabbedPage'

type RegistryServiceBindings = {
  listServices: Map<string, ts.Expression>
  services: Map<string, ts.Expression>
}

type IndexRuntimeBindings = {
  registryBindings: Set<string>
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    node = node.expression
  }
  return node
}

function moduleImportBindings(source: ts.SourceFile, modulePath: string) {
  const bindings = new Set<string>()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const moduleName = statement.moduleSpecifier.text.replace(/\.(?:ts|tsx|js|jsx)$/, '')
    if (moduleName !== modulePath) continue
    const clause = statement.importClause
    if (!clause) continue
    if (clause.name) bindings.add(clause.name.text)
    const namedBindings = clause.namedBindings
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) bindings.add(element.name.text)
    }
  }
  return bindings
}

function jsxAttributeExpression(opening: ts.JsxOpeningLikeElement, attributeName: string) {
  for (const attribute of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attribute)) continue
    const name = ts.isIdentifier(attribute.name) ? attribute.name.text : attribute.name.getText()
    if (name !== attributeName || !attribute.initializer || !ts.isJsxExpression(attribute.initializer)) {
      continue
    }
    return attribute.initializer.expression
  }
  return undefined
}

function isImportedIdentifier(expression: ts.Expression | undefined, bindings: Set<string>) {
  const value = expression && unwrapExpression(expression)
  return Boolean(value && ts.isIdentifier(value) && bindings.has(value.text))
}

function validateIndexBindings(
  indexContent: string,
  indexPath: string,
  expectedComponent: RuntimePageComponent,
  diagnostics: Diagnostic[],
  relativePath: string
): IndexRuntimeBindings {
  const source = ts.createSourceFile(indexPath, indexContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const schemaBindings = moduleImportBindings(source, './schema')
  const registryImportBindings = moduleImportBindings(source, './registry')
  let schemaBound = false
  let runtimeBound = false
  let hasUnboundRuntime = false
  const runtimeRegistryBindings = new Set<string>()
  function importedBinding(expression: ts.Expression | undefined, bindings: Set<string>) {
    const value = expression && unwrapExpression(expression)
    return value && ts.isIdentifier(value) && bindings.has(value.text) ? value.text : undefined
  }
  function visit(node: ts.Node, providerRegistry?: string) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      const name = jsxName(opening.tagName)
      const nextProviderRegistry =
        name === 'BestProvider'
          ? importedBinding(jsxAttributeExpression(opening, 'registry'), registryImportBindings)
          : providerRegistry
      if (name === expectedComponent) {
        if (isImportedIdentifier(jsxAttributeExpression(opening, 'schema'), schemaBindings)) {
          schemaBound = true
          if (nextProviderRegistry) {
            runtimeBound = true
            runtimeRegistryBindings.add(nextProviderRegistry)
          } else {
            hasUnboundRuntime = true
          }
        }
      }
      ts.forEachChild(node, (child) => visit(child, nextProviderRegistry))
      return
    }
    ts.forEachChild(node, (child) => visit(child, providerRegistry))
  }
  visit(source)
  if (!schemaBound) {
    diagnostics.push(
      diagnostic(
        'error',
        'architecture.schema.unbound',
        `${expectedComponent} 的 schema 必须直接导入自 ./schema。`,
        relativePath
      )
    )
  }
  if (!runtimeBound || hasUnboundRuntime) {
    diagnostics.push(
      diagnostic(
        'error',
        'architecture.registry.unbound',
        `${expectedComponent} 必须作为引用 ./registry 的 BestProvider 后代渲染。`,
        relativePath
      )
    )
  }
  return { registryBindings: runtimeRegistryBindings }
}

function registryServiceBindings(
  content: string,
  registryPath: string,
  registryBinding: string
): RegistryServiceBindings {
  const source = ts.createSourceFile(registryPath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const bindings: RegistryServiceBindings = { listServices: new Map(), services: new Map() }
  function collectMappings(value: ts.Expression) {
    value = unwrapExpression(value)
    if (!ts.isObjectLiteralExpression(value)) return
    for (const property of value.properties) {
      if (!ts.isPropertyAssignment(property)) continue
      const group = property.name.getText()
      const mappings = unwrapExpression(property.initializer)
      if ((group !== 'listServices' && group !== 'services') || !ts.isObjectLiteralExpression(mappings)) continue
      for (const mapping of mappings.properties) {
        if (!ts.isPropertyAssignment(mapping)) continue
        const key = ts.isIdentifier(mapping.name) || ts.isStringLiteral(mapping.name)
          ? mapping.name.text
          : undefined
        if (key) bindings[group].set(key, mapping.initializer)
      }
    }
  }
  for (const statement of source.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      continue
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === registryBinding &&
        declaration.initializer
      ) {
        collectMappings(declaration.initializer)
      }
    }
  }
  return bindings
}

function isStaticRecord(value: StaticSchemaValue): value is Record<string, StaticSchemaValue> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isCrudSchema(schema: Record<string, StaticSchemaValue>) {
  return schema.kind === 'crud' || schema.$schema === 'https://best.dev/schema/crud/v1'
}

/**
 * A tabbed page can embed CRUD schemas directly in `tabs[].content.schema`.
 * Collect them recursively so mapping and service-contract checks enforce the
 * same boundary whether a CRUD schema is declared separately or inline.
 */
function collectCrudSchemas(schemas: Array<Record<string, StaticSchemaValue>>) {
  const result: Array<Record<string, StaticSchemaValue>> = []
  const seen = new Set<string>()
  function visit(value: StaticSchemaValue) {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!isStaticRecord(value)) return
    if (isCrudSchema(value)) {
      // An exported CRUD schema may also be referenced by a tab. The static
      // evaluator produces separate objects in that case, so dedupe by value.
      const fingerprint = JSON.stringify(value)
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint)
        result.push(value)
      }
    }
    Object.values(value).forEach(visit)
  }
  schemas.forEach(visit)
  return result
}

function schemaServiceReferences(schemas: Array<Record<string, StaticSchemaValue>>) {
  const services: Array<{ id: string; group: keyof RegistryServiceBindings }> = []
  for (const schema of collectCrudSchemas(schemas)) {
    const dataSource = schema.dataSource
    if (!isStaticRecord(dataSource)) continue
    for (const key of ['list', 'detail', 'create', 'update', 'remove'] as const) {
      const id = dataSource[key]
      if (typeof id === 'string') services.push({ id, group: key === 'list' ? 'listServices' : 'services' })
    }
  }
  return services
}

function validateRegistryAdapterBindings(
  schemas: Array<Record<string, StaticSchemaValue>>,
  registryContent: string,
  registryPath: string,
  registryBindings: Set<string>,
  diagnostics: Diagnostic[],
  relativePath: string
) {
  const source = ts.createSourceFile(registryPath, registryContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const adapterBindings = moduleImportBindings(source, './adapter')
  for (const registryBinding of registryBindings) {
    const mappings = registryServiceBindings(registryContent, registryPath, registryBinding)
    const seen = new Set<string>()
    for (const { id, group } of schemaServiceReferences(schemas)) {
    const key = `${group}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    const implementation = mappings[group].get(id)
    if (!implementation) {
      diagnostics.push(
        diagnostic(
          'error',
          'architecture.registry.service.missing',
          `Schema 服务 ${id} 未映射到 registry.${group}。`,
          relativePath
        )
      )
      continue
    }
    if (!isImportedIdentifier(implementation, adapterBindings)) {
      diagnostics.push(
        diagnostic(
          'error',
          'architecture.adapter.service.unmapped',
          `Schema 服务 ${id} 必须映射到从 ./adapter 导入的实现。`,
          relativePath
        )
      )
    }
    }
  }
}

async function collectTypeScriptFiles(rootDir: string) {
  const files: string[] = []
  const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage'])
  async function visit(directory: string) {
    let entries: Dirent<string>[]
    try {
      entries = await readdir(directory, { encoding: 'utf8', withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) await visit(resolve(directory, entry.name))
      if (entry.isFile() && /\.(?:tsx?|jsx?)$/.test(entry.name)) files.push(resolve(directory, entry.name))
    }
  }
  await visit(rootDir)
  return files
}

function importsPageComponent(
  source: ts.SourceFile,
  sourcePath: string,
  indexPath: string
) {
  const bindings = new Set<string>()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const specifier = statement.moduleSpecifier.text
    if (!specifier.startsWith('.')) continue
    const importedIndex = resolve(dirname(sourcePath), specifier, 'index.tsx')
    if (importedIndex !== indexPath) continue
    const clause = statement.importClause
    if (!clause) continue
    if (clause.name) bindings.add(clause.name.text)
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) bindings.add(element.name.text)
    }
  }
  return bindings
}

function routeMountsPage(source: ts.SourceFile, componentBindings: Set<string>) {
  let mounted = false
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      if (jsxName(opening.tagName) === 'Route') {
        const element = jsxAttributeExpression(opening, 'element')
        const value = element && unwrapExpression(element)
        const component =
          value && (ts.isJsxElement(value) || ts.isJsxSelfClosingElement(value))
            ? jsxName(ts.isJsxElement(value) ? value.openingElement.tagName : value.tagName)
            : undefined
        mounted ||= Boolean(component && componentBindings.has(component))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return mounted
}

type TypeScriptSource = { path: string; source: ts.SourceFile }

async function loadTypeScriptSources(rootDir: string): Promise<TypeScriptSource[]> {
  const files = await collectTypeScriptFiles(rootDir)
  const sources = await Promise.all(
    files.map(async (filePath) => {
      try {
        return {
          path: filePath,
          source: ts.createSourceFile(
            filePath,
            await readFile(filePath, 'utf8'),
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX
          )
        }
      } catch {
        return undefined
      }
    })
  )
  return sources.filter((source): source is TypeScriptSource => Boolean(source))
}

function isPageMountedByRoute(sources: TypeScriptSource[], indexPath: string) {
  for (const { path, source } of sources) {
    const bindings = importsPageComponent(source, path, indexPath)
    if (bindings.size && routeMountsPage(source, bindings)) return true
  }
  return false
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
        (key === 'list' || key === 'detail' || key === 'create' || key === 'update' || key === 'remove')
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
  const routeSources = await loadTypeScriptSources(rootDir)

  for (const filePath of files) {
    const relativePath = relative(rootDir, filePath).split(sep).join('/')
    const pageDir = resolve(filePath, '..')
    const registryPath = resolve(pageDir, 'registry.ts')
    const indexPath = resolve(pageDir, 'index.tsx')
    const isRuntimeSource = relativePath.startsWith('packages/best-lowcode-react/')
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
    const expectedComponent = schemas.some(
      (schema) => schemaRuntimeComponent(schema) === 'BestTabbedPage'
    )
      ? 'BestTabbedPage'
      : 'BestCrudPage'
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
      const hasExpectedComponent =
        expectedComponent === 'BestTabbedPage' ? architecture.hasTabbedPage : architecture.hasCrudPage
      if (!hasExpectedComponent || !architecture.hasProvider) {
        diagnostics.push(
          diagnostic(
            'error',
            'architecture.component.missing',
            `BEST 页面入口必须渲染 BestProvider 与 ${expectedComponent}，禁止使用常规组件库页面替代。`,
            relative(rootDir, indexPath).split(sep).join('/')
          )
        )
      }
      const indexBindings = validateIndexBindings(
        indexContent,
        indexPath,
        expectedComponent,
        diagnostics,
        relativePath
      )
      try {
        const registryContent = await readFile(registryPath, 'utf8')
        const adapterPath = resolve(pageDir, 'adapter.ts')
        if (schemaServiceReferences(schemas).length) {
          try {
            await access(adapterPath)
          } catch {
            diagnostics.push(
              diagnostic(
                'error',
                'architecture.adapter.file.missing',
                'BEST 页面 registry 使用服务映射时必须提供 adapter.ts。',
                relative(rootDir, adapterPath).split(sep).join('/')
              )
            )
          }
        }
        validateRegistryAdapterBindings(
          schemas,
          registryContent,
          registryPath,
          // Every Provider branch that can render this schema must have a
          // complete mapping; a valid sibling registry cannot mask a broken one.
          // An empty set is already reported by validateIndexBindings.
          indexBindings.registryBindings,
          diagnostics,
          relativePath
        )
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
      if (architecture.hiddenRuntimePage) {
        diagnostics.push(
          diagnostic(
            'error',
            'architecture.runtime.hidden',
            `${expectedComponent} 不能被 hidden、aria-hidden 或 display: none 包裹；可见页面必须由 Runtime 渲染。`,
            relative(rootDir, indexPath).split(sep).join('/')
          )
        )
      }
      if (!isPageMountedByRoute(routeSources, indexPath)) {
        diagnostics.push(
          diagnostic(
            'error',
            'architecture.route.unmounted',
            'BEST 页面未发现 React Router Route 挂载。',
            relative(rootDir, indexPath).split(sep).join('/')
          )
        )
      }
    } catch {
      // The missing-file diagnostic above is the actionable error.
    }
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
    for (const schema of collectCrudSchemas(schemas)) {
      validateSchemaContracts(schema, contexts, diagnostics, relativePath)
    }
  }
  return diagnostics
}
