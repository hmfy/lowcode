import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const externalPeers = [
  '@ant-design/pro-components',
  'antd',
  'dayjs',
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/jsx-dev-runtime'
]

await Promise.all([
  build({
    bundle: true,
    entryPoints: [resolve(packageRoot, 'src/index.ts')],
    external: externalPeers,
    format: 'esm',
    loader: { '.less': 'css' },
    outfile: resolve(packageRoot, 'dist/index.js'),
    platform: 'browser',
    sourcemap: true,
    target: 'es2022'
  }),
  build({
    bundle: true,
    entryPoints: [resolve(packageRoot, 'src/dev.ts')],
    format: 'esm',
    outfile: resolve(packageRoot, 'dist/dev.js'),
    platform: 'node',
    sourcemap: true,
    target: 'node20'
  })
])
