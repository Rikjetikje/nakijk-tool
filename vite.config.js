import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: parseInt(process.env.PORT) || 5173,
    strictPort: true,
    proxy: {
      // Forwards /api/ocr to the Netlify dev server (netlify dev runs on 8888)
      '/api/ocr': {
        target: 'http://localhost:8888',
        changeOrigin: true,
        rewrite: () => '/.netlify/functions/ocr',
      },
    },
  },
})
