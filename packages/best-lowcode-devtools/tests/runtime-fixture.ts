import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function installFixturePackage(root: string, name = 'best-lowcode-runtime', version = '0.2.4', extra = {}) {
  const directory = join(root, 'node_modules', name)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version, main: 'index.js', ...extra }))
  await writeFile(join(directory, 'index.js'), '')
}
