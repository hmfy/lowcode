import type { ActionType } from '@ant-design/pro-components'
import { Button, Modal, message } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Key, type ReactNode } from 'react'
import { useBestListService, useBestRegistry } from '../runtime'
import {
  BestDetail,
  type BestDetailField,
  type BestDetailSection,
  type BestFieldDefinition,
  BestDrawer,
  BestEmpty,
  BestError,
  BestLoading,
  BestForm,
  BestModal,
  BestSearch,
  BestTable,
  type BestTableColumn
} from '../ui'
import { evaluateCondition, getDefaultValues } from '../ui/BestForm'
import {
  confirmBeforeAction,
  createLatestPageRequest,
  errorMessage,
  formatCrudValue,
  removeCrudRecord,
  toBestListQuery
} from './runtime'
import type { CrudDataAdapter } from './adapter'
import type {
  CrudPageSchema,
  DetailFieldSchema,
  DetailSectionSchema,
  FieldSchema,
  FormMode,
  PageActionSchema,
  TableColumnSchema
} from './schema'
import { assertValidCrudPageSchema } from './validate'

type RecordValue = Record<string, unknown>

type BestCrudPageProps = {
  className?: string
  /** `fill` consumes the bounded Runtime page host and gives the table its remaining height. */
  layout?: 'auto' | 'fill'
  /** Explicit table body height supplied by the public BestPage entry point. */
  tableHeight?: number
  schema: CrudPageSchema
  adapter?: CrudDataAdapter
}

type DrawerState = { mode: 'closed' } | { mode: 'detail' | 'edit' | 'create'; record?: RecordValue }
type DetailState = { loading: boolean; error?: unknown; record?: RecordValue }

function pickRowKeyValues(record: RecordValue | undefined, rowKey: string | string[]) {
  if (!record) return {}
  const keys = Array.isArray(rowKey) ? rowKey : [rowKey]
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = record[key]
      return value === undefined ? [] : [[key, value] as const]
    })
  )
}

function projectSubmittedValues(values: RecordValue, fields: FieldSchema[]) {
  const projected: RecordValue = {}
  fields.forEach((field) => {
    if (!Object.hasOwn(values, field.field)) return
    const value = values[field.field]
    if (field.component === 'repeatable' && Array.isArray(value) && field.itemFields?.length) {
      projected[field.field] = value.map((item) =>
        isRecord(item) ? projectSubmittedValues(item, field.itemFields ?? []) : item
      )
      return
    }
    projected[field.field] = value
  })
  return projected
}

export function buildCrudSubmitValues(
  values: RecordValue,
  record: RecordValue | undefined,
  rowKey: string | string[]
) {
  return { ...values, ...pickRowKeyValues(record, rowKey) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function mergeRecordForEdit(
  record: RecordValue | undefined,
  detail: RecordValue,
  rowKey: string | string[]
) {
  return record ? { ...record, ...detail, ...pickRowKeyValues(record, rowKey) } : detail
}

function toFieldDefinition(
  field: FieldSchema,
  dictionaries: ReturnType<typeof useBestRegistry>['dictionaries'],
  slots: ReturnType<typeof useBestRegistry>['slots']
): BestFieldDefinition {
  const slot = field.slot
  const options = field.dict ? (dictionaries[field.dict] ?? []) : []
  const rules = field.rules ?? []
  return {
    field: field.field,
    label: field.label,
    component: field.component,
    placeholder: field.placeholder,
    options,
    remoteService: field.remoteService,
    searchField: field.searchField,
    labelField: field.labelField,
    valueField: field.valueField,
    debounceMs: field.debounceMs,
    pageSize: field.pageSize,
    required: field.required,
    disabled: field.disabled,
    hidden: field.hidden,
    maxDate: field.maxDate,
    span: field.span,
    defaultValue: field.defaultValue,
    visibleWhen: field.visibleWhen,
    disabledWhen: field.disabledWhen,
    clearWhenHidden: field.clearWhenHidden,
    itemFields: field.itemFields?.map((item) =>
      toFieldDefinition(item as FieldSchema, dictionaries, slots)
    ),
    minItems: field.minItems,
    maxItems: field.maxItems,
    render: slot ? (context) => slots[slot]?.(context) : undefined,
    rules:
      field.required && !rules.some((rule) => rule.required)
        ? [{ required: true, message: `请填写${field.label}` }, ...rules]
        : rules
  }
}

function useFields(fields: FieldSchema[] = []) {
  const registry = useBestRegistry()
  return fields.map((field) => toFieldDefinition(field, registry.dictionaries, registry.slots))
}

function toDetailField(
  field: DetailFieldSchema,
  dictionary: Record<string, { label: string; value: string | number }[]>,
  slots: ReturnType<typeof useBestRegistry>['slots'],
  record: RecordValue = {}
): BestDetailField {
  const slot = field.slot
  const valueEnum = field.dict
    ? Object.fromEntries(
        (dictionary[field.dict] ?? []).map((item) => [String(item.value), item.label])
      )
    : undefined
  return {
    field: field.field,
    label: field.label,
    span: field.span,
    format: field.format,
    emptyText: field.emptyText,
    visible: !field.visibleWhen || evaluateCondition(field.visibleWhen, record, 'detail'),
    valueEnum,
    render: slot
      ? (value, record) => slots[slot]?.({ field: field.field, record, value }) ?? '-'
      : undefined
  }
}

function getPathValue(values: RecordValue, path: string) {
  if (Object.hasOwn(values, path)) return values[path]
  return path.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object') return (current as RecordValue)[part]
    return undefined
  }, values)
}

function toDetailSection(
  section: DetailSectionSchema,
  record: RecordValue,
  dictionaries: ReturnType<typeof useBestRegistry>['dictionaries'],
  slots: ReturnType<typeof useBestRegistry>['slots']
): BestDetailSection | null {
  if (section.visibleWhen && !evaluateCondition(section.visibleWhen, record, 'detail')) return null
  const fields = section.fields?.map((field) => toDetailField(field, dictionaries, slots, record))
  const table = section.table
    ? {
        key: section.key,
        data: (getPathValue(record, section.table.data) as RecordValue[]) ?? [],
        rowKey: section.table.rowKey,
        scrollX: section.table.scrollX,
        columns: section.table.columns.map((column) => ({
          key: column.field,
          title: column.title,
          dataIndex: column.field,
          width: column.width,
          fixed: column.fixed,
          render: (value: unknown, row: RecordValue) => {
            if (column.slot) return slots[column.slot]?.({ field: column.field, record: row, value }) ?? '-'
            if (column.dict) {
              const item = (dictionaries[column.dict] ?? []).find((candidate) => candidate.value === value)
              if (item) return item.label
            }
            const format = column.format
            if (format === 'date' || format === 'datetime') return formatCrudValue(value, format)
            if (format === 'money') return formatCrudValue(value, format)
            return value == null || value === '' ? '-' : String(value)
          }
        }))
      }
    : undefined
  const content = section.layout === 'slot' && section.slot
    ? slots[section.slot]?.({ record })
    : undefined
  return { key: section.key, title: section.title, description: section.description, columns: section.columns, span: section.span, variant: section.variant, fields, table, content }
}

function toTableColumn(
  column: TableColumnSchema,
  dictionary: Record<string, { label: string; value: string | number }[]>,
  slots: ReturnType<typeof useBestRegistry>['slots']
): BestTableColumn<RecordValue> {
  const slot = column.slot
  const composite = column.composite
  const valueEnum = column.dict
    ? Object.fromEntries(
        (dictionary[column.dict] ?? []).map((item) => [String(item.value), { text: item.label }])
      )
    : undefined
  return {
    dataIndex: column.field,
    search: false,
    title: column.title,
    width: column.width,
    fixed: column.fixed,
    valueEnum,
    renderText:
      column.format && !slot && !column.dict
        ? (value) => formatCrudValue(value, column.format)
        : undefined,
    render: composite
      ? (_value, record) => (
          <div style={{ display: 'flex', flexDirection: composite.layout === 'horizontal' ? 'row' : 'column', gap: composite.gap ?? 2 }}>
            {composite.items.map((item) => {
              const rawValue = getPathValue(record, item.field)
              const dictionaryItem = item.dict
                ? (dictionary[item.dict] ?? []).find((candidate) => String(candidate.value) === String(rawValue))
                : undefined
              const value = dictionaryItem?.label ?? formatCrudValue(rawValue, item.format)
              const content = rawValue == null || rawValue === '' ? item.emptyText ?? '-' : value
              return <div key={item.field}>{item.label ? `${item.label}：${content}` : content}</div>
            })}
          </div>
        )
      : slot
      ? (_value, record) =>
          slots[slot]?.({
            field: column.field,
            record,
            value: column.field ? record[column.field] : undefined
          }) ?? '-'
      : undefined
  }
}

function InlineDetailTable({
  columns,
  data,
  rowKey
}: {
  columns: BestTableColumn<RecordValue>[]
  data: RecordValue[]
  rowKey: string
}) {
  return (
    <div className='best-lowcode-detail-table'>
      <table className='best-lowcode-detail-table-grid'>
        <colgroup>
          {columns.map((column, index) => (
            <col key={`${String(column.key ?? column.dataIndex ?? 'column')}-${index}`} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={`${String(column.key ?? column.dataIndex ?? 'column')}-${index}`}>
                {typeof column.title === 'function' ? '' : column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((record, rowIndex) => (
            <tr key={String(record[rowKey] ?? rowIndex)}>
              {columns.map((column, columnIndex) => {
                const field = Array.isArray(column.dataIndex) ? column.dataIndex.join('.') : column.dataIndex
                const value = field ? getPathValue(record, String(field)) : undefined
                const render = column.render as ((value: unknown, row: RecordValue, index: number) => ReactNode) | undefined
                const renderText = column.renderText as ((value: unknown, row: RecordValue, index: number) => ReactNode) | undefined
                return (
                  <td key={`${String(column.key ?? field ?? 'column')}-${columnIndex}`}>
                    {render?.(value, record, rowIndex) ?? renderText?.(value, record, rowIndex) ?? (value == null || value === '' ? '-' : String(value))}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function toProTableSearchColumn(
  field: FieldSchema,
  dictionary: Record<string, { label: string; value: string | number }[]>
): BestTableColumn<RecordValue> {
  const valueType = (() => {
    switch (field.component) {
      case 'number':
        return 'digit' as const
      case 'select':
        return 'select' as const
      case 'date':
        return 'date' as const
      case 'dateRange':
        return 'dateRange' as const
      default:
        return 'text' as const
    }
  })()
  const options = field.dict ? (dictionary[field.dict] ?? []) : undefined
  return {
    dataIndex: field.field,
    title: field.label,
    valueType,
    search: true,
    hideInTable: true,
    initialValue: field.defaultValue,
    fieldProps: {
      ...(options ? { options } : {}),
      ...(field.maxDate === 'today'
        ? { disabledDate: (current: dayjs.Dayjs) => current.isAfter(dayjs(), 'day') }
        : {})
    }
  }
}

function confirmAction(content: string) {
  return new Promise<boolean>((resolve) => {
    Modal.confirm({
      content,
      okText: '确认',
      cancelText: '取消',
      onOk: () => resolve(true),
      onCancel: () => resolve(false)
    })
  })
}

export function BestCrudPage({ adapter, className, layout = 'fill', tableHeight, schema }: BestCrudPageProps) {
  const registry = useBestRegistry()
  assertValidCrudPageSchema(schema, registry)
  const registeredListService = useBestListService(schema.dataSource.list)
  if (!registeredListService) throw new Error(`未注册列表服务：${schema.dataSource.list}`)
  const listService = useCallback(
    async (
      query: Parameters<typeof registeredListService>[0],
      options?: Parameters<typeof registeredListService>[1]
    ) => {
      const response = await registeredListService(query, options)
      return adapter?.fromList ? { ...response, items: adapter.fromList(response.items) } : response
    },
    [adapter, registeredListService]
  )
  const rawSearchFields = useFields(schema.search)
  const searchFields = useMemo(() => {
    const columns = schema.searchConfig?.columns
    if (!columns || columns < 1) return rawSearchFields
    const span = Math.floor(24 / columns)
    return rawSearchFields.map((field) => ({ ...field, span: field.span ?? span }))
  }, [rawSearchFields, schema.searchConfig?.columns])
  const useBestSearch =
    schema.searchMode === 'bestSearch' ||
    schema.search?.some((field) => field.component === 'remoteSelect')
  const formFields = useFields(schema.form)
  const actionRef = useRef<ActionType>(undefined)
  const searchDefaultValues = useMemo(() => getDefaultValues(searchFields), [searchFields])
  const searchFieldNames = useMemo(
    () => new Set(searchFields.map((field) => field.field)),
    [searchFields]
  )
  const searchSchemaSignature = useMemo(
    () =>
      JSON.stringify(
        searchFields.map((field) => ({
          field: field.field,
          component: field.component,
          defaultValue: field.defaultValue
        }))
      ),
    [searchFields]
  )
  const [query, setQuery] = useState<RecordValue>(searchDefaultValues)
  const queryRef = useRef<RecordValue>(searchDefaultValues)
  const queryStateRef = useRef({
    schemaId: schema.id,
    searchSchemaSignature,
    userTouched: false
  })
  const [drawer, setDrawer] = useState<DrawerState>({ mode: 'closed' })
  const [detailState, setDetailState] = useState<DetailState>({ loading: false })
  const detailRequestRef = useRef<AbortController | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const pageRef = useRef<HTMLDivElement>(null)
  const tableRegionRef = useRef<HTMLDivElement>(null)
  const [tableRecords, setTableRecords] = useState<RecordValue[]>([])
  const [availableTableScrollHeight, setAvailableTableScrollHeight] = useState<number>()
  const [expandedRowKeys, setExpandedRowKeys] = useState<Key[]>(
    schema.table.expandable?.defaultExpandedRowKeys ?? []
  )
  const expansionInitializedRef = useRef(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const selectedRowKeysRef = useRef<Key[]>([])
  const selectedRecordsRef = useRef<Record<string, unknown>[]>([])
  const rowKeyOf = useCallback(
    (record: RecordValue) =>
      Array.isArray(schema.table.rowKey)
        ? schema.table.rowKey.map((field) => String(record[field] ?? '')).join('-')
        : String(record[schema.table.rowKey] ?? ''),
    [schema.table.rowKey]
  )

  useEffect(() => {
    expansionInitializedRef.current = false
    setTableRecords([])
    setExpandedRowKeys(schema.table.expandable?.defaultExpandedRowKeys ?? [])
  }, [schema.id, schema.table.expandable?.defaultExpandedRowKeys])

  const handleAction = useCallback(
    async (action: PageActionSchema, record?: RecordValue) => {
      if (action.access && !registry.access(action.access)) return
      if (action.effect === 'closeDetail') {
        detailRequestRef.current?.abort()
        setDrawer({ mode: 'closed' })
        setDetailState({ loading: false })
        return
      }
      if (action.effect !== 'remove' && !(await confirmBeforeAction(action.confirm, confirmAction)))
        return
      if (action.effect === 'openDetail') {
        detailRequestRef.current?.abort()
        const controller = new AbortController()
        detailRequestRef.current = controller
        setDrawer({ mode: 'detail', record })
        setDetailState({ loading: Boolean(schema.dataSource.detail), record })
        if (schema.dataSource.detail) {
          const detailService = registry.services[schema.dataSource.detail]
          if (!detailService) {
            setDetailState({ loading: false, error: new Error(`未注册服务：${schema.dataSource.detail}`), record })
            return
          }
          try {
            const detail = await detailService(record ?? {}, { signal: controller.signal })
            if (controller.signal.aborted) return
            const normalized = isRecord(detail)
              ? adapter?.fromDetail ? adapter.fromDetail(detail) : detail
              : record ?? {}
            setDetailState({ loading: false, record: normalized })
            setDrawer({ mode: 'detail', record: normalized })
          } catch (error) {
            if (!controller.signal.aborted) setDetailState({ loading: false, error, record })
          }
        }
      }
      if (action.effect === 'openEdit') {
        let editRecord = record
        if (schema.dataSource.detail) {
          const detailService = registry.services[schema.dataSource.detail]
          if (!detailService) {
            message.error(`未注册服务：${schema.dataSource.detail}`)
            return
          }
          try {
            const detail = await detailService(record ?? {})
            if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
              const normalizedDetail = adapter?.fromDetail
                ? adapter.fromDetail(detail as RecordValue)
                : (detail as RecordValue)
              editRecord = mergeRecordForEdit(record, normalizedDetail, schema.table.rowKey)
            }
          } catch (error) {
            message.error(errorMessage(error, `${schema.title}详情加载失败，请稍后重试`))
            return
          }
        }
        setDrawer({ mode: 'edit', record: editRecord })
      }
      if (action.effect === 'openCreate') setDrawer({ mode: 'create' })
      if (action.effect === 'remove' && schema.dataSource.remove) {
        const removeService = registry.services[schema.dataSource.remove]
        if (!removeService) {
          message.error(`未注册服务：${schema.dataSource.remove}`)
          return
        }
        try {
          const deleted = await removeCrudRecord(
            record ?? {},
            removeService,
            action.confirm ?? `确认删除${schema.title}？`,
            confirmAction
          )
          if (deleted) {
            message.success('删除成功')
            actionRef.current?.reload()
          }
        } catch (error) {
          message.error(errorMessage(error, '删除失败，请稍后重试'))
        }
      }
      if (action.effect === 'runAction' && action.action) {
        const runAction = registry.actions[action.action]
        if (!runAction) {
          message.error(`未注册动作：${action.action}`)
          return
        }
        try {
          await runAction({
            record,
            selectedRowKeys: selectedRowKeysRef.current.filter(
              (key): key is string | number => typeof key === 'string' || typeof key === 'number'
            ),
            selectedRecords: selectedRecordsRef.current,
            query: queryRef.current
          })
          actionRef.current?.reload()
        } catch (error) {
          message.error(errorMessage(error, `${action.label}失败，请稍后重试`))
        }
      }
    },
    [adapter, registry, schema]
  )

  const columns = useMemo<BestTableColumn<RecordValue>[]>(() => {
    const proTableSearchFields = useBestSearch ? [] : (schema.search ?? [])
    const searchColumns = new Map(
      proTableSearchFields.map((field) => [
        field.field,
        toProTableSearchColumn(field, registry.dictionaries)
      ])
    )
    const configuredColumns = schema.table.columns.map((column) => {
      const tableColumn = toTableColumn(column, registry.dictionaries, registry.slots)
      if (!column.field) return tableColumn
      const searchColumn = searchColumns.get(column.field)
      if (!searchColumn) return tableColumn
      searchColumns.delete(column.field)
      return { ...tableColumn, ...searchColumn, hideInTable: false }
    })
    configuredColumns.push(...searchColumns.values())
    if (!schema.table.actions?.length) return configuredColumns
    const actionColumnWidth = Math.max(160, schema.table.actions.length * 80 + 32)
    configuredColumns.push({
      title: '操作',
      valueType: 'option',
      fixed: 'right',
      width: actionColumnWidth,
      render: (_, record) =>
        schema.table.actions?.map((action) => (
          <ActionButton action={action} key={action.id} record={record} onExecute={handleAction} />
        ))
    })
    return configuredColumns
  }, [
    handleAction,
    registry.dictionaries,
    registry.slots,
    schema.search,
    schema.table.actions,
    schema.table.columns,
    useBestSearch
  ])

  const pageRequest = useMemo(
    () =>
      createLatestPageRequest(listService, (error) =>
        message.error(errorMessage(error, `${schema.title}加载失败，请稍后重试`))
      ),
    [listService, schema.title]
  )
  const rowKey = schema.table.rowKey
  const request = useCallback(
    async (params: RecordValue, sort?: Record<string, unknown>) => {
      const response = await pageRequest.request(
        toBestListQuery(
          {
            ...params,
            // Header Slots own business filter presentation while Runtime owns
            // the query state and request lifecycle.
            ...(useBestSearch || schema.header ? queryRef.current : {}),
          },
          sort
        )
      )
      setTableRecords(response.data)
      if (!expansionInitializedRef.current) {
        expansionInitializedRef.current = true
        if (schema.table.expandable?.defaultExpandAllRows) {
          setExpandedRowKeys(response.data.map(rowKeyOf))
        }
      }
      return response
    },
    [pageRequest, rowKeyOf, schema.header, schema.table.expandable?.defaultExpandAllRows, useBestSearch]
  )

  const expandedColumns = useMemo(
    () => schema.table.expandable?.columns?.map((column) =>
      toTableColumn(column, registry.dictionaries, registry.slots)
    ),
    [registry.dictionaries, registry.slots, schema.table.expandable?.columns]
  )

  const handleSelectionChange = useCallback(
    (keys: Key[], rows: RecordValue[] = []) => {
      const records = new Map(selectedRecordsRef.current.map((record) => [rowKeyOf(record), record]))
      rows.forEach((record) => records.set(rowKeyOf(record), record))
      const keySet = new Set(keys.map((key) => String(key)))
      const selectedRecords = Array.from(records.values()).filter((record) => keySet.has(rowKeyOf(record)))
      selectedRecordsRef.current = selectedRecords
      selectedRowKeysRef.current = keys
      setSelectedRowKeys(keys)
    },
    [rowKeyOf]
  )

  const toolbarOptions = schema.table.toolbar
  const expandableSchema = schema.table.expandable
  const detailMode = schema.detail?.mode ?? 'drawer'
  const expandableKeys = useMemo(() => tableRecords.map(rowKeyOf), [rowKeyOf, tableRecords])
  const allRowsExpanded = expandableKeys.length > 0 && expandableKeys.every((key) => expandedRowKeys.includes(key))
  const toggleAllRows = useCallback(() => {
    setExpandedRowKeys(allRowsExpanded ? [] : expandableKeys)
  }, [allRowsExpanded, expandableKeys])
  const proTableSearch = useMemo(() => {
    if (useBestSearch || !schema.searchConfig?.collapsible) return undefined
    return {
      defaultCollapsed: schema.searchConfig.defaultCollapsed,
      collapseRender: (collapsed: boolean) => (collapsed ? '展开' : '收起')
    }
  }, [schema.searchConfig, useBestSearch])

  useLayoutEffect(() => {
    const previous = queryStateRef.current
    if (previous.schemaId === schema.id && previous.searchSchemaSignature === searchSchemaSignature)
      return

    const shouldUseDefaults = previous.schemaId !== schema.id || !previous.userTouched
    const nextQuery = shouldUseDefaults
      ? searchDefaultValues
      : Object.fromEntries(
          Object.entries(queryRef.current).filter(([field]) => searchFieldNames.has(field))
        )
    queryRef.current = nextQuery
    setQuery(nextQuery)
    queryStateRef.current = {
      schemaId: schema.id,
      searchSchemaSignature,
      userTouched: shouldUseDefaults ? false : previous.userTouched
    }
  }, [schema.id, searchDefaultValues, searchFieldNames, searchSchemaSignature])

  useLayoutEffect(() => {
    if (layout !== 'fill') {
      setAvailableTableScrollHeight(undefined)
      return
    }
    const page = pageRef.current
    const tableRegion = tableRegionRef.current
    if (!page || !tableRegion) return

    const updateAvailableHeight = () => {
      const tableBodyTop = tableRegion.querySelector('.ant-table-tbody')?.getBoundingClientRect().top
      const paginationElement = tableRegion.querySelector('.ant-pagination') as HTMLElement | null
      const pagination = paginationElement?.getBoundingClientRect()
      const paginationStyle = paginationElement ? getComputedStyle(paginationElement) : undefined
      const paginationSpacing = paginationStyle
        ? (parseFloat(paginationStyle.marginTop) || 0) + (parseFloat(paginationStyle.marginBottom) || 0)
        : 0
      const regionBottom = tableRegion.getBoundingClientRect().bottom
      if (!tableBodyTop) return
      const nextHeight = Math.max(
        120,
        // Keep a small border-safe inset so the last row is not clipped by the table container.
        Math.floor(regionBottom - tableBodyTop - (pagination?.height ?? 0) - paginationSpacing - 14)
      )
      setAvailableTableScrollHeight((current) => current === nextHeight ? current : nextHeight)
    }

    updateAvailableHeight()
    if (typeof ResizeObserver === 'undefined') return
    // The available height belongs to the page layout, not to the table
    // content. Observing the table region makes expanded rows feed their own
    // height back into `scroll.y`, which can grow the scroll area indefinitely.
    const observer = new ResizeObserver(updateAvailableHeight)
    observer.observe(page)
    return () => observer.disconnect()
  }, [layout, tableRecords.length])

  useEffect(() => () => pageRequest.abort(), [pageRequest])

  const submitForm = useCallback(
    async (values: RecordValue) => {
      if (submittingRef.current) return
      const serviceKey =
        drawer.mode === 'edit' ? schema.dataSource.update : schema.dataSource.create
      if (!serviceKey) {
        message.error(`${drawer.mode === 'edit' ? '更新' : '创建'}服务未配置`)
        return
      }
      const service = registry.services[serviceKey]
      if (!service) {
        message.error(`未注册服务：${serviceKey}`)
        return
      }
      const record = drawer.mode === 'closed' ? undefined : drawer.record
      const payloadValues =
        drawer.mode === 'edit'
          ? buildCrudSubmitValues(projectSubmittedValues(values, formFields), record, rowKey)
          : projectSubmittedValues(values, formFields)
      submittingRef.current = true
      setSubmitting(true)
      try {
        const payload =
          drawer.mode === 'edit'
            ? (adapter?.toUpdatePayload?.(payloadValues, record) ?? payloadValues)
            : (adapter?.toCreatePayload?.(payloadValues) ?? payloadValues)
        await service(payload)
        message.success('保存成功')
        setDrawer({ mode: 'closed' })
        actionRef.current?.reload()
      } catch (error) {
        message.error(errorMessage(error, '保存失败，请稍后重试'))
      } finally {
        setSubmitting(false)
        submittingRef.current = false
      }
    },
    [
      adapter,
      drawer,
      formFields,
      registry.services,
      rowKey,
      schema.dataSource.create,
      schema.dataSource.update
    ]
  )

  const setPageQuery = useCallback((nextQuery: RecordValue) => {
    queryRef.current = nextQuery
    queryStateRef.current = { ...queryStateRef.current, userTouched: true }
    setQuery(nextQuery)
    actionRef.current?.reload()
  }, [])

  const renderHeaderSlot = (slot?: string) => slot
    ? registry.slots[slot]?.({
        pageId: schema.id,
        query,
        setQuery: setPageQuery,
        reload: () => actionRef.current?.reload(),
        selectedRowKeys: selectedRowKeysRef.current.filter(
          (key): key is string | number => typeof key === 'string' || typeof key === 'number'
        ),
        selectedRecords: selectedRecordsRef.current
      }) ?? null
    : null

  return (
    <div ref={pageRef} className={`best-lowcode-page${layout === 'fill' ? ' best-lowcode-page--fill' : ''}`}>
      {renderHeaderSlot(schema.header?.beforeSearch?.slot)}
      {useBestSearch && searchFields.length ? (
        <BestSearch
          fields={searchFields}
          value={query}
          defaultValues={searchDefaultValues}
          collapsible={schema.searchConfig?.collapsible}
          defaultCollapsed={schema.searchConfig?.defaultCollapsed}
          collapseAfter={schema.searchConfig?.collapseAfter}
          onReset={(values) => {
            queryRef.current = values
            queryStateRef.current = { ...queryStateRef.current, userTouched: true }
            setQuery(values)
            actionRef.current?.reload()
          }}
          onSearch={(values) => {
            // Keep the latest filters synchronously available to request().
            // reload() may execute before React commits a state update.
            queryRef.current = values
            queryStateRef.current = { ...queryStateRef.current, userTouched: true }
            setQuery(values)
            actionRef.current?.reload()
          }}
        />
      ) : null}
      {renderHeaderSlot(schema.header?.afterSearch?.slot)}
      <div ref={tableRegionRef} className='best-lowcode-table-region'>
      <BestTable<RecordValue, RecordValue>
        actionRef={actionRef}
        className={className}
        columns={columns}
        pagination={{ showSizeChanger: true, defaultPageSize: schema.table.pageSize ?? 20 }}
        request={request}
        rowKey={
          Array.isArray(rowKey)
            ? (record) => rowKey.map((field) => String(record[field] ?? '')).join('-')
            : rowKey
        }
        expandable={expandableSchema ? {
          childrenColumnName: expandableSchema.childrenField ?? 'children',
          defaultExpandAllRows: expandableSchema.defaultExpandAllRows,
          defaultExpandedRowKeys: expandableSchema.defaultExpandedRowKeys,
          expandedRowKeys,
          onExpandedRowsChange: (keys) => setExpandedRowKeys(Array.from(keys)),
          columnTitle: expandableSchema.showExpandAll ? (
            <Button type='link' size='small' onClick={toggleAllRows}>
              {allRowsExpanded ? '收起全部' : '展开全部'}
            </Button>
          ) : undefined,
          // The default expand-icon width clips a header action label.
          columnWidth: expandableSchema.showExpandAll ? 84 : undefined,
          indentSize: expandableSchema.indentSize,
          expandedRowRender: expandableSchema.dataField && expandedColumns
            ? (record) => {
                const details = record[expandableSchema.dataField ?? '']
                return (
                  <InlineDetailTable
                    columns={expandedColumns}
                    data={Array.isArray(details) ? details.filter(isRecord) : []}
                    rowKey={expandableSchema.rowKey ?? 'id'}
                  />
                )
              }
            : undefined
        } : undefined}
        rowSelection={schema.table.rowSelection?.enabled ? {
          type: schema.table.rowSelection.type ?? 'checkbox',
          checkStrictly: schema.table.rowSelection.checkStrictly ?? true,
          preserveSelectedRowKeys: schema.table.rowSelection.preserveSelectedRowKeys,
          selectedRowKeys,
          onChange: handleSelectionChange
        } : undefined}
        options={toolbarOptions?.columnSettings ? { setting: true, reload: false, density: false } : false}
        search={useBestSearch ? false : proTableSearch}
        scroll={{
          ...(schema.table.scrollX ? { x: schema.table.scrollX } : {}),
          ...(tableHeight !== undefined
            ? { y: tableHeight }
            : schema.table.scrollY !== undefined
              ? { y: schema.table.scrollY }
              : layout === 'fill' && availableTableScrollHeight
                ? { y: availableTableScrollHeight }
                : {})
        }}
        toolBarRender={() => [
          ...(schema.toolbar?.map((action) => (
            <ActionButton action={action} key={action.id} onExecute={handleAction} />
          )) ?? []),
          ...(toolbarOptions?.refresh ? [
            <Button key='refresh' onClick={() => actionRef.current?.reload()}>刷新</Button>
          ] : []),
          ...(toolbarOptions?.exportAction ? [
            <ActionButton action={toolbarOptions.exportAction} key={toolbarOptions.exportAction.id} onExecute={handleAction} />
          ] : [])
        ]}
      />
      </div>
      {drawer.mode === 'detail' && detailMode === 'inline' ? (
        <DetailContent state={detailState} record={drawer.record} />
      ) : null}
      {drawer.mode !== 'closed' && (detailMode !== 'inline' || drawer.mode !== 'detail') && detailMode === 'drawer' ? <BestDrawer
        open
        width={schema.detail?.width}
        title={drawer.mode === 'detail' ? `${schema.title}详情` : drawer.mode === 'edit' ? `编辑${schema.title}` : `新建${schema.title}`}
        footer={drawer.mode === 'detail' && schema.detail?.footer?.length ? <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{schema.detail.footer.map((action) => <ActionButton action={action} key={action.id} record={drawer.record} onExecute={handleAction} />)}</div> : undefined}
        onClose={() => { detailRequestRef.current?.abort(); setDrawer({ mode: 'closed' }); setDetailState({ loading: false }) }}
      >
        {drawer.mode === 'detail' ? <DetailContent state={detailState} record={drawer.record} /> : null}
        {drawer.mode === 'edit' || drawer.mode === 'create' ? <BestForm fields={formFields} initialValues={drawer.record} loading={submitting} mode={drawer.mode as FormMode} onCancel={() => setDrawer({ mode: 'closed' })} onSubmit={(values) => { void submitForm(values) }} /> : null}
      </BestDrawer> : null}
      {drawer.mode !== 'closed' && (detailMode !== 'inline' || drawer.mode !== 'detail') && detailMode === 'modal' ? <BestModal
        open
        title={
          drawer.mode === 'detail'
            ? `${schema.title}详情`
            : drawer.mode === 'edit'
              ? `编辑${schema.title}`
              : `新建${schema.title}`
        }
        width={schema.detail?.width}
        footer={drawer.mode === 'detail' && schema.detail?.footer?.length ? <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{schema.detail.footer.map((action) => <ActionButton action={action} key={action.id} record={drawer.record} onExecute={handleAction} />)}</div> : undefined}
        onClose={() => { detailRequestRef.current?.abort(); setDrawer({ mode: 'closed' }); setDetailState({ loading: false }) }}
      >
        {drawer.mode === 'detail' ? (
          <DetailContent state={detailState} record={drawer.record} />
        ) : null}
        {drawer.mode === 'edit' || drawer.mode === 'create' ? (
          <BestForm
            fields={formFields}
            initialValues={drawer.record}
            loading={submitting}
            mode={drawer.mode as FormMode}
            onCancel={() => setDrawer({ mode: 'closed' })}
            onSubmit={(values) => {
              void submitForm(values)
            }}
          />
        ) : null}
      </BestModal> : null}
    </div>
  )

  function DetailContent({ state, record }: { state: DetailState; record?: RecordValue }) {
    if (state.loading) return <BestLoading />
    if (state.error) return <BestError description={errorMessage(state.error, `${schema.title}详情加载失败`)} />
    if (!record) return <BestEmpty />
    const sections = schema.detail?.sections?.map((section) => toDetailSection(section, record, registry.dictionaries, registry.slots)).filter(Boolean) as BestDetailSection[] | undefined
    return <BestDetail
      fields={schema.detail?.fields?.map((field) => toDetailField(field, registry.dictionaries, registry.slots, record)) ?? []}
      sections={sections}
      sectionColumns={schema.detail?.columns}
      sectionGap={schema.detail?.gap}
      record={record}
    />
  }

  function ActionButton({
    action,
    record,
    onExecute
  }: {
    action: PageActionSchema
    record?: RecordValue
    onExecute: (action: PageActionSchema, record?: RecordValue) => Promise<void>
  }) {
    const permitted = !action.access || registry.access(action.access)
    if (!permitted) return null
    // Table actions are intentionally row-data driven. Page-level filters and
    // selections belong to business filter Slots and batch action handlers.
    const visible = !action.visibleWhen || evaluateCondition(action.visibleWhen, record ?? {}, 'detail')
    if (!visible) return null
    const disabled = Boolean(action.disabledWhen && evaluateCondition(action.disabledWhen, record ?? {}, 'detail'))
    if (action.effect === 'slot' && action.slot) {
      return registry.slots[action.slot]?.({
        pageId: schema.id,
        record,
        query: queryRef.current,
        reload: () => actionRef.current?.reload(),
        selectedRowKeys: selectedRowKeysRef.current.filter(
          (key): key is string | number => typeof key === 'string' || typeof key === 'number'
        ),
        selectedRecords: selectedRecordsRef.current
      }) ?? null
    }
    return (
      <Button
        key={action.id}
        type={action.buttonType ?? 'link'}
        disabled={disabled}
        onClick={() => {
          void onExecute(action, record)
        }}
      >
        {action.label}
      </Button>
    )
  }
}
