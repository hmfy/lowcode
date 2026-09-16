import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import type { BestListQuery, BestListService } from './list'
import type { TableColumnSchema } from './schema'

dayjs.extend(utc)

type ProTablePageResponse = { data: Record<string, unknown>[]; success: boolean; total: number }

export function toBestListQuery(
  params: Record<string, unknown>,
  sort?: Record<string, unknown>
): BestListQuery {
  const { current, pageSize, ...filters } = params
  const normalizedSort = Object.fromEntries(
    Object.entries(sort ?? {}).filter(
      (entry): entry is [string, 'ascend' | 'descend'] =>
        entry[1] === 'ascend' || entry[1] === 'descend'
    )
  )
  return {
    page: typeof current === 'number' && current > 0 ? current : 1,
    pageSize: typeof pageSize === 'number' && pageSize > 0 ? pageSize : 20,
    filters,
    ...(Object.keys(normalizedSort).length ? { sort: normalizedSort } : {})
  }
}

export function formatCrudValue(value: unknown, format: TableColumnSchema['format']): string {
  if (value == null || value === '') return '-'
  if (!format || format === 'text') return String(value)
  if (format === 'money') {
    const amount = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(amount)
      ? new Intl.NumberFormat('zh-CN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(amount)
      : String(value)
  }
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) {
    return String(value)
  }
  let timestamp: string | number | Date = value
  if (typeof value === 'number' || typeof value === 'string') {
    const numericValue = typeof value === 'number' ? value : Number(value.trim())
    timestamp =
      Number.isFinite(numericValue) && numericValue !== 0
        ? Math.abs(numericValue) >= 1_000_000_000_000
          ? numericValue
          : numericValue * 1000
        : value
  }
  const date = dayjs.utc(timestamp)
  if (!date.isValid()) return String(value)
  return date.format(format === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss')
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')
}

export async function confirmBeforeAction(
  content: string | undefined,
  confirm: (content: string) => Promise<boolean>
): Promise<boolean> {
  return !content || confirm(content)
}

export async function removeCrudRecord(
  record: Record<string, unknown>,
  service: (
    params: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ) => Promise<unknown>,
  content: string,
  confirm: (content: string) => Promise<boolean>
): Promise<boolean> {
  if (!(await confirmBeforeAction(content, confirm))) return false
  await service(record)
  return true
}

export function createLatestPageRequest(
  service: BestListService,
  onError: (error: unknown) => void
) {
  let sequence = 0
  let controller: AbortController | undefined
  let latest: ProTablePageResponse = { data: [], success: false, total: 0 }

  return {
    async request(query: BestListQuery): Promise<ProTablePageResponse> {
      controller?.abort()
      controller = new AbortController()
      const currentController = controller
      const currentSequence = ++sequence
      try {
        const response = await service(query, { signal: currentController.signal })
        const pageResponse: ProTablePageResponse = {
          data: response.items,
          success: true,
          total: response.total
        }
        if (currentSequence !== sequence) return latest
        latest = pageResponse
        return pageResponse
      } catch (error) {
        if (currentSequence !== sequence || isAbortError(error, currentController.signal))
          return latest
        onError(error)
        return { data: [], success: false, total: 0 }
      }
    },
    abort() {
      controller?.abort()
    }
  }
}
