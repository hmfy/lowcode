import type { ReactNode } from 'react'
import type { Condition, FormMode } from '../lowcode/schema'

export type BestFieldComponent =
  | 'input'
  | 'number'
  | 'select'
  | 'remoteSelect'
  | 'date'
  | 'dateRange'
  | 'textarea'
  | 'slot'
  | 'repeatable'

export type BestOption = {
  label: ReactNode
  value: string | number
  disabled?: boolean
}

export type BestFieldRenderContext = {
  field: string
  values: Record<string, unknown>
  value?: unknown
  mode: FormMode
  disabled?: boolean
  setValue: (field: string | number | (string | number)[], value: unknown) => void
}

export type BestFieldRule = {
  type?: 'email' | 'number' | 'integer' | 'string'
  required?: boolean
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  message?: string
}

export type BestFieldDefinition = {
  field: string
  label: string
  component: BestFieldComponent
  placeholder?: string
  options?: BestOption[]
  remoteService?: string
  searchField?: string
  labelField?: string
  valueField?: string
  debounceMs?: number
  pageSize?: number
  required?: boolean
  disabled?: boolean
  hidden?: boolean
  maxDate?: 'today'
  span?: number
  defaultValue?: string | number | boolean | null
  rules?: BestFieldRule[]
  render?: (context: BestFieldRenderContext) => ReactNode
  visibleWhen?: Condition
  disabledWhen?: Condition
  clearWhenHidden?: boolean
  itemFields?: Omit<BestFieldDefinition, 'itemFields'>[]
  minItems?: number
  maxItems?: number
}

export type BestDetailField = {
  field: string
  label: string
  span?: number
  valueEnum?: Record<string, ReactNode>
  render?: (value: unknown, record: Record<string, unknown>) => ReactNode
}
