// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useBestDictionary } from '../src/runtime'

vi.mock('../src/lowcode/BestCrudPage', () => ({
  BestCrudPage: () => <div>{useBestDictionary('first-mount.status')[0]?.label}</div>
}))
vi.mock('../src/lowcode/BestTabbedPage', () => ({
  BestTabbedPage: () => <div>tabbed page</div>
}))

import { BestPage } from '../src/lowcode/BestPage'
import { CRUD_SCHEMA_ID, CRUD_SCHEMA_VERSION } from '../src/lowcode/schema'

describe('BestPage', () => {
  it('owns the Provider boundary and renders a validated page on first mount', () => {
    render(
      <BestPage
        schema={{
          $schema: CRUD_SCHEMA_ID,
          version: CRUD_SCHEMA_VERSION,
          id: 'first-mount',
          kind: 'crud',
          title: '首屏',
          dataSource: { list: 'first-mount.list' },
          table: { rowKey: 'id', columns: [{ field: 'id', title: 'ID' }] }
        }}
        registry={{
          listServices: { 'first-mount.list': async () => ({ items: [], total: 0 }) },
          dictionaries: { 'first-mount.status': [{ label: '首屏已渲染', value: 'ready' }] }
        }}
      />
    )

    expect(screen.getByText('首屏已渲染')).toBeTruthy()
  })
})
