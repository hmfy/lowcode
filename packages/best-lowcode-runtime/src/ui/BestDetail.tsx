import { Descriptions, Empty, Table, Typography } from 'antd'
import dayjs from 'dayjs'
import type { ReactNode } from 'react'
import type { BestDetailField } from './types'

export type BestDetailTable = {
  key: string
  data: Record<string, unknown>[]
  rowKey?: string
  columns: {
    key: string
    title: string
    dataIndex?: string
    width?: number
    fixed?: 'left' | 'right'
    render?: (value: unknown, record: Record<string, unknown>) => React.ReactNode
  }[]
  scrollX?: number | string
}

export type BestDetailSection = {
  key: string
  title?: ReactNode
  description?: ReactNode
  columns?: number
  span?: number
  variant?: 'plain' | 'card'
  fields?: BestDetailField[]
  table?: BestDetailTable
  content?: ReactNode
}

export type BestDetailProps = {
  fields: BestDetailField[]
  record?: Record<string, unknown>
  column?: number
  sections?: BestDetailSection[]
  sectionColumns?: number
  sectionGap?: number | string
}

export function BestDetail({ fields, record = {}, column = 2, sections, sectionColumns, sectionGap = 20 }: BestDetailProps) {
  const content = sections?.length
    ? <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sectionColumns ?? 1}, minmax(0, 1fr))`, gap: sectionGap }}>
        {sections.map((section) => {
          const card = section.variant === 'card'
          return <section key={section.key} style={{ gridColumn: section.span ? `span ${section.span}` : undefined, marginBottom: 0, border: card ? '1px solid #f0f0f0' : undefined, borderRadius: card ? 6 : undefined, overflow: card ? 'hidden' : undefined, background: card ? '#fff' : undefined }}>
            {section.title ? <div style={{ padding: card ? '8px 12px' : undefined, background: card ? '#fafafa' : undefined, borderBottom: card ? '1px solid #f0f0f0' : undefined }}><Typography.Title level={5} style={{ margin: 0 }}>{section.title}</Typography.Title></div> : null}
            <div style={{ padding: card ? 12 : undefined }}>
              {section.description ? <Typography.Paragraph type='secondary'>{section.description}</Typography.Paragraph> : null}
              {section.content}
              {section.fields ? <FieldDescriptions fields={section.fields} record={record} column={section.columns ?? column} /> : null}
              {section.table ? <DetailTable table={section.table} /> : null}
            </div>
          </section>
        })}
      </div>
    : <FieldDescriptions fields={fields} record={record} column={column} />
  return content
}

function FieldDescriptions({ fields, record, column }: { fields: BestDetailField[]; record: Record<string, unknown>; column: number }) {
  const visibleFields = fields.filter((field) => field.visible !== false)
  return <Descriptions bordered column={column} size='small'>
    {visibleFields.map((field) => {
      const value = getPathValue(record, field.field)
      const display = field.render
        ? field.render(value, record)
        : (field.valueEnum?.[String(value)] ?? formatValue(value, field.format, field.emptyText))
      return <Descriptions.Item key={field.field} label={field.label} span={field.span}>{display}</Descriptions.Item>
    })}
  </Descriptions>
}

function DetailTable({ table }: { table: BestDetailTable }) {
  if (!table.data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='暂无数据' />
  return <Table<Record<string, unknown>>
    size='small'
    bordered
    pagination={false}
    rowKey={table.rowKey}
    dataSource={table.data}
    scroll={table.scrollX ? { x: table.scrollX } : undefined}
    columns={table.columns.map((column) => ({ ...column, dataIndex: column.dataIndex ?? column.key }))}
  />
}

function formatValue(value: unknown, format: BestDetailField['format'], emptyText = '-') {
  if (value == null || value === '') return emptyText
  const type = typeof format === 'object' ? format.type : format
  if (!type || type === 'text') return String(value)
  if (type === 'number') {
    const number = Number(value)
    if (!Number.isFinite(number)) return String(value)
    const precision = typeof format === 'object' ? format.precision : undefined
    return number.toLocaleString('zh-CN', precision === undefined ? undefined : { minimumFractionDigits: precision, maximumFractionDigits: precision })
  }
  if (type === 'money') {
    const number = Number(value)
    return Number.isFinite(number) ? number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value)
  }
  if (type === 'boolean') return value ? '是' : '否'
  if (type === 'json') return typeof value === 'string' ? value : JSON.stringify(value)
  const date = dayjs(value as string | number | Date)
  return date.isValid() ? date.format(type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss') : String(value)
}

function getPathValue(values: Record<string, unknown>, path: string) {
  if (Object.hasOwn(values, path)) return values[path]
  return path.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[part]
    }
    return undefined
  }, values)
}
