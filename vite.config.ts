import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('shacl-') || tag.startsWith('rokit-'),
        },
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['shacl-engine', 'n3'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/sparql': {
        target: 'http://localhost:3030',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sparql/, '/vpd/sparql'),
      },
      '/update': {
        target: 'http://localhost:3030',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/update/, '/vpd/update'),
      },
    },
  },
})
