import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
})
