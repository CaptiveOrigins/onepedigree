import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))
export default defineConfig({
  resolve: {
    alias: {
      '@extantape/onepedigree-core': src('../core/src/index.ts'),
      '@extantape/onepedigree-react/headless': src('../react/src/headless.ts'),
      '@extantape/onepedigree-react': src('../react/src/index.ts'),
    },
  },
  test: { environment: 'node', testTimeout: 60_000, hookTimeout: 180_000, fileParallelism: false },
})
