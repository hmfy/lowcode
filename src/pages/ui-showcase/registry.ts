import type { BestProviderProps } from 'best-lowcode-runtime'
import { createElement } from 'react'

const people = [
  { id: 'U-1001', name: '林予安', team: '产品', status: 'active', email: 'lin@example.com' },
  { id: 'U-1002', name: '周知夏', team: '设计', status: 'active', email: 'zhou@example.com' },
  { id: 'U-1003', name: '陈景行', team: '研发', status: 'pending', email: 'chen@example.com' },
  { id: 'U-1004', name: '许以宁', team: '运营', status: 'active', email: 'xu@example.com' }
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
        email: String(values.email ?? '')
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
  slots: {
    'showcase.summary': () => createElement('div', { style: { padding: 24 } },
      createElement('strong', null, '自定义 Slot 面板'),
      createElement('p', null, '标签页可以承载由应用注册的任意 React 内容。'))
  }
}

export const showcasePeople = people
