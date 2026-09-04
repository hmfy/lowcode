import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir, platform as currentPlatform } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)

export const DEVTOOLS_PACKAGE = 'best-lowcode-devtools'
export const MCP_SERVER_NAME = 'best-lowcode'
export const SUPPORTED_HOSTS = ['codex', 'cursor', 'claude-code'] as const

export type SupportedHost = (typeof SUPPORTED_HOSTS)[number]
export type CommandResult = { ok: boolean; stdout: string; stderr: string }
export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>
export type InstallStatus =
  | 'installed'
  | 'repaired'
  | 'already-registered'
  | 'skipped'
  | 'failed'

export type HostInstallResult = {
  host: SupportedHost
  skill: InstallStatus
  mcp: InstallStatus
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
  devtoolsVersion?: string
  homeDir?: string
  platform?: NodeJS.Platform
  repairMcp?: boolean
  runner?: CommandRunner
  skillSourceDir?: string
}

type HostDefinition = {
  id: SupportedHost
  command: string
  skillRelativePath: string[]
  registrationArgs: (mcpCommand: string) => string[]
  removalArgs: () => string[]
}

const HOSTS: HostDefinition[] = [
  {
    id: 'codex',
    command: 'codex',
    skillRelativePath: ['.codex', 'skills', MCP_SERVER_NAME],
    registrationArgs: (mcpCommand) => ['mcp', 'add', MCP_SERVER_NAME, '--', mcpCommand],
    removalArgs: () => ['mcp', 'remove', MCP_SERVER_NAME]
  },
  {
    id: 'cursor',
    command: 'agent',
    skillRelativePath: ['.cursor', 'skills', MCP_SERVER_NAME],
    registrationArgs: (mcpCommand) => ['mcp', 'add', MCP_SERVER_NAME, '--', mcpCommand],
    removalArgs: () => ['mcp', 'remove', MCP_SERVER_NAME]
  },
  {
    id: 'claude-code',
    command: 'claude',
    skillRelativePath: ['.claude', 'skills', MCP_SERVER_NAME],
    registrationArgs: (mcpCommand) => [
      'mcp',
      'add',
      '--transport',
      'stdio',
      '--scope',
      'user',
      MCP_SERVER_NAME,
      '--',
      mcpCommand
    ],
    removalArgs: () => ['mcp', 'remove', MCP_SERVER_NAME]
  }
]

async function defaultRunner(command: string, args: string[]): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { encoding: 'utf8' })
    return { ok: true, stdout, stderr }
  } catch (error) {
    const result = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
    return {
      ok: false,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? result.message
    }
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
  return osPlatform === 'win32'
    ? join(prefix, 'best-lowcode-mcp.cmd')
    : join(prefix, 'bin', 'best-lowcode-mcp')
}

async function installSkill(source: string, destination: string, host: SupportedHost) {
  await mkdir(dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true, force: true })
  if (host !== 'claude-code') return
  const skillPath = join(destination, 'SKILL.md')
  const skill = await readFile(skillPath, 'utf8')
  const claudeSkill = skill.replace('\n---\n\n#', '\ndisable-model-invocation: true\n---\n\n#')
  await writeFile(skillPath, claudeSkill, 'utf8')
}

async function isHostAvailable(host: HostDefinition, runner: CommandRunner) {
  return (await runner(host.command, ['--version'])).ok
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

export async function installBestLowcode(options: InstallerOptions = {}): Promise<InstallerResult> {
  const runner = options.runner ?? defaultRunner
  const homeDir = options.homeDir ?? homedir()
  const osPlatform = options.platform ?? currentPlatform()
  const version = options.devtoolsVersion ?? 'latest'
  const sourceSkill = options.skillSourceDir ?? bundledSkillDirectory()
  const devtoolsInstall = await runner('npm', ['install', '--global', `${DEVTOOLS_PACKAGE}@${version}`])

  if (!devtoolsInstall.ok) {
    return {
      ok: false,
      devtools: 'failed',
      devtoolsMessage: `全局安装 ${DEVTOOLS_PACKAGE} 失败：${devtoolsInstall.stderr || devtoolsInstall.stdout}`,
      hosts: []
    }
  }

  const detectedHosts = await Promise.all(
    HOSTS.map(async (host) => ({ host, available: await isHostAvailable(host, runner) }))
  )
  const unavailableHosts = detectedHosts
    .filter(({ available }) => !available)
    .map(({ host }) => ({
      host: host.id,
      skill: 'skipped' as const,
      mcp: 'skipped' as const,
      message: `${host.command} 未安装或不在 PATH 中`
    }))
  const availableHosts = detectedHosts.filter(({ available }) => available)

  if (availableHosts.length === 0) {
    return {
      ok: true,
      devtools: 'installed',
      hosts: unavailableHosts
    }
  }

  const prefix = await runner('npm', ['prefix', '--global'])
  if (!prefix.ok || !prefix.stdout.trim()) {
    return {
      ok: false,
      devtools: 'installed',
      devtoolsMessage: `无法解析全局 npm prefix：${prefix.stderr || prefix.stdout}`,
      hosts: []
    }
  }

  const mcpCommand = globalMcpCommand(prefix.stdout.trim(), osPlatform)
  const hosts = await Promise.all(
    availableHosts.map(async ({ host }): Promise<HostInstallResult> => {
      const destination = join(homeDir, ...host.skillRelativePath)
      try {
        await installSkill(sourceSkill, destination, host.id)
      } catch (error) {
        return {
          host: host.id,
          skill: 'failed',
          mcp: 'skipped',
          message: `Skill 安装失败：${error instanceof Error ? error.message : '未知错误'}`
        }
      }
      const registration = await registerHost(host, runner, mcpCommand, options.repairMcp ?? false)
      return { host: host.id, skill: 'installed', ...registration }
    })
  )
  const hostResults = HOSTS.map((host) =>
    hosts.find((result) => result.host === host.id) ?? unavailableHosts.find((result) => result.host === host.id)!
  )
  return {
    ok: hostResults.every((host) => host.skill !== 'failed' && host.mcp !== 'failed'),
    devtools: 'installed',
    mcpCommand,
    hosts: hostResults
  }
}

function usage(write: (value: string) => void) {
  write(
    'Usage:\n  npx best-lowcode-installer [install] [--devtools-version <version>] [--repair-mcp]\n'
  )
}

export async function runInstallerCli(
  argv: string[],
  io: { stdout: (value: string) => void; stderr: (value: string) => void } = {
    stdout: process.stdout.write.bind(process.stdout),
    stderr: process.stderr.write.bind(process.stderr)
  }
) {
  const args = argv[0] === 'install' ? argv.slice(1) : argv
  if (args.includes('--help') || args.includes('-h')) {
    usage(io.stdout)
    return 0
  }
  let devtoolsVersion: string | undefined
  let repairMcp = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--repair-mcp') {
      repairMcp = true
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
  const result = await installBestLowcode({ devtoolsVersion, repairMcp })
  io.stdout(`${JSON.stringify(result, null, 2)}\n`)
  return result.ok ? 0 : 1
}
