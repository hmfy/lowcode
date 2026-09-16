// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { type ReactNode, useEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { BestProvider, useBestDictionary, useBestDictionaryActions } from '../src/runtime'

function AsyncDictionaryUpdater() {
  const { setDictionary } = useBestDictionaryActions()

  useEffect(() => {
    setDictionary('customer.status', [{ label: '启用', value: 'enabled' }])
  }, [setDictionary])

  return <span>{useBestDictionary('customer.status').map((item) => item.label).join(',') || '加载中'}</span>
}

function renderProvider(children: ReactNode) {
  return render(<BestProvider registry={{ dictionaries: { 'customer.status': [] } }}>{children}</BestProvider>)
}

describe('BestProvider dictionary updates', () => {
  it('publishes a dictionary update without replacing the full registry', async () => {
    renderProvider(<AsyncDictionaryUpdater />)

    await waitFor(() => expect(screen.getByText('启用')).toBeTruthy())
  })
})
