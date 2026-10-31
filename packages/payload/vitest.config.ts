import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))
export default defineConfig({
  resolve: {
    alias: {
      '@captiveorigins/onepedigree-core': src('../core/src/index.ts'),
      '@captiveorigins/onepedigree-react/headless': src('../react/src/headless.ts'),
      '@captiveorigins/onepedigree-react': src('../react/src/index.ts'),
    },
  },
  test: { environment: 'node', testTimeout: 60_000, hookTimeout: 180_000, fileParallelism: false },
})
