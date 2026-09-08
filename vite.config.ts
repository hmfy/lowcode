import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_BASE_URL?.trim()
  const proxyTarget = env.VITE_API_PROXY_TARGET?.trim() || target || 'https://fund-chargewipe-api.bestfulfill.top'
  const authorization = env.API_AUTHORIZATION?.trim() || env.VITE_ADMIN_TOKEN?.trim()

  return {
    plugins: [react()],
    server: {
      port: 6789,
          proxy: {
            '/api': {
              target: proxyTarget,
              changeOrigin: true,
              secure: false,
              configure: (proxy) => {
                if (authorization) proxy.on('proxyReq', (request) => request.setHeader('authorization', authorization))
                if (target && proxyTarget !== target) proxy.on('proxyReq', (request) => request.setHeader('host', new URL(target).host))
              },
            },
          },
        }
  }
})
