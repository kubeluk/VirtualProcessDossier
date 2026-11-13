import { defineConfig, mergeConfig } from 'vitest/config'
import vite from './vite.config'
export default defineConfig((env) =>
  mergeConfig(
    vite(env),
    defineConfig({
      test: {
        include: ['tests/integration/**/*.spec.ts'],
        environment: 'node',
        maxWorkers: 1,
        testTimeout: 30000,
        hookTimeout: 60000,
      },
    }),
  ),
)
