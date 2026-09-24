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
  /** Business-owned table body height. The value may be derived from React state. */
  tableHeight: number
  schema: BestPageSchema
  registry?: Parameters<typeof BestProvider>[0]['registry']
  theme?: Parameters<typeof BestProvider>[0]['theme']
  adapter?: CrudDataAdapter
}

function BestPageContent({ className, tableHeight, schema, adapter }: Omit<BestPageProps, 'registry' | 'theme'>) {
  const registry = useBestRegistry()
  assertValidBestPageSchema(schema, registry)
  if (!Number.isFinite(tableHeight) || tableHeight <= 0) {
    throw new Error('BestPage requires a positive finite tableHeight')
  }
  if (schema.kind === 'tabs') return <BestTabbedPage className={className} schema={schema} tableHeight={tableHeight} />
  return (
    <BestCrudPage
      className={className}
      tableHeight={tableHeight}
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
export function BestPage({ registry, theme, ...props }: BestPageProps): ReactNode {
  return (
    <BestProvider registry={registry} theme={theme}>
      <div className='best-lowcode-page-host'>
        <BestPageContent {...props} />
      </div>
    </BestProvider>
  )
}
