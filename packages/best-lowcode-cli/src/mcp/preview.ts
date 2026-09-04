import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isConfiguredManifestPath, resolveAllowedPath } from './config'
import { diagnostic } from './diagnostics'
import { parseStaticCrudSchemas } from './static-schema'
import type {
  CandidateLanguage,
  CandidatePreview,
  Diagnostic,
  LowcodeAdapter,
  ProjectConfig
} from './types'

export async function previewCandidateChange(
  rootDir: string,
  config: ProjectConfig,
  targetPath: string,
  candidate: string,
  adapter?: LowcodeAdapter,
  language: CandidateLanguage = 'auto'
): Promise<CandidatePreview> {
  const diagnostics: Diagnostic[] = []
  const resolvedPath = isConfiguredManifestPath(config, targetPath)
    ? resolve(rootDir, targetPath)
    : resolveAllowedPath(rootDir, config.allowedPaths, targetPath)
  if (!resolvedPath) {
    return {
      targetPath,
      exists: false,
      diff: { before: null, after: candidate },
      diagnostics: [
        diagnostic('error', 'preview.path', '目标文件不在 allowedPaths 白名单内', targetPath)
      ]
    }
  }
  if (isConfiguredManifestPath(config, targetPath)) {
    let before: string | null = null
    try {
      before = await readFile(resolvedPath, 'utf8')
    } catch {
      // New Manifest files are valid preview targets.
    }
    return { targetPath, exists: before !== null, diff: { before, after: candidate }, diagnostics }
  }
  const isTypeScriptTarget = targetPath.endsWith('.ts') || targetPath.endsWith('.tsx')
  let candidateLanguage = language === 'auto' && isTypeScriptTarget ? 'ts' : language
  let typeScriptResult: ReturnType<typeof parseStaticCrudSchemas> | undefined
  if (language === 'auto' && isTypeScriptTarget) {
    typeScriptResult = parseStaticCrudSchemas(candidate, targetPath)
    if (typeScriptResult.schemas.length !== 1 || typeScriptResult.diagnostics.length) {
      try {
        const value = JSON.parse(candidate) as unknown
        if (value && typeof value === 'object' && !Array.isArray(value)) candidateLanguage = 'json'
      } catch {
        // Keep TypeScript diagnostics: they explain why the TypeScript candidate is invalid.
      }
    }
  }
  let parsed: Record<string, unknown> | undefined
  if (candidateLanguage === 'ts') {
    const result = typeScriptResult ?? parseStaticCrudSchemas(candidate, targetPath)
    diagnostics.push(...result.diagnostics)
    if (!result.schemas.length && !result.diagnostics.some((item) => item.level === 'error')) {
      diagnostics.push(
        diagnostic(
          'error',
          'candidate.ts.schema',
          '候选 TypeScript 未包含静态 CRUD Schema',
          targetPath
        )
      )
    }
    if (result.schemas.length > 1) {
      diagnostics.push(
        diagnostic(
          'error',
          'candidate.ts.multiple',
          '候选 TypeScript 只能包含一个静态 CRUD Schema',
          targetPath
        )
      )
    }
    parsed = result.schemas[0]
  } else {
    try {
      const value = JSON.parse(candidate) as unknown
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        diagnostics.push(
          diagnostic('error', 'candidate.shape', '候选 Schema 必须是 JSON 对象', targetPath)
        )
      } else {
        parsed = value as Record<string, unknown>
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      diagnostics.push(
        diagnostic('error', 'candidate.json', `候选内容不是合法 JSON：${message}`, targetPath)
      )
    }
  }
  if (parsed && adapter?.validateSchema) diagnostics.push(...(await adapter.validateSchema(parsed)))
  let before: string | null = null
  try {
    before = await readFile(resolvedPath, 'utf8')
  } catch {
    // New files are valid preview targets; this tool never writes either variant.
  }
  return { targetPath, exists: before !== null, diff: { before, after: candidate }, diagnostics }
}
