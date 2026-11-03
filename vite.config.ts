import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

const serverEnv = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '')
const target =
  process.env.FUSEKI_PROXY_TARGET ?? serverEnv.FUSEKI_PROXY_TARGET ?? 'http://localhost:3030'
const dataset = process.env.FUSEKI_DATASET ?? serverEnv.FUSEKI_DATASET ?? 'vpd'
const authorization =
  'Basic ' +
  Buffer.from(
    'admin:' + (process.env.ADMIN_PASSWORD ?? serverEnv.ADMIN_PASSWORD ?? 'admin'),
  ).toString('base64')

export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    exclude: ['shacl-engine'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/sparql': {
        target,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sparql/, '/' + dataset + '/sparql'),
      },
      '/update': {
        target,
        headers: { Authorization: authorization },
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/update/, '/' + dataset + '/update'),
      },
    },
  },
})
