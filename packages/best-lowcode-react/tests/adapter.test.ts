import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { createBestCrudAdapter, normalizeBestValues } from '../src/lowcode/adapter'

describe('low-code adapter helpers', () => {
  it('normalizes empty strings recursively', () => {
    expect(normalizeBestValues({ name: ' Alice ', empty: '', tiers: [{ price: ' 2 ' }] })).toEqual({
      name: 'Alice',
      empty: undefined,
      tiers: [{ price: '2' }]
    })
  })

  it('normalizes create and update payloads', () => {
    const adapter = createBestCrudAdapter()
    expect(adapter.toCreatePayload?.({ name: ' customer ' })).toEqual({ name: 'customer' })
    expect(adapter.toUpdatePayload?.({ name: ' customer ' }, { id: 1 })).toEqual({
      name: 'customer'
    })
  })

  it('preserves Dayjs values while normalizing nested payloads', () => {
    const value = dayjs('2026-08-18T09:30:00Z')
    const result = normalizeBestValues({ createdAt: value, nested: { occurredAt: value } })
    expect(dayjs.isDayjs(result.createdAt)).toBe(true)
    expect(dayjs.isDayjs((result.nested as Record<string, unknown>).occurredAt)).toBe(true)
  })
})
