import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { diagnostic } from './diagnostics'
import type { Diagnostic } from './types'

const RUNTIME_PACKAGE = 'best-lowcode-runtime'

type PackageJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
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
  for (const directory of packageDirectories(rootDir, allowedPaths)) {
    try {
      const content = await readFile(resolve(directory, 'package.json'), 'utf8')
      foundPackageJson = true
      if (declaresRuntime(JSON.parse(content) as PackageJson)) return []
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') continue
    }
  }
  if (!foundPackageJson) return []
  return [
    diagnostic(
      'error',
      'runtime.missing',
      `当前项目未声明 ${RUNTIME_PACKAGE}；请由项目维护者安装后重试，例如 pnpm add ${RUNTIME_PACKAGE}。`,
      undefined,
      {
        command: `pnpm add ${RUNTIME_PACKAGE}`,
        requiresUserApproval: true,
        retryTool: 'best_prepare_task'
      }
    )
  ]
}
