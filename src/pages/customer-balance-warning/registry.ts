import type { BestRegistry } from 'best-lowcode-runtime'
import { createCustomerConfig, detailCustomerConfig, detailWarningRecord, listCustomerConfigs, listWarningRecords, removeCustomerConfig, updateCustomerConfig } from './adapter'

export const balanceWarningRegistry: Partial<BestRegistry> = {
  listServices: { 'customerBalanceWarning.customer.list': listCustomerConfigs, 'customerBalanceWarning.record.list': listWarningRecords },
  services: { 'customerBalanceWarning.customer.detail': detailCustomerConfig, 'customerBalanceWarning.customer.create': createCustomerConfig, 'customerBalanceWarning.customer.update': updateCustomerConfig, 'customerBalanceWarning.customer.remove': removeCustomerConfig, 'customerBalanceWarning.record.detail': detailWarningRecord },
  dictionaries: {
    balanceWarningFrequency: [{ label: '每天定时通知', value: 'daily' }, { label: '每周定时通知', value: 'weekly' }],
    balanceWarningNoticeStatus: [{ label: '全部', value: '' }, { label: '已通知', value: 'notified' }, { label: '未通知', value: 'notNotified' }],
    balanceWarningWeekday: [{ label: '周一', value: 'monday' }, { label: '周二', value: 'tuesday' }, { label: '周三', value: 'wednesday' }, { label: '周四', value: 'thursday' }, { label: '周五', value: 'friday' }]
  }
}
