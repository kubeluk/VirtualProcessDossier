import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { backendConfig, backendProxy } from './scripts/proxy-config'

export default defineConfig(({ mode, command }) => {
  const common = {
    plugins: [vue()],
    optimizeDeps: {
      // The validator imports CommonJS dependencies such as lodash/once.js.
      // Prebundle its lazy-loaded entry so those imports work in the browser.
      include: ['shacl-engine/Validator.js'],
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
  // Building the SPA never needs a backend or its credentials.
  if (command === 'build') return common

  const backend = backendConfig(mode, loadEnv(mode, process.cwd(), ''))
  const label = mode === 'remote' ? 'remote' : 'local'
  return {
    ...common,
    plugins: [
      ...common.plugins,
      {
        name: 'vpd-backend',
        configureServer(server) {
          server.config.logger.info(`VPD ${label} backend: ${backend.target}/${backend.dataset}`)
        },
      },
    ],
    server: {
      host: '127.0.0.1',
      port: mode === 'remote' ? 5174 : 5173,
      strictPort: true,
      proxy: backendProxy(backend),
    },
  }
})
