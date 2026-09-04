import { resolve } from 'node:path'
import { initializeCodexAgentRules } from './agent-init'
import { initializeProject } from './init'
import { bestLowcodeAdapter, createBestLowcodeMcpService, hasErrors } from './mcp'
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
      '  best init [--write] [--cwd <path>]',
      '  best page create <name> [--kind crud] [--dir <path>] [--title <title>] [--capability-prefix <id>] [--write] [--cwd <path>]',
      '  best prepare <request> [--semantic codex] [--cwd <path>]',
      '  best verify [--cwd <path>]',
      '  best manifest sync --discover [--write] [--cwd <path>]',
      '  best mcp serve [--cwd <path>]',
      '  best agent init [--targets codex] [--write] [--cwd <path>]'
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

function extractSemantic(args: string[]) {
  const index = args.indexOf('--semantic')
  if (index === -1) return { semantic: undefined, args }
  const value = args[index + 1]
  if (value !== 'codex') return { semantic: undefined, args: [] }
  return {
    semantic: value,
    args: args.filter((_, position) => position !== index && position !== index + 1)
  }
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
  const { semantic, args } = extractSemantic(cwdArgs)
  const cwd = explicitCwd ?? (await findDefaultProjectRoot())
  if (!command || command === '--help' || command === '-h' || !cwd) {
    usage(io)
    return command && !cwd ? 1 : 0
  }
  if (command === 'init') {
    if (args.some((arg) => arg !== '--write')) {
      usage(io)
      return 1
    }
    try {
      json(io, await initializeProject(cwd, args.includes('--write')))
      return 0
    } catch (error) {
      json(io, { ok: false, error: error instanceof Error ? error.message : '初始化失败' })
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

  if (command === 'agent') {
    if (args[0] !== 'init') {
      usage(io)
      return 1
    }
    const agentArgs = args.slice(1)
    let targets = 'codex'
    let hasWrite = false
    let valid = true
    for (let index = 0; index < agentArgs.length; index += 1) {
      const arg = agentArgs[index]
      if (arg === '--write' && !hasWrite) {
        hasWrite = true
        continue
      }
      if (arg === '--targets' && agentArgs[index + 1] === 'codex') {
        targets = 'codex'
        index += 1
        continue
      }
      valid = false
      break
    }
    if (!valid || targets !== 'codex') {
      usage(io)
      return 1
    }
    try {
      json(io, await initializeCodexAgentRules(cwd, hasWrite))
      return 0
    } catch (error) {
      json(io, { ok: false, error: error instanceof Error ? error.message : '规则初始化失败' })
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
    const request = args.join(' ').trim()
    if (!request) {
      usage(io)
      return 1
    }
    const result = await service.prepareTask(request, semantic === 'codex' ? { semantic } : {})
    json(io, { ok: !hasErrors(result.diagnostics), ...result })
    return hasErrors(result.diagnostics) ? 1 : 0
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
