import { loadProjectConfig } from './config'
import { hasErrors } from './diagnostics'
import { loadCapabilityContexts } from './manifest'
import { syncManifestDiscovery } from './manifest-sync'
import { previewCandidateChange } from './preview'
import { scanTypeScriptSchemas } from './schema-scan'
import { resolveWithLocalCodex } from './semantic'
import { describeCapabilities, prepareTask } from './task'
import type {
  CandidateLanguage,
  LowcodeAdapter,
  PrepareOptions,
  SemanticResolver,
  SemanticSelection,
  VerificationResult
} from './types'

const execAsync = promisify(exec)

export type BestLowcodeMcpService = ReturnType<typeof createBestLowcodeMcpService>

export function createBestLowcodeMcpService(
  rootDir: string,
  adapter?: LowcodeAdapter,
  semanticResolver?: SemanticResolver
) {
  function validateSelection(
    selection: SemanticSelection,
    allowedPaths: string[],
    capabilityIds: string[],
    manifestPaths: string[]
  ): string | undefined {
    if (selection.relatedCapabilities.some((id) => !capabilityIds.includes(id))) {
      return 'Codex 返回了不在 Manifest 或内置能力清单中的能力 ID'
    }
    if (
      selection.allowedPaths.some(
        (path) => !allowedPaths.includes(path) && !manifestPaths.includes(path)
      )
    ) {
      return 'Codex 返回了不在 allowedPaths 白名单中的路径'
    }
    return undefined
  }
  async function readContext() {
    const configResult = await loadProjectConfig(rootDir)
    if (!configResult.config)
      return { config: undefined, contexts: [], diagnostics: configResult.diagnostics }
    const manifests = await loadCapabilityContexts(rootDir, configResult.config.manifestPaths)
    return {
      config: configResult.config,
      contexts: manifests.contexts,
      diagnostics: [...configResult.diagnostics, ...manifests.diagnostics]
    }
  }

  return {
    async getContext() {
      const context = await readContext()
      return {
        config: context.config,
        manifests: context.contexts,
        builtInCapabilities: adapter?.builtInCapabilities?.() ?? [],
        diagnostics: context.diagnostics
      }
    },
    async prepareTask(request: string, options: PrepareOptions = {}) {
      const context = await readContext()
      if (!context.config) return { task: undefined, diagnostics: context.diagnostics }
      const builtInCapabilities = adapter?.builtInCapabilities?.() ?? []
      const diagnostics = [...context.diagnostics]
      let selection: SemanticSelection | undefined
      const semantic = options.semantic ?? 'codex'
      if (semantic === 'codex') {
        try {
          const resolver = semanticResolver ?? ((input) => resolveWithLocalCodex(rootDir, input))
          const result = await resolver({
            request,
            allowedPaths: context.config.allowedPaths,
            capabilities: describeCapabilities(context.contexts, builtInCapabilities)
          })
          const selectionError = validateSelection(
            result,
            context.config.allowedPaths,
            describeCapabilities(context.contexts, builtInCapabilities).map(({ id }) => id),
            context.config.manifestPaths
          )
          if (selectionError) {
            diagnostics.push({
              level: 'warning',
              code: 'semantic.rejected',
              message: selectionError
            })
          } else {
            selection = {
              ...result,
              // Manifest is a separately controlled capability file, not a business write path.
              allowedPaths: result.allowedPaths.filter(
                (path) => !context.config?.manifestPaths.includes(path)
              )
            }
          }
        } catch (error) {
          diagnostics.push({
            level: 'warning',
            code: 'semantic.fallback',
            message: `Codex 语义解析不可用，已回退到确定性匹配：${error instanceof Error ? error.message : '未知错误'}`
          })
        }
      }
      return {
        task: prepareTask(
          request,
          context.config,
          context.contexts,
          builtInCapabilities,
          selection
        ),
        diagnostics
      }
    },
    async previewChange(
      targetPath: string,
      candidate: string,
      language: CandidateLanguage = 'auto'
    ) {
      const context = await readContext()
      if (!context.config) return { preview: undefined, diagnostics: context.diagnostics }
      const preview = await previewCandidateChange(
        rootDir,
        context.config,
        targetPath,
        candidate,
        adapter,
        language
      )
      return { preview, diagnostics: [...context.diagnostics, ...preview.diagnostics] }
    },
    async discoverManifest(write = false) {
      const configResult = await loadProjectConfig(rootDir)
      if (!configResult.config) {
        return { written: false, pages: [], diagnostics: configResult.diagnostics }
      }
      return syncManifestDiscovery(rootDir, configResult.config, write)
    },
    async verify(): Promise<VerificationResult> {
      const context = await readContext()
      const schemaDiagnostics = context.config
        ? await scanTypeScriptSchemas(
            rootDir,
            context.config,
            context.contexts,
            adapter?.builtInCapabilities?.() ?? [],
            adapter
          )
        : []
      const adapterDiagnostics = adapter?.verifyProject ? await adapter.verifyProject(rootDir) : []
      const diagnostics = [...context.diagnostics, ...schemaDiagnostics, ...adapterDiagnostics]
      for (const command of context.config?.verificationCommands ?? []) {
        try {
          await execAsync(command, { cwd: rootDir, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 })
        } catch (error) {
          const detail = error && typeof error === 'object' && 'stderr' in error
            ? String(error.stderr || ('message' in error ? error.message : '命令执行失败'))
            : error instanceof Error ? error.message : '命令执行失败'
          diagnostics.push({
            level: 'error',
            code: 'verification.command.failed',
            message: `验证命令执行失败：${command}\n${detail.trim()}`
          })
        }
      }
      return { ok: !hasErrors(diagnostics), diagnostics }
    }
  }
}
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
