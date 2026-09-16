import type { BestListService, BestService } from 'best-lowcode-runtime'

export type BalanceWarningConfig = {
  historyDays: number
  forecastDays: number
  warningFactor: number
  minimumBalance: number
  frequency: 'daily' | 'weekly'
  weekday: string
  timePoints: string[]
}

const globalConfig: BalanceWarningConfig = {
  historyDays: 30, forecastDays: 7, warningFactor: 1, minimumBalance: 100,
  frequency: 'daily', weekday: 'monday', timePoints: ['09:00', '14:46', '18:00']
}

const customerConfigs = [
  { id: '13228', customerName: '产品演示', email: 'ouw e iquan@bestfulfill.com', historyDays: 30, forecastDays: 7, warningFactor: 1, minimumBalance: 100, frequency: 'daily', weekday: 'monday', timePoints: ['09:00', '14:46', '18:00'] },
  { id: '13492', customerName: 'LLLLLLLLLLLLLLLLLLLLLLLL', email: 'll@example.com', historyDays: 30, forecastDays: 7, warningFactor: 1, minimumBalance: 100, frequency: 'daily', weekday: 'monday', timePoints: ['10:00'] },
  { id: '13500', customerName: 'LY', email: 'ly@example.com', historyDays: 30, forecastDays: 7, warningFactor: 2, minimumBalance: 6, frequency: 'daily', weekday: 'monday', timePoints: ['09:00'] },
  { id: '13284', customerName: '菠萝饮雪', email: 'boluo@example.com', historyDays: 7, forecastDays: 1, warningFactor: 1, minimumBalance: 6, frequency: 'daily', weekday: 'monday', timePoints: ['12:00'] }
]

const warningRecords = [
  ['r1', '2026-09-08 09:04:06', '产品演示', '13228', 3569.24, 112312, 'notified'],
  ['r2', '2026-09-08 09:04:05', 'LY', '13500', 0.99, 0, 'notified'],
  ['r3', '2026-09-07 18:00:18', '产品演示', '13228', 3569.24, 112312, 'notified'],
  ['r4', '2026-09-07 17:30:18', 'LY', '13500', 0.99, 0, 'notified'],
  ['r5', '2026-09-07 17:05:18', '产品演示', '13228', 3569.24, 112312, 'notified'],
  ['r6', '2026-09-07 17:00:39', 'kehu@qq.com', '14863', 0, 0, 'notified'],
  ['r7', '2026-09-07 17:00:38', 'lt8328279_2@2925.com', '14302', 0, 0, 'notified'],
  ['r8', '2026-09-07 17:00:37', '462976799@qq.com', '13529', 0, 0, 'notNotified']
].map(([id, triggeredAt, customerName, merchantId, currentBalance, forecastBalance, noticeStatus]) => ({ id, triggeredAt, customerName, merchantId, currentBalance, forecastBalance, noticeStatus, cashOut: currentBalance === 0 ? 0 : 108742.76, reason: noticeStatus === 'notified' ? '-' : '通知通道不可用' }))

function filterPage<T extends Record<string, unknown>>(items: T[], page: number, pageSize: number, filters: Record<string, unknown>) {
  const filtered = items.filter((item) => Object.entries(filters).every(([key, value]) => !value || String(item[key] ?? '').includes(String(value))))
  return { total: filtered.length, items: filtered.slice((page - 1) * pageSize, page * pageSize) }
}

export const getGlobalConfig: BestService = async () => ({ ...globalConfig })
export const updateGlobalConfig: BestService = async (payload) => Object.assign(globalConfig, payload)
export const listCustomerConfigs: BestListService = async ({ page, pageSize, filters }) => filterPage(customerConfigs, page, pageSize, filters)
export const detailCustomerConfig: BestService = async ({ id }) => customerConfigs.find((item) => item.id === id) ?? customerConfigs[0]
export const createCustomerConfig: BestService = async (payload) => ({ id: `static-${customerConfigs.length + 1}`, ...payload })
export const updateCustomerConfig: BestService = async (payload) => payload
export const removeCustomerConfig: BestService = async () => ({ ok: true })
export const listWarningRecords: BestListService = async ({ page, pageSize, filters }) => filterPage(warningRecords, page, pageSize, filters)
export const detailWarningRecord: BestService = async ({ id }) => warningRecords.find((item) => item.id === id) ?? warningRecords[0]
