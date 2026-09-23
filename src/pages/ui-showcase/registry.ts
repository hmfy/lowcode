import type { BestProviderProps } from 'best-lowcode-runtime'
import { createElement } from 'react'
import { Button, Space } from 'antd'

const people = [
  {
    id: 'U-1001',
    name: '林予安',
    team: '产品',
    status: 'active',
    email: 'lin@example.com',
    joinedAt: '2026-01-12',
    budget: 128000,
    detailList: [
      { id: 'P-1001-1', project: '客户增长平台', role: '产品负责人', progress: '进行中' },
      { id: 'P-1001-2', project: '运营数据看板', role: '需求负责人', progress: '已完成' }
    ]
  },
  {
    id: 'U-1002',
    name: '周知夏',
    team: '设计',
    status: 'active',
    email: 'zhou@example.com',
    joinedAt: '2025-11-03',
    budget: 96000,
    detailList: [
      { id: 'P-1002-1', project: '客户增长平台', role: '交互设计', progress: '进行中' }
    ]
  },
  {
    id: 'U-1003',
    name: '陈景行',
    team: '研发',
    status: 'pending',
    email: 'chen@example.com',
    joinedAt: '2026-02-18',
    budget: 88000,
    detailList: [
      { id: 'P-1003-1', project: '低代码运行时', role: '前端开发', progress: '测试中' },
      { id: 'P-1003-2', project: '运营数据看板', role: '技术负责人', progress: '进行中' }
    ]
  },
  {
    id: 'U-1004',
    name: '许以宁',
    team: '运营',
    status: 'active',
    email: 'xu@example.com',
    joinedAt: '2025-08-26',
    budget: 76000,
    detailList: [
      { id: 'P-1004-1', project: '运营数据看板', role: '运营负责人', progress: '已完成' }
    ]
  }
]

export const showcaseRegistry: NonNullable<BestProviderProps['registry']> = {
  dictionaries: {
    status: [
      { label: '启用', value: 'active' },
      { label: '待审核', value: 'pending' }
    ],
    teams: ['产品', '设计', '研发', '运营'].map((team) => ({ label: team, value: team }))
  },
  listServices: {
    'showcase.people': async ({ page, pageSize, filters }) => {
      const filtered = people.filter((person) =>
        Object.entries(filters).every(([key, value]) => !value || String(person[key as keyof typeof person] ?? '').includes(String(value)))
      )
      return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length }
    }
  },
  services: {
    'showcase.detail': async ({ id }) => people.find((person) => person.id === id) ?? people[0],
    'showcase.create': async (values) => {
      const id = `U-${1001 + people.length}`
      people.push({
        id,
        name: String(values.name ?? '新成员'),
        team: String(values.team ?? '产品'),
        status: 'active',
        email: String(values.email ?? ''),
        joinedAt: String(values.joinedAt ?? '2026-09-23'),
        budget: Number(values.budget ?? 0),
        detailList: []
      })
    },
    'showcase.update': async (values) => {
      const person = people.find((item) => item.id === values.id)
      if (person) Object.assign(person, values)
    },
    'showcase.remove': async ({ id }) => {
      const index = people.findIndex((item) => item.id === id)
      if (index >= 0) people.splice(index, 1)
    },
    'showcase.remotePeople': async ({ keyword }) => people
      .filter((person) => person.name.includes(String(keyword ?? '')))
      .map((person) => ({ label: person.name, value: person.id }))
  },
  actions: {
    'showcase.batchActivate': async ({ selectedRecords }) => {
      selectedRecords?.forEach((record) => {
        record.status = 'active'
      })
    },
    'showcase.export': async () => undefined
  },
  slots: {
    'showcase.peopleStatusFilter': ({ query, setQuery }) => createElement(
      Space,
      { style: { marginBottom: 8 } },
      ['全部', '启用中', '待审核'].map((label) => {
        const status = label === '全部' ? '' : label === '启用中' ? 'active' : 'pending'
        return createElement(Button, {
          key: status || 'all',
          type: query?.status === status ? 'primary' : 'default',
          onClick: () => setQuery?.({ ...(query ?? {}), status })
        }, label)
      })
    ),
    'showcase.summary': () => createElement('div', { style: { padding: 24 } },
      createElement('strong', null, '自定义 Slot 面板'),
      createElement('p', null, '标签页可以承载由应用注册的任意 React 内容。'))
  }
}

export const showcasePeople = people
