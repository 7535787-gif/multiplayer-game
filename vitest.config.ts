import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'shared/**/*.test.ts',
      'client/src/**/*.test.ts',
      'server/src/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['shared/**/*.ts'],
      exclude: ['shared/**/*.test.ts'],
      reporter: ['text', 'html'],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
    testTimeout: 10000,
  },
})
