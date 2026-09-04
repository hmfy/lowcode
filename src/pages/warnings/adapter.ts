import type { BestListService, BestService } from 'best-lowcode-runtime'

const base = [
  ['883301749109059584', '178833848671', 'test202609826157232981694'], ['883258175726317568', '1788335889610', 'test20260902160929640539'],
  ['883257498245558272', '1788335849233', 'test202609A9^5U_)2u'], ['883257511589494784', '1788335742717', 'test2026094f0d584e-a253-4200-9258-427829c9742dc'],
  ['883254974432178176', '1788335698828', 'test20260901010121'], ['883254736950865696', '1788335684585', 'test2026090101012'],
  ['88322947063116856', '1788334178335', 'test202609010012'], ['883229006405595136', '1788334150948', 'test202609010011'],
  ['88320642586694656', '1788332805034', 'test20260920160151624484'], ['883205668945817600', '1788332759911', 'test20260821003'],
  ['883204305830572032', '1788332678345', 'test20260821003'], ['865795731164786688', '1787295046708', 'test20260821002'],
  ['86561968075313536', '1787284553374', 'test20260821001'], ['865607874127907856', '1787283849692', 'feishu_James0728_Payshield_CDRN'],
  ['865607056707579904', '1787283800947', 'test20260821001'], ['86560981713424384', '1787283796350', 'feishu_James0728_Payshield'],
  ['865605876925453888', '1787283730562', 'test20260821001'], ['865605367678353408', '1787283700291', 'test20260821001'],
  ['865602221564477440', '1787283512771', 'test20260821001'], ['865601629261643776', '1787283477438', 'test20260821001']
] as const

export const warningRows = base.map(([warningId, serviceWarningId, registeredDescriptor], index) => ({
  warningId, serviceWarningId, warningType: index === 15 ? 'ETHOCA' : 'CDRN', registeredDescriptor,
  receivedDescriptor: index > 13 ? 'test20260821001' : '-', merchantId: index === 10 ? '14831' : '-',
  customerName: index === 10 ? 'zhangchengcheng@bestfulfill.com' : '-', provider: 'payshield',
  transactionAmount: '100.80 USD', processStatus: index === 12 ? 'none' : 'pending', chargeStatus: 'unpaid',
  transactionAt: '2026-09-02 11:52:37', receivedAt: `2026-09-02 ${String(16 - Math.floor(index / 3)).padStart(2, '0')}:${String(41 - index).padStart(2, '0')}:26`,
  expireAt: '2026-08-23 09:30:57', remainingHours: '-', cardLastFour: index === 10 ? '0377' : '-',
  chargeAmount: '-', completedAt: '-', serviceCost: '-', profit: '-', authorizationId: index === 10 ? '45024Z' : '-'
}))

export const listWarnings: BestListService = async ({ page, pageSize, filters }) => {
  const entries = warningRows.filter((row) => Object.entries(filters).every(([key, value]) => !value || String(row[key as keyof typeof row]).includes(String(value))))
  return { total: entries.length, items: entries.slice((page - 1) * pageSize, page * pageSize) }
}
export const detailWarning: BestService = async ({ warningId }) => warningRows.find((row) => row.warningId === warningId) ?? warningRows[0]
export const assignWarning: BestService = async () => ({ ok: true })
