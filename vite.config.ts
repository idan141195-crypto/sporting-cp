import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/bodo-glimt/',
  server: {
    proxy: {
      // All /api/replicate/* requests are forwarded to api.replicate.com
      // This avoids CORS issues when calling Replicate from the browser.
      '/api/replicate': {
        target: 'https://api.replicate.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/replicate/, '/v1'),
      },
    },
  },
})
