import type { TableColumnsType } from 'antd'
import { Table } from 'antd'

export type BestLightTableColumn<T extends Record<string, unknown>> = {
  field: keyof T & string
  title: string
  width?: number
  render?: (value: unknown, record: T, index: number) => React.ReactNode
}

export type BestLightTableProps<T extends Record<string, unknown>> = {
  columns: BestLightTableColumn<T>[]
  data: T[]
  rowKey?: string
}

export function BestLightTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey
}: BestLightTableProps<T>) {
  const tableColumns: TableColumnsType<T> = columns.map((column) => ({
    dataIndex: column.field,
    key: column.field,
    title: column.title,
    width: column.width,
    render: column.render
  }))
  return (
    <Table
      columns={tableColumns}
      dataSource={data}
      pagination={false}
      rowKey={rowKey}
      size='small'
    />
  )
}
