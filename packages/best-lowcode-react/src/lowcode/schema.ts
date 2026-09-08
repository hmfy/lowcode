import type { BestFieldComponent, BestFieldRule } from '../ui/types'

export const CRUD_SCHEMA_ID = 'https://best.dev/schema/crud/v1' as const
export const CRUD_SCHEMA_VERSION = 1 as const

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

export type TableColumnSchema = {
  field: string
  title: string
  dict?: string
  width?: number
  fixed?: 'left' | 'right'
  format?: 'date' | 'datetime' | 'money' | 'text'
  slot?: string
}

export type DetailFieldSchema = {
  field: string
  label: string
  dict?: string
  span?: number
  slot?: string
}

export type PageActionButtonType = 'primary' | 'default' | 'link' | 'text' | 'dashed'

export type PageActionSchema = {
  id: string
  label: string
  effect: 'openCreate' | 'openDetail' | 'openEdit' | 'remove' | 'runAction' | 'slot'
  action?: string
  slot?: string
  access?: string
  confirm?: string
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
  }
  detail?: { fields: DetailFieldSchema[] }
  toolbar?: PageActionSchema[]
  meta?: {
    generatedBy?: string
    generatedAt?: string
  }
}
