import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isConfiguredManifestPath,
  loadProjectConfig,
  parseProjectConfig,
  resolveAllowedPath
} from '../../src/mcp/config'
import { createBestLowcodeMcpService } from '../../src/mcp/service'

describe('project config', () => {
  it('accepts the minimum controlled configuration', () => {
    const result = parseProjectConfig({
      version: 1,
      allowedPaths: ['apps/rps/src/pages'],
      manifestPaths: ['apps/rps/lowcode.manifest.json']
    })
    expect(result.diagnostics).toEqual([])
    expect(result.config?.allowedPaths).toEqual(['apps/rps/src/pages'])
  })

  it('does not resolve a target outside its allowlist', () => {
    expect(
      resolveAllowedPath('/project', ['apps/rps/src/pages'], '../../package.json')
    ).toBeUndefined()
  })

  it('rejects configuration paths that escape the repository', () => {
    const result = parseProjectConfig({
      version: 1,
      allowedPaths: ['../outside'],
      manifestPaths: ['apps/rps/lowcode.manifest.json']
    })
    expect(result.config).toBeUndefined()
    expect(result.diagnostics[0]?.code).toBe('config.path')
  })

  it('returns an actionable diagnostic when configuration is missing', async () => {
    const result = await loadProjectConfig('/definitely-missing-best-lowcode-project')
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'config.missing',
        message: expect.stringContaining('best init --write'),
        recovery: {
          command: 'pnpm exec best init --write',
          requiresUserApproval: true,
          retryTool: 'best_prepare_task'
        }
      })
    )
  })

  it('exposes config recovery through best_prepare_task results', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-missing-config-'))
    const service = createBestLowcodeMcpService(root)

    await expect(service.prepareTask('新增客户管理页面')).resolves.toMatchObject({
      task: undefined,
      diagnostics: [
        {
          code: 'config.missing',
          recovery: {
            command: 'pnpm exec best init --write',
            requiresUserApproval: true,
            retryTool: 'best_prepare_task'
          }
        }
      ]
    })
  })

  it('treats configured Manifest as directly writable without adding it to allowedPaths', () => {
    const config = parseProjectConfig({
      version: 1,
      allowedPaths: ['src'],
      manifestPaths: ['lowcode.manifest.json']
    }).config
    expect(config && isConfiguredManifestPath(config, 'lowcode.manifest.json')).toBe(true)
  })

  it('previews configured Manifest changes without Schema validation or allowedPath errors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-manifest-preview-'))
    const service = createBestLowcodeMcpService(root)
    await import('node:fs/promises').then(({ writeFile }) =>
      Promise.all([
        writeFile(
          join(root, 'best.lowcode.config.json'),
          JSON.stringify({
            version: 1,
            allowedPaths: ['src'],
            manifestPaths: ['lowcode.manifest.json']
          })
        ),
        writeFile(join(root, 'lowcode.manifest.json'), '{"version":1}\n')
      ])
    )
    const result = await service.previewChange(
      'lowcode.manifest.json',
      '{"version":1,"services":{"customer.list":{}}}'
    )
    expect(result.diagnostics).toEqual([])
    expect(result.preview?.exists).toBe(true)
  })
})
