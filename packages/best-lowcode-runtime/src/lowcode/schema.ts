import type { BestFieldComponent, BestFieldRule } from '../ui/types'

export const CRUD_SCHEMA_ID = 'https://best.dev/schema/crud/v1' as const
export const CRUD_SCHEMA_VERSION = 1 as const
export const TABBED_PAGE_SCHEMA_ID = 'https://best.dev/schema/tabs/v1' as const
export const TABBED_PAGE_SCHEMA_VERSION = 1 as const

export type Condition =
  | { operator: 'equals'; field: string; value: string | number | boolean | null }
  | { operator: 'notEmpty'; field: string }
  | { operator: 'modeEquals'; value: FormMode }
  | { operator: 'and' | 'or'; conditions: Condition[] }
  | { operator: 'not'; condition: Condition }

export type FormMode = 'create' | 'edit' | 'detail'

export type FieldSchema = {
  field: string
  label: string
  component: BestFieldComponent
  placeholder?: string
  dict?: string
  required?: boolean
  disabled?: boolean
  hidden?: boolean
  maxDate?: 'today'
  span?: number
  defaultValue?: string | number | boolean | null
  rules?: BestFieldRule[]
  /** Application-specific form control registered in the BestProvider registry. */
  slot?: string
  remoteService?: string
  searchField?: string
  labelField?: string
  valueField?: string
  debounceMs?: number
  pageSize?: number
  visibleWhen?: Condition
  disabledWhen?: Condition
  /** Clears stale dependent values when this field becomes hidden. */
  clearWhenHidden?: boolean
  /** Repeated object fields, for rules such as tiered pricing. */
  itemFields?: Omit<FieldSchema, 'itemFields'>[]
  minItems?: number
  maxItems?: number
}

export type CompositeColumnItemSchema = {
  label?: string
  field: string
  dict?: string
  format?: 'date' | 'datetime' | 'money' | 'text'
  emptyText?: string
}

export type CompositeColumnSchema = {
  layout?: 'vertical' | 'horizontal'
  gap?: number
  items: CompositeColumnItemSchema[]
}

export type TableColumnSchema = {
  field?: string
  title: string
  dict?: string
  width?: number
  fixed?: 'left' | 'right'
  format?: 'date' | 'datetime' | 'money' | 'text'
  slot?: string
  composite?: CompositeColumnSchema
}

export type TableExpandableSchema = {
  /** Nested row field name. Defaults to Ant Design Table's `children`. */
  childrenField?: string
  /** Render a separate detail table from this field instead of nested rows. */
  dataField?: string
  /** Show a control in the expand column header to expand or collapse all loaded rows. */
  showExpandAll?: boolean
  rowKey?: string
  columns?: TableColumnSchema[]
  defaultExpandAllRows?: boolean
  defaultExpandedRowKeys?: (string | number)[]
  indentSize?: number
}

export type TableRowSelectionSchema = {
  enabled?: boolean
  type?: 'checkbox' | 'radio'
  /** When false, selecting a parent also selects its descendants. */
  checkStrictly?: boolean
  preserveSelectedRowKeys?: boolean
}

export type TableStatusTabSchema = {
  key: string
  label: string
  value?: string | number | boolean | null
  count?: number
}

export type TableToolbarSchema = {
  refresh?: boolean
  columnSettings?: boolean
  exportAction?: PageActionSchema
}

export type DetailFieldSchema = {
  field: string
  label: string
  dict?: string
  span?: number
  slot?: string
  format?: DetailFormat | DetailFormatConfig
  visibleWhen?: Condition
  emptyText?: string
}

export type DetailFormat = 'text' | 'number' | 'money' | 'date' | 'datetime' | 'boolean' | 'json'

export type DetailFormatConfig = {
  type: DetailFormat
  emptyText?: string
  precision?: number
  timezone?: string
}

export type DetailTableColumnSchema = {
  field: string
  title: string
  width?: number
  fixed?: 'left' | 'right'
  dict?: string
  format?: DetailFormat | DetailFormatConfig
  slot?: string
}

export type DetailTableSchema = {
  data: string
  rowKey?: string
  columns: DetailTableColumnSchema[]
  scrollX?: number | string
}

export type DetailSectionSchema = {
  key: string
  title?: string
  description?: string
  visibleWhen?: Condition
  layout?: 'fields' | 'table' | 'slot'
  columns?: number
  span?: number
  variant?: 'plain' | 'card'
  fields?: DetailFieldSchema[]
  table?: DetailTableSchema
  slot?: string
}

export type PageActionButtonType = 'primary' | 'default' | 'link' | 'text' | 'dashed'

export type PageActionSchema = {
  id: string
  label: string
  effect: 'openCreate' | 'openDetail' | 'openEdit' | 'remove' | 'runAction' | 'slot' | 'closeDetail'
  action?: string
  slot?: string
  access?: string
  confirm?: string
  visibleWhen?: Condition
  disabledWhen?: Condition
  /** Visual button style; omitted actions use the runtime area default. */
  buttonType?: PageActionButtonType
}

export type CrudPageSchema = {
  $schema: typeof CRUD_SCHEMA_ID
  version: typeof CRUD_SCHEMA_VERSION
  id: string
  kind: 'crud'
  title: string
  dataSource: {
    list: string
    detail?: string
    create?: string
    update?: string
    remove?: string
  }
  search?: FieldSchema[]
  searchMode?: 'proTable' | 'bestSearch'
  form?: FieldSchema[]
  table: {
    rowKey: string | string[]
    columns: TableColumnSchema[]
    actions?: PageActionSchema[]
    scrollX?: number
    pageSize?: number
    expandable?: TableExpandableSchema
    rowSelection?: TableRowSelectionSchema
    statusTabs?: {
      field: string
      items: TableStatusTabSchema[]
      defaultKey?: string
    }
    toolbar?: TableToolbarSchema
  }
  searchConfig?: {
    collapsible?: boolean
    defaultCollapsed?: boolean
    collapseAfter?: number
    columns?: number
  }
  detail?: {
    /** Defaults to drawer when omitted. */
    mode?: 'drawer' | 'modal' | 'inline'
    width?: number | string
    columns?: number
    gap?: number | string
    fields?: DetailFieldSchema[]
    sections?: DetailSectionSchema[]
    footer?: PageActionSchema[]
  }
  toolbar?: PageActionSchema[]
  meta?: {
    generatedBy?: string
    generatedAt?: string
  }
}

export type TabContentSchema =
  | { type: 'crud'; schema: CrudPageSchema }
  | { type: 'slot'; slot: string }

export type TabSchema = {
  key: string
  label: string
  access?: string
  /** Defaults to true so inactive CRUD pages do not fetch until selected. */
  destroyOnHidden?: boolean
  content: TabContentSchema
}

/** A page composition schema with runtime-owned tab navigation. */
export type TabbedPageSchema = {
  $schema: typeof TABBED_PAGE_SCHEMA_ID
  version: typeof TABBED_PAGE_SCHEMA_VERSION
  id: string
  kind: 'tabs'
  tabs: TabSchema[]
}
