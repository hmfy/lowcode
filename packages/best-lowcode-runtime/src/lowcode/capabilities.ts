export type RuntimeCapability = {
  key: string
  label: string
  description: string
  schemaPath?: string
  example?: Record<string, unknown>
}

export type RuntimeCapabilityManifest = {
  runtime: 'best-lowcode-runtime'
  version: 1
  capabilities: RuntimeCapability[]
}

const semanticCapabilities: RuntimeCapability[] = [
  {
    key: 'page.crud',
    label: 'CRUD 页面',
    description: '使用 BestPage 通过 Schema 声明查询区、数据表格、详情和操作。',
    schemaPath: 'CrudPageSchema'
  },
  {
    key: 'page.tabs',
    label: '页面状态页签',
    description: '使用 TabbedPageSchema 声明多个 CRUD 页面或 Slot 页面，并切换页面上下文。',
    schemaPath: 'TabbedPageSchema'
  },
  {
    key: 'table.expandable',
    label: '表格展开明细表',
    description: '父表行展开后展示独立的子表，适用于订单明细、SKU 明细等一对多数据。',
    schemaPath: 'table.expandable',
    example: {
      dataField: 'detailList',
      showExpandAll: true,
      rowKey: 'skuCode',
      columns: [
        { field: 'skuCode', title: 'SKU编码' },
        { field: 'skuName', title: 'SKU名称' }
      ]
    }
  },
  {
    key: 'table.rowSelection',
    label: '表格行选择',
    description: '为表格启用 checkbox 行选择，并通过 rowKey 维护选中行。',
    schemaPath: 'table.rowSelection',
    example: { enabled: true }
  },
  {
    key: 'table.batchAction',
    label: '表格批量操作',
    description: '在工具栏或页面操作中读取 selectedRowKeys、selectedRecords 与 query 执行批量业务动作。',
    schemaPath: 'toolbar[].effect',
    example: { effect: 'runAction', action: 'transferToWms' }
  },
  {
    key: 'page.headerSlot',
    label: '页面业务筛选 Slot',
    description: '在查询区前后注入业务筛选控件；Slot 可读取并更新 Runtime 管理的 query 后刷新列表。',
    schemaPath: 'header.beforeSearch / header.afterSearch'
  },
  {
    key: 'table.search.collapsible',
    label: '查询区折叠',
    description: '控制查询表单默认展开状态，并支持用户在页面上收起或展开查询区。',
    schemaPath: 'searchConfig.collapsible',
    example: { collapsible: true, defaultCollapsed: false }
  },
  {
    key: 'table.toolbar',
    label: '表格工具栏',
    description: '声明新建、导出、刷新、列设置或批量业务操作等表格工具栏动作。',
    schemaPath: 'toolbar[]'
  },
  {
    key: 'table.actionVisibility',
    label: '行操作动态状态',
    description: '按 row、selection、query、detail 或 form 作用域动态控制行操作的显示和禁用状态。',
    schemaPath: 'table.actions[].visibleWhen / disabledWhen'
  },
  {
    key: 'form.fields',
    label: '表单字段',
    description: '使用 Runtime 内置字段类型声明查询表单、创建表单和编辑表单。',
    schemaPath: 'search[] / form[]'
  },
  {
    key: 'form.repeatable',
    label: '重复表单字段',
    description: '声明可增删的重复字段组，适用于明细项或多值表单。',
    schemaPath: 'form[].type',
    example: { type: 'repeatable', name: 'items' }
  },
  {
    key: 'detail.table',
    label: '详情明细表',
    description: '在详情区域声明只读明细表，适用于展示关联列表数据。',
    schemaPath: 'detail.sections[].table'
  },
  {
    key: 'effect.runAction',
    label: '业务动作',
    description: '调用 Registry 中注册的业务动作，并将页面上下文传给动作处理器。',
    schemaPath: 'table.actions[].effect / toolbar[].effect'
  },
  {
    key: 'slot.customContent',
    label: 'Runtime Slot 扩展',
    description: 'Runtime 已覆盖页面行为但内容需要自定义渲染时，通过 Slot 注入局部内容。',
    schemaPath: 'slot'
  }
]

const builtinDescriptions: Record<string, [string, string]> = {
  'builtin.effect.openCreate': ['打开新建', '打开 CRUD 新建表单。'],
  'builtin.effect.openDetail': ['打开详情', '打开 CRUD 详情区域。'],
  'builtin.effect.openEdit': ['打开编辑', '打开当前行编辑表单。'],
  'builtin.effect.remove': ['删除动作', '调用删除服务并刷新列表。'],
  'builtin.effect.runAction': ['执行动作', '执行 Registry 中注册的业务动作。'],
  'builtin.effect.slot': ['Slot 动作', '渲染或打开 Runtime Slot。'],
  'builtin.effect.closeDetail': ['关闭详情', '关闭当前详情区域。'],
  'builtin.format.date': ['日期格式化', '格式化日期字段。'],
  'builtin.format.datetime': ['日期时间格式化', '格式化日期时间字段。'],
  'builtin.format.money': ['金额格式化', '格式化金额字段。'],
  'builtin.format.text': ['文本格式化', '格式化普通文本字段。'],
  'builtin.field.input': ['输入框', '声明普通文本输入字段。'],
  'builtin.field.number': ['数字输入框', '声明数字输入字段。'],
  'builtin.field.select': ['选择框', '声明静态选项选择字段。'],
  'builtin.field.remoteSelect': ['远程选择框', '声明从服务加载选项的选择字段。'],
  'builtin.field.date': ['日期字段', '声明日期选择字段。'],
  'builtin.field.dateRange': ['日期范围字段', '声明日期范围选择字段。'],
  'builtin.field.textarea': ['多行文本', '声明多行文本字段。'],
  'builtin.field.slot': ['字段 Slot', '在字段位置注入自定义渲染。'],
  'builtin.field.repeatable': ['重复字段', '声明可重复的字段组。']
}

export const runtimeCapabilityManifest: RuntimeCapabilityManifest = {
  runtime: 'best-lowcode-runtime',
  version: 1,
  capabilities: [
    ...semanticCapabilities,
    ...Object.entries(builtinDescriptions).map(([key, [label, description]]) => ({
      key,
      label,
      description
    }))
  ]
}

export function getRuntimeCapabilityManifest(): RuntimeCapabilityManifest {
  return {
    ...runtimeCapabilityManifest,
    capabilities: runtimeCapabilityManifest.capabilities.map((capability) => ({
      ...capability,
      ...(capability.example ? { example: structuredClone(capability.example) } : {})
    }))
  }
}

export function getRuntimeCapabilityKeys(): string[] {
  return runtimeCapabilityManifest.capabilities.map(({ key }) => key)
}
