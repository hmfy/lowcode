import { describe, expect, it, vi } from 'vitest'
import {
  confirmBeforeAction,
  createLatestPageRequest,
  errorMessage,
  formatCrudValue,
  removeCrudRecord,
  toBestListQuery
} from '../src/lowcode/runtime'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe('lowcode runtime helpers', () => {
  it('formats standard date and money values while preserving invalid values', () => {
    expect(formatCrudValue('2026-08-18 09:30:00', 'date')).toBe('2026-08-18')
    expect(formatCrudValue('2026-08-18 09:30:00', 'datetime')).toBe('2026-08-18 09:30:00')
    expect(formatCrudValue('2026-08-18T09:30:00Z', 'datetime')).toBe('2026-08-18 09:30:00')
    expect(formatCrudValue(1672531200, 'datetime')).toBe('2023-01-01 00:00:00')
    expect(formatCrudValue(1234.5, 'money')).toBe('1,234.50')
    expect(formatCrudValue('not-a-date', 'datetime')).toBe('not-a-date')
  })

  it('cancels an old request and never returns its stale response', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    const service = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const request = createLatestPageRequest(service, vi.fn())

    const oldResult = request.request({ page: 1, pageSize: 20, filters: { keyword: 'old' } })
    const newResult = request.request({ page: 1, pageSize: 20, filters: { keyword: 'new' } })
    expect(service.mock.calls[0]?.[1]?.signal.aborted).toBe(true)
    second.resolve({ items: [{ id: 'new' }], total: 1 })
    await expect(newResult).resolves.toMatchObject({ data: [{ id: 'new' }] })
    first.resolve({ items: [{ id: 'old' }], total: 1 })
    await expect(oldResult).resolves.toMatchObject({ data: [{ id: 'new' }] })
  })

  it('converts ProTable pagination and filtering into the stable list query', () => {
    expect(
      toBestListQuery(
        { current: 2, pageSize: 50, keyword: 'merchant' },
        { createdAt: 'descend', ignored: null }
      )
    ).toEqual({
      page: 2,
      pageSize: 50,
      filters: { keyword: 'merchant' },
      sort: { createdAt: 'descend' }
    })
  })

  it('reports a useful fallback for non-Error failures', () => {
    expect(errorMessage(new Error('接口不可用'), '加载失败')).toBe('接口不可用')
    expect(errorMessage('unknown', '加载失败')).toBe('加载失败')
  })

  it('does not run an action until its confirmation is accepted', async () => {
    const confirm = vi.fn().mockResolvedValue(false)
    await expect(confirmBeforeAction('确认提现吗？', confirm)).resolves.toBe(false)
    expect(confirm).toHaveBeenCalledWith('确认提现吗？')
    await expect(confirmBeforeAction(undefined, confirm)).resolves.toBe(true)
  })

  it('only calls the delete service after confirmation and passes the current record', async () => {
    const service = vi.fn().mockResolvedValue(undefined)
    const record = { id: 'customer-1' }

    await expect(
      removeCrudRecord(record, service, '确认删除该记录？', vi.fn().mockResolvedValue(false))
    ).resolves.toBe(false)
    expect(service).not.toHaveBeenCalled()

    await expect(
      removeCrudRecord(record, service, '确认删除该记录？', vi.fn().mockResolvedValue(true))
    ).resolves.toBe(true)
    expect(service).toHaveBeenCalledWith(record)
  })
})
