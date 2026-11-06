import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // In development the API runs separately: cd ../server && npm run dev
  server: { proxy: { '/api': 'http://localhost:8787' } },
})
