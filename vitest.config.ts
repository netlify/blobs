import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    target: 'esnext',
  },
  test: {
    include: ['src/**/*.test.mts'],
    testTimeout: 30_000,
  },
})
