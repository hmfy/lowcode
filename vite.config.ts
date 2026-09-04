import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_BASE_URL?.trim()
  const proxyTarget = env.VITE_API_PROXY_TARGET?.trim() || target || 'https://fund-chargewipe-api.bestfulfill.top'
  const authorization = env.API_AUTHORIZATION?.trim() || 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJVVUlEIjoiMGEyOWIyYzUtMjEyZS00ZTA2LWEwNzctYWZiNjg4YTU4YWViIiwiSUQiOjEsIlVzZXJuYW1lIjoiYWRtaW4iLCJOaWNrTmFtZSI6Iuasp-S8n-adgyIsIkF1dGhvcml0eUlkIjoxLCJCdWZmZXJUaW1lIjo4NjQwMCwiaXNzIjoicW1QbHVzIiwiYXVkIjpbIkdWQSJdLCJleHAiOjE3ODgzMzQ2MzgsIm5iZiI6MTc4NzcyOTgzOH0.DvjPPxs2aoWPEdcri4XHenn2RSQdT4v1zu4rgZWisK4'

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
                proxy.on('proxyReq', (request) => request.setHeader('authorization', authorization))
                if (target && proxyTarget !== target) proxy.on('proxyReq', (request) => request.setHeader('host', new URL(target).host))
              },
            },
          },
        }
  }
})
