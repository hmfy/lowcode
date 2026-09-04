import { BestCrudPage, BestProvider } from 'best-lowcode-runtime'
import 'best-lowcode-runtime/style.css'
import { warningSchema } from './schema'
import { warningRegistry } from './registry'

export function WarningsPage() {
  return <BestProvider registry={warningRegistry}><BestCrudPage schema={warningSchema} /></BestProvider>
}
