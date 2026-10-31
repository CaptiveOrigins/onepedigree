import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { buildConfig, createLocalReq, getPayload, type CollectionConfig, type Config, type Payload, type TypedUser } from 'payload'

/** A real Payload instance on an in-memory MongoDB replica set (transactions on). */
export async function startPayload(config: Omit<Config, 'db' | 'secret'>) {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  const payload = await getPayload({
    config: await buildConfig({
      ...config,
      secret: 'test-secret-not-for-production',
      telemetry: false,
      typescript: { autoGenerate: false },
      db: mongooseAdapter({ url: mongo.getUri('onepedigree'), ensureIndexes: true }),
    }),
  })
  return {
    payload,
    stop: async () => {
      await payload.destroy()
      await mongo.stop()
    },
  }
}

export const usersCollection: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [{ name: 'role', type: 'select', options: ['admin', 'editor', 'viewer', 'public-editor'], defaultValue: 'viewer' }],
}

/** Calls a collection endpoint the way the REST API would, as `user` (null = anonymous). */
export async function callEndpoint(
  payload: Payload,
  collection: string,
  path: string,
  routeParams: Record<string, string>,
  options: { user?: TypedUser | null; query?: Record<string, string | number | boolean>; body?: unknown } = {},
) {
  const endpoint = (payload.collections[collection as never]!.config.endpoints || []).find((e) => e.path === path)
  if (!endpoint) throw new Error(`No endpoint ${collection}${path}`)
  const req = await createLocalReq({ user: (options.user ?? undefined) as never }, payload)
  if (options.user === null) req.user = null
  const qs = new URLSearchParams(Object.entries(options.query ?? {}).map(([k, v]) => [k, String(v)]))
  ;(req as { url: string }).url = `http://localhost/api/${collection}${path}?${qs}`
  req.routeParams = routeParams
  if (options.body !== undefined) {
    req.data = options.body as never
    ;(req as { json?: () => Promise<unknown> }).json = async () => options.body
  }
  const res = (await endpoint.handler(req)) as Response
  return { status: res.status, body: await res.json(), text: '' }
}
