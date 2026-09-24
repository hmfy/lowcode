// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useBestDictionary } from '../src/runtime'

const crudPageProps = vi.hoisted(() => ({ current: undefined as { tableHeight: number } | undefined }))

vi.mock('../src/lowcode/BestCrudPage', () => ({
  BestCrudPage: (props: { tableHeight: number }) => {
    crudPageProps.current = props
    return <div>{useBestDictionary('first-mount.status')[0]?.label}</div>
  }
}))
vi.mock('../src/lowcode/BestTabbedPage', () => ({
  BestTabbedPage: () => <div>tabbed page</div>
}))

import { BestPage } from '../src/lowcode/BestPage'
import { CRUD_SCHEMA_ID, CRUD_SCHEMA_VERSION } from '../src/lowcode/schema'

describe('BestPage', () => {
  const registry = {
    listServices: { 'first-mount.list': async () => ({ items: [], total: 0 }) },
    dictionaries: { 'first-mount.status': [{ label: '首屏已渲染', value: 'ready' }] }
  }

  const schema = {
    $schema: CRUD_SCHEMA_ID,
    version: CRUD_SCHEMA_VERSION,
    id: 'first-mount',
    kind: 'crud' as const,
    title: '首屏',
    dataSource: { list: 'first-mount.list' },
    table: { rowKey: 'id', columns: [{ field: 'id', title: 'ID' }] }
  }

  it('owns the Provider boundary and renders a validated page on first mount', () => {
    render(
      <BestPage schema={schema} tableHeight={480} registry={registry} />
    )

    expect(screen.getByText('首屏已渲染')).toBeTruthy()
    expect(crudPageProps.current?.tableHeight).toBe(480)
  })

  it('uses the explicit table height when supplied', () => {
    render(<BestPage schema={schema} tableHeight={640} registry={registry} />)

    expect(crudPageProps.current?.tableHeight).toBe(640)
  })

  it('accepts a changed table height value', () => {
    const { rerender } = render(<BestPage schema={schema} tableHeight={480} registry={registry} />)
    rerender(<BestPage schema={schema} tableHeight={720} registry={registry} />)

    expect(crudPageProps.current?.tableHeight).toBe(720)
  })

  it('rejects an invalid table height', () => {
    expect(() =>
      render(<BestPage schema={schema} tableHeight={0} registry={registry} />)
    ).toThrow('BestPage requires a positive finite tableHeight')
  })
})
