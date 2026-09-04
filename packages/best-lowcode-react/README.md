# best-lowcode-runtime

BEST 的 React 低代码运行时统一入口，包含 Schema 驱动的 CRUD 页面、运行时 Registry 与基础 UI 组件。

## 安装

```bash
npm install best-lowcode-runtime
```

本包将 React、React DOM、Ant Design、Ant Design Pro Components 和 Day.js 声明为 peer dependencies；应用应使用与项目兼容的版本安装它们。

## 快速开始

```tsx
import 'best-lowcode-runtime/style.css'
import {
  BestCrudPage,
  BestProvider,
  CRUD_SCHEMA_ID,
  CRUD_SCHEMA_VERSION,
  type CrudPageSchema
} from 'best-lowcode-runtime'

const schema = {
  $schema: CRUD_SCHEMA_ID,
  version: CRUD_SCHEMA_VERSION,
  id: 'customer-list',
  kind: 'crud',
  title: '客户列表',
  dataSource: { list: 'customer.list' },
  table: {
    rowKey: 'id',
    columns: [{ field: 'name', title: '名称' }]
  }
} satisfies CrudPageSchema

export function CustomerPage() {
  return (
    <BestProvider registry={{ services: { 'customer.list': async () => ({ list: [], total: 0 }) } }}>
      <BestCrudPage schema={schema} />
    </BestProvider>
  )
}
```

## 开发期校验入口

### 通用表单和数据能力

Schema 支持 `remoteSelect`，通过 Registry Service 提供防抖搜索数据：

```ts
{
  field: 'owner',
  label: '负责人',
  component: 'remoteSelect',
  remoteService: 'user.search',
  searchField: 'keyword',
  labelField: 'name',
  valueField: 'id'
}
```

字段可声明 `required`、`type`、`min`、`max`、`minLength`、`maxLength`、`pattern` 等通用规则。
`createBestCrudAdapter` 和 `normalizeBestValues` 可用于统一清理空字符串、转换创建/更新 payload，提交期间 Runtime 会自动显示 loading 并防止重复提交。

CLI 或工具链可从 `best-lowcode-runtime/dev` 导入不依赖页面渲染的能力：

```ts
import { getBuiltinCapabilities, validateUnknownCrudPageSchema } from 'best-lowcode-runtime/dev'
```

## 发布内容

发布包只包含编译后的 `dist` 与本 README。`npm pack --dry-run` 可用于在不发布的情况下检查最终包内容。

本包当前标记为 `UNLICENSED`；在对外公开前，应由代码所有方确定正式许可证。
