import { defineConfig, mergeConfig } from 'vitest/config'
import vite from './vite.config'
export default defineConfig((env) =>
  mergeConfig(
    vite(env),
    defineConfig({
      test: {
        include: ['tests/unit/**/*.spec.ts', 'tests/components/**/*.spec.ts'],
        environment: 'node',
        maxWorkers: 2,
        testTimeout: 15000,
      },
    }),
  ),
)
