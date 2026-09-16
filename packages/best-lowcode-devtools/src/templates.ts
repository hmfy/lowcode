import type { CapabilityManifest, ProjectConfig } from './mcp/types'

export const DEFAULT_CONFIG_FILE = 'best.lowcode.config.json'
export const DEFAULT_MANIFEST_FILE = 'lowcode.manifest.json'

export function createProjectConfigTemplate(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    version: 1,
    allowedPaths: ['src'],
    manifestPaths: [DEFAULT_MANIFEST_FILE],
    schemaFilePattern: 'schema.ts',
    verificationCommands: ['pnpm typecheck'],
    ...overrides
  }
}

export function createCapabilityManifestTemplate(): CapabilityManifest {
  return {
    version: 1,
    services: {},
    dictionaries: [],
    actions: [],
    slots: [],
    access: []
  }
}
