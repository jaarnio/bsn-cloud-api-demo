import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The SPA talks only to /api (the Express proxy on :3001). It never calls
// auth.bsn.cloud / provision.bsn.cloud directly, so the client secret stays
// server-side. In dev, Vite forwards /api/* to the Express server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
