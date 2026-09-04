import {
  type ParamsType,
  ProTable,
  type ProTableProps,
  type RequestData
} from '@ant-design/pro-components'
import type { TableProps } from 'antd'
import type { ReactNode } from 'react'
import styles from './BestTable.module.less'

export type BestTableColumn<T extends Record<string, unknown>> = NonNullable<
  ProTableProps<T, ParamsType>['columns']
>[number]

export type BestTableProps<
  DataSource extends Record<string, unknown>,
  Params extends ParamsType = ParamsType,
  ValueType = 'text'
> = Omit<ProTableProps<DataSource, Params, ValueType>, 'columns'> & {
  columns?:
    | ProTableProps<DataSource, Params, ValueType>['columns']
    | TableProps<DataSource>['columns']
  emptyText?: ReactNode
}

const defaultSearch: NonNullable<ProTableProps<Record<string, unknown>, ParamsType>['search']> = {
  layout: 'vertical',
  labelWidth: 'auto',
  defaultCollapsed: false,
  collapseRender: false,
  span: 6
}

function mergeSearch<T>(defaults: T, value: T | false | undefined): T | false {
  if (value === false) return false
  return { ...(defaults as object), ...((value ?? {}) as object) } as T
}

export function BestTable<
  DataSource extends Record<string, unknown>,
  Params extends ParamsType = ParamsType,
  ValueType = 'text'
>({
  columns,
  cardProps,
  className,
  search,
  emptyText = '暂无数据',
  ...props
}: BestTableProps<DataSource, Params, ValueType>) {
  return (
    <ProTable<DataSource, Params, ValueType>
      {...props}
      className={[styles.root, className].filter(Boolean).join(' ')}
      columns={columns as ProTableProps<DataSource, Params, ValueType>['columns']}
      options={false}
      search={mergeSearch(defaultSearch, search as typeof defaultSearch | false | undefined)}
      cardProps={
        cardProps === false
          ? false
          : {
              ...cardProps,
              styles: {
                ...cardProps?.styles,
                body: { ...cardProps?.styles?.body, padding: 12 }
              }
            }
      }
      locale={{ emptyText }}
    />
  )
}

export type { RequestData }
