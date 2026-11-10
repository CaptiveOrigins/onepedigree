import { defineConfig } from 'vitest/config'

// The numbering endpoints' tests start a real Payload on an in-memory MongoDB, which needs time on first run.
export default defineConfig({ test: { environment: 'node', testTimeout: 60_000, hookTimeout: 180_000, fileParallelism: false } })
