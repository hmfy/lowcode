import { CRUD_SCHEMA_ID, CRUD_SCHEMA_VERSION, type CrudPageSchema } from 'best-lowcode-runtime'

export const providerSchema = {
  $schema: CRUD_SCHEMA_ID,
  version: CRUD_SCHEMA_VERSION,
  id: 'provider-management',
  kind: 'crud',
  title: '服务商',
  dataSource: { list: 'provider.list', detail: 'provider.detail', update: 'provider.update' },
  searchMode: 'bestSearch',
  search: [{ field: 'name', label: '服务商名称', component: 'input', placeholder: '请输入服务商名称' }],
  form: [
    { field: 'name', label: '服务商名称', component: 'input', required: true },
    { field: 'status', label: '状态', component: 'slot', slot: 'provider.status', required: true },
    { field: 'apiKeys', label: 'API', component: 'slot', slot: 'provider.apiInfo' },
    { field: 'pricingMode', label: '定价模式', component: 'select', dict: 'pricingModes', required: true },
    { field: 'ethocaPrice', label: 'ETHOCA单价（$）', component: 'number', required: true },
    { field: 'rdrPrice', label: 'RDR单价（$）', component: 'number', required: true },
    { field: 'cdrnPrice', label: 'CDRN单价（$）', component: 'number', required: true }
  ],
  table: {
    rowKey: 'id',
    pageSize: 10,
    scrollX: 1200,
    columns: [
      { field: 'id', title: 'ID', width: 80 },
      { field: 'name', title: '服务商名称', width: 180 },
      { field: 'status', title: '状态', slot: 'provider.status', width: 130 },
      { field: 'apiKeys', title: 'API', slot: 'provider.apiList', width: 340 },
      { field: 'updatedBy', title: '最后更新人', width: 140 },
      { field: 'updatedAt', title: '最后更新时间', format: 'datetime', width: 190 }
    ],
    actions: [{ id: 'edit', label: '编辑', effect: 'openEdit' }]
  }
} satisfies CrudPageSchema
