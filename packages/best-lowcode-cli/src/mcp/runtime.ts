import { access, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { satisfies } from 'semver'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { diagnostic } from './diagnostics'
import type { Diagnostic } from './types'

const RUNTIME_PACKAGE = 'best-lowcode-runtime'
export const SUPPORTED_RUNTIME = '>=0.2.3 <0.3.0'

type PackageJson = {
  version?: string
  main?: string
  exports?: string | Record<string, unknown>
  packageManager?: string
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

// Read metadata from the project's node_modules ancestry, never from DevTools' own installation.
async function installedPackage(directory: string, name: string): Promise<PackageJson> {
  for (let current = directory; ; current = dirname(current)) {
    let content: string
    try {
      content = await readFile(resolve(current, 'node_modules', name, 'package.json'), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      if (dirname(current) === current) throw new Error(`${name} 未安装`)
      continue
    }
    const pkg: PackageJson = JSON.parse(content)
    try { createRequire(resolve(directory, 'package.json')).resolve(name) } catch {
      // Runtime exposes an import-only entry, which require.resolve cannot resolve.
      let entry: unknown = typeof pkg.exports === 'object' ? pkg.exports['.'] ?? pkg.exports : pkg.exports
      while (entry && typeof entry === 'object') {
        const conditions = entry as Record<string, unknown>
        entry = conditions.node ?? conditions.import ?? conditions.default
      }
      if (typeof entry !== 'string') throw new Error(`${name} 入口不可解析`)
      await access(resolve(current, 'node_modules', name, entry))
    }
    return pkg
  }
}

async function installCommand(directory: string, rootDir: string, packages: string[]) {
  for (let current = directory; ; current = dirname(current)) {
    let manager: string | undefined
    try {
      const pkg: PackageJson = JSON.parse(await readFile(resolve(current, 'package.json'), 'utf8'))
      manager = pkg.packageManager?.split('@')[0]
    } catch { /* A workspace parent may not contain package.json. */ }
    for (const [file, candidate] of [['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['package-lock.json', 'npm'], ['bun.lock', 'bun']]) {
      if (manager) break
      try { await readFile(resolve(current, file)); manager = candidate } catch { /* Try the next lockfile. */ }
    }
    if (manager) return `${manager} ${manager === 'npm' ? 'install' : 'add'} ${packages.join(' ')}`
    if (current === rootDir || dirname(current) === current) return `pnpm add ${packages.join(' ')}`
  }
}

async function inspectDependencies(directory: string, rootDir: string): Promise<Diagnostic[]> {
  const fail = async (code: string, message: string, packages: string[]) => diagnostic(
    'error', code, `${message}；请在 ${directory} 安装项目依赖后重试。`, directory,
    { command: await installCommand(directory, rootDir, packages), requiresUserApproval: true, retryTool: 'best_prepare_task' }
  )
  let runtime: PackageJson
  try { runtime = await installedPackage(directory, RUNTIME_PACKAGE) } catch {
    return [await fail('runtime.notInstalled', '项目声明了 Runtime，但无法解析其安装文件', [RUNTIME_PACKAGE])]
  }
  if (!runtime.version || !satisfies(runtime.version, SUPPORTED_RUNTIME)) {
    return [await fail('runtime.incompatible', `Runtime ${runtime.version ?? '未知版本'} 不兼容，工具支持 ${SUPPORTED_RUNTIME}`, [`${RUNTIME_PACKAGE}@\"${SUPPORTED_RUNTIME}\"`])]
  }
  const diagnostics: Diagnostic[] = []
  for (const [name, range] of Object.entries(runtime.peerDependencies ?? {})) {
    let peer: PackageJson
    try { peer = await installedPackage(directory, name) } catch {
      if (!runtime.peerDependenciesMeta?.[name]?.optional) diagnostics.push(await fail('runtime.peerMissing', `缺少 Runtime 依赖 ${name} (${range})`, [`${name}@\"${range}\"`]))
      continue
    }
    if (!peer.version || !satisfies(peer.version, range)) diagnostics.push(await fail('runtime.peerIncompatible', `${name} ${peer.version ?? '未知版本'} 不满足 Runtime 要求 ${range}`, [`${name}@\"${range}\"`]))
  }
  return diagnostics
}

function declaresRuntime(packageJson: PackageJson) {
  return [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
    packageJson.optionalDependencies
  ].some((dependencies) => Boolean(dependencies?.[RUNTIME_PACKAGE]))
}

/**
 * A missing package.json is not an error because DevTools may be used by non-Node project
 * templates. When a Node package is present, however, Runtime must be declared by that project.
 */
function packageDirectories(rootDir: string, allowedPaths: string[]) {
  const directories = new Set([rootDir])
  for (const allowedPath of allowedPaths) {
    let directory = resolve(rootDir, allowedPath)
    while (true) {
      const fromRoot = relative(rootDir, directory)
      if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) break
      directories.add(directory)
      if (directory === rootDir) break
      directory = dirname(directory)
    }
  }
  return directories
}

export async function checkProjectRuntime(
  rootDir: string,
  allowedPaths: string[] = []
): Promise<Diagnostic[]> {
  let foundPackageJson = false
  const diagnostics: Diagnostic[] = []
  let declared = false
  for (const directory of packageDirectories(rootDir, allowedPaths)) {
    try {
      const content = await readFile(resolve(directory, 'package.json'), 'utf8')
      foundPackageJson = true
      if (declaresRuntime(JSON.parse(content) as PackageJson)) {
        declared = true
        diagnostics.push(...await inspectDependencies(directory, rootDir))
      }
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') continue
      diagnostics.push(diagnostic('error', 'runtime.packageInvalid', `无法读取项目 package.json：${String(error)}`, directory))
    }
  }
  if (diagnostics.length || declared) return diagnostics
  if (!foundPackageJson) return []
  return [
    diagnostic(
      'error',
      'runtime.missing',
      `当前项目未声明 ${RUNTIME_PACKAGE}；请在 ${rootDir} 安装项目依赖后重试。`,
      rootDir,
      {
        command: await installCommand(rootDir, rootDir, [RUNTIME_PACKAGE]),
        requiresUserApproval: true,
        retryTool: 'best_prepare_task'
      }
    )
  ]
}
