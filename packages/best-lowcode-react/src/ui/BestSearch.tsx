import type { FormInstance } from 'antd'
import { Button, Col, DatePicker, Form, Input, InputNumber, Row, Select } from 'antd'
import dayjs from 'dayjs'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { useBestRegistry } from '../runtime'
import {
  getDefaultValues,
  mergeDefinedValues,
  RemoteSelect,
  serializeDatePickerValue,
  serializeDateRangePickerValue,
  toAntRules,
  toDatePickerValue,
  toDateRangePickerValue
} from './BestForm'
import type { BestFieldDefinition } from './types'

export type BestSearchProps = {
  fields: BestFieldDefinition[]
  value?: Record<string, unknown>
  defaultValues?: Record<string, unknown>
  loading?: boolean
  submitText?: string
  extra?: ReactNode
  onChange?: (value: Record<string, unknown>) => void
  onSearch: (value: Record<string, unknown>) => void
  onReset?: () => void
}

type FieldControlProps = {
  field: BestFieldDefinition
  value?: unknown
  onChange?: (value: unknown) => void
} & Record<string, unknown>

function searchFormSignature(
  fields: BestFieldDefinition[],
  initialValues: Record<string, unknown>
) {
  return JSON.stringify([
    fields.map((field) => ({
      field: field.field,
      component: field.component,
      defaultValue: field.defaultValue,
      remoteService: field.remoteService,
      searchField: field.searchField,
      labelField: field.labelField,
      valueField: field.valueField,
      debounceMs: field.debounceMs,
      pageSize: field.pageSize
    })),
    initialValues
  ])
}

function FieldControl({ field, value, onChange, ...controlProps }: FieldControlProps) {
  const registry = useBestRegistry()
  switch (field.component) {
    case 'select':
      return (
        <Select
          {...controlProps}
          allowClear
          value={value as never}
          onChange={onChange}
          disabled={field.disabled}
          options={field.options}
          placeholder={field.placeholder}
        />
      )
    case 'number':
      return (
        <InputNumber
          {...controlProps}
          value={value as never}
          onChange={onChange}
          disabled={field.disabled}
          placeholder={field.placeholder}
          style={{ width: '100%' }}
        />
      )
    case 'remoteSelect':
      return (
        <RemoteSelect
          field={field}
          value={value as never}
          onChange={onChange ?? (() => undefined)}
          disabled={field.disabled}
          placeholder={field.placeholder}
          registry={registry}
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
          placeholder={field.placeholder}
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
          onChange={onChange}
          disabled={field.disabled}
          placeholder={field.placeholder}
        />
      )
    default:
      return (
        <Input
          {...controlProps}
          allowClear
          value={value as never}
          onChange={onChange}
          disabled={field.disabled}
          placeholder={field.placeholder}
        />
      )
  }
}

function syncValues(
  form: FormInstance,
  value: Record<string, unknown>,
  fields: BestFieldDefinition[]
) {
  form.setFieldsValue(Object.fromEntries(fields.map((field) => [field.field, undefined])) as never)
  form.setFieldsValue(value as never)
}

export function BestSearch({
  fields,
  value,
  defaultValues,
  loading,
  submitText = '查询',
  extra,
  onChange,
  onSearch,
  onReset
}: BestSearchProps) {
  const initialValues = useMemo(
    () => mergeDefinedValues(getDefaultValues(fields), defaultValues),
    [fields, defaultValues]
  )
  return (
    <BestSearchBody
      key={searchFormSignature(fields, initialValues)}
      extra={extra}
      fields={fields}
      initialValues={initialValues}
      loading={loading}
      onChange={onChange}
      onReset={onReset}
      onSearch={onSearch}
      submitText={submitText}
      value={value}
    />
  )
}

function BestSearchBody({
  fields,
  value,
  initialValues,
  loading,
  submitText,
  extra,
  onChange,
  onSearch,
  onReset
}: Omit<BestSearchProps, 'defaultValues'> & { initialValues: Record<string, unknown> }) {
  const [form] = Form.useForm()
  const valueSignatureRef = useRef<string | undefined>(undefined)
  const controlledRef = useRef(false)

  useEffect(() => {
    if (value === undefined) {
      if (controlledRef.current) {
        syncValues(form, {}, fields)
        valueSignatureRef.current = JSON.stringify({})
        controlledRef.current = false
      }
      return
    }
    controlledRef.current = true
    const signature = JSON.stringify(value)
    if (valueSignatureRef.current === signature) return
    syncValues(form, value, fields)
    valueSignatureRef.current = signature
  }, [fields, form, value])

  return (
    <Form
      form={form}
      initialValues={initialValues}
      layout='vertical'
      onFinish={(values) => onSearch(values as Record<string, unknown>)}
      onValuesChange={(_, values) => onChange?.(values as Record<string, unknown>)}
      style={{ marginBottom: 16 }}
    >
      <Row gutter={16} align='bottom'>
        {fields
          .filter((field) => !field.hidden)
          .map((field) => (
            <Col key={field.field} span={field.span ?? 6}>
              <Form.Item label={field.label} name={field.field} rules={toAntRules(field.rules)}>
                <FieldControl field={field} />
              </Form.Item>
            </Col>
          ))}
        <Col>
          <Form.Item>
            <Button htmlType='submit' loading={loading} type='primary'>
              {submitText}
            </Button>
            <Button
              onClick={() => {
                syncValues(form, {}, fields)
                valueSignatureRef.current = JSON.stringify({})
                onChange?.({})
                onReset?.()
              }}
              style={{ marginInlineStart: 8 }}
            >
              重置
            </Button>
            {extra}
          </Form.Item>
        </Col>
      </Row>
    </Form>
  )
}
