import { access, cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir, platform as currentPlatform } from 'node:os'
import { dirname, join, resolve, win32 as win32Path } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const DEVTOOLS_PACKAGE = 'best-lowcode-devtools'
export const MCP_SERVER_NAME = 'best-lowcode'
export const SUPPORTED_HOSTS = ['codex', 'cursor'] as const

export type SupportedHost = (typeof SUPPORTED_HOSTS)[number]
export type CommandResult = { ok: boolean; stdout: string; stderr: string }
export type CommandOutput = (chunk: string) => void
export type CommandRunner = (command: string, args: string[], onOutput?: CommandOutput) => Promise<CommandResult>
export type InstallStatus =
  | 'installed'
  | 'repaired'
  | 'already-registered'
  | 'pending-user-install'
  | 'skipped'
  | 'failed'

export type HostInstallResult = {
  host: SupportedHost
  skill: InstallStatus
  mcp: InstallStatus
  mcpInstallUrl?: string
  message?: string
}

export type InstallerResult = {
  ok: boolean
  devtools: InstallStatus
  devtoolsMessage?: string
  mcpCommand?: string
  hosts: HostInstallResult[]
}

export type InstallerOptions = {
  cursorConfigFallback?: boolean
  devtoolsVersion?: string
  environment?: NodeJS.ProcessEnv
  homeDir?: string
  hostDetector?: HostDetector
  onProgress?: (message: string) => void
  platform?: NodeJS.Platform
  repairMcp?: boolean
  runner?: CommandRunner
  skillSourceDir?: string
}

export type HostAvailability = 'cli' | 'client' | 'unavailable'
export type HostDescriptor = {
  id: SupportedHost
  label: string
  command: string
}
export type HostDetector = (host: HostDescriptor, context: HostDetectionContext) => Promise<HostAvailability>

export type HostDetectionContext = {
  environment: NodeJS.ProcessEnv
  homeDir: string
  platform: NodeJS.Platform
  runner: CommandRunner
}

type HostDefinition = HostDescriptor & {
  skillRelativePath: string[]
  clientPaths: (homeDir: string, environment: NodeJS.ProcessEnv, osPlatform: NodeJS.Platform) => string[]
  registrationArgs: (mcpCommand: string) => string[]
  removalArgs: () => string[]
}

const HOSTS: HostDefinition[] = [
  {
    id: 'codex',
    label: 'Codex',
    command: 'codex',
    skillRelativePath: ['.codex', 'skills', MCP_SERVER_NAME],
    clientPaths: (homeDir, environment, osPlatform) => [
      join(homeDir, '.codex'),
      ...(osPlatform === 'darwin'
        ? ['/Applications/Codex.app', join(homeDir, 'Applications', 'Codex.app')]
        : []),
      ...(osPlatform === 'win32'
        ? [
            join(environment.LOCALAPPDATA ?? join(homeDir, 'AppData', 'Local'), 'Programs', 'Codex', 'Codex.exe')
          ]
        : []),
      ...(osPlatform === 'linux' ? ['/usr/bin/codex', '/usr/local/bin/codex'] : [])
    ],
    registrationArgs: (mcpCommand) => ['mcp', 'add', MCP_SERVER_NAME, '--', mcpCommand],
    removalArgs: () => ['mcp', 'remove', MCP_SERVER_NAME]
  },
  {
    id: 'cursor',
    label: 'Cursor',
    command: 'agent',
    skillRelativePath: ['.cursor', 'skills', MCP_SERVER_NAME],
    clientPaths: (homeDir, environment, osPlatform) => [
      join(homeDir, '.cursor'),
      ...(osPlatform === 'darwin'
        ? ['/Applications/Cursor.app', join(homeDir, 'Applications', 'Cursor.app')]
        : []),
      ...(osPlatform === 'win32'
        ? [
            join(environment.LOCALAPPDATA ?? join(homeDir, 'AppData', 'Local'), 'Programs', 'Cursor', 'Cursor.exe'),
            join(environment.LOCALAPPDATA ?? join(homeDir, 'AppData', 'Local'), 'Cursor', 'Cursor.exe')
          ]
        : []),
      ...(osPlatform === 'linux'
        ? ['/usr/bin/cursor', '/usr/local/bin/cursor', join(homeDir, '.local', 'share', 'cursor')]
        : [])
    ],
    registrationArgs: (mcpCommand) => ['mcp', 'add', MCP_SERVER_NAME, '--', mcpCommand],
    removalArgs: () => ['mcp', 'remove', MCP_SERVER_NAME]
  }
]

async function defaultRunner(command: string, args: string[], onOutput?: CommandOutput): Promise<CommandResult> {
  return new Promise((resolveResult) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const settle = (result: CommandResult) => {
      if (settled) return
      settled = true
      resolveResult(result)
    }
    let child
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      settle({ ok: false, stdout, stderr: message })
      return
    }
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      onOutput?.(text)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      onOutput?.(text)
    })
    child.once('error', (error) => settle({ ok: false, stdout, stderr: stderr || error.message }))
    child.once('close', (code) => settle({ ok: code === 0, stdout, stderr }))
  })
}

function progressRunner(runner: CommandRunner, progress: (message: string) => void): CommandRunner {
  return async (command, args, onOutput) => {
    if (onOutput) return runner(command, args, onOutput)
    let remainder = ''
    const result = await runner(command, args, (chunk) => {
      const lines = `${remainder}${chunk}`.split(/\r?\n/)
      remainder = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) progress(`  ${line}`)
    })
    if (remainder.trim()) progress(`  ${remainder}`)
    return result
  }
}

function bundledSkillDirectory() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'skill')
}

function normalizeOutput(result: CommandResult) {
  return `${result.stdout}\n${result.stderr}`.toLocaleLowerCase()
}

function hasRegisteredServer(result: CommandResult) {
  return new RegExp(`(^|\\s)${MCP_SERVER_NAME}(?=\\s|$|:)`, 'm').test(normalizeOutput(result))
}

function globalMcpCommand(prefix: string, osPlatform: NodeJS.Platform) {
  if (osPlatform === 'win32') return win32Path.join(prefix, 'best-lowcode-mcp.cmd')
  return join(prefix, 'bin', 'best-lowcode-mcp')
}

async function installSkill(source: string, destination: string) {
  await mkdir(dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true, force: true })
}

async function pathExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function defaultHostDetector(host: HostDefinition, context: HostDetectionContext): Promise<HostAvailability> {
  if ((await context.runner(host.command, ['--version'])).ok) return 'cli'
  const paths = host.clientPaths(context.homeDir, context.environment, context.platform)
  return (await Promise.all(paths.map(pathExists))).some(Boolean) ? 'client' : 'unavailable'
}

async function registerHost(
  host: HostDefinition,
  runner: CommandRunner,
  mcpCommand: string,
  repairMcp: boolean
): Promise<Pick<HostInstallResult, 'mcp' | 'message'>> {
  const listed = await runner(host.command, ['mcp', 'list'])
  if (!listed.ok) {
    return {
      mcp: 'failed',
      message: `${host.command} mcp list 执行失败：${listed.stderr || listed.stdout}`
    }
  }
  const registered = hasRegisteredServer(listed)
  if (registered && !repairMcp) {
    return { mcp: 'already-registered' }
  }

  if (registered) {
    const removed = await runner(host.command, host.removalArgs())
    if (!removed.ok) {
      return {
        mcp: 'failed',
        message: `${host.command} MCP 移除失败：${removed.stderr || removed.stdout}`
      }
    }
  }

  const added = await runner(host.command, host.registrationArgs(mcpCommand))
  if (!added.ok) {
    return {
      mcp: 'failed',
      message: `${host.command} MCP 注册失败：${added.stderr || added.stdout}`
    }
  }
  return { mcp: registered ? 'repaired' : 'installed' }
}

function tomlString(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function removeTomlServer(text: string, serverName: string) {
  const header = new RegExp(`^\\[mcp_servers\\.${serverName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?:\\.[^\\]]+)?\\]\\s*$`, 'gm')
  const ranges: Array<[number, number]> = []
  for (let match = header.exec(text); match; match = header.exec(text)) {
    const nextHeader = /^\[/gm
    nextHeader.lastIndex = header.lastIndex
    const next = nextHeader.exec(text)
    ranges.push([match.index, next?.index ?? text.length])
  }
  return ranges.reverse().reduce((value, [start, end]) => `${value.slice(0, start)}${value.slice(end)}`, text)
}

function hasTomlServer(text: string, serverName: string) {
  return new RegExp(`^\\[mcp_servers\\.${serverName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?:\\.[^\\]]+)?\\]\\s*$`, 'm').test(
    text
  )
}

async function readOptionalFile(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function writeConfigAtomically(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  const existing = await readOptionalFile(path)
  if (existing !== undefined) await writeFile(`${path}.best-lowcode.bak`, existing, 'utf8')
  const temporary = `${path}.best-lowcode-${process.pid}.tmp`
  await writeFile(temporary, content, 'utf8')
  await rename(temporary, path)
}

async function registerCodexConfig(
  homeDir: string,
  mcpCommand: string,
  repairMcp: boolean
): Promise<Pick<HostInstallResult, 'mcp' | 'message'>> {
  const configPath = join(homeDir, '.codex', 'config.toml')
  const existing = (await readOptionalFile(configPath)) ?? ''
  const registered = hasTomlServer(existing, MCP_SERVER_NAME)
  if (registered && !repairMcp) return { mcp: 'already-registered' }

  const prefix = removeTomlServer(existing, MCP_SERVER_NAME).trimEnd()
  const entry = `[mcp_servers.${MCP_SERVER_NAME}]\ncommand = ${tomlString(mcpCommand)}\nargs = []\n`
  await writeConfigAtomically(configPath, `${prefix}${prefix ? '\n\n' : ''}${entry}`)
  return {
    mcp: registered ? 'repaired' : 'installed',
    message: '已写入 Codex MCP 配置，请重启 Codex 以加载 BEST 工具'
  }
}

async function registerCursorConfig(
  homeDir: string,
  mcpCommand: string,
  repairMcp: boolean
): Promise<Pick<HostInstallResult, 'mcp' | 'message'>> {
  const configPath = join(homeDir, '.cursor', 'mcp.json')
  const source = await readOptionalFile(configPath)
  let configuration: { mcpServers?: Record<string, unknown> } = {}
  if (source) {
    try {
      configuration = JSON.parse(source) as { mcpServers?: Record<string, unknown> }
    } catch {
      return { mcp: 'failed', message: `Cursor MCP 配置不是有效 JSON：${configPath}` }
    }
  }
  if (configuration.mcpServers !== undefined && (typeof configuration.mcpServers !== 'object' || Array.isArray(configuration.mcpServers))) {
    return { mcp: 'failed', message: `Cursor MCP 配置格式无效：${configPath}` }
  }

  const servers = configuration.mcpServers ?? {}
  const registered = MCP_SERVER_NAME in servers
  if (registered && !repairMcp) return { mcp: 'already-registered' }
  servers[MCP_SERVER_NAME] = { command: mcpCommand, args: [] }
  configuration.mcpServers = servers
  await writeConfigAtomically(configPath, `${JSON.stringify(configuration, null, 2)}\n`)
  return {
    mcp: registered ? 'repaired' : 'installed',
    message: '已写入 Cursor MCP 配置，请重新加载 Cursor 以加载 BEST 工具'
  }
}

function cursorMcpInstallUrl(mcpCommand: string) {
  const config = Buffer.from(JSON.stringify({ command: mcpCommand, args: [] })).toString('base64')
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(MCP_SERVER_NAME)}&config=${encodeURIComponent(config)}`
}

async function openUrl(url: string, osPlatform: NodeJS.Platform, runner: CommandRunner) {
  if (osPlatform === 'darwin') return runner('open', [url])
  if (osPlatform === 'win32') {
    return runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $args[0]', url])
  }
  return runner('xdg-open', [url])
}

async function registerClientHost(
  host: HostDefinition,
  options: Pick<InstallerOptions, 'cursorConfigFallback' | 'repairMcp'>,
  homeDir: string,
  mcpCommand: string,
  osPlatform: NodeJS.Platform,
  runner: CommandRunner
): Promise<Pick<HostInstallResult, 'mcp' | 'message' | 'mcpInstallUrl'>> {
  if (host.id === 'codex') return registerCodexConfig(homeDir, mcpCommand, options.repairMcp ?? false)
  if (options.cursorConfigFallback) {
    return registerCursorConfig(homeDir, mcpCommand, options.repairMcp ?? false)
  }

  const mcpInstallUrl = cursorMcpInstallUrl(mcpCommand)
  const opened = await openUrl(mcpInstallUrl, osPlatform, runner)
  return {
    mcp: 'pending-user-install',
    mcpInstallUrl,
    message: opened.ok
      ? '已打开 Cursor 安装确认，请在 Cursor 中点击 Install'
      : '无法自动打开 Cursor 安装确认，请复制 mcpInstallUrl 到浏览器打开后点击 Install'
  }
}

function hostProgressMessage(host: HostDefinition, result: HostInstallResult) {
  if (result.skill === 'failed' || result.mcp === 'failed') {
    return `✗ ${host.label}：${result.message ?? '配置失败'}`
  }
  if (result.mcp === 'repaired') {
    return `✓ ${host.label}：Skill 已安装，MCP 已修复`
  }
  if (result.mcp === 'already-registered') {
    return `✓ ${host.label}：Skill 已安装，MCP 已存在`
  }
  if (result.mcp === 'pending-user-install') {
    return `! ${host.label}：Skill 已安装，请在 Cursor 中确认安装 MCP`
  }
  return `✓ ${host.label}：Skill 已安装，MCP 已注册`
}

export async function installBestLowcode(options: InstallerOptions = {}): Promise<InstallerResult> {
  const rawRunner = options.runner ?? defaultRunner
  const homeDir = options.homeDir ?? homedir()
  const osPlatform = options.platform ?? currentPlatform()
  const environment = options.environment ?? process.env
  const progress = options.onProgress ?? (() => undefined)
  const runner = progressRunner(rawRunner, progress)
  const version = options.devtoolsVersion ?? 'latest'
  const sourceSkill = options.skillSourceDir ?? bundledSkillDirectory()
  progress(`1/3 正在安装全局 DevTools（${version}）…`)
  const useVolta = Boolean(environment.VOLTA_HOME)
  const devtoolsInstall = useVolta
    ? await runner('volta', ['install', `${DEVTOOLS_PACKAGE}@${version}`])
    : await runner('npm', ['install', '--global', '--loglevel=info', `${DEVTOOLS_PACKAGE}@${version}`])

  if (!devtoolsInstall.ok) {
    progress('✗ 全局 DevTools 安装失败')
    return {
      ok: false,
      devtools: 'failed',
      devtoolsMessage: `全局安装 ${DEVTOOLS_PACKAGE} 失败：${devtoolsInstall.stderr || devtoolsInstall.stdout}`,
      hosts: []
    }
  }
  const cliCheck = osPlatform === 'win32'
    ? await runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '& best --help; if (-not $?) { exit 1 }'])
    : await runner('best', ['--help'])
  if (!cliCheck.ok) {
    progress('✗ 全局 best 命令不可用')
    return {
      ok: false,
      devtools: 'failed',
      devtoolsMessage: `DevTools 已安装，但 best --help 执行失败。请检查 ${useVolta ? 'VOLTA_HOME/bin' : 'npm 全局命令目录'} 是否在终端 PATH 中：${cliCheck.stderr || cliCheck.stdout}`,
      hosts: []
    }
  }
  progress('✓ 全局 DevTools 已安装')

  progress('2/3 正在探测 Codex 与 Cursor…')
  const hostDetector = options.hostDetector ?? defaultHostDetector
  const detectedHosts = await Promise.all(
    HOSTS.map(async (host) => ({
      host,
      availability: await hostDetector(host, { environment, homeDir, platform: osPlatform, runner })
    }))
  )
  const availableHosts = detectedHosts.filter(({ availability }) => availability !== 'unavailable')

  for (const { host, availability } of detectedHosts) {
    if (availability === 'cli') progress(`✓ 检测到 ${host.label} CLI`)
    if (availability === 'client') progress(`✓ 检测到 ${host.label} 客户端`)
  }

  if (availableHosts.length === 0) {
    progress('安装完成：未检测到可配置的宿主环境')
    return {
      ok: true,
      devtools: 'installed',
      hosts: []
    }
  }

  const prefix = useVolta
    ? await runner('volta', ['which', 'best-lowcode-mcp'])
    : await runner('npm', ['prefix', '--global'])
  if (!prefix.ok || !prefix.stdout.trim()) {
    progress('✗ 无法解析 MCP 命令路径')
    return {
      ok: false,
      devtools: 'installed',
      devtoolsMessage: `无法解析 ${useVolta ? 'Volta MCP 命令路径' : '全局 npm prefix'}：${prefix.stderr || prefix.stdout}`,
      hosts: []
    }
  }

  const mcpCommand = useVolta ? prefix.stdout.trim() : globalMcpCommand(prefix.stdout.trim(), osPlatform)
  progress('3/3 正在安装 Skill 并配置 MCP…')
  const hosts: HostInstallResult[] = []
  for (const { host, availability } of availableHosts) {
    progress(`正在配置 ${host.label}…`)
    const destination = join(homeDir, ...host.skillRelativePath)
    let result: HostInstallResult
    try {
      await installSkill(sourceSkill, destination)
      const registration =
        availability === 'cli'
          ? await registerHost(host, runner, mcpCommand, options.repairMcp ?? false)
          : await registerClientHost(host, options, homeDir, mcpCommand, osPlatform, runner)
      result = { host: host.id, skill: 'installed', ...registration }
    } catch (error) {
      result = {
        host: host.id,
        skill: 'failed',
        mcp: 'skipped',
        message: `Skill 安装失败：${error instanceof Error ? error.message : '未知错误'}`
      }
    }
    hosts.push(result)
    progress(hostProgressMessage(host, result))
  }
  const hostResults = hosts
  const result: InstallerResult = {
    ok: hostResults.every((host) => host.skill !== 'failed' && host.mcp !== 'failed'),
    devtools: 'installed',
    mcpCommand,
    hosts: hostResults
  }
  progress(result.ok ? '安装完成' : '安装未完成，请查看失败项')
  return result
}

function usage(write: (value: string) => void) {
  write(
    'Usage:\n  npx best-lowcode-installer [install] [--devtools-version <version>] [--repair-mcp] [--cursor-config-fallback]\n'
  )
}

export type InstallerCliIo = {
  stdout: (value: string) => void
  stderr: (value: string) => void
}

export async function runInstallerCli(
  argv: string[],
  io: InstallerCliIo = {
    stdout: process.stdout.write.bind(process.stdout),
    stderr: process.stderr.write.bind(process.stderr)
  },
  install: (options: InstallerOptions) => Promise<InstallerResult> = installBestLowcode
) {
  const args = argv[0] === 'install' ? argv.slice(1) : argv
  if (args.includes('--help') || args.includes('-h')) {
    usage(io.stdout)
    return 0
  }
  let devtoolsVersion: string | undefined
  let cursorConfigFallback = false
  let repairMcp = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--repair-mcp') {
      repairMcp = true
      continue
    }
    if (arg === '--cursor-config-fallback') {
      cursorConfigFallback = true
      continue
    }
    if (arg === '--devtools-version' && args[index + 1]) {
      devtoolsVersion = args[index + 1]
      index += 1
      continue
    }
    usage(io.stderr)
    return 1
  }
  const result = await install({
    devtoolsVersion,
    cursorConfigFallback,
    repairMcp,
    onProgress: (message) => io.stdout(`[best-lowcode] ${message}\n`)
  })
  io.stdout(`${JSON.stringify(result, null, 2)}\n`)
  return result.ok ? 0 : 1
}
