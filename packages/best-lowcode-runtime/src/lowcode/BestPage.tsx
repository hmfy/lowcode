import type { ReactNode } from 'react'
import { BestProvider, useBestRegistry } from '../runtime'
import { BestCrudPage } from './BestCrudPage'
import type { CrudDataAdapter } from './adapter'
import { BestTabbedPage } from './BestTabbedPage'
import type { CrudPageSchema, TabbedPageSchema } from './schema'
import { assertValidBestPageSchema } from './validate'

export type BestPageSchema = CrudPageSchema | TabbedPageSchema

export type BestPageProps = {
  className?: string
  /** Standard full-page host: the table body receives the height left by page controls. */
  layout?: 'auto' | 'fill'
  /** Explicit table body height. Runtime falls back to 480px if a JS caller omits it. */
  tableHeight: number
  schema: BestPageSchema
  registry?: Parameters<typeof BestProvider>[0]['registry']
  theme?: Parameters<typeof BestProvider>[0]['theme']
  adapter?: CrudDataAdapter
}

const DEFAULT_TABLE_HEIGHT = 480

function BestPageContent({ className, layout, tableHeight, schema, adapter }: Omit<BestPageProps, 'registry' | 'theme'>) {
  const registry = useBestRegistry()
  assertValidBestPageSchema(schema, registry)
  if (schema.kind === 'tabs') return <BestTabbedPage className={className} schema={schema} />
  const resolvedTableHeight =
    tableHeight ?? schema.table.scrollY ?? DEFAULT_TABLE_HEIGHT
  return (
    <BestCrudPage
      className={className}
      layout={layout}
      tableHeight={resolvedTableHeight}
      schema={schema}
      adapter={adapter}
    />
  )
}

/**
 * The stable page entry point for generated pages.
 * Provider setup and the schema/registry dependency check stay in one place,
 * so page implementations cannot accidentally call Runtime hooks above the Provider.
 */
export function BestPage({ layout = 'fill', registry, theme, ...props }: BestPageProps): ReactNode {
  return (
    <BestProvider registry={registry} theme={theme}>
      <div className={`best-lowcode-page-host${layout === 'fill' ? ' best-lowcode-page-host--fill' : ''}`}>
        <BestPageContent {...props} layout={layout} />
      </div>
    </BestProvider>
  )
}
