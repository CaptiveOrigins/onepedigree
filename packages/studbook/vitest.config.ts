import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Core from source, so tests run before anything is built (the Release workflow tests before it builds).
// The numbering endpoints' tests start a real Payload on an in-memory MongoDB, which needs time on first run.
export default defineConfig({
  resolve: { alias: { '@captiveorigins/onepedigree-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) } },
  test: { environment: 'node', testTimeout: 60_000, hookTimeout: 180_000, fileParallelism: false },
})
