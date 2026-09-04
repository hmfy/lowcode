import { CRUD_SCHEMA_ID, CRUD_SCHEMA_VERSION, type CrudPageSchema } from 'best-lowcode-runtime'

export const warningSchema = {
  $schema: CRUD_SCHEMA_ID,
  version: CRUD_SCHEMA_VERSION,
  id: 'warning-management',
  kind: 'crud',
  title: '预警',
  dataSource: { list: 'warning.list', detail: 'warning.detail' },
  searchMode: 'bestSearch',
  search: [
    { field: 'warningType', label: '预警类型', component: 'select', dict: 'warningTypes', span: 4 },
    { field: 'merchantId', label: '商户ID', component: 'input', placeholder: '请输入商户ID', span: 4 },
    { field: 'customerName', label: '客户名称', component: 'input', placeholder: '请输入客户名称', span: 4 },
    { field: 'provider', label: '服务商', component: 'select', dict: 'providers', span: 4 },
    { field: 'processStatus', label: '处理状态', component: 'select', dict: 'processStatuses', span: 4 },
    { field: 'chargeStatus', label: '扣费状态', component: 'select', dict: 'chargeStatuses', span: 4 },
    { field: 'receivedAt', label: '接收时间', component: 'dateRange', span: 8 }
  ],
  table: {
    rowKey: 'warningId', pageSize: 20, scrollX: 2200,
    columns: [
      { field: 'warningId', title: '预警ID', width: 170 },
      { field: 'serviceWarningId', title: '服务商预警ID', width: 170 },
      { field: 'warningType', title: '预警类型', dict: 'warningTypes', width: 90 },
      { field: 'registeredDescriptor', title: '注册Descriptor', width: 220 },
      { field: 'receivedDescriptor', title: '接收预警的Descriptor', width: 220 },
      { field: 'merchantId', title: '商户ID', width: 90 },
      { field: 'customerName', title: '客户名称', width: 150 },
      { field: 'provider', title: '服务商', width: 100 },
      { field: 'transactionAmount', title: '交易金额', width: 110 },
      { field: 'processStatus', title: '处理状态', dict: 'processStatuses', width: 110 },
      { field: 'chargeStatus', title: '扣费状态', dict: 'chargeStatuses', width: 100 },
      { field: 'receivedAt', title: '接收时间', format: 'datetime', width: 160 },
      { field: 'expireAt', title: '预计到期时间', format: 'datetime', width: 160 },
      { field: 'remainingHours', title: '剩余小时', width: 90 },
      { field: 'cardLastFour', title: '卡号后四位', width: 100 }
    ],
    actions: [
      { id: 'detail', label: '详情', effect: 'openDetail' },
      { id: 'assign', label: '分配', effect: 'slot', slot: 'warning.assign' }
    ]
  },
  detail: {
    fields: [
      { field: 'warningId', label: '预警ID' }, { field: 'warningType', label: '预警类型', dict: 'warningTypes' },
      { field: 'registeredDescriptor', label: '注册Descriptor' }, { field: 'receivedDescriptor', label: '接收预警的Descriptor' },
      { field: 'transactionAmount', label: '交易金额' }, { field: 'transactionAt', label: '交易时间' },
      { field: 'receivedAt', label: '接收时间' }, { field: 'cardLastFour', label: '卡号后四位' },
      { field: 'processStatus', label: '处理状态', dict: 'processStatuses' }, { field: 'chargeStatus', label: '扣费状态', dict: 'chargeStatuses' },
      { field: 'chargeAmount', label: '扣费金额' }, { field: 'completedAt', label: '完成时间' }, { field: 'serviceCost', label: '服务商成本' },
      { field: 'profit', label: '利润' }, { field: 'customerName', label: '客户名称' }, { field: 'provider', label: '服务商' }, { field: 'authorizationId', label: '授权ID' }
    ]
  }
} satisfies CrudPageSchema
