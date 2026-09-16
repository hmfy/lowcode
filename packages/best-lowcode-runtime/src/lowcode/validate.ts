import type { BestRegistry } from '../runtime'
import {
  type Condition,
  CRUD_SCHEMA_ID,
  CRUD_SCHEMA_VERSION,
  type CrudPageSchema,
  type FieldSchema,
  type PageActionSchema,
  TABBED_PAGE_SCHEMA_ID,
  TABBED_PAGE_SCHEMA_VERSION,
  type TabbedPageSchema
} from './schema'

export type SchemaDiagnostic = {
  path: string
  code: string
  message: string
}

export type SchemaValidationResult = {
  valid: boolean
  diagnostics: SchemaDiagnostic[]
}

const fieldComponents = new Set([
  'input',
  'number',
  'select',
  'remoteSelect',
  'date',
  'dateRange',
  'textarea',
  'slot',
  'repeatable'
])
const builtInEffects = new Set([
  'openCreate',
  'openDetail',
  'openEdit',
  'remove',
  'runAction',
  'slot'
])
const columnFormats = new Set(['date', 'datetime', 'money', 'text'])

function push(diagnostics: SchemaDiagnostic[], path: string, code: string, message: string) {
  diagnostics.push({ path, code, message })
}

function validateCondition(condition: Condition, path: string, diagnostics: SchemaDiagnostic[]) {
  if (!condition || typeof condition !== 'object') {
    push(diagnostics, path, 'condition.type', '条件必须是对象')
    return
  }
  if (condition.operator === 'equals') {
    if (typeof condition.field !== 'string' || condition.field === '') {
      push(diagnostics, path, 'condition.field', 'equals 条件必须指定字段名')
    }
    return
  }
  if (condition.operator === 'notEmpty') {
    if (typeof condition.field !== 'string' || condition.field === '') {
      push(diagnostics, path, 'condition.field', 'notEmpty 条件必须指定字段名')
    }
    return
  }
  if (condition.operator === 'modeEquals') {
    return
  }
  if (
    (condition.operator === 'and' || condition.operator === 'or') &&
    !Array.isArray(condition.conditions)
  ) {
    push(diagnostics, path, 'condition.conditions', '组合条件必须指定 conditions 数组')
    return
  }
  if (condition.operator === 'and' || condition.operator === 'or') {
    if (condition.conditions.length === 0) {
      push(diagnostics, path, 'condition.empty', '组合条件至少需要一个子条件')
    }
    condition.conditions.forEach((item, index) => {
      validateCondition(item, `${path}/conditions/${index}`, diagnostics)
    })
    return
  }
  if (condition.operator === 'not') {
    if (!condition.condition) {
      push(diagnostics, path, 'condition.missing', 'not 条件必须指定 condition')
      return
    }
    validateCondition(condition.condition, `${path}/condition`, diagnostics)
    return
  }
  push(diagnostics, path, 'condition.operator', `不支持的条件：${(condition as { operator?: unknown }).operator}`)
}

function validateFields(
  fields: FieldSchema[] | undefined,
  path: string,
  registry: BestRegistry | undefined,
  diagnostics: SchemaDiagnostic[]
) {
  const seen = new Set<string>()
  fields?.forEach((field, index) => {
    const fieldPath = `${path}/${index}`
    if (!field.field) push(diagnostics, fieldPath, 'field.missing', '字段名不能为空')
    if (seen.has(field.field))
      push(diagnostics, fieldPath, 'field.duplicate', `字段重复：${field.field}`)
    seen.add(field.field)
    if (!fieldComponents.has(field.component))
      push(diagnostics, fieldPath, 'field.component', `不支持的组件：${field.component}`)
    if (field.dict && registry && !registry.dictionaries[field.dict]) {
      push(diagnostics, fieldPath, 'registry.dictionary', `未注册字典：${field.dict}`)
    }
    if (field.component === 'remoteSelect' && !field.remoteService)
      push(diagnostics, fieldPath, 'field.remoteService', 'remoteSelect 必须指定 remoteService')
    if (field.remoteService && registry && !registry.services[field.remoteService])
      push(diagnostics, fieldPath, 'registry.service', `未注册服务：${field.remoteService}`)
    if (field.component === 'slot' && !field.slot)
      push(diagnostics, fieldPath, 'field.slot', 'slot 组件必须指定 slot key')
    if (field.component === 'repeatable' && !field.itemFields?.length)
      push(
        diagnostics,
        fieldPath,
        'field.repeatable',
        'repeatable 组件至少需要一个 itemFields 字段'
      )
    if (field.itemFields?.length)
      validateFields(
        field.itemFields as FieldSchema[],
        `${fieldPath}/itemFields`,
        registry,
        diagnostics
      )
    if (
      field.minItems !== undefined &&
      field.maxItems !== undefined &&
      field.minItems > field.maxItems
    )
      push(diagnostics, fieldPath, 'field.repeatable.range', 'minItems 不能大于 maxItems')
    if (field.slot && registry && !registry.slots[field.slot])
      push(diagnostics, fieldPath, 'registry.slot', `未注册插槽：${field.slot}`)
    if (field.visibleWhen)
      validateCondition(field.visibleWhen, `${fieldPath}/visibleWhen`, diagnostics)
    if (field.disabledWhen)
      validateCondition(field.disabledWhen, `${fieldPath}/disabledWhen`, diagnostics)
  })
}

function validateActions(
  actions: PageActionSchema[] | undefined,
  path: string,
  registry: BestRegistry | undefined,
  hasRemoveService: boolean,
  diagnostics: SchemaDiagnostic[]
) {
  actions?.forEach((action, index) => {
    const actionPath = `${path}/${index}`
    if (!action.id) push(diagnostics, actionPath, 'action.missing', '动作 id 不能为空')
    if (!builtInEffects.has(action.effect))
      push(diagnostics, actionPath, 'action.effect', `不支持的动作：${action.effect}`)
    if (action.effect === 'runAction' && !action.action)
      push(diagnostics, actionPath, 'action.key', 'runAction 必须指定 action key')
    if (action.effect === 'remove' && !hasRemoveService)
      push(diagnostics, actionPath, 'action.removeService', 'remove 动作必须配置 dataSource.remove')
    if (action.effect === 'slot' && !action.slot)
      push(diagnostics, actionPath, 'action.slot', 'slot 动作必须指定 slot key')
    if (action.action && registry && !registry.actions[action.action]) {
      push(diagnostics, actionPath, 'registry.action', `未注册动作：${action.action}`)
    }
    if (action.slot && registry && !registry.slots[action.slot]) {
      push(diagnostics, actionPath, 'registry.slot', `未注册插槽：${action.slot}`)
    }
  })
}

export function validateCrudPageSchema(
  schema: CrudPageSchema,
  registry?: BestRegistry
): SchemaValidationResult {
  const diagnostics: SchemaDiagnostic[] = []
  if (schema.$schema !== CRUD_SCHEMA_ID)
    push(diagnostics, '/$schema', 'schema.id', `仅支持 ${CRUD_SCHEMA_ID}`)
  if (schema.version !== CRUD_SCHEMA_VERSION)
    push(diagnostics, '/version', 'schema.version', `仅支持版本 ${CRUD_SCHEMA_VERSION}`)
  if (!schema.id) push(diagnostics, '/id', 'page.id', '页面 id 不能为空')
  if (!schema.title) push(diagnostics, '/title', 'page.title', '页面标题不能为空')
  if (!schema.dataSource?.list)
    push(diagnostics, '/dataSource/list', 'service.list', '列表服务不能为空')
  if (schema.dataSource?.list && registry && !registry.listServices[schema.dataSource.list]) {
    push(
      diagnostics,
      '/dataSource/list',
      'registry.service',
      `未注册服务：${schema.dataSource.list}`
    )
  }
  if (schema.dataSource?.detail && registry && !registry.services[schema.dataSource.detail]) {
    push(
      diagnostics,
      '/dataSource/detail',
      'registry.service',
      `未注册服务：${schema.dataSource.detail}`
    )
  }
  if (schema.dataSource?.create && registry && !registry.services[schema.dataSource.create]) {
    push(
      diagnostics,
      '/dataSource/create',
      'registry.service',
      `未注册服务：${schema.dataSource.create}`
    )
  }
  if (schema.dataSource?.update && registry && !registry.services[schema.dataSource.update]) {
    push(
      diagnostics,
      '/dataSource/update',
      'registry.service',
      `未注册服务：${schema.dataSource.update}`
    )
  }
  if (schema.dataSource?.remove && registry && !registry.services[schema.dataSource.remove]) {
    push(
      diagnostics,
      '/dataSource/remove',
      'registry.service',
      `未注册服务：${schema.dataSource.remove}`
    )
  }
  validateFields(schema.search, '/search', registry, diagnostics)
  validateFields(schema.form, '/form', registry, diagnostics)
  if (!schema.table?.rowKey) push(diagnostics, '/table/rowKey', 'table.rowKey', 'rowKey 不能为空')
  if (!schema.table?.columns?.length)
    push(diagnostics, '/table/columns', 'table.columns', '至少需要一列')
  schema.table?.columns?.forEach((column, index) => {
    if (column.fixed !== undefined && column.fixed !== 'left' && column.fixed !== 'right') {
      push(
        diagnostics,
        `/table/columns/${index}/fixed`,
        'column.fixed',
        `不支持的固定位置：${column.fixed}`
      )
    }
    if (column.format && !columnFormats.has(column.format)) {
      push(
        diagnostics,
        `/table/columns/${index}/format`,
        'column.format',
        `不支持的格式：${column.format}`
      )
    }
    if (column.dict && registry && !registry.dictionaries[column.dict]) {
      push(
        diagnostics,
        `/table/columns/${index}/dict`,
        'registry.dictionary',
        `未注册字典：${column.dict}`
      )
    }
    if (column.slot && registry && !registry.slots[column.slot]) {
      push(
        diagnostics,
        `/table/columns/${index}/slot`,
        'registry.slot',
        `未注册插槽：${column.slot}`
      )
    }
  })
  if (schema.detail !== undefined) {
    if (
      !schema.detail ||
      typeof schema.detail !== 'object' ||
      !Array.isArray(schema.detail.fields)
    ) {
      push(diagnostics, '/detail', 'detail.type', 'detail 必须包含 fields 对象数组')
    } else {
      schema.detail.fields.forEach((field, index) => {
        if (field.slot && registry && !registry.slots[field.slot])
          push(
            diagnostics,
            `/detail/fields/${index}/slot`,
            'registry.slot',
            `未注册插槽：${field.slot}`
          )
      })
    }
  }
  validateActions(
    schema.table?.actions,
    '/table/actions',
    registry,
    Boolean(schema.dataSource?.remove),
    diagnostics
  )
  validateActions(
    schema.toolbar,
    '/toolbar',
    registry,
    Boolean(schema.dataSource?.remove),
    diagnostics
  )
  return { valid: diagnostics.length === 0, diagnostics }
}

export function assertValidCrudPageSchema(schema: CrudPageSchema, registry?: BestRegistry) {
  const result = validateCrudPageSchema(schema, registry)
  if (!result.valid) {
    const message = result.diagnostics.map((item) => `${item.path}: ${item.message}`).join('\n')
    throw new Error(`Schema 校验失败：\n${message}`)
  }
}

export function validateTabbedPageSchema(
  schema: TabbedPageSchema,
  registry?: BestRegistry
): SchemaValidationResult {
  const diagnostics: SchemaDiagnostic[] = []
  if (schema.$schema !== TABBED_PAGE_SCHEMA_ID)
    push(diagnostics, '/$schema', 'schema.id', `仅支持 ${TABBED_PAGE_SCHEMA_ID}`)
  if (schema.version !== TABBED_PAGE_SCHEMA_VERSION)
    push(diagnostics, '/version', 'schema.version', `仅支持版本 ${TABBED_PAGE_SCHEMA_VERSION}`)
  if (!schema.id) push(diagnostics, '/id', 'page.id', '页面 id 不能为空')
  if (!Array.isArray(schema.tabs) || schema.tabs.length === 0) {
    push(diagnostics, '/tabs', 'tabs.required', '至少需要一个页签')
    return { valid: false, diagnostics }
  }
  const keys = new Set<string>()
  schema.tabs.forEach((tab, index) => {
    const path = `/tabs/${index}`
    if (!tab.key) push(diagnostics, path, 'tab.key', '页签 key 不能为空')
    if (keys.has(tab.key)) push(diagnostics, path, 'tab.duplicate', `页签 key 重复：${tab.key}`)
    keys.add(tab.key)
    if (!tab.label) push(diagnostics, path, 'tab.label', '页签标题不能为空')
    if (tab.content.type === 'crud') {
      const result = validateCrudPageSchema(tab.content.schema, registry)
      diagnostics.push(...result.diagnostics.map((item) => ({ ...item, path: `${path}/content/schema${item.path}` })))
    } else if (tab.content.type === 'slot') {
      if (!tab.content.slot) push(diagnostics, path, 'tab.slot', 'slot 页签必须指定 slot key')
      if (tab.content.slot && registry && !registry.slots[tab.content.slot])
        push(diagnostics, path, 'registry.slot', `未注册插槽：${tab.content.slot}`)
    } else {
      push(diagnostics, path, 'tab.content', '不支持的页签内容类型')
    }
  })
  return { valid: diagnostics.length === 0, diagnostics }
}

export function assertValidTabbedPageSchema(schema: TabbedPageSchema, registry?: BestRegistry) {
  const result = validateTabbedPageSchema(schema, registry)
  if (!result.valid) {
    const message = result.diagnostics.map((item) => `${item.path}: ${item.message}`).join('\n')
    throw new Error(`Schema 校验失败：\n${message}`)
  }
}
