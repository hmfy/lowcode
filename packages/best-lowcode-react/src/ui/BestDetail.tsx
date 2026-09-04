import { Descriptions } from 'antd'
import type { BestDetailField } from './types'

export type BestDetailProps = {
  fields: BestDetailField[]
  record?: Record<string, unknown>
  column?: number
}

export function BestDetail({ fields, record = {}, column = 2 }: BestDetailProps) {
  return (
    <Descriptions bordered column={column} size='small'>
      {fields.map((field) => {
        const value = getPathValue(record, field.field)
        const display = field.render
          ? field.render(value, record)
          : (field.valueEnum?.[String(value)] ??
            (value == null || value === '' ? '-' : String(value)))
        return (
          <Descriptions.Item key={field.field} label={field.label} span={field.span}>
            {display}
          </Descriptions.Item>
        )
      })}
    </Descriptions>
  )
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
