import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { configureProject } from '../src/init'

describe('project configuration', () => {
  it('updates only the selected Config fields and never overwrites an existing Manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-init-'))
    await writeFile(
      join(root, 'best.lowcode.config.json'),
      JSON.stringify({ version: 1, allowedPaths: ['src'], manifestPaths: ['lowcode.manifest.json'] })
    )
    await writeFile(join(root, 'lowcode.manifest.json'), '{"version":1,"services":{"existing":{}}}\n')

    const result = await configureProject(root, { allowedPaths: ['apps/rps/src/pages'] }, true)

    expect(result).toMatchObject({ written: true, files: [{ action: 'update' }, { action: 'unchanged' }] })
    expect(result.files[1]?.diff.after).toContain('"existing"')
    await expect(readFile(join(root, 'best.lowcode.config.json'), 'utf8')).resolves.toContain(
      'apps/rps/src/pages'
    )
    await expect(readFile(join(root, 'lowcode.manifest.json'), 'utf8')).resolves.toContain('"existing"')
  })
})
