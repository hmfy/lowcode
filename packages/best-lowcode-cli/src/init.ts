import { access, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  createCapabilityManifestTemplate,
  createProjectConfigTemplate,
  DEFAULT_CONFIG_FILE,
  DEFAULT_MANIFEST_FILE
} from './templates'

export type InitResult = {
  files: Array<{ path: string; content: string; exists: boolean }>
  written: boolean
}

async function exists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function initializeProject(rootDir: string, write = false): Promise<InitResult> {
  const files = [
    {
      path: DEFAULT_CONFIG_FILE,
      content: `${JSON.stringify(createProjectConfigTemplate(), null, 2)}\n`,
      exists: await exists(resolve(rootDir, DEFAULT_CONFIG_FILE))
    },
    {
      path: DEFAULT_MANIFEST_FILE,
      content: `${JSON.stringify(createCapabilityManifestTemplate(), null, 2)}\n`,
      exists: await exists(resolve(rootDir, DEFAULT_MANIFEST_FILE))
    }
  ]
  if (write && files.some((file) => file.exists)) {
    throw new Error('初始化会覆盖已有配置或 Manifest；请先移动、删除或手动合并这些文件。')
  }
  if (write) {
    await Promise.all(
      files.map((file) => writeFile(resolve(rootDir, file.path), file.content, 'utf8'))
    )
  }
  return { files, written: write }
}
