import { describe, expect, it, vi } from 'vitest'
import type { CrudPageSchema } from '../src/lowcode'
import { getBuiltinCapabilities, validateUnknownCrudPageSchema } from '../src/lowcode/dev'
import { validateCrudPageSchema } from '../src/lowcode/validate'
import { composeBestRegistry, createBestRegistry } from '../src/runtime'

const deleteAction = { id: 'remove', label: '删除', effect: 'remove' } as const

function crudSchema(dataSource: { list: string; remove?: string }) {
  return {
    $schema: 'https://best.dev/schema/crud/v1' as const,
    version: 1 as const,
    id: 'customer-list',
    kind: 'crud' as const,
    title: '客户列表',
    dataSource,
    table: { rowKey: 'id', columns: [{ field: 'id', title: 'ID' }], actions: [deleteAction] }
  }
}

describe('lowcode schema', () => {
  it('composes registry layers and rejects duplicate keys', () => {
    const list = vi.fn()
    const registry = composeBestRegistry(
      { listServices: { 'customer.list': list }, access: () => true },
      { services: { 'customer.detail': vi.fn() }, access: (key) => key !== 'customer.write' }
    )
    expect(registry.listServices['customer.list']).toBe(list)
    expect(registry.access('customer.read')).toBe(true)
    expect(registry.access('customer.write')).toBe(false)
    expect(() =>
      composeBestRegistry(
        { actions: { 'customer.toggle': vi.fn() } },
        { actions: { 'customer.toggle': vi.fn() } }
      )
    ).toThrow('Registry key 重复：actions.customer.toggle')
  })
  it('exposes the remove effect as a built-in capability', () => {
    expect(getBuiltinCapabilities()).toContain('builtin.effect.remove')
  })

  it('requires a registered remove service for a remove action', () => {
    const missingService = validateCrudPageSchema(crudSchema({ list: 'customer.list' }))
    expect(missingService.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'action.removeService', path: '/table/actions/0' })
    )

    const registry = createBestRegistry({
      listServices: {
        'customer.list': vi.fn().mockResolvedValue({ items: [], total: 0 })
      },
      services: {
        'customer.remove': vi.fn()
      }
    })
    expect(
      validateCrudPageSchema(
        crudSchema({ list: 'customer.list', remove: 'customer.remove' }),
        registry
      )
    ).toEqual({ valid: true, diagnostics: [] })
  })

  it('requires create and update services when they are declared', () => {
    const schema = {
      ...crudSchema({ list: 'customer.list', remove: 'customer.remove' }),
      dataSource: {
        list: 'customer.list',
        remove: 'customer.remove',
        create: 'customer.create',
        update: 'customer.update'
      }
    } as CrudPageSchema
    const result = validateCrudPageSchema(
      schema,
      createBestRegistry({
        listServices: { 'customer.list': vi.fn().mockResolvedValue({ items: [], total: 0 }) },
        services: {
          'customer.remove': vi.fn(),
          'customer.create': vi.fn(),
          'customer.update': vi.fn()
        }
      })
    )
    expect(result).toEqual({ valid: true, diagnostics: [] })
  })

  it('requires list services to use the dedicated registry boundary', () => {
    const registry = createBestRegistry({ services: { 'customer.list': vi.fn() } })

    expect(
      validateCrudPageSchema(crudSchema({ list: 'customer.list' }), registry).diagnostics
    ).toContainEqual(
      expect.objectContaining({ code: 'registry.service', path: '/dataSource/list' })
    )
  })

  it('rejects unsupported formats from untrusted Schema candidates', () => {
    const result = validateUnknownCrudPageSchema({
      $schema: 'https://best.dev/schema/crud/v1',
      version: 1,
      id: 'test',
      kind: 'crud',
      title: '测试页',
      dataSource: { list: 'test.list' },
      table: { rowKey: 'id', columns: [{ field: 'amount', title: '金额', format: 'currency' }] }
    })
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'column.format', path: '/table/columns/0/format' })
    )
  })

  it('accepts left and right fixed table columns', () => {
    const result = validateUnknownCrudPageSchema({
      $schema: 'https://best.dev/schema/crud/v1',
      version: 1,
      id: 'test',
      kind: 'crud',
      title: '测试页',
      dataSource: { list: 'test.list' },
      table: {
        rowKey: 'id',
        columns: [
          { field: 'id', title: 'ID', fixed: 'left' },
          { field: 'actions', title: '操作', fixed: 'right' }
        ]
      }
    })
    expect(result.valid).toBe(true)
  })

  it('requires registered slots for custom form fields and detail fields', () => {
    const schema = {
      ...crudSchema({ list: 'customer.list', remove: 'customer.remove' }),
      form: [{ field: 'pricing', label: '定价', component: 'slot', slot: 'customer.pricing' }],
      detail: { fields: [{ field: 'authorizations', label: '授权', slot: 'customer.auth' }] }
    } as unknown as CrudPageSchema
    const result = validateCrudPageSchema(schema, createBestRegistry())
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'registry.slot', path: '/form/0' }),
        expect.objectContaining({ code: 'registry.slot', path: '/detail/fields/0/slot' })
      ])
    )
    const registry = createBestRegistry({
      listServices: { 'customer.list': vi.fn().mockResolvedValue({ items: [], total: 0 }) },
      services: { 'customer.remove': vi.fn() },
      slots: { 'customer.pricing': () => null, 'customer.auth': () => null }
    })
    expect(validateCrudPageSchema(schema, registry)).toEqual({ valid: true, diagnostics: [] })
  })

  it('accepts mode conditions and validates repeatable field definitions', () => {
    const schema = {
      ...crudSchema({ list: 'customer.list' }),
      form: [
        {
          field: 'password',
          label: '默认密码',
          component: 'input',
          visibleWhen: { operator: 'modeEquals', value: 'create' }
        },
        { field: 'tiers', label: '阶梯', component: 'repeatable', itemFields: [] }
      ]
    } as unknown as CrudPageSchema
    expect(validateCrudPageSchema(schema).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'field.repeatable', path: '/form/1' })
    )
  })

  it('requires a registered service for remote selects', () => {
    const schema = {
      ...crudSchema({ list: 'customer.list', remove: 'customer.remove' }),
      form: [
        { field: 'owner', label: '负责人', component: 'remoteSelect', remoteService: 'user.search' }
      ]
    } as unknown as CrudPageSchema
    expect(validateCrudPageSchema(schema, createBestRegistry()).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'registry.service', path: '/form/0' })
    )
    const registry = createBestRegistry({
      listServices: { 'customer.list': vi.fn().mockResolvedValue({ items: [], total: 0 }) },
      services: { 'customer.remove': vi.fn(), 'user.search': vi.fn() }
    })
    expect(validateCrudPageSchema(schema, registry)).toEqual({ valid: true, diagnostics: [] })
  })

  it('reports malformed conditions and detail blocks as diagnostics', () => {
    const schema = {
      ...crudSchema({ list: 'customer.list', remove: 'customer.remove' }),
      form: [
        {
          field: 'status',
          label: '状态',
          component: 'input',
          visibleWhen: { operator: 'and', conditions: [] }
        }
      ],
      detail: 'bad'
    } as unknown as CrudPageSchema

    const result = validateCrudPageSchema(schema)
    expect(result.valid).toBe(false)
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'condition.empty', path: '/form/0/visibleWhen' }),
        expect.objectContaining({ code: 'detail.type', path: '/detail' })
      ])
    )
  })
})
