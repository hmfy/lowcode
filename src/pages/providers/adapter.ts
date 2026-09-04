import type { BestListService, BestService } from 'best-lowcode-runtime'

const rows = [
  { id: 8, name: 'Ozpay', status: 'enabled', apiKeys: ['rdr_alert_webhook', 'ethoca_alert_webhook', 'create_descriptor'].map((value) => ({ value })), updatedBy: '黎伟铭', updatedAt: '2026-06-11 16:43:25', pricingMode: 'fixed', ethocaPrice: 9.99, rdrPrice: 9.99, cdrnPrice: 9.99 },
  { id: 7, name: 'Payshield', status: 'enabled', apiKeys: ['create_descriptor', 'ethoca_feedback_alert', 'descriptor_webhook', 'rdr_alert_webhook', 'ethoca_alert_webhook', 'cdrn_alert_webhook'].map((value) => ({ value })), updatedBy: '黎伟铭', updatedAt: '2026-04-13 14:25:02', pricingMode: 'fixed', ethocaPrice: 9.99, rdrPrice: 9.99, cdrnPrice: 9.99 },
  { id: 1, name: '拒付通', status: 'enabled', apiKeys: ['create_descriptor', 'close_descriptor', 'ethoca_feedback_alert', 'descriptor_webhook', 'rdr_alert_webhook', 'ethoca_alert_webhook'].map((value) => ({ value })), updatedBy: '黎伟铭', updatedAt: '2026-04-09 15:33:31', pricingMode: 'fixed', ethocaPrice: 9.99, rdrPrice: 9.99, cdrnPrice: 9.99 }
]

export const listProviders: BestListService = async ({ page, pageSize, filters }) => {
  const name = String(filters.name ?? '').trim().toLowerCase()
  const filtered = name ? rows.filter((row) => row.name.toLowerCase().includes(name)) : rows
  return { total: filtered.length, items: filtered.slice((page - 1) * pageSize, page * pageSize) }
}

export const detailProvider: BestService = async ({ id }) => rows.find((row) => String(row.id) === String(id)) ?? rows[0]
export const updateProvider: BestService = async () => ({ ok: true })
