import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

await Promise.all(
  [
    { entryPoint: 'src/bin.ts', outfile: 'dist/bin.js' },
    { entryPoint: 'src/index.ts', outfile: 'dist/index.js' }
  ].map(({ entryPoint, outfile }) =>
    build({
      bundle: true,
      entryPoints: [resolve(packageRoot, entryPoint)],
      format: 'esm',
      outfile: resolve(packageRoot, outfile),
      packages: 'external',
      platform: 'node',
      sourcemap: true,
      target: 'node20'
    })
  )
)
