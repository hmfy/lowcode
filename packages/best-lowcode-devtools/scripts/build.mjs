import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entries = [
  { entryPoint: 'src/bin.ts', outfile: 'dist/bin.js' },
  { entryPoint: 'src/mcp/bin.ts', outfile: 'dist/mcp-server.js' },
  { entryPoint: 'src/index.ts', outfile: 'dist/index.js' }
]

await Promise.all(
  entries.map(({ entryPoint, outfile }) =>
    build({
      bundle: true,
      entryPoints: [resolve(packageRoot, entryPoint)],
      external: [
        '@modelcontextprotocol/sdk',
        'semver',
        'typescript'
      ],
      format: 'esm',
      outfile: resolve(packageRoot, outfile),
      platform: 'node',
      sourcemap: true,
      target: 'node20'
    })
  )
)
