import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { diagnostic } from './diagnostics'
import type { Diagnostic, ProjectConfig } from './types'

export const CONFIG_FILE_NAME = 'best.lowcode.config.json'

export function isConfiguredManifestPath(config: ProjectConfig, targetPath: string) {
  return config.manifestPaths.includes(targetPath)
}

function isRelativeSafePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !isAbsolute(value) &&
    !value.includes('\0') &&
    !value.split(/[\\/]+/).includes('..')
  )
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined
}

export function parseProjectConfig(value: unknown): {
  config?: ProjectConfig
  diagnostics: Diagnostic[]
} {
  const diagnostics: Diagnostic[] = []
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { diagnostics: [diagnostic('error', 'config.invalid', '配置必须是 JSON 对象')] }
  }
  const raw = value as Record<string, unknown>
  const allowedPaths = stringArray(raw.allowedPaths)
  const manifestPaths = stringArray(raw.manifestPaths)
  if (raw.version !== 1) diagnostics.push(diagnostic('error', 'config.version', '仅支持配置版本 1'))
  if (!allowedPaths?.length)
    diagnostics.push(diagnostic('error', 'config.allowedPaths', 'allowedPaths 至少需要一个目录'))
  if (!manifestPaths?.length)
    diagnostics.push(diagnostic('error', 'config.manifestPaths', 'manifestPaths 至少需要一个文件'))
  for (const path of [...(allowedPaths ?? []), ...(manifestPaths ?? [])]) {
    if (!isRelativeSafePath(path))
      diagnostics.push(diagnostic('error', 'config.path', '配置路径必须是非空相对路径', path))
  }
  if (diagnostics.length > 0 || !allowedPaths || !manifestPaths) return { diagnostics }
  return {
    config: {
      version: 1,
      allowedPaths,
      manifestPaths,
      schemaFilePattern:
        typeof raw.schemaFilePattern === 'string' ? raw.schemaFilePattern : undefined,
      verificationCommands: stringArray(raw.verificationCommands)
    },
    diagnostics
  }
}

export async function loadProjectConfig(rootDir: string) {
  const filePath = resolve(rootDir, CONFIG_FILE_NAME)
  try {
    const content = await readFile(filePath, 'utf8')
    const parsed = parseProjectConfig(JSON.parse(content) as unknown)
    return { ...parsed, filePath }
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') {
      return {
        filePath,
        diagnostics: [
          diagnostic(
            'error',
            'config.missing',
            `未找到 ${CONFIG_FILE_NAME}；请先调用 best_configure_project 预览候选配置并在用户确认后写入，MCP 不可用时使用 best init --write。`,
            undefined,
            {
              command: 'best init --write',
              requiresUserApproval: true,
              retryTool: 'best_configure_project'
            }
          )
        ]
      }
    }
    const message = error instanceof Error ? error.message : '未知错误'
    return {
      filePath,
      diagnostics: [diagnostic('error', 'config.read', `无法读取 ${CONFIG_FILE_NAME}：${message}`)]
    }
  }
}

export function resolveAllowedPath(rootDir: string, allowedPaths: string[], targetPath: string) {
  if (!isRelativeSafePath(targetPath)) return undefined
  const target = resolve(rootDir, targetPath)
  const permitted = allowedPaths.some((allowedPath) => {
    const base = resolve(rootDir, allowedPath)
    const fromBase = relative(base, target)
    return (
      fromBase === '' ||
      (!fromBase.startsWith(`..${sep}`) && fromBase !== '..' && !isAbsolute(fromBase))
    )
  })
  return permitted ? target : undefined
}
