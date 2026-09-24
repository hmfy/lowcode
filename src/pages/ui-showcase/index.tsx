import { useState } from 'react'
import { Button, Card, Col, Row, Space, Tag, Typography } from 'antd'
import {
  BestBatchInput,
  BestDetail,
  BestEmpty,
  BestError,
  BestFilePreview,
  BestForm,
  BestLightTable,
  BestLoading,
  BestModal,
  BestDrawer,
  BestSearch,
  BestTable,
  BestPage,
  CRUD_SCHEMA_ID,
  CRUD_SCHEMA_VERSION,
  TABBED_PAGE_SCHEMA_ID,
  TABBED_PAGE_SCHEMA_VERSION,
  type BestFieldDefinition,
  type BestTableColumn,
  type CrudPageSchema,
  type TabbedPageSchema
} from 'best-lowcode-runtime'
import { showcasePeople, showcaseRegistry } from './registry'

const { Title, Paragraph, Text } = Typography
type Person = (typeof showcasePeople)[number]

function ShowcaseHeading({ title, description }: { title: string; description: string }) {
  return <div className="page-heading"><div><Title level={2}>{title}</Title><Paragraph type="secondary">{description}</Paragraph></div></div>
}

function ShowcaseCard({ title, description, className, children }: { title: string; description?: string; className?: string; children: React.ReactNode }) {
  return <Card title={title} className={`section-card${className ? ` ${className}` : ''}`} extra={description ? <Text type="secondary">{description}</Text> : undefined}>{children}</Card>
}

const columns: BestTableColumn<Person>[] = [
  { title: '姓名', dataIndex: 'name' },
  { title: '团队', dataIndex: 'team' },
  { title: '邮箱', dataIndex: 'email' },
  { title: '状态', dataIndex: 'status', render: (_, person) => <Tag color={person.status === 'active' ? 'green' : 'gold'}>{person.status === 'active' ? '启用' : '待审核'}</Tag> }
]

export function DataShowcasePage() {
  const first = showcasePeople[0]
  return <section><ShowcaseHeading title="数据展示组件" description="表格、详情和文件预览组件，展示常用数据密度与内容布局。" />
    <ShowcaseCard title="BestTable" description="ProTable 能力封装"><BestTable<Person> rowKey="id" columns={columns} dataSource={showcasePeople} search={false} pagination={{ pageSize: 3 }} /></ShowcaseCard>
    <ShowcaseCard title="BestLightTable" description="轻量只读表格"><BestLightTable<Person> rowKey="id" data={showcasePeople.slice(0, 3)} columns={[{ field: 'name', title: '姓名' }, { field: 'team', title: '团队' }, { field: 'status', title: '状态', render: (value) => <Tag color={value === 'active' ? 'green' : 'gold'}>{value === 'active' ? '启用' : '待审核'}</Tag> }]} /></ShowcaseCard>
    <ShowcaseCard title="BestDetail" description="字段分组与嵌套表格"><BestDetail record={first} fields={[{ field: 'id', label: '员工编号' }, { field: 'name', label: '姓名' }, { field: 'team', label: '团队' }, { field: 'email', label: '邮箱' }, { field: 'status', label: '状态', valueEnum: { active: '启用', pending: '待审核' } }]} /></ShowcaseCard>
    <ShowcaseCard title="BestFilePreview" description="图片缩略图、文件名称与下载入口"><BestFilePreview files={[{ name: '项目封面示例.png', mimeType: 'image/png', url: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22 viewBox=%220 0 80 80%22%3E%3Crect width=%2280%22 height=%2280%22 rx=%2212%22 fill=%22%23e6f4ff%22/%3E%3Ccircle cx=%2240%22 cy=%2240%22 r=%2218%22 fill=%22%231677ff%22/%3E%3C/svg%3E' }, { name: '需求说明.pdf', mimeType: 'application/pdf', url: '#' }]} onDownload={(file) => window.alert(`下载示例：${file.name}`)} /></ShowcaseCard>
  </section>
}

const formFields: BestFieldDefinition[] = [
  { field: 'name', label: '姓名', component: 'input', required: true, placeholder: '请输入姓名' },
  { field: 'team', label: '团队', component: 'select', options: ['产品', '设计', '研发', '运营'].map((value) => ({ label: value, value })) },
  { field: 'owner', label: '负责人（远程搜索）', component: 'remoteSelect', remoteService: 'showcase.remotePeople', searchField: 'keyword', labelField: 'label', valueField: 'value', placeholder: '输入姓名搜索' },
  { field: 'score', label: '评分', component: 'number', placeholder: '0–100' },
  { field: 'startDate', label: '入职日期', component: 'date' },
  { field: 'custom', label: '自定义 Slot 字段', component: 'slot', render: () => <Tag color="blue">由业务自定义渲染</Tag> },
  { field: 'note', label: '备注', component: 'textarea', span: 24, placeholder: '补充说明' },
  { field: 'tags', label: '标签组', component: 'repeatable', itemFields: [{ field: 'label', label: '标签', component: 'input' }], minItems: 1, maxItems: 3 }
]

export function FormsShowcasePage() {
  const [parsed, setParsed] = useState<string[][]>([])
  const [submitted, setSubmitted] = useState<Record<string, unknown>>({})
  const [searchResult, setSearchResult] = useState<Record<string, unknown>>({})
  const searchFields: BestFieldDefinition[] = [
    { field: 'keyword', label: '关键词', component: 'input', placeholder: '姓名或邮箱' },
    { field: 'team', label: '团队', component: 'select', options: ['产品', '设计', '研发', '运营'].map((value) => ({ label: value, value })) },
    { field: 'joined', label: '入职日期', component: 'dateRange', span: 8 }
  ]
  return <section><ShowcaseHeading title="表单输入组件" description="展示表单校验、字典选项、远程选择、日期范围与批量文本解析。" />
    <ShowcaseCard title="BestSearch" description="支持查询、重置及受控值"><BestSearch fields={searchFields} onSearch={setSearchResult} onReset={setSearchResult} /><Text type="secondary">当前查询：{JSON.stringify(searchResult)}</Text></ShowcaseCard>
    <ShowcaseCard title="BestForm" description="支持条件字段、校验规则和可重复字段组"><BestForm fields={formFields} initialValues={{ name: '林予安', team: '产品', score: 92, tags: [{ label: '核心用户' }] }} onSubmit={setSubmitted} onCancel={() => setSubmitted({ cancelled: true })} /><Text type="secondary">最近提交：{JSON.stringify(submitted)}</Text></ShowcaseCard>
    <ShowcaseCard title="BestBatchInput" description="每行一条，竖线分隔字段"><Row gutter={16}><Col xs={24} md={14}><BestBatchInput rows={5} placeholder={'林予安 | 产品 | active\n周知夏 | 设计 | active'} onChange={(_, rows) => setParsed(rows)} /></Col><Col xs={24} md={10}><Text strong>解析结果</Text><pre className="showcase-code">{JSON.stringify(parsed, null, 2)}</pre></Col></Row></ShowcaseCard>
    <ShowcaseCard title="字段类型速览"><Space wrap>{['input 文本', 'number 数字', 'select 下拉', 'remoteSelect 远程搜索', 'date 日期', 'dateRange 日期范围', 'textarea 多行文本', 'slot 自定义插槽', 'repeatable 可重复组'].map((item) => <Tag key={item}>{item}</Tag>)}</Space></ShowcaseCard>
  </section>
}

export function FeedbackShowcasePage() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  return <section><ShowcaseHeading title="反馈交互组件" description="加载、空数据、错误状态，以及可由业务操作打开的抽屉和弹窗。" />
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8}><ShowcaseCard title="BestLoading"><BestLoading description="正在加载示例数据" /></ShowcaseCard></Col>
      <Col xs={24} md={8}><ShowcaseCard title="BestEmpty"><BestEmpty description="暂时没有待处理事项" /></ShowcaseCard></Col>
      <Col xs={24} md={8}><ShowcaseCard title="BestError"><BestError description="示例请求失败，请重试" /></ShowcaseCard></Col>
    </Row>
    <ShowcaseCard title="BestDrawer / BestModal" description="点击按钮预览真实容器交互"><Space><Button type="primary" onClick={() => setDrawerOpen(true)}>打开抽屉</Button><Button onClick={() => setModalOpen(true)}>打开弹窗</Button></Space></ShowcaseCard>
    <BestDrawer open={drawerOpen} title="BestDrawer 示例" onClose={() => setDrawerOpen(false)} footer={<Button type="primary" onClick={() => setDrawerOpen(false)}>完成</Button>}><BestDetail record={showcasePeople[0]} fields={[{ field: 'name', label: '姓名' }, { field: 'team', label: '团队' }, { field: 'email', label: '邮箱' }]} /></BestDrawer>
    <BestModal open={modalOpen} title="BestModal 示例" onClose={() => setModalOpen(false)}><Paragraph>弹窗内容可以承载表单、确认信息或其他自定义组件。</Paragraph><Button type="primary" onClick={() => setModalOpen(false)}>知道了</Button></BestModal>
  </section>
}

const crudSchema: CrudPageSchema = {
  $schema: CRUD_SCHEMA_ID, version: CRUD_SCHEMA_VERSION, id: 'ui-showcase-people', kind: 'crud', title: '成员',
  dataSource: { list: 'showcase.people', detail: 'showcase.detail', create: 'showcase.create', update: 'showcase.update', remove: 'showcase.remove' },
  search: [{ field: 'name', label: '姓名', component: 'input', placeholder: '搜索姓名' }, { field: 'team', label: '团队', component: 'select', dict: 'teams' }],
  form: [{ field: 'name', label: '姓名', component: 'input', required: true }, { field: 'team', label: '团队', component: 'select', dict: 'teams' }, { field: 'email', label: '邮箱', component: 'input', rules: [{ type: 'email', message: '请输入有效邮箱' }] }],
  table: {
    rowKey: 'id',
    columns: [{ field: 'name', title: '姓名', width: 140 }, { field: 'team', title: '团队', width: 120 }, { field: 'email', title: '邮箱', width: 240 }, { field: 'status', title: '状态', dict: 'status', width: 100 }],
    expandable: {
      dataField: 'detailList',
      showExpandAll: true,
      rowKey: 'id',
      defaultExpandedRowKeys: ['U-1001'],
      columns: [
        { field: 'project', title: '项目', width: 260 },
        { field: 'role', title: '职责', width: 180 },
        { field: 'progress', title: '进度', width: 120 }
      ]
    },
    actions: [{ id: 'detail', label: '详情', effect: 'openDetail' }, { id: 'edit', label: '编辑', effect: 'openEdit' }, { id: 'remove', label: '删除', effect: 'remove' }],
    pageSize: 5
  },
  toolbar: [{ id: 'create', label: '新增成员', effect: 'openCreate', buttonType: 'primary' }],
  detail: { mode: 'drawer', fields: [{ field: 'id', label: '员工编号' }, { field: 'name', label: '姓名' }, { field: 'team', label: '团队' }, { field: 'email', label: '邮箱' }, { field: 'status', label: '状态', dict: 'status' }] }
}

const capabilityCrudSchema: CrudPageSchema = {
  $schema: CRUD_SCHEMA_ID, version: CRUD_SCHEMA_VERSION, id: 'ui-showcase-runtime-capabilities', kind: 'crud', title: 'Runtime 能力示例',
  dataSource: { list: 'showcase.people', detail: 'showcase.detail', create: 'showcase.create', update: 'showcase.update', remove: 'showcase.remove' },
  search: [
    { field: 'name', label: '姓名', component: 'input', placeholder: '输入姓名' },
    { field: 'team', label: '团队', component: 'select', dict: 'teams' },
    { field: 'status', label: '状态', component: 'select', dict: 'status' },
    { field: 'joinedAt', label: '入职日期', component: 'date' },
    { field: 'budget', label: '年度预算', component: 'number' }
  ],
  searchConfig: { collapsible: true, defaultCollapsed: false, collapseAfter: 2 },
  header: { beforeSearch: { slot: 'showcase.peopleStatusFilter' } },
  table: {
    rowKey: 'id',
    columns: [
      { field: 'name', title: '姓名', width: 140 },
      { field: 'team', title: '团队', width: 120 },
      { field: 'status', title: '状态', dict: 'status', width: 100 },
      { field: 'joinedAt', title: '入职日期', format: 'date', width: 140 },
      { field: 'budget', title: '年度预算', format: 'money', width: 140 }
    ],
    rowSelection: { enabled: true, preserveSelectedRowKeys: true },
    toolbar: {
      refresh: true,
      columnSettings: true,
      exportAction: { id: 'export', label: '导出 Mock', effect: 'runAction', action: 'showcase.export' }
    },
    actions: [
      { id: 'detail', label: '详情', effect: 'openDetail' },
      { id: 'edit', label: '编辑', effect: 'openEdit', visibleWhen: { operator: 'equals', field: 'status', value: 'active' } },
      { id: 'remove', label: '删除', effect: 'remove', disabledWhen: { operator: 'equals', field: 'status', value: 'pending' } }
    ],
    pageSize: 5
  },
  toolbar: [
    { id: 'batchActivate', label: '批量设为启用', effect: 'runAction', action: 'showcase.batchActivate', buttonType: 'primary' }
  ],
  detail: {
    mode: 'drawer',
    fields: [
      { field: 'id', label: '员工编号' },
      { field: 'name', label: '姓名' },
      { field: 'joinedAt', label: '入职日期', format: 'date' },
      { field: 'budget', label: '年度预算', format: 'money' }
    ],
    sections: [{
      key: 'projects',
      title: '参与项目',
      layout: 'table',
      variant: 'card',
      table: {
        data: 'detailList',
        rowKey: 'id',
        columns: [
          { field: 'project', title: '项目' },
          { field: 'role', title: '职责' },
          { field: 'progress', title: '进度' }
        ]
      }
    }]
  }
}

const tabsSchema: TabbedPageSchema = {
  $schema: TABBED_PAGE_SCHEMA_ID, version: TABBED_PAGE_SCHEMA_VERSION, id: 'ui-showcase-tabs', kind: 'tabs',
  tabs: [
    { key: 'active', label: '成员管理', content: { type: 'crud', schema: crudSchema } },
    { key: 'summary', label: '自定义面板', content: { type: 'slot', slot: 'showcase.summary' } }
  ]
}

export function PagesShowcasePage() {
  return <section><ShowcaseHeading title="页面模板组件" description="以 Schema 组合完整 CRUD 页面和标签页，使用本地模拟服务演示交互。" />
    <ShowcaseCard className="section-card-fixed-height" title="BestPage" description="统一 Provider 边界、列表、查询、增删改查、行展开明细表和详情抽屉"><BestPage tableHeight={480} registry={showcaseRegistry} schema={crudSchema} /></ShowcaseCard>
    <ShowcaseCard title="Runtime 能力全量示例" description="Mock 演示业务筛选 Slot、行选择、批量动作、查询折叠、工具栏、动态行操作和详情明细表"><BestPage tableHeight={480} registry={showcaseRegistry} schema={capabilityCrudSchema} /></ShowcaseCard>
    <ShowcaseCard title="BestPage / BestTabbedPage" description="统一 Provider 边界、标签页中组合 CRUD 页面与注册 Slot"><BestPage tableHeight={480} registry={showcaseRegistry} schema={tabsSchema} /></ShowcaseCard>
  </section>
}
