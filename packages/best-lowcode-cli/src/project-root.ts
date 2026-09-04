import { access } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { DEFAULT_CONFIG_FILE } from './templates'

async function exists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * pnpm runs filtered package scripts from the package directory. Walk upward so the CLI still
 * reads the calling workspace's low-code config instead of looking inside its own package.
 */
export async function findDefaultProjectRoot(startDir = process.cwd()): Promise<string> {
  let directory = resolve(startDir)
  let workspaceRoot: string | undefined
  while (true) {
    if (await exists(join(directory, DEFAULT_CONFIG_FILE))) return directory
    if (await exists(join(directory, 'pnpm-workspace.yaml'))) workspaceRoot = directory
    const parent = dirname(directory)
    if (parent === directory) return workspaceRoot ?? resolve(startDir)
    directory = parent
  }
}
