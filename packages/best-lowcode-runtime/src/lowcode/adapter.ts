import dayjs from 'dayjs'
import type { CrudDataAdapter } from './BestCrudPage'

export type BestValueNormalizer = (value: unknown, field?: string) => unknown

export function normalizeBestValues(
  values: Record<string, unknown>,
  normalize: BestValueNormalizer = defaultNormalize
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([field, value]) => [
      field,
      normalizeNested(value, normalize, field)
    ])
  )
}

function normalizeNested(value: unknown, normalize: BestValueNormalizer, field?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeNested(item, normalize, field))
  if (dayjs.isDayjs(value) || value instanceof Date) return value
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeNested(item, normalize, key)])
    )
  }
  return normalize(value, field)
}

function defaultNormalize(value: unknown) {
  if (typeof value === 'string') return value.trim() === '' ? undefined : value.trim()
  return value
}

export function createBestCrudAdapter(
  options: {
    normalize?: BestValueNormalizer
    fromList?: CrudDataAdapter['fromList']
    fromDetail?: CrudDataAdapter['fromDetail']
    toCreatePayload?: CrudDataAdapter['toCreatePayload']
    toUpdatePayload?: CrudDataAdapter['toUpdatePayload']
  } = {}
): CrudDataAdapter {
  const normalize = options.normalize ?? defaultNormalize
  return {
    fromList: options.fromList,
    fromDetail: options.fromDetail,
    toCreatePayload: (values) =>
      options.toCreatePayload?.(normalizeBestValues(values, normalize)) ??
      normalizeBestValues(values, normalize),
    toUpdatePayload: (values, record) =>
      options.toUpdatePayload?.(normalizeBestValues(values, normalize), record) ??
      normalizeBestValues(values, normalize)
  }
}
