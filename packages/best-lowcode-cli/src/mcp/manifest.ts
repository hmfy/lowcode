import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { diagnostic } from './diagnostics'
import type { CapabilityContext, CapabilityDefinition, CapabilityManifest, Diagnostic } from './types'

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0)
}

export function parseCapabilityManifest(value: unknown): {
  manifest?: CapabilityManifest
  diagnostics: Diagnostic[]
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { diagnostics: [diagnostic('error', 'manifest.invalid', 'Manifest 必须是 JSON 对象')] }
  }
  const raw = value as Record<string, unknown>
  const diagnostics: Diagnostic[] = []
  if (raw.version !== 1)
    diagnostics.push(diagnostic('error', 'manifest.version', '仅支持 Manifest 版本 1'))
  const listKeys = ['dictionaries', 'actions', 'slots', 'access'] as const
  for (const key of listKeys) {
    if (raw[key] !== undefined && !isStringList(raw[key])) {
      diagnostics.push(diagnostic('error', 'manifest.list', `${key} 必须是非空字符串数组`, key))
    }
  }
  const services = raw.services
  if (
    services !== undefined &&
    (!services || typeof services !== 'object' || Array.isArray(services))
  ) {
    diagnostics.push(diagnostic('error', 'manifest.services', 'services 必须是对象', 'services'))
  }
  if (diagnostics.length > 0) return { diagnostics }
  return {
    manifest: {
      version: 1,
      services: services as CapabilityManifest['services'],
      dictionaries: raw.dictionaries as string[] | undefined,
      actions: raw.actions as string[] | undefined,
      slots: raw.slots as string[] | undefined,
      access: raw.access as string[] | undefined
    },
    diagnostics
  }
}

export async function loadCapabilityContexts(rootDir: string, manifestPaths: string[]) {
  const diagnostics: Diagnostic[] = []
  const contexts: CapabilityContext[] = []
  for (const manifestPath of manifestPaths) {
    try {
      const content = await readFile(resolve(rootDir, manifestPath), 'utf8')
      const result = parseCapabilityManifest(JSON.parse(content) as unknown)
      diagnostics.push(...result.diagnostics.map((item) => ({ ...item, path: manifestPath })))
      if (result.manifest) contexts.push({ manifestPath, manifest: result.manifest })
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      diagnostics.push(
        diagnostic('error', 'manifest.read', `无法读取 Manifest：${message}`, manifestPath)
      )
    }
  }
  return { contexts, diagnostics }
}

export function listCapabilities(contexts: CapabilityContext[]): string[] {
  return contexts.flatMap(({ manifest }) => [
    ...Object.keys(manifest.services ?? {}),
    ...(manifest.dictionaries ?? []),
    ...(manifest.actions ?? []),
    ...(manifest.slots ?? []),
    ...(manifest.access ?? [])
  ])
}

export function findCapabilityDefinition(
  contexts: CapabilityContext[],
  id: string
): CapabilityDefinition | undefined {
  for (const { manifest } of contexts) {
    const definition = manifest.services?.[id]
    if (definition) return definition
  }
  return undefined
}
