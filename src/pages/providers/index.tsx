import { BestCrudPage, BestProvider } from 'best-lowcode-runtime'
import 'best-lowcode-runtime/style.css'
import { providerRegistry } from './registry'
import { providerSchema } from './schema'

export function ProvidersPage() {
  return <BestProvider registry={providerRegistry}><BestCrudPage schema={providerSchema} /></BestProvider>
}
