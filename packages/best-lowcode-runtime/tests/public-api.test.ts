import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

describe('best-lowcode-runtime', () => {
  it('re-exports lowcode pages, runtime, and UI from one entry', async () => {
    const source = await readFile(
      join(dirname(fileURLToPath(import.meta.url)), '../src/index.ts'),
      'utf8'
    )
    expect(source).toContain("export * from './lowcode'")
    expect(source).toContain("export * from './runtime'")
    expect(source).toContain("export * from './ui'")
  })

  it('exposes BestPage but keeps BestCrudPage internal', async () => {
    const rootSource = await readFile(
      join(dirname(fileURLToPath(import.meta.url)), '../src/index.ts'),
      'utf8'
    )
    const lowcodeSource = await readFile(
      join(dirname(fileURLToPath(import.meta.url)), '../src/lowcode/index.ts'),
      'utf8'
    )
    const lowcodeEntry = ts.createSourceFile(
      'lowcode/index.ts',
      lowcodeSource,
      ts.ScriptTarget.Latest,
      true
    )

    expect(rootSource).toContain("export * from './lowcode'")
    expect(lowcodeEntry.text).toContain("export { BestPage } from './BestPage'")
    expect(lowcodeEntry.text).toContain("export type { CrudDataAdapter } from './adapter'")
    expect(lowcodeEntry.text).not.toContain('BestCrudPage')
    expect(lowcodeEntry.text).not.toContain('BestCrudPageProps')
  })
})
