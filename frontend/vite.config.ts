import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The Safe (multisig) connector shipped inside @wagmi/connectors dynamically
 * imports two optional peer packages that this app never uses — the app only
 * configures the injected and Base Account connectors. Aliasing them to a
 * local stub keeps builds deterministic when those optional packages are
 * missing (or left half-installed by an unrelated parent node_modules).
 */
const optionalStub = fileURLToPath(new URL('./src/lib/optionalDepsStub.ts', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@safe-global/safe-apps-sdk': optionalStub,
      '@safe-global/safe-apps-provider': optionalStub,
    },
  },
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
  },
})
