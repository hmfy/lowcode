import type { Dirent } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import { resolveAllowedPath } from './config'
import { diagnostic } from './diagnostics'
import { parseCapabilityManifest } from './manifest'
import type {
  CapabilityManifest,
  Diagnostic,
  ManifestDiscoveryResult,
  ProjectConfig
} from './types'

type CapabilityKind = 'services' | 'dictionaries' | 'actions' | 'slots' | 'access'
type CapabilitySets = Record<CapabilityKind, Set<string>>
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const CAPABILITY_KINDS: CapabilityKind[] = [
  'services',
  'dictionaries',
  'actions',
  'slots',
  'access'
]
const IDENTIFIERS: Record<string, JsonValue> = {
  CRUD_SCHEMA_ID: 'https://best.dev/schema/crud/v1',
  CRUD_SCHEMA_VERSION: 1
}

function emptyCapabilitySets(): CapabilitySets {
  return {
    services: new Set(),
    dictionaries: new Set(),
    actions: new Set(),
    slots: new Set(),
    access: new Set()
  }
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text
  return undefined
}

function unwrap(node: ts.Expression): ts.Expression {
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

function evaluate(node: ts.Expression): JsonValue | undefined {
  node = unwrap(node)
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isIdentifier(node) && node.text in IDENTIFIERS) return IDENTIFIERS[node.text]
  if (ts.isArrayLiteralExpression(node)) {
    const values: JsonValue[] = []
    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) return undefined
      const value = evaluate(element)
      if (value === undefined) return undefined
      values.push(value)
    }
    return values
  }
  if (ts.isObjectLiteralExpression(node)) {
    const value: Record<string, JsonValue> = {}
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue
      const name = propertyName(property.name)
      const propertyValue = evaluate(property.initializer)
      if (name && propertyValue !== undefined) value[name] = propertyValue
    }
    return value
  }
  return undefined
}

function findCrudSchema(sourceFile: ts.SourceFile): Record<string, JsonValue> | undefined {
  let schema: Record<string, JsonValue> | undefined
  function visit(node: ts.Node) {
    if (schema) return
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const value = evaluate(node.initializer)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const candidate = value as Record<string, JsonValue>
        if (candidate.$schema === IDENTIFIERS.CRUD_SCHEMA_ID || candidate.kind === 'crud') {
          schema = candidate
          return
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return schema
}

function collectSchemaReferences(
  value: JsonValue,
  capabilities: CapabilitySets,
  parentKey?: string
) {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaReferences(item, capabilities, parentKey)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string') {
      if (
        parentKey === 'dataSource' &&
        (key === 'list' || key === 'detail' || key === 'create' || key === 'update')
      ) {
        capabilities.services.add(child)
      } else if (key === 'dict') capabilities.dictionaries.add(child)
      else if (key === 'action') capabilities.actions.add(child)
      else if (key === 'slot') capabilities.slots.add(child)
      else if (key === 'access') capabilities.access.add(child)
    }
    collectSchemaReferences(child, capabilities, key)
  }
}

function objectProperty(node: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const property of node.properties) {
    if (ts.isPropertyAssignment(property) && propertyName(property.name) === name) {
      return property.initializer
    }
  }
  return undefined
}

function collectRegistryCapabilities(sourceFile: ts.SourceFile): CapabilitySets {
  const capabilities = emptyCapabilitySets()
  function visit(node: ts.Node) {
    if (ts.isObjectLiteralExpression(node)) {
      const hasRegistryProperty =
        CAPABILITY_KINDS.some((kind) => objectProperty(node, kind)) ||
        Boolean(objectProperty(node, 'listServices'))
      if (hasRegistryProperty) {
        for (const kind of CAPABILITY_KINDS) {
          const values =
            kind === 'services'
              ? [objectProperty(node, 'listServices'), objectProperty(node, 'services')]
              : [objectProperty(node, kind)]
          for (const value of values) {
            const registryValue = value && unwrap(value)
            if (!registryValue || !ts.isObjectLiteralExpression(registryValue)) continue
            for (const property of registryValue.properties) {
              if (!ts.isPropertyAssignment(property) && !ts.isMethodDeclaration(property)) continue
              const name = propertyName(property.name)
              if (name) capabilities[kind].add(name)
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return capabilities
}

async function collectSchemaFiles(rootDir: string, config: ProjectConfig) {
  const pattern = config.schemaFilePattern ?? 'schema.ts'
  const files: string[] = []
  async function visit(directory: string) {
    let entries: Dirent<string>[]
    try {
      entries = await readdir(directory, { encoding: 'utf8', withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && entry.name === pattern) files.push(path)
    }
  }
  for (const allowedPath of config.allowedPaths) {
    const base = resolveAllowedPath(rootDir, [allowedPath], allowedPath)
    if (base) await visit(base)
  }
  return files
}

async function readPageRegistry(schemaPath: string) {
  const pageDir = dirname(schemaPath)
  const registryPath = resolve(pageDir, 'registry.ts')
  const indexPath = resolve(pageDir, 'index.tsx')
  try {
    const indexContent = await readFile(indexPath, 'utf8')
    if (!indexContent.includes('BestCrudPage')) return undefined
    let pagePath = registryPath
    let content: string
    try {
      content = await readFile(registryPath, 'utf8')
    } catch {
      // Keep supporting legacy pages that still define their registry inline in index.tsx.
      pagePath = indexPath
      content = indexContent
    }
    return collectRegistryCapabilities(
      ts.createSourceFile(pagePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    )
  } catch {
    return undefined
  }
}

function intersect(a: CapabilitySets, b: CapabilitySets): CapabilitySets {
  const result = emptyCapabilitySets()
  for (const kind of CAPABILITY_KINDS) {
    for (const id of a[kind]) if (b[kind].has(id)) result[kind].add(id)
  }
  return result
}

function mergeManifest(
  existing: CapabilityManifest,
  discovered: CapabilitySets
): CapabilityManifest {
  const services = { ...(existing.services ?? {}) }
  for (const id of [...discovered.services].sort()) {
    services[id] ??= { description: '由页面 registry 自动发现' }
  }
  const list = (kind: Exclude<CapabilityKind, 'services'>) => [
    ...(existing[kind] ?? []),
    ...[...discovered[kind]].filter((id) => !existing[kind]?.includes(id)).sort()
  ]
  return {
    version: 1,
    ...(existing.services !== undefined || Object.keys(services).length
      ? { services: Object.fromEntries(Object.entries(services).sort()) }
      : {}),
    ...(existing.dictionaries !== undefined || list('dictionaries').length
      ? { dictionaries: list('dictionaries') }
      : {}),
    ...(existing.actions !== undefined || list('actions').length
      ? { actions: list('actions') }
      : {}),
    ...(existing.slots !== undefined || list('slots').length ? { slots: list('slots') } : {}),
    ...(existing.access !== undefined || list('access').length ? { access: list('access') } : {})
  }
}

function hasManifestAdditions(existing: CapabilityManifest, discovered: CapabilitySets) {
  if ([...discovered.services].some((id) => !existing.services?.[id])) return true
  return CAPABILITY_KINDS.filter((kind) => kind !== 'services').some((kind) =>
    [...discovered[kind]].some((id) => !existing[kind]?.includes(id))
  )
}

export async function syncManifestDiscovery(
  rootDir: string,
  config: ProjectConfig,
  write = false
): Promise<ManifestDiscoveryResult> {
  const diagnostics: Diagnostic[] = []
  if (config.manifestPaths.length !== 1) {
    return {
      written: false,
      pages: [],
      diagnostics: [
        diagnostic(
          'error',
          'manifest.sync.target.ambiguous',
          '全项目发现仅支持配置一个 manifestPaths 目标；请先收敛为单个 Manifest。'
        )
      ]
    }
  }
  const manifestPath = config.manifestPaths[0]
  if (!manifestPath) {
    return { written: false, pages: [], diagnostics }
  }
  const absoluteManifestPath = resolve(rootDir, manifestPath)
  let before: string
  let existing: CapabilityManifest
  try {
    before = await readFile(absoluteManifestPath, 'utf8')
    const parsed = parseCapabilityManifest(JSON.parse(before) as unknown)
    diagnostics.push(...parsed.diagnostics.map((item) => ({ ...item, path: manifestPath })))
    if (!parsed.manifest) return { written: false, pages: [], diagnostics }
    existing = parsed.manifest
  } catch (error) {
    return {
      written: false,
      pages: [],
      diagnostics: [
        diagnostic(
          'error',
          'manifest.sync.read',
          `无法读取 Manifest：${error instanceof Error ? error.message : '未知错误'}`,
          manifestPath
        )
      ]
    }
  }

  const discovered = emptyCapabilitySets()
  const pages: string[] = []
  for (const schemaPath of await collectSchemaFiles(rootDir, config)) {
    const content = await readFile(schemaPath, 'utf8')
    const schema = findCrudSchema(
      ts.createSourceFile(schemaPath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    )
    if (!schema) continue
    const registry = await readPageRegistry(schemaPath)
    if (!registry) continue
    const referenced = emptyCapabilitySets()
    collectSchemaReferences(schema, referenced)
    const pageCapabilities = intersect(referenced, registry)
    for (const kind of CAPABILITY_KINDS) {
      if (kind === 'access') {
        for (const id of referenced.access) discovered.access.add(id)
        continue
      }
      for (const id of pageCapabilities[kind]) discovered[kind].add(id)
      for (const id of referenced[kind]) {
        if (!registry[kind].has(id)) {
          diagnostics.push(
            diagnostic(
              'warning',
              'manifest.sync.registry.missing',
              `Schema 引用了未在同页 registry 中发现的 ${kind}：${id}`,
              relative(rootDir, schemaPath).split(sep).join('/')
            )
          )
        }
      }
    }
    pages.push(relative(rootDir, dirname(schemaPath)).split(sep).join('/'))
  }

  const after = hasManifestAdditions(existing, discovered)
    ? `${JSON.stringify(mergeManifest(existing, discovered), null, 2)}\n`
    : before
  if (write && before !== after) await writeFile(absoluteManifestPath, after)
  return {
    written: write && before !== after,
    pages: [...new Set(pages)].sort(),
    preview: { targetPath: manifestPath, exists: true, diff: { before, after }, diagnostics },
    diagnostics
  }
}
