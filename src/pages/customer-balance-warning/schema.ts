import { CRUD_SCHEMA_ID, CRUD_SCHEMA_VERSION, type CrudPageSchema } from 'best-lowcode-runtime'

export const customerConfigSchema = {
  $schema: CRUD_SCHEMA_ID, version: CRUD_SCHEMA_VERSION, id: 'customer-balance-warning-customer-config', kind: 'crud', title: '客户配置',
  dataSource: { list: 'customerBalanceWarning.customer.list', detail: 'customerBalanceWarning.customer.detail', create: 'customerBalanceWarning.customer.create', update: 'customerBalanceWarning.customer.update', remove: 'customerBalanceWarning.customer.remove' },
  searchMode: 'bestSearch', search: [{ field: 'customerName', label: '客户名称或商户 ID', component: 'input', placeholder: '搜索客户名称或商户 ID' }],
  form: [
    { field: 'customerName', label: '客户名称（邮箱）', component: 'input', required: true },
    { field: 'historyDays', label: '历史天数（M）', component: 'number', required: true }, { field: 'forecastDays', label: '预测天数（N）', component: 'number', required: true },
    { field: 'warningFactor', label: '预警系数', component: 'number', required: true }, { field: 'minimumBalance', label: '预警最小金额（$）', component: 'number', required: true },
    { field: 'frequency', label: '通知频率', component: 'select', dict: 'balanceWarningFrequency', required: true }, { field: 'weekday', label: '每周通知日', component: 'select', dict: 'balanceWarningWeekday' },
    { field: 'timePoints', label: '通知时间点', component: 'input', placeholder: '例如：09:00、14:46、18:00' }
  ],
  table: { rowKey: 'id', pageSize: 10, columns: [
    { field: 'customerName', title: '客户名称', width: 240 }, { field: 'id', title: '商户 ID', width: 150 }, { field: 'historyDays', title: '历史天数', width: 130 }, { field: 'forecastDays', title: '预测天数', width: 130 }, { field: 'warningFactor', title: '预警系数', width: 130 }, { field: 'minimumBalance', title: '预警最小金额（$）', format: 'money', width: 170 }, { field: 'frequency', title: '通知频率', dict: 'balanceWarningFrequency', width: 150 }
  ], actions: [{ id: 'edit', label: '编辑', effect: 'openEdit' }, { id: 'remove', label: '删除', effect: 'remove' }] },
  toolbar: [{ id: 'create', label: '添加客户配置', effect: 'openCreate', buttonType: 'primary' }], detail: { fields: [{ field: 'customerName', label: '客户名称' }, { field: 'id', label: '商户 ID' }, { field: 'historyDays', label: '历史天数' }, { field: 'forecastDays', label: '预测天数' }, { field: 'warningFactor', label: '预警系数' }, { field: 'minimumBalance', label: '预警最小金额（$）', }, { field: 'frequency', label: '通知频率', dict: 'balanceWarningFrequency' }, { field: 'timePoints', label: '通知时间点' }] }
} satisfies CrudPageSchema

export const warningRecordSchema = {
  $schema: CRUD_SCHEMA_ID, version: CRUD_SCHEMA_VERSION, id: 'customer-balance-warning-records', kind: 'crud', title: '预警记录',
  dataSource: { list: 'customerBalanceWarning.record.list', detail: 'customerBalanceWarning.record.detail' }, searchMode: 'bestSearch',
  search: [{ field: 'customerName', label: '客户名称或商户 ID', component: 'input', placeholder: '搜索客户名称或商户 ID' }, { field: 'noticeStatus', label: '通知状态', component: 'select', dict: 'balanceWarningNoticeStatus' }],
  table: { rowKey: 'id', pageSize: 10, columns: [{ field: 'triggeredAt', title: '时间', width: 190 }, { field: 'customerName', title: '客户名称', width: 230 }, { field: 'merchantId', title: '商户 ID', width: 150 }, { field: 'currentBalance', title: '当前余额（$）', format: 'money', width: 160 }, { field: 'forecastBalance', title: '预测开销（$）', format: 'money', width: 160 }, { field: 'noticeStatus', title: '是否通知', dict: 'balanceWarningNoticeStatus', width: 130 }], actions: [{ id: 'detail', label: '详情', effect: 'openDetail' }] },
  detail: { fields: [{ field: 'merchantId', label: '商户 ID' }, { field: 'customerName', label: '客户名称' }, { field: 'currentBalance', label: '当前余额（$）' }, { field: 'forecastBalance', label: '预测开销（$）' }, { field: 'cashOut', label: '资金缺口（$）' }, { field: 'triggeredAt', label: '触发时间' }, { field: 'noticeStatus', label: '通知结果', dict: 'balanceWarningNoticeStatus' }, { field: 'reason', label: '未通知原因' }] }
} satisfies CrudPageSchema
