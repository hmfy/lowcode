import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bestLowcodeAdapter } from '../../src/mcp/adapters/best-lowcode'
import { createBestLowcodeMcpService } from '../../src/mcp/service'

describe('bestLowcodeAdapter', () => {
  it('exposes current built-in runtime capabilities', () => {
    expect(bestLowcodeAdapter.builtInCapabilities?.()).toContain('builtin.field.dateRange')
    expect(bestLowcodeAdapter.builtInCapabilities?.()).toContain('builtin.format.money')
  })

  it('returns a stable diagnostic for malformed untrusted Schema', async () => {
    const diagnostics = await bestLowcodeAdapter.validateSchema?.({
      $schema: 'https://best.dev/schema/crud/v1',
      version: 1,
      id: 'invalid',
      kind: 'crud',
      title: 'Invalid',
      dataSource: { list: 'demo.list' },
      table: { rowKey: 'id', columns: 'not-an-array' }
    })
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'schema.column.list', path: '/table/columns' })
    )
  })

  it('applies primary-package validation during candidate previews', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-cli-'))
    await writeFile(
      join(root, 'best.lowcode.config.json'),
      JSON.stringify({ version: 1, allowedPaths: ['schemas'], manifestPaths: ['manifest.json'] })
    )
    await writeFile(join(root, 'manifest.json'), JSON.stringify({ version: 1 }))
    const service = createBestLowcodeMcpService(root, bestLowcodeAdapter)
    const result = await service.previewChange(
      'schemas/example.json',
      JSON.stringify({ table: { columns: 'not-an-array' } })
    )
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'schema.column.list', path: '/table/columns' })
    )
  })
})
