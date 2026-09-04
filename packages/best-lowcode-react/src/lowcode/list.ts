export type BestListQuery = {
  page: number
  pageSize: number
  filters: Record<string, unknown>
  sort?: Record<string, 'ascend' | 'descend'>
}

export type BestListResult<T extends Record<string, unknown> = Record<string, unknown>> = {
  items: T[]
  total: number
}

export type BestListService<T extends Record<string, unknown> = Record<string, unknown>> = (
  query: BestListQuery,
  options?: { signal?: AbortSignal }
) => Promise<BestListResult<T>>
