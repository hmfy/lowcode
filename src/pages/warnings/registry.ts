import { createElement } from 'react'
import type { BestRegistry } from 'best-lowcode-runtime'
import { assignWarning, detailWarning, listWarnings } from './adapter'
import { AssignButton } from './assign-slot'

export const warningRegistry: Partial<BestRegistry> = {
  listServices: { 'warning.list': listWarnings },
  services: { 'warning.detail': detailWarning, 'warning.assign': assignWarning },
  slots: { 'warning.assign': (context) => createElement(AssignButton, context) },
  dictionaries: {
    warningTypes: [{ label: '全部', value: '' }, { label: 'CDRN', value: 'CDRN' }, { label: 'ETHOCA', value: 'ETHOCA' }],
    providers: [{ label: '全部', value: '' }, { label: 'tradefensor', value: 'tradefensor' }, { label: 'payshield', value: 'payshield' }, { label: 'ozpay', value: 'ozpay' }],
    processStatuses: [{ label: '全部', value: '' }, { label: '待反馈', value: 'pending' }, { label: '无需处理', value: 'none' }],
    chargeStatuses: [{ label: '全部', value: '' }, { label: '已扣费', value: 'paid' }, { label: '未扣费', value: 'unpaid' }]
  }
}
