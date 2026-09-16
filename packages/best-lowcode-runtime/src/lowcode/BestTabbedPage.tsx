import { Tabs } from 'antd'
import { useBestRegistry } from '../runtime'
import { BestCrudPage } from './BestCrudPage'
import type { TabbedPageSchema } from './schema'
import { assertValidTabbedPageSchema } from './validate'

export type BestTabbedPageProps = {
  className?: string
  schema: TabbedPageSchema
}

/** Renders declarative tabs whose contents are either a CRUD schema or a registered slot. */
export function BestTabbedPage({ className, schema }: BestTabbedPageProps) {
  const registry = useBestRegistry()
  assertValidTabbedPageSchema(schema, registry)
  const items = schema.tabs
    .filter((tab) => !tab.access || registry.access(tab.access))
    .map((tab) => ({
      key: tab.key,
      label: tab.label,
      destroyOnHidden: tab.destroyOnHidden,
      children:
        tab.content.type === 'crud' ? (
          <BestCrudPage schema={tab.content.schema} />
        ) : (
          registry.slots[tab.content.slot]?.({ pageId: schema.id, tabKey: tab.key }) ?? null
        )
    }))
  return <Tabs className={className} items={items} />
}
