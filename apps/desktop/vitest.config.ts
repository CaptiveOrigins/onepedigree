import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Test against core's source, so tests don't need its build first (the release workflow tests before it builds).
export default defineConfig({
  resolve: { alias: { '@captiveorigins/onepedigree-core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)) } },
  test: { environment: 'node' },
})
