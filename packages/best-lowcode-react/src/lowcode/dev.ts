import {
  CRUD_SCHEMA_ID,
  TABBED_PAGE_SCHEMA_ID
} from './schema'
import type {
  CRUD_SCHEMA_VERSION,
  CrudPageSchema,
  FieldSchema,
  PageActionSchema,
  TABBED_PAGE_SCHEMA_VERSION,
  TabbedPageSchema
} from './schema'
import type { SchemaDiagnostic, SchemaValidationResult } from './validate'
import { validateCrudPageSchema, validateTabbedPageSchema } from './validate'

const builtInCapabilities = [
  'builtin.effect.openCreate',
  'builtin.effect.openDetail',
  'builtin.effect.openEdit',
  'builtin.effect.remove',
  'builtin.effect.runAction',
  'builtin.effect.slot',
  'builtin.format.date',
  'builtin.format.datetime',
  'builtin.format.money',
  'builtin.format.text',
  'builtin.field.input',
  'builtin.field.number',
  'builtin.field.select',
  'builtin.field.remoteSelect',
  'builtin.field.date',
  'builtin.field.dateRange',
  'builtin.field.textarea',
  'builtin.field.slot',
  'builtin.field.repeatable'
] as const

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function arrayOfRecords(value: unknown): JsonRecord[] | undefined {
  return Array.isArray(value) && value.every(isRecord) ? value : undefined
}

function diagnostic(path: string, code: string, message: string): SchemaDiagnostic {
  return { path, code, message }
}

function validateUnknownShape(candidate: unknown): SchemaDiagnostic[] {
  if (!isRecord(candidate)) return [diagnostic('', 'schema.type', 'Schema 必须是 JSON 对象')]
  const diagnostics: SchemaDiagnostic[] = []
  if (!isRecord(candidate.dataSource))
    diagnostics.push(diagnostic('/dataSource', 'dataSource.type', 'dataSource 必须是对象'))
  if (!isRecord(candidate.table))
    diagnostics.push(diagnostic('/table', 'table.type', 'table 必须是对象'))
  for (const key of ['search', 'form'] as const) {
    if (candidate[key] !== undefined && !arrayOfRecords(candidate[key])) {
      diagnostics.push(diagnostic(`/${key}`, 'field.list', `${key} 必须是对象数组`))
    }
  }
  if (isRecord(candidate.table)) {
    if (!arrayOfRecords(candidate.table.columns)) {
      diagnostics.push(diagnostic('/table/columns', 'column.list', 'columns 必须是对象数组'))
    }
    if (candidate.table.actions !== undefined && !arrayOfRecords(candidate.table.actions)) {
      diagnostics.push(diagnostic('/table/actions', 'action.list', 'actions 必须是对象数组'))
    }
  }
  if (candidate.toolbar !== undefined && !arrayOfRecords(candidate.toolbar)) {
    diagnostics.push(diagnostic('/toolbar', 'action.list', 'toolbar 必须是对象数组'))
  }
  return diagnostics
}

function toRuntimeSchema(candidate: JsonRecord): CrudPageSchema {
  return {
    $schema: candidate.$schema as typeof CRUD_SCHEMA_ID,
    version: candidate.version as typeof CRUD_SCHEMA_VERSION,
    id: candidate.id as string,
    kind: candidate.kind as 'crud',
    title: candidate.title as string,
    dataSource: candidate.dataSource as CrudPageSchema['dataSource'],
    search: candidate.search as FieldSchema[] | undefined,
    searchMode: candidate.searchMode as CrudPageSchema['searchMode'],
    form: candidate.form as FieldSchema[] | undefined,
    table: candidate.table as CrudPageSchema['table'],
    detail: candidate.detail as CrudPageSchema['detail'],
    toolbar: candidate.toolbar as PageActionSchema[] | undefined,
    meta: candidate.meta as CrudPageSchema['meta']
  }
}

function toRuntimeTabbedSchema(candidate: JsonRecord): TabbedPageSchema {
  return {
    $schema: candidate.$schema as typeof TABBED_PAGE_SCHEMA_ID,
    version: candidate.version as typeof TABBED_PAGE_SCHEMA_VERSION,
    id: candidate.id as string,
    kind: candidate.kind as 'tabs',
    tabs: candidate.tabs as TabbedPageSchema['tabs']
  }
}

/**
 * Server-safe development entry. It accepts unknown JSON from CLI/MCP before delegating to the
 * runtime validator, so untrusted candidates cannot trigger assumptions in typed runtime code.
 */
export function validateUnknownCrudPageSchema(candidate: unknown): SchemaValidationResult {
  const shapeDiagnostics = validateUnknownShape(candidate)
  if (shapeDiagnostics.length || !isRecord(candidate)) {
    return { valid: false, diagnostics: shapeDiagnostics }
  }
  return validateCrudPageSchema(toRuntimeSchema(candidate))
}

/** Validates every page schema the Runtime can render without importing React. */
export function validateUnknownPageSchema(candidate: unknown): SchemaValidationResult {
  if (!isRecord(candidate)) return validateUnknownCrudPageSchema(candidate)
  if (candidate.kind === 'crud' || candidate.$schema === CRUD_SCHEMA_ID) {
    return validateUnknownCrudPageSchema(candidate)
  }
  if (candidate.kind !== 'tabs' && candidate.$schema !== TABBED_PAGE_SCHEMA_ID)
    return validateUnknownCrudPageSchema(candidate)
  if (!Array.isArray(candidate.tabs) || !candidate.tabs.every(isRecord)) {
    return {
      valid: false,
      diagnostics: [diagnostic('/tabs', 'tabs.type', 'tabs 必须是对象数组')]
    }
  }
  for (const [index, tab] of candidate.tabs.entries()) {
    const contentPath = `/tabs/${index}/content`
    if (!isRecord(tab.content)) {
      return {
        valid: false,
        diagnostics: [diagnostic(contentPath, 'tabs.content', 'tab content 必须是 CRUD 或 Slot')]
      }
    }
    if (tab.content.type !== 'crud' && tab.content.type !== 'slot') {
      return {
        valid: false,
        diagnostics: [diagnostic(`${contentPath}/type`, 'tabs.content', 'tab content 必须是 CRUD 或 Slot')]
      }
    }
    if (tab.content.type === 'crud' && !isRecord(tab.content.schema)) {
      return {
        valid: false,
        diagnostics: [diagnostic(`${contentPath}/schema`, 'tabs.content', 'CRUD tab 必须提供对象 schema')]
      }
    }
    if (tab.content.type === 'crud') {
      const result = validateUnknownCrudPageSchema(tab.content.schema)
      if (!result.valid) {
        return {
          valid: false,
          diagnostics: result.diagnostics.map((item) => ({
            ...item,
            path: `${contentPath}/schema${item.path}`
          }))
        }
      }
    }
  }
  return validateTabbedPageSchema(toRuntimeTabbedSchema(candidate))
}

/** Serializable capabilities supplied by the current runtime without application Manifest entries. */
export function getBuiltinCapabilities(): string[] {
  return [...builtInCapabilities]
}
