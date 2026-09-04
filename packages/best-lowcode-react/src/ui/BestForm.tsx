import type { FormRule } from 'antd'
import { Button, DatePicker, Form, Input, InputNumber, Select, Space } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormMode } from '../lowcode/schema'
import { useBestRegistry } from '../runtime'
import type { BestFieldDefinition, BestFieldRule, BestOption } from './types'

export type BestFormProps = {
  fields: BestFieldDefinition[]
  initialValues?: Record<string, unknown>
  loading?: boolean
  submitText?: string
  extra?: ReactNode
  mode?: FormMode
  onSubmit: (value: Record<string, unknown>) => void
  onCancel?: () => void
}

type FormControlProps = {
  field: BestFieldDefinition
  values: Record<string, unknown>
  scopeValues?: Record<string, unknown>
  namePath?: string | number | (string | number)[]
  value?: unknown
  onChange?: (...args: unknown[]) => void
} & Record<string, unknown>

function toNamePath(path?: string | number | (string | number)[]) {
  return path === undefined ? [] : Array.isArray(path) ? path : [path]
}

function isNamePath(value: string | number | (string | number)[]) {
  return Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Date) {
    return false
  }
  if (dayjs.isDayjs(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function appendNamePath(
  path: string | number | (string | number)[] | undefined,
  ...segments: (string | number)[]
) {
  return [...toNamePath(path), ...segments]
}

function getConditionFieldValue(values: Record<string, unknown>, field: string) {
  if (Object.hasOwn(values, field)) return values[field]
  return getPathValue(values, field.split('.'))
}

function getScopedValues(values: Record<string, unknown>, itemPath: (string | number)[]) {
  const itemValues = getPathValue(values, itemPath)
  return isRecord(itemValues) ? { ...values, ...itemValues } : values
}

function isFieldVisible(
  field: BestFieldDefinition,
  values: Record<string, unknown>,
  mode: FormMode
) {
  return !field.hidden && (!field.visibleWhen || evaluateCondition(field.visibleWhen, values, mode))
}

function resolveFieldDisabled(
  field: BestFieldDefinition,
  values: Record<string, unknown>,
  mode: FormMode
) {
  return (
    field.disabled ||
    Boolean(field.disabledWhen && evaluateCondition(field.disabledWhen, values, mode))
  )
}

function toDayjsValue(value: unknown): Dayjs | null {
  if (dayjs.isDayjs(value)) return value
  if (value instanceof Date) return dayjs(value)
  if (typeof value === 'number') {
    const normalized = Math.abs(value) >= 1_000_000_000_000 ? value : value * 1000
    const parsed = dayjs(normalized)
    return parsed.isValid() ? parsed : null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = dayjs(trimmed)
    return parsed.isValid() ? parsed : null
  }
  return null
}

export function toDatePickerValue(value: unknown): Dayjs | null {
  return toDayjsValue(value)
}

export function toDateRangePickerValue(value: unknown): [Dayjs | null, Dayjs | null] | null {
  if (!Array.isArray(value)) return null
  const nextValue: [Dayjs | null, Dayjs | null] = [toDayjsValue(value[0]), toDayjsValue(value[1])]
  return nextValue[0] || nextValue[1] ? nextValue : null
}

export function serializeDatePickerValue(_: Dayjs | null, dateString: string) {
  return dateString || undefined
}

export function serializeDateRangePickerValue(
  _: [Dayjs | null, Dayjs | null] | null,
  dateStrings: [string, string]
) {
  return dateStrings[0] || dateStrings[1] ? dateStrings : undefined
}

function fieldSignature(field: BestFieldDefinition): unknown {
  return {
    field: field.field,
    component: field.component,
    defaultValue: field.defaultValue,
    remoteService: field.remoteService,
    searchField: field.searchField,
    labelField: field.labelField,
    valueField: field.valueField,
    debounceMs: field.debounceMs,
    pageSize: field.pageSize,
    itemFields: field.itemFields?.map((itemField) => fieldSignature(itemField))
  }
}

function FormControl({
  field,
  values,
  scopeValues,
  mode = 'create',
  form,
  namePath,
  value,
  onChange,
  ...controlProps
}: FormControlProps & { mode?: FormMode; form: ReturnType<typeof Form.useForm>[0] }) {
  const registry = useBestRegistry()
  const renderValues = scopeValues ?? values
  switch (field.component) {
    case 'select':
      return (
        <Select
          {...controlProps}
          value={value as never}
          onChange={onChange as never}
          disabled={field.disabled}
          options={field.options}
          placeholder={field.placeholder}
        />
      )
    case 'remoteSelect':
      return (
        <RemoteSelect
          field={field}
          value={value !== undefined ? value : getPathValue(values, namePath ?? field.field)}
          disabled={field.disabled}
          placeholder={field.placeholder}
          onChange={(nextValue) => {
            if (onChange) onChange(nextValue)
            else form.setFieldValue(namePath ?? field.field, nextValue)
          }}
          registry={registry}
        />
      )
    case 'number':
      return (
        <InputNumber
          {...controlProps}
          value={value as never}
          onChange={onChange as never}
          disabled={field.disabled}
          placeholder={field.placeholder}
          style={{ width: '100%' }}
        />
      )
    case 'date':
      return (
        <DatePicker
          {...controlProps}
          value={toDatePickerValue(value) as never}
          onChange={(date, dateString) =>
            onChange?.(serializeDatePickerValue(date, dateString as string))
          }
          disabled={field.disabled}
          disabledDate={(current) => field.maxDate === 'today' && current.isAfter(dayjs(), 'day')}
          style={{ width: '100%' }}
        />
      )
    case 'dateRange':
      return (
        <DatePicker.RangePicker
          {...controlProps}
          value={toDateRangePickerValue(value) as never}
          onChange={(dates, dateStrings) =>
            onChange?.(serializeDateRangePickerValue(dates, dateStrings as [string, string]))
          }
          disabled={field.disabled}
          disabledDate={(current) => field.maxDate === 'today' && current.isAfter(dayjs(), 'day')}
          style={{ width: '100%' }}
        />
      )
    case 'textarea':
      return (
        <Input.TextArea
          {...controlProps}
          value={value as never}
          onChange={onChange as never}
          disabled={field.disabled}
          placeholder={field.placeholder}
        />
      )
    case 'slot':
      return (
        <>
          {field.render?.({
            field: field.field,
            values: renderValues,
            value: value !== undefined ? value : getPathValue(values, namePath ?? field.field),
            mode,
            disabled: field.disabled,
            setValue: (name, nextValue) =>
              form.setFieldValue(
                namePath
                  ? isNamePath(name)
                    ? name
                    : [...toNamePath(namePath).slice(0, -1), name]
                  : name,
                nextValue
              )
          })}
        </>
      )
    case 'repeatable':
      return (
        <RepeatableField
          field={field}
          form={form}
          mode={mode}
          namePath={namePath}
          values={values}
        />
      )
    default:
      return (
        <Input
          {...controlProps}
          value={value as never}
          onChange={onChange as never}
          disabled={field.disabled}
          placeholder={field.placeholder}
        />
      )
  }
}

function RepeatableField({
  field,
  form,
  mode,
  namePath,
  values
}: {
  field: BestFieldDefinition
  form: ReturnType<typeof Form.useForm>[0]
  mode: FormMode
  namePath?: string | number | (string | number)[]
  values: Record<string, unknown>
}) {
  const listName = namePath ?? field.field
  return (
    <Form.List name={listName}>
      {(items, { add, remove }) => (
        <>
          {items.map((item) => (
            <RepeatableFieldRow
              key={item.key}
              field={field}
              form={form}
              itemCount={items.length}
              itemName={item.name}
              itemKey={item.key}
              listName={listName}
              mode={mode}
              remove={remove}
              values={values}
            />
          ))}
          <Button
            disabled={field.maxItems !== undefined && items.length >= field.maxItems}
            onClick={() => add(resolveInitialValues(field.itemFields ?? [], undefined))}
            type='dashed'
          >
            新增一项
          </Button>
        </>
      )}
    </Form.List>
  )
}

function RepeatableFieldRow({
  field,
  form,
  itemCount,
  itemName,
  itemKey,
  listName,
  mode,
  remove,
  values
}: {
  field: BestFieldDefinition
  form: ReturnType<typeof Form.useForm>[0]
  itemCount: number
  itemName: number
  itemKey: React.Key
  listName: string | number | (string | number)[]
  mode: FormMode
  remove: (index: number) => void
  values: Record<string, unknown>
}) {
  const itemPath = appendNamePath(listName, itemName)
  const itemValues = getPathValue(values, itemPath)
  const scopeValues = getScopedValues(values, itemPath)

  useEffect(() => {
    field.itemFields?.forEach((itemField) => {
      if (!itemField.clearWhenHidden) return
      const nextPath = appendNamePath(itemPath, itemField.field)
      if (
        !isFieldVisible(itemField, scopeValues, mode) &&
        getPathValue(values, nextPath) !== undefined
      ) {
        form.setFieldValue(nextPath, undefined)
      }
    })
  }, [field.itemFields, form, itemPath, mode, scopeValues, values])

  return (
    <Space key={itemKey} align='start'>
      {field.itemFields?.map((itemField) => {
        if (!isFieldVisible(itemField, scopeValues, mode)) return null
        const nextPath = appendNamePath(itemPath, itemField.field)
        return (
          <Form.Item
            key={itemField.field}
            label={itemField.label}
            name={[itemName, itemField.field]}
            rules={toAntRules(itemField.rules)}
          >
            <FormControl
              field={{
                ...itemField,
                disabled: resolveFieldDisabled(itemField, scopeValues, mode)
              }}
              form={form}
              mode={mode}
              namePath={nextPath}
              scopeValues={scopeValues}
              values={isRecord(itemValues) ? { ...values, ...itemValues } : values}
            />
          </Form.Item>
        )
      })}
      <Button
        disabled={itemCount <= (field.minItems ?? 0)}
        onClick={() => remove(itemName)}
        type='link'
      >
        删除
      </Button>
    </Space>
  )
}

type FormFieldsProps = Pick<BestFormProps, 'fields' | 'initialValues' | 'mode'> & {
  form: ReturnType<typeof Form.useForm>[0]
}

function FormFields({ fields, form, initialValues, mode = 'create' }: FormFieldsProps) {
  const values =
    (Form.useWatch([], { form, preserve: true }) as Record<string, unknown> | undefined) ??
    initialValues ??
    {}
  const isVisible = (field: BestFieldDefinition) =>
    !field.hidden && (!field.visibleWhen || evaluateCondition(field.visibleWhen, values, mode))
  useEffect(() => {
    fields
      .filter((field) => field.clearWhenHidden && !isVisible(field))
      .forEach((field) => {
        if (values[field.field] !== undefined) form.setFieldValue(field.field, undefined)
      })
  }, [fields, form, mode, values])
  return (
    <>
      {fields
        .filter((field) => isVisible(field))
        .map((field) => {
          const control = (
            <FormControl
              key={field.field}
              field={{
                ...field,
                disabled:
                  field.disabled ||
                  Boolean(field.disabledWhen && evaluateCondition(field.disabledWhen, values, mode))
              }}
              form={form}
              mode={mode}
              values={values}
            />
          )
          return field.component === 'repeatable' ? (
            <Form.Item key={field.field} label={field.label}>
              {control}
            </Form.Item>
          ) : (
            <Form.Item
              key={field.field}
              label={field.label}
              name={field.field}
              rules={toAntRules(field.rules)}
            >
              {control}
            </Form.Item>
          )
        })}
    </>
  )
}

export function toAntRules(rules: BestFieldRule[] | undefined): FormRule[] | undefined {
  return rules?.map(
    (rule) =>
      Object.fromEntries(
        Object.entries({
          required: rule.required,
          type: rule.type === 'string' ? undefined : rule.type,
          min: rule.min ?? rule.minLength,
          max: rule.max ?? rule.maxLength,
          pattern: safeRegExp(rule.pattern),
          message: rule.message,
          validator:
            rule.type === 'integer'
              ? async (_: unknown, value: unknown) => {
                  if (value === undefined || value === null || value === '') return
                  if (!Number.isInteger(Number(value)))
                    throw new Error(rule.message ?? '请输入整数')
                }
              : undefined
        }).filter(([, value]) => value !== undefined)
      ) as FormRule
  )
}

function safeRegExp(pattern: string | undefined) {
  if (!pattern) return undefined
  try {
    return new RegExp(pattern)
  } catch {
    return undefined
  }
}

export function RemoteSelect({
  field,
  value,
  disabled,
  placeholder,
  onChange,
  registry
}: {
  field: BestFieldDefinition
  value?: unknown
  disabled?: boolean
  placeholder?: string
  onChange: (value: unknown) => void
  registry: ReturnType<typeof useBestRegistry>
}) {
  const [keywordOptions, setKeywordOptions] = useState<BestOption[]>([])
  const [selectedOptions, setSelectedOptions] = useState<BestOption[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const keywordRequestId = useRef(0)
  const selectedRequestId = useRef(0)
  const service = field.remoteService ? registry.services[field.remoteService] : undefined
  const labelField = field.labelField ?? 'label'
  const valueField = field.valueField ?? 'value'
  const searchField = field.searchField ?? 'keyword'
  const debounceMs = field.debounceMs ?? 300
  const pageSize = field.pageSize ?? 20

  const parseOptions = (response: unknown): BestOption[] => {
    const raw = Array.isArray(response)
      ? response
      : ((response as { items?: unknown[]; list?: unknown[] })?.items ??
        (response as { list?: unknown[] })?.list ??
        [])
    return raw.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      const optionValue = record[valueField]
      if (typeof optionValue !== 'string' && typeof optionValue !== 'number') return []
      return [
        {
          label: String(record[labelField] ?? optionValue ?? ''),
          value: optionValue,
          disabled: Boolean(record.disabled)
        }
      ]
    })
  }

  const mergeOptions = (base: BestOption[], extra: BestOption[]) => {
    const merged = new Map(base.map((item) => [String(item.value), item]))
    extra.forEach((item) => {
      merged.set(String(item.value), item)
    })
    return [...merged.values()]
  }

  const options = useMemo(
    () => mergeOptions(keywordOptions, selectedOptions),
    [keywordOptions, selectedOptions]
  )

  useEffect(() => {
    const currentRequestId = ++keywordRequestId.current
    if (!service) {
      setKeywordOptions([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const isCurrent = () =>
      currentRequestId === keywordRequestId.current && !controller.signal.aborted
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const response = await service(
          { [searchField]: keyword, page: 1, pageSize },
          { signal: controller.signal }
        )
        if (isCurrent()) setKeywordOptions(parseOptions(response))
      } catch {
        if (isCurrent()) setKeywordOptions([])
      } finally {
        if (isCurrent()) setLoading(false)
      }
    }, debounceMs)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [debounceMs, keyword, labelField, pageSize, searchField, service, valueField])

  useEffect(() => {
    const currentRequestId = ++selectedRequestId.current
    if (!service) {
      setSelectedOptions([])
      return
    }
    if (value === undefined || value === null || value === '') {
      setSelectedOptions([])
      return
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      setSelectedOptions([])
      return
    }
    const controller = new AbortController()
    const isCurrent = () =>
      currentRequestId === selectedRequestId.current && !controller.signal.aborted
    const fallbackOption: BestOption = {
      label: String(value),
      value: value as string | number
    }
    setSelectedOptions([fallbackOption])
    void service({ [valueField]: value, page: 1, pageSize }, { signal: controller.signal })
      .then((response) => {
        if (!isCurrent()) return
        const resolvedOptions = parseOptions(response)
        if (resolvedOptions.length) {
          setSelectedOptions(mergeOptions([fallbackOption], resolvedOptions))
        }
      })
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [labelField, pageSize, service, value, valueField])

  return (
    <Select
      showSearch
      filterOption={false}
      loading={loading}
      value={value}
      options={options}
      disabled={disabled}
      placeholder={placeholder}
      onSearch={setKeyword}
      onChange={onChange}
    />
  )
}

export function BestForm({
  fields,
  initialValues,
  loading,
  submitText = '提交',
  extra,
  mode,
  onSubmit,
  onCancel
}: BestFormProps) {
  const resolvedInitialValues = useMemo(
    () => resolveInitialValues(fields, initialValues),
    [fields, initialValues]
  )
  const formSignature = useMemo(
    () =>
      JSON.stringify([mode, fields.map((field) => fieldSignature(field)), resolvedInitialValues]),
    [fields, mode, resolvedInitialValues]
  )
  return (
    <BestFormBody
      key={formSignature}
      extra={extra}
      fields={fields}
      initialValues={resolvedInitialValues}
      loading={loading}
      mode={mode}
      onCancel={onCancel}
      onSubmit={onSubmit}
      submitText={submitText}
    />
  )
}

function BestFormBody({
  fields,
  initialValues,
  loading,
  submitText = '提交',
  extra,
  mode,
  onSubmit,
  onCancel
}: BestFormProps & { initialValues: Record<string, unknown> }) {
  const [form] = Form.useForm()
  return (
    <Form form={form} initialValues={initialValues} layout='vertical' onFinish={onSubmit}>
      <FormFields fields={fields} form={form} initialValues={initialValues} mode={mode} />
      <Space>
        <Button htmlType='submit' loading={loading} type='primary'>
          {submitText}
        </Button>
        {onCancel ? <Button onClick={onCancel}>取消</Button> : null}
        {extra}
      </Space>
    </Form>
  )
}

export function getDefaultValues(fields: BestFieldDefinition[]): Record<string, unknown> {
  return Object.fromEntries(
    fields
      .filter((field) => field.defaultValue !== undefined)
      .map((field) => [field.field, field.defaultValue])
  )
}

function resolveInitialValues(
  fields: BestFieldDefinition[],
  initialValues: Record<string, unknown> | undefined
) {
  const values = mergeDefinedValues(getDefaultValues(fields), initialValues)
  const resolvedValues = { ...values }
  fields.forEach((field) => {
    if (field.component !== 'repeatable' || !field.itemFields) return
    const items: unknown[] = Array.isArray(resolvedValues[field.field])
      ? (resolvedValues[field.field] as unknown[])
      : []
    resolvedValues[field.field] = items.map((item) =>
      resolveInitialValues(field.itemFields ?? [], isRecord(item) ? item : {})
    )
  })
  return resolvedValues
}

export function mergeDefinedValues(
  baseValues: Record<string, unknown>,
  nextValues: Record<string, unknown> | undefined
) {
  const mergedValues = { ...baseValues }
  Object.entries(nextValues ?? {}).forEach(([key, value]) => {
    if (value === undefined) return
    const currentValue = mergedValues[key]
    if (isRecord(currentValue) && isRecord(value)) {
      mergedValues[key] = mergeDefinedValues(currentValue, value)
      return
    }
    mergedValues[key] = value
  })
  return mergedValues
}

function getPathValue(
  values: Record<string, unknown>,
  path: string | number | (string | number)[]
) {
  const parts = Array.isArray(path) ? path : [path]
  return parts.reduce<unknown>((current, part) => {
    if (current && typeof current === 'object') return (current as Record<string, unknown>)[part]
    return undefined
  }, values)
}

export function evaluateCondition(
  condition: NonNullable<BestFieldDefinition['visibleWhen']>,
  values: Record<string, unknown>,
  mode: FormMode
): boolean {
  switch (condition.operator) {
    case 'equals':
      return getConditionFieldValue(values, condition.field) === condition.value
    case 'notEmpty':
      return (
        getConditionFieldValue(values, condition.field) !== undefined &&
        getConditionFieldValue(values, condition.field) !== null &&
        getConditionFieldValue(values, condition.field) !== ''
      )
    case 'modeEquals':
      return mode === condition.value
    case 'and':
      return condition.conditions.every((item) => evaluateCondition(item, values, mode))
    case 'or':
      return condition.conditions.some((item) => evaluateCondition(item, values, mode))
    case 'not':
      return !evaluateCondition(condition.condition, values, mode)
  }
}
