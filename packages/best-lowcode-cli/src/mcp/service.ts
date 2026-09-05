import { exec } from 'node:child_process'
import { posix } from 'node:path'
import { promisify } from 'node:util'
import { configureProject, type ProjectConfigurationSelection } from '../init'
import { loadProjectConfig } from './config'
import { hasErrors } from './diagnostics'
import { loadCapabilityContexts } from './manifest'
import { syncManifestDiscovery } from './manifest-sync'
import { previewCandidateChange } from './preview'
import { checkProjectRuntime } from './runtime'
import { scanTypeScriptSchemas } from './schema-scan'
import { describeCapabilities, prepareTask } from './task'
import type {
  CandidateLanguage,
  Diagnostic,
  LowcodeAdapter,
  TaskSelection,
  VerificationResult
} from './types'

const execAsync = promisify(exec)

export type BestLowcodeMcpService = ReturnType<typeof createBestLowcodeMcpService>

export function createBestLowcodeMcpService(
  rootDir: string,
  adapter?: LowcodeAdapter
) {
  function isWithinAllowedPath(targetPath: string, allowedPaths: string[]) {
    const normalizedTarget = targetPath.replaceAll('\\', '/')
    if (
      !normalizedTarget ||
      posix.isAbsolute(normalizedTarget) ||
      normalizedTarget.includes('\0') ||
      normalizedTarget.split('/').includes('..')
    ) {
      return false
    }
    return allowedPaths.some((allowedPath) => {
      const relativePath = posix.relative(allowedPath, normalizedTarget)
      return (
        relativePath === '' ||
        (!relativePath.startsWith('../') && relativePath !== '..' && !posix.isAbsolute(relativePath))
      )
    })
  }

  function validateTaskSelection(
    selection: TaskSelection,
    allowedPaths: string[],
    capabilityIds: string[],
    manifestPaths: string[]
  ): Diagnostic[] {
    const diagnostics: Diagnostic[] = []
    const unknownCapabilities = selection.relatedCapabilities.filter(
      (id) => !capabilityIds.includes(id)
    )
    if (unknownCapabilities.length) {
      diagnostics.push({
        level: 'error',
        code: 'selection.capability.unknown',
        message: `存在未在 Manifest 或 Runtime 中声明的能力 ID：${unknownCapabilities.join(', ')}`
      })
    }
    const disallowedPaths = selection.allowedPaths.filter(
      (path) => !manifestPaths.includes(path) && !isWithinAllowedPath(path, allowedPaths)
    )
    if (disallowedPaths.length) {
      diagnostics.push({
        level: 'error',
        code: 'selection.path.disallowed',
        message: `存在不在 allowedPaths 白名单中的路径：${disallowedPaths.join(', ')}`
      })
    }
    return diagnostics
  }
  async function readContext() {
    const configResult = await loadProjectConfig(rootDir)
    if (!configResult.config)
      return { config: undefined, contexts: [], diagnostics: configResult.diagnostics }
    const manifests = await loadCapabilityContexts(rootDir, configResult.config.manifestPaths)
    const runtimeDiagnostics = await checkProjectRuntime(rootDir, configResult.config.allowedPaths)
    return {
      config: configResult.config,
      contexts: manifests.contexts,
      diagnostics: [...configResult.diagnostics, ...manifests.diagnostics, ...runtimeDiagnostics]
    }
  }

  return {
    async configureProject(selection: Partial<ProjectConfigurationSelection> = {}, write = false) {
      return configureProject(rootDir, selection, write)
    },
    async getContext() {
      const context = await readContext()
      return {
        config: context.config,
        manifests: context.contexts,
        builtInCapabilities: adapter?.builtInCapabilities?.() ?? [],
        diagnostics: context.diagnostics
      }
    },
    async prepareTask(request: string) {
      const context = await readContext()
      if (!context.config || hasErrors(context.diagnostics)) {
        return { task: undefined, diagnostics: context.diagnostics }
      }
      const builtInCapabilities = adapter?.builtInCapabilities?.() ?? []
      return {
        task: prepareTask(request, context.config, context.contexts, builtInCapabilities),
        diagnostics: context.diagnostics
      }
    },
    async validateSelection(request: string, selection: TaskSelection) {
      const context = await readContext()
      if (!context.config) return { task: undefined, diagnostics: context.diagnostics }
      const builtInCapabilities = adapter?.builtInCapabilities?.() ?? []
      const capabilityIds = describeCapabilities(context.contexts, builtInCapabilities).map(({ id }) => id)
      const diagnostics = [
        ...context.diagnostics,
        ...validateTaskSelection(
          selection,
          context.config.allowedPaths,
          capabilityIds,
          context.config.manifestPaths
        )
      ]
      if (hasErrors(diagnostics)) return { task: undefined, diagnostics }
      return {
        task: prepareTask(request, context.config, context.contexts, builtInCapabilities, {
          relatedCapabilities: [...new Set(selection.relatedCapabilities)],
          // Manifest is a separately controlled capability file, not a business write path.
          allowedPaths: [...new Set(selection.allowedPaths)].filter(
            (path) => !context.config?.manifestPaths.includes(path)
          )
        }),
        diagnostics
      }
    },
    async previewChange(
      targetPath: string,
      candidate: string,
      language: CandidateLanguage = 'auto'
    ) {
      const context = await readContext()
      if (!context.config || hasErrors(context.diagnostics)) {
        return { preview: undefined, diagnostics: context.diagnostics }
      }
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
      const runtimeDiagnostics = await checkProjectRuntime(rootDir, configResult.config.allowedPaths)
      if (hasErrors(runtimeDiagnostics)) {
        return { written: false, pages: [], diagnostics: [...configResult.diagnostics, ...runtimeDiagnostics] }
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
