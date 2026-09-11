import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: { alias: { '@shared': path.resolve(root, 'shared') } },
  test: {
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'client/src/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    environment: 'node',
    env: { NODE_ENV: 'test' },
  },
})
