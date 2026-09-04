import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  bestLowcodeAdapter,
  createBestLowcodeMcpService,
  hasErrors,
  type CandidateLanguage
} from './mcp'
import { configureProject, type ProjectConfigurationSelection } from './init'
import { startBestLowcodeMcpServer } from './mcp/server'
import { createPage, type PageCreateOptions } from './page-create'
import { findDefaultProjectRoot } from './project-root'

export type CliIo = {
  stdout: (value: string) => void
  stderr: (value: string) => void
}

function json(io: CliIo, value: unknown) {
  io.stdout(`${JSON.stringify(value, null, 2)}\n`)
}

function usage(io: CliIo) {
  io.stderr(
    `${[
      'Usage:',
      '  best init [--allowed-paths <json-array>] [--manifest-paths <json-array>] [--verification-commands <json-array>] [--write] [--cwd <path>]',
      '  best page create <name> [--kind crud] [--dir <path>] [--title <title>] [--capability-prefix <id>] [--write] [--cwd <path>]',
      '  best prepare <request> [--cwd <path>]',
      '  best validate-selection <request> --related-capabilities <json-array> --allowed-paths <json-array> [--cwd <path>]',
      '  best preview-change <target-path> --candidate-file <path> [--language auto|ts|json] [--cwd <path>]',
      '  best verify [--cwd <path>]',
      '  best manifest sync --discover [--write] [--cwd <path>]',
      '  best mcp serve [--cwd <path>]'
    ].join('\n')}\n`
  )
}

function parsePageCreateArgs(args: string[]): PageCreateOptions | undefined {
  if (args[0] !== 'create') return undefined
  const name = args[1]
  if (!name) return undefined
  const options: PageCreateOptions = { name }
  for (let index = 2; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--write' && !options.write) {
      options.write = true
      continue
    }
    if (arg === '--kind' && args[index + 1] === 'crud') {
      options.kind = 'crud'
      index += 1
      continue
    }
    if (arg === '--dir' && args[index + 1]) {
      options.dir = args[index + 1]
      index += 1
      continue
    }
    if (arg === '--title' && args[index + 1]) {
      options.title = args[index + 1]
      index += 1
      continue
    }
    if (arg === '--capability-prefix' && args[index + 1]) {
      options.capabilityPrefix = args[index + 1]
      index += 1
      continue
    }
    return undefined
  }
  return options
}

function extractCwd(args: string[]) {
  const index = args.indexOf('--cwd')
  if (index === -1) return { cwd: undefined, args }
  const value = args[index + 1]
  if (!value) return { cwd: undefined, args: [] }
  return {
    cwd: resolve(value),
    args: args.filter((_, position) => position !== index && position !== index + 1)
  }
}

function parseStringArray(value: string | undefined) {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : undefined
  } catch {
    return undefined
  }
}

function parseValidateSelectionArgs(args: string[]) {
  const capabilitiesIndex = args.indexOf('--related-capabilities')
  const pathsIndex = args.indexOf('--allowed-paths')
  if (capabilitiesIndex === -1 || pathsIndex === -1) return undefined
  const relatedCapabilities = parseStringArray(args[capabilitiesIndex + 1])
  const allowedPaths = parseStringArray(args[pathsIndex + 1])
  const request = args
    .filter(
      (_, index) =>
        index !== capabilitiesIndex &&
        index !== capabilitiesIndex + 1 &&
        index !== pathsIndex &&
        index !== pathsIndex + 1
    )
    .join(' ')
    .trim()
  if (!request || !relatedCapabilities || !allowedPaths) return undefined
  return { request, relatedCapabilities, allowedPaths }
}

function parsePreviewChangeArgs(args: string[]) {
  const targetPath = args[0]
  const candidateIndex = args.indexOf('--candidate-file')
  const languageIndex = args.indexOf('--language')
  if (!targetPath || candidateIndex === -1 || !args[candidateIndex + 1]) return undefined
  const language = languageIndex === -1 ? 'auto' : args[languageIndex + 1]
  if (language !== 'auto' && language !== 'ts' && language !== 'json') return undefined
  const expectedLength = 3 + (languageIndex === -1 ? 0 : 2)
  if (args.length !== expectedLength) return undefined
  return { targetPath, candidateFile: args[candidateIndex + 1], language: language as CandidateLanguage }
}

function parseInitArgs(args: string[]): { write: boolean; selection: Partial<ProjectConfigurationSelection> } | undefined {
  const selection: Partial<ProjectConfigurationSelection> = {}
  let write = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--write' && !write) {
      write = true
      continue
    }
    const key =
      arg === '--allowed-paths'
        ? 'allowedPaths'
        : arg === '--manifest-paths'
          ? 'manifestPaths'
          : arg === '--verification-commands'
            ? 'verificationCommands'
            : undefined
    if (!key || selection[key] !== undefined) return undefined
    const value = parseStringArray(args[index + 1])
    if (!value) return undefined
    selection[key] = value
    index += 1
  }
  return { write, selection }
}

export async function runCli(
  argv: string[],
  io: CliIo = {
    stdout: process.stdout.write.bind(process.stdout),
    stderr: process.stderr.write.bind(process.stderr)
  }
): Promise<number> {
  const [command, ...rawArgs] = argv
  const { cwd: explicitCwd, args: cwdArgs } = extractCwd(rawArgs)
  const args = cwdArgs
  const cwd = explicitCwd ?? (await findDefaultProjectRoot())
  if (!command || command === '--help' || command === '-h' || !cwd) {
    usage(io)
    return command && !cwd ? 1 : 0
  }
  if (command === 'init') {
    const options = parseInitArgs(args)
    if (!options) {
      usage(io)
      return 1
    }
    try {
      const result = await configureProject(cwd, options.selection, options.write)
      json(io, { ok: !hasErrors(result.diagnostics), ...result })
      return hasErrors(result.diagnostics) ? 1 : 0
    } catch (error) {
      json(io, { ok: false, error: error instanceof Error ? error.message : '项目配置失败' })
      return 1
    }
  }
  if (command === 'mcp') {
    if (args.length !== 1 || args[0] !== 'serve') {
      usage(io)
      return 1
    }
    try {
      await startBestLowcodeMcpServer(cwd, bestLowcodeAdapter)
      return 0
    } catch (error) {
      io.stderr(`${error instanceof Error ? error.message : 'MCP 服务启动失败'}\n`)
      return 1
    }
  }

  if (command === 'page') {
    const options = parsePageCreateArgs(args)
    if (!options) {
      usage(io)
      return 1
    }
    const result = await createPage(cwd, options)
    json(io, { ok: !hasErrors(result.diagnostics), ...result })
    return hasErrors(result.diagnostics) ? 1 : 0
  }

  const service = createBestLowcodeMcpService(cwd, bestLowcodeAdapter)
  if (command === 'manifest') {
    const validArgs = args.every((arg) => ['sync', '--discover', '--write'].includes(arg))
    if (args[0] !== 'sync' || !args.includes('--discover') || !validArgs) {
      usage(io)
      return 1
    }
    const result = await service.discoverManifest(args.includes('--write'))
    json(io, { ok: !hasErrors(result.diagnostics), ...result })
    return hasErrors(result.diagnostics) ? 1 : 0
  }
  if (command === 'prepare') {
    if (args.includes('--semantic')) {
      usage(io)
      return 1
    }
    const request = args.join(' ').trim()
    if (!request) {
      usage(io)
      return 1
    }
    const result = await service.prepareTask(request)
    json(io, { ok: !hasErrors(result.diagnostics), ...result })
    return hasErrors(result.diagnostics) ? 1 : 0
  }
  if (command === 'validate-selection') {
    const selection = parseValidateSelectionArgs(args)
    if (!selection) {
      usage(io)
      return 1
    }
    const result = await service.validateSelection(selection.request, {
      relatedCapabilities: selection.relatedCapabilities,
      allowedPaths: selection.allowedPaths
    })
    json(io, { ok: !hasErrors(result.diagnostics), ...result })
    return hasErrors(result.diagnostics) ? 1 : 0
  }
  if (command === 'preview-change') {
    const preview = parsePreviewChangeArgs(args)
    if (!preview) {
      usage(io)
      return 1
    }
    try {
      const candidate = await readFile(resolve(cwd, preview.candidateFile), 'utf8')
      const result = await service.previewChange(preview.targetPath, candidate, preview.language)
      json(io, { ok: !hasErrors(result.diagnostics), ...result })
      return hasErrors(result.diagnostics) ? 1 : 0
    } catch (error) {
      json(io, { ok: false, error: error instanceof Error ? error.message : '无法读取候选文件' })
      return 1
    }
  }
  if (command === 'verify') {
    if (args.length) {
      usage(io)
      return 1
    }
    const result = await service.verify()
    json(io, result)
    return result.ok ? 0 : 1
  }
  usage(io)
  return 1
}
