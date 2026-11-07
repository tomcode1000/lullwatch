import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // The Intel quote verifier (@phala/dcap-qvl) expects Node's crypto and Buffer.
    nodePolyfills({ include: ['crypto', 'stream', 'buffer', 'util'], globals: { Buffer: true, global: true, process: true } }),
  ],
  // In development the API runs separately: cd ../server && npm run dev
  server: { proxy: { '/api': 'http://localhost:8787' } },
})
