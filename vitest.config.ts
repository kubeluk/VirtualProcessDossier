import { defineConfig, mergeConfig } from 'vitest/config'
import vite from './vite.config'
export default mergeConfig(
  vite,
  defineConfig({
    test: {
      include: ['tests/unit/**/*.spec.ts', 'tests/components/**/*.spec.ts'],
      environment: 'node',
      maxWorkers: 2,
      testTimeout: 15000,
    },
  }),
)
