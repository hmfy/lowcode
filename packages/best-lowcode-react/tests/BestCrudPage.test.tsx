// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { type ReactNode, useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CRUD_SCHEMA_ID, CRUD_SCHEMA_VERSION, type CrudPageSchema } from '../src/lowcode'
import { BestCrudPage, buildCrudSubmitValues } from '../src/lowcode/BestCrudPage'
import { BestProvider } from '../src/runtime'

const spies = vi.hoisted(() => ({
  confirm: vi.fn(),
  error: vi.fn(),
  reload: vi.fn(),
  success: vi.fn(),
  request: undefined as undefined | ((params: Record<string, unknown>) => Promise<unknown>)
}))

vi.mock('antd', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button onClick={onClick} type='button'>
      {children}
    </button>
  ),
  ConfigProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Modal: { confirm: spies.confirm },
  message: { error: spies.error, success: spies.success }
}))

type TableColumn = {
  dataIndex?: string
  render?: (value: unknown, record: Record<string, unknown>) => ReactNode
  renderText?: (value: unknown, record: Record<string, unknown>) => ReactNode
  valueType?: string
  title: string
  valueEnum?: Record<string, ReactNode | { text?: ReactNode }>
}

vi.mock('../src/ui', () => ({
  BestDetail: () => <div>详情</div>,
  BestDrawer: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  BestForm: ({
    initialValues,
    onSubmit
  }: {
    initialValues?: Record<string, unknown>
    onSubmit: (values: Record<string, unknown>) => void
  }) => (
    <button onClick={() => onSubmit({ ...(initialValues ?? {}), name: 'updated' })} type='button'>
      提交表单
    </button>
  ),
  BestSearch: ({ onSearch }: { onSearch: (value: Record<string, unknown>) => void }) => (
    <button onClick={() => onSearch({ tag: 'retail' })} type='button'>
      搜索
    </button>
  ),
  BestTable: ({
    actionRef,
    columns,
    request,
    toolBarRender
  }: {
    actionRef: { current?: { reload: () => void } }
    columns: TableColumn[]
    request: (params: Record<string, unknown>) => Promise<unknown>
    toolBarRender?: () => ReactNode[]
  }) => {
    spies.request = request
    useEffect(() => {
      actionRef.current = {
        reload: () => {
          spies.reload()
          void request({ current: 1, pageSize: 20 })
        }
      }
      void request({ current: 1, pageSize: 20 })
    }, [actionRef, request])
    const actionRecord: Record<string, unknown> = { id: 'customer-1', name: '旧名称' }
    const renderRecord: Record<string, unknown> = {
      ...actionRecord,
      status: 1,
      amount: 1234.5
    }
    return (
      <>
        {toolBarRender?.()}
        {columns.map((column) => {
          const value =
            column.dataIndex && column.valueType === 'option'
              ? undefined
              : column.dataIndex
                ? renderRecord[column.dataIndex]
                : undefined
          const record = column.valueType === 'option' ? actionRecord : renderRecord
          const renderedText = column.renderText ? column.renderText(value, record) : value
          const valueEnumItem = column.valueEnum?.[String(renderedText)]
          const proTableRenderedValue =
            valueEnumItem && typeof valueEnumItem === 'object' && 'text' in valueEnumItem ? (
              <span>{valueEnumItem.text}</span>
            ) : (
              (valueEnumItem ?? renderedText)
            )
          return column.render
            ? column.render(proTableRenderedValue, record)
            : proTableRenderedValue
        })}
      </>
    )
  }
}))

const schema = {
  $schema: CRUD_SCHEMA_ID,
  version: CRUD_SCHEMA_VERSION,
  id: 'customer-list',
  kind: 'crud',
  title: '客户',
  dataSource: {
    list: 'customer.list',
    create: 'customer.create',
    update: 'customer.update',
    remove: 'customer.remove'
  },
  form: [{ field: 'name', label: '名称', component: 'input' }],
  table: {
    rowKey: 'id',
    columns: [{ field: 'name', title: '名称' }],
    actions: [
      { id: 'edit', label: '编辑', effect: 'openEdit' },
      { id: 'remove', label: '删除', effect: 'remove', access: 'customer.remove' }
    ]
  },
  toolbar: [{ id: 'create', label: '新增', effect: 'openCreate' }]
} satisfies CrudPageSchema

function renderPage(registry: Parameters<typeof BestProvider>[0]['registry']) {
  return render(
    <BestProvider registry={registry}>
      <BestCrudPage schema={schema} />
    </BestProvider>
  )
}

function renderSchemaPage(
  pageSchema: CrudPageSchema,
  registry: Parameters<typeof BestProvider>[0]['registry']
) {
  return render(
    <BestProvider registry={registry}>
      <BestCrudPage schema={pageSchema} />
    </BestProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  spies.request = undefined
})

describe('BestCrudPage', () => {
  it('loads records, submits create and edit drawers, and reloads the table', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 })
    const create = vi.fn().mockResolvedValue(undefined)
    const update = vi.fn().mockResolvedValue(undefined)
    renderPage({
      listServices: {
        'customer.list': list
      },
      services: {
        'customer.create': create,
        'customer.update': update,
        'customer.remove': vi.fn()
      }
    })

    await waitFor(() => expect(list).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '新增' }))
    fireEvent.click(await screen.findByRole('button', { name: '提交表单' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: 'updated' }))

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.click(await screen.findByRole('button', { name: '提交表单' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ id: 'customer-1', name: 'updated' }))
    expect(spies.reload).toHaveBeenCalledTimes(2)
  })

  it('keeps row keys when building update payloads', () => {
    expect(
      buildCrudSubmitValues(
        { name: 'updated' },
        { id: 'customer-1', hiddenMode: 'tiered' },
        'id'
      )
    ).toEqual({ id: 'customer-1', name: 'updated' })
  })

  it('prevents duplicate submit while a save is in flight', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 })
    let resolveCreate!: () => void
    const create = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve
        })
    )
    renderPage({
      listServices: {
        'customer.list': list
      },
      services: {
        'customer.create': create,
        'customer.update': vi.fn(),
        'customer.remove': vi.fn()
      }
    })

    await waitFor(() => expect(list).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '新增' }))
    const submit = await screen.findByRole('button', { name: '提交表单' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    resolveCreate()
    await waitFor(() => expect(spies.reload).toHaveBeenCalledTimes(1))
  })

  it('uses the latest bestSearch filters when reload runs synchronously', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 })
    const pageSchema = {
      ...schema,
      searchMode: 'bestSearch' as const,
      search: [{ field: 'tag', label: '标签', component: 'input' as const }]
    }
    renderSchemaPage(pageSchema, {
      listServices: { 'customer.list': list },
      services: {
        'customer.create': vi.fn(),
        'customer.update': vi.fn(),
        'customer.remove': vi.fn()
      }
    })

    await waitFor(() => expect(list).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ filters: { tag: 'retail' } }),
        expect.anything()
      )
    )
  })

  it('does not let proTable default search values override user filters', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 })
    const pageSchema = {
      ...schema,
      search: [
        { field: 'tag', label: '标签', component: 'input' as const, defaultValue: 'default' }
      ]
    }
    renderSchemaPage(pageSchema, {
      listServices: { 'customer.list': list },
      services: {
        'customer.create': vi.fn(),
        'customer.update': vi.fn(),
        'customer.remove': vi.fn()
      }
    })

    await waitFor(() => expect(spies.request).toBeDefined())
    await spies.request?.({ current: 1, pageSize: 20, tag: 'retail' })

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ filters: { tag: 'retail' } }),
        expect.anything()
      )
    )
  })

  it('confirms deletion, refreshes on success, and reports service failures', async () => {
    spies.confirm.mockImplementation(({ onOk }: { onOk: () => void }) => onOk())
    const remove = vi.fn().mockResolvedValue(undefined)
    renderPage({
      listServices: { 'customer.list': vi.fn().mockResolvedValue({ items: [], total: 0 }) },
      services: {
        'customer.create': vi.fn(),
        'customer.update': vi.fn(),
        'customer.remove': remove
      }
    })

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ id: 'customer-1', name: '旧名称' }))
    expect(spies.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ content: '确认删除客户？' })
    )
    expect(spies.success).toHaveBeenCalledWith('删除成功')
    expect(spies.reload).toHaveBeenCalled()

    cleanup()
    const failedRemove = vi.fn().mockRejectedValue(new Error('删除接口不可用'))
    renderPage({
      listServices: { 'customer.list': vi.fn().mockResolvedValue({ items: [], total: 0 }) },
      services: {
        'customer.create': vi.fn(),
        'customer.update': vi.fn(),
        'customer.remove': failedRemove
      }
    })
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(spies.error).toHaveBeenCalledWith('删除接口不可用'))
    expect(spies.reload).toHaveBeenCalledTimes(1)
  })

  it('does not render actions denied by the registry access policy', () => {
    renderPage({
      listServices: { 'customer.list': vi.fn().mockResolvedValue({ items: [], total: 0 }) },
      services: {
        'customer.create': vi.fn(),
        'customer.update': vi.fn(),
        'customer.remove': vi.fn()
      },
      access: () => false
    })
    expect(screen.queryByRole('button', { name: '删除' })).toBeNull()
  })

  it('loads detail data before opening the edit form when configured', async () => {
    const detail = vi.fn().mockResolvedValue({ name: '详情名称', extra: 'loaded' })
    const update = vi.fn().mockResolvedValue(undefined)
    const pageSchema = {
      ...schema,
      dataSource: { ...schema.dataSource, detail: 'customer.detail' }
    }
    renderSchemaPage(pageSchema, {
      listServices: { 'customer.list': vi.fn().mockResolvedValue({ items: [], total: 0 }) },
      services: {
        'customer.detail': detail,
        'customer.create': vi.fn(),
        'customer.update': update,
        'customer.remove': vi.fn()
      }
    })

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    await waitFor(() => expect(detail).toHaveBeenCalledWith({ id: 'customer-1', name: '旧名称' }))
    fireEvent.click(await screen.findByRole('button', { name: '提交表单' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ id: 'customer-1', name: 'updated' }))
  })

  it('uses the adapter to normalize detail data and create/update payloads', async () => {
    const detail = vi.fn().mockResolvedValue({ api_name: '详情名称' })
    const create = vi.fn().mockResolvedValue(undefined)
    const update = vi.fn().mockResolvedValue(undefined)
    const pageSchema = {
      ...schema,
      dataSource: { ...schema.dataSource, detail: 'customer.detail' }
    }
    render(
      <BestProvider
        registry={{
          listServices: { 'customer.list': vi.fn().mockResolvedValue({ items: [], total: 0 }) },
          services: {
            'customer.detail': detail,
            'customer.create': create,
            'customer.update': update,
            'customer.remove': vi.fn()
          }
        }}
      >
        <BestCrudPage
          adapter={{
            fromDetail: (record) => ({ ...record, name: record.api_name }),
            toCreatePayload: (values) => ({ create_name: values.name }),
            toUpdatePayload: (values) => ({ update_name: values.name })
          }}
          schema={pageSchema}
        />
      </BestProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: '新增' }))
    fireEvent.click(await screen.findByRole('button', { name: '提交表单' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith({ create_name: 'updated' }))

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    await waitFor(() => expect(detail).toHaveBeenCalled())
    fireEvent.click(await screen.findByRole('button', { name: '提交表单' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ update_name: 'updated' }))
  })

  it('keeps dictionary table columns on valueEnum display without stringifying ProTable DOM', async () => {
    const pageSchema = {
      ...schema,
      table: {
        ...schema.table,
        actions: undefined,
        columns: [
          {
            field: 'amount',
            title: '金额',
            format: 'money'
          },
          {
            field: 'status',
            title: '状态',
            dict: 'customer.status'
          }
        ]
      }
    } satisfies CrudPageSchema

    renderSchemaPage(pageSchema, {
      dictionaries: {
        'customer.status': [{ label: '成长客户', value: 1 }]
      },
      listServices: { 'customer.list': vi.fn().mockResolvedValue({ items: [], total: 0 }) },
      services: {
        'customer.create': vi.fn(),
        'customer.update': vi.fn(),
        'customer.remove': vi.fn()
      }
    })

    expect(screen.getByText('1,234.50')).toBeTruthy()
    expect(screen.getByText('成长客户')).toBeTruthy()
    expect(screen.queryByText('[object Object]')).toBeNull()
  })

  it('passes the raw record value to table slots when valueEnum pre-renders display DOM', () => {
    const statusSlot = vi.fn(({ value }) => <span>状态值：{String(value)}</span>)
    const pageSchema = {
      ...schema,
      table: {
        ...schema.table,
        actions: undefined,
        columns: [
          {
            field: 'status',
            title: '状态',
            dict: 'customer.status',
            slot: 'customer.status'
          }
        ]
      }
    } satisfies CrudPageSchema

    renderSchemaPage(pageSchema, {
      dictionaries: {
        'customer.status': [{ label: '成长客户', value: 1 }]
      },
      listServices: { 'customer.list': vi.fn().mockResolvedValue({ items: [], total: 0 }) },
      services: {
        'customer.create': vi.fn(),
        'customer.update': vi.fn(),
        'customer.remove': vi.fn()
      },
      slots: {
        'customer.status': statusSlot
      }
    })

    expect(statusSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        field: 'status',
        record: expect.objectContaining({ status: 1 }),
        value: 1
      })
    )
    expect(screen.getByText('状态值：1')).toBeTruthy()
    expect(screen.queryByText('状态值：[object Object]')).toBeNull()
  })
})
