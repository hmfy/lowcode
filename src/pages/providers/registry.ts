import { Badge, Radio, Space, Tag } from 'antd'
import { createElement } from 'react'
import type { BestRegistry } from 'best-lowcode-runtime'
import { detailProvider, listProviders, updateProvider } from './adapter'

export const providerRegistry: Partial<BestRegistry> = {
  listServices: { 'provider.list': listProviders },
  services: { 'provider.detail': detailProvider, 'provider.update': updateProvider },
  slots: {
    'provider.status': (context) => {
      if (context.record) return createElement(Badge, { status: context.value === 'enabled' ? 'success' : 'default', text: context.value === 'enabled' ? '启用' : '停用' })
      const setValue = (context as typeof context & { setValue?: (field: string, value: unknown) => void }).setValue
      return createElement(Radio.Group, { value: context.value ?? 'enabled', onChange: (event) => setValue?.('status', event.target.value) },
        createElement(Radio, { value: 'enabled' }, '启用'), createElement(Radio, { value: 'disabled' }, '停用'))
    },
    'provider.apiList': ({ value }) => createElement(
      Space,
      { wrap: true, size: [4, 4] },
      ...(Array.isArray(value) ? value : []).map((api) => createElement(
        Tag,
        { key: String(api) },
        typeof api === 'object' && api !== null ? String((api as { value?: unknown }).value ?? '') : String(api)
      ))
    ),
    'provider.apiInfo': ({ value }) => {
      const apis = (Array.isArray(value) ? value : []).map((api) =>
        typeof api === 'object' && api !== null ? String((api as { value?: unknown }).value ?? '') : String(api)
      )
      return createElement(
        'div',
        { className: 'provider-api-info-card' },
        ...apis.map((api) => createElement('div', { className: 'provider-api-info-item', key: api }, api))
      )
    }
  },
  dictionaries: {
    providerStatus: [{ label: '启用', value: 'enabled' }, { label: '停用', value: 'disabled' }],
    pricingModes: [{ label: '固定价格', value: 'fixed' }, { label: '阶梯价格', value: 'tiered' }],
    status: [{ label: '启用', value: 'enabled' }, { label: '停用', value: 'disabled' }],
    providers: []
  }
}
