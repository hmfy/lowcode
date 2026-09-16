import { access, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseProjectConfig } from './mcp/config'
import { diagnostic, hasErrors } from './mcp/diagnostics'
import type { Diagnostic, ProjectConfig } from './mcp/types'
import {
  createCapabilityManifestTemplate,
  createProjectConfigTemplate,
  DEFAULT_CONFIG_FILE
} from './templates'

export type ProjectConfigurationSelection = Pick<
  ProjectConfig,
  'allowedPaths' | 'manifestPaths' | 'verificationCommands'
> & { schemaFilePattern?: string }

export type ProjectConfigurationFile = {
  path: string
  action: 'create' | 'update' | 'unchanged'
  diff: { before: string | null; after: string }
}

export type ProjectConfigurationResult = {
  config?: ProjectConfig
  files: ProjectConfigurationFile[]
  diagnostics: Diagnostic[]
  written: boolean
}

async function readOptional(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
}

async function exists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function candidateConfig(existing: string | undefined, selection: Partial<ProjectConfigurationSelection>) {
  if (existing) {
    const parsed = parseProjectConfig(JSON.parse(existing) as unknown)
    if (parsed.config) return { config: { ...parsed.config, ...selection }, diagnostics: parsed.diagnostics }
    return { config: undefined, diagnostics: parsed.diagnostics }
  }
  return { config: createProjectConfigTemplate(selection), diagnostics: [] }
}

export async function configureProject(
  rootDir: string,
  selection: Partial<ProjectConfigurationSelection> = {},
  write = false
): Promise<ProjectConfigurationResult> {
  const configPath = resolve(rootDir, DEFAULT_CONFIG_FILE)
  const existingConfig = await readOptional(configPath)
  let candidate: ReturnType<typeof candidateConfig>
  try {
    candidate = candidateConfig(existingConfig, selection)
  } catch (error) {
    return {
      files: [],
      diagnostics: [diagnostic('error', 'config.read', `无法解析 ${DEFAULT_CONFIG_FILE}：${error instanceof Error ? error.message : '未知错误'}`)],
      written: false
    }
  }
  if (!candidate.config || hasErrors(candidate.diagnostics)) {
    return { files: [], diagnostics: candidate.diagnostics, written: false }
  }
  const validated = parseProjectConfig(candidate.config)
  if (!validated.config || hasErrors(validated.diagnostics)) {
    return { files: [], diagnostics: validated.diagnostics, written: false }
  }

  const configContent = `${JSON.stringify(validated.config, null, 2)}\n`
  const files: ProjectConfigurationFile[] = [
    {
      path: DEFAULT_CONFIG_FILE,
      action: existingConfig === undefined ? 'create' : existingConfig === configContent ? 'unchanged' : 'update',
      diff: { before: existingConfig ?? null, after: configContent }
    }
  ]
  for (const manifestPath of validated.config.manifestPaths) {
    const absolutePath = resolve(rootDir, manifestPath)
    const content = await readOptional(absolutePath)
    const template = `${JSON.stringify(createCapabilityManifestTemplate(), null, 2)}\n`
    files.push({
      path: manifestPath,
      action: content === undefined ? 'create' : 'unchanged',
      diff: { before: content ?? null, after: content ?? template }
    })
  }
  if (write) {
    await Promise.all(
      files.map(async (file) => {
        if (file.action === 'unchanged') return
        const absolutePath = resolve(rootDir, file.path)
        if (file.path === DEFAULT_CONFIG_FILE || !(await exists(absolutePath))) {
          await writeFile(absolutePath, file.diff.after, 'utf8')
        }
      })
    )
  }
  return { config: validated.config, files, diagnostics: [], written: write && files.some((file) => file.action !== 'unchanged') }
}
