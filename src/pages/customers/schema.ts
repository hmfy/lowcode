import {
  CRUD_SCHEMA_ID,
  CRUD_SCHEMA_VERSION,
  type CrudPageSchema
} from "best-lowcode-runtime";
export const customerSchema = {
  $schema: CRUD_SCHEMA_ID,
  version: CRUD_SCHEMA_VERSION,
  id: "customer-management",
  kind: "crud",
  title: "客户",
  dataSource: {
    list: "customer.list",
    detail: "customer.detail",
    create: "customer.create",
    update: "customer.update",
    remove: "customer.remove"
  },
  searchMode: "bestSearch",
  search: [
    { field: "name", label: "客户名称", component: "input" },
    { field: "id", label: "商户ID", component: "input" },
    { field: "email", label: "登录邮箱", component: "input" },
    { field: "status", label: "状态", component: "select", dict: "status" },
    { field: "tag", label: "客户标签", component: "select", dict: "tags" },
    { field: "source", label: "客户来源", component: "select", dict: "sources" }
  ],
  form: [
    { field: "name", label: "客户名称", component: "input", required: true },
    { field: "email", label: "登录邮箱", component: "input", required: true },
    { field: "password", label: "密码", component: "input", required: true },
    {
      field: "notify",
      label: "飞书通知",
      component: "select",
      dict: "boolean"
    },
    { field: "tag", label: "客户标签", component: "select", dict: "tags" },
    {
      field: "source",
      label: "客户来源",
      component: "select",
      dict: "sources",
      required: true
    },
    {
      field: "sourcePerson",
      label: "介绍人",
      component: "remoteSelect",
      remoteService: "user.search",
      visibleWhen: { operator: "equals", field: "source", value: "internal_referral" },
      clearWhenHidden: true
    },
    {
      field: "sourceChannel",
      label: "介绍渠道",
      component: "select",
      dict: "channels",
      visibleWhen: { operator: "equals", field: "source", value: "business_referral" },
      clearWhenHidden: true
    },
    {
      field: "sourceDescription",
      label: "来源描述",
      component: "input",
      visibleWhen: { operator: "equals", field: "source", value: "self_registered" },
      clearWhenHidden: true
    },
    {
      field: "pricingMode",
      label: "定价模式",
      component: "select",
      dict: "pricingModes",
      required: true
    },
    {
      field: "ethocaPrice",
      label: "ETHOCA单价（$）",
      component: "number",
      required: true,
      visibleWhen: { operator: "equals", field: "pricingMode", value: "fixed" }
    },
    {
      field: "rdrPrice",
      label: "RDR单价（$）",
      component: "number",
      required: true,
      visibleWhen: { operator: "equals", field: "pricingMode", value: "fixed" }
    },
    {
      field: "cdrnPrice",
      label: "CDRN单价（$）",
      component: "number",
      required: true,
      visibleWhen: { operator: "equals", field: "pricingMode", value: "fixed" }
    },
    {
      field: "tiers",
      label: "",
      component: "slot",
      slot: "customer.tieredPricing",
      visibleWhen: {
        operator: "equals",
        field: "pricingMode",
        value: "tiered"
      },
      clearWhenHidden: true
    }
  ],
  table: {
    rowKey: "id",
    pageSize: 10,
    scrollX: 2100,
    columns: [
      { field: "id", title: "商户ID", width: 160 },
      { field: "name", title: "客户名称", width: 200 },
      { field: "email", title: "登录邮箱", width: 200 },
      { field: "status", title: "状态", dict: "status", width: 90 },
      { field: "authorized", title: "授权卡数", width: 100 },
      { field: "tag", title: "标签", dict: "tags", width: 120 },
      { field: "sourceText", title: "来源", width: 180 },
      { field: "currency", title: "币种", width: 90 },
      { field: "balance", title: "当前余额", format: "money", width: 140 },
      { field: "available", title: "预计可用额度", format: "money", width: 170 },
      { field: "createdAt", title: "创建时间", format: "datetime", width: 180 }
    ],
    actions: [
      { id: "edit", label: "编辑", effect: "openEdit" },
      { id: "detail", label: "查看", effect: "openDetail" },
      { id: "toggle", label: "启用/禁用", effect: "runAction", action: "customer.toggleStatus" },
      { id: "reset", label: "修改密码", effect: "runAction", action: "customer.resetPassword" },
      { id: "remove", label: "删除", effect: "remove" }
    ]
  },
  toolbar: [{ id: "create", label: "添加客户", effect: "openCreate", buttonType: "primary" }],
  detail: {
    fields: [
      { field: "id", label: "商户ID" },
      { field: "name", label: "客户名称" },
      { field: "email", label: "联系邮箱" },
      { field: "tag", label: "客户标签", dict: "tags" },
      { field: "sourceText", label: "客户来源" },
      { field: "status", label: "账号状态", dict: "status" },
      { field: "balance", label: "当前余额" },
      { field: "createdAt", label: "创建时间" }
    ]
  }
} satisfies CrudPageSchema;
