import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { buildConfig, createLocalReq, getPayload, type CollectionConfig, type Payload, type PayloadRequest, type TypedUser } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Studbook } from '../src/index.js'
import { studbookNumberEndpoints } from '../src/payload.js'

// A real Payload on an in-memory MongoDB, with made-up animals. Only coordinators may write numbers.
type Role = 'coordinator' | 'member'
const source = async ({ req }: { studbook: string; req: PayloadRequest }): Promise<Studbook | null> => {
  const { docs } = await req.payload.find({ collection: 'animals' as never, overrideAccess: false, user: req.user, pagination: false, req })
  return {
    title: 'Made-up',
    currentness: '2026-11-01',
    events: [],
    animals: (docs as { id: string; private?: boolean }[]).map((d) => ({ id: String(d.id), studbookNumber: '', coId: '', sex: 'unknown', birthType: 'unknown', birth: { date: null, precision: 'unknown' }, parentage: null, status: 'alive', private: Boolean(d.private) })),
  }
}
const numbers = { collection: 'studbook-numbers', studbookField: 'studbook', animalField: 'animal', numberField: 'number', oldNumbersField: 'oldNumbers' }
const coordinatorOnly = ({ req }: { req: PayloadRequest }) => (req.user as unknown as { role?: Role })?.role === 'coordinator'
const collections: CollectionConfig[] = [
  { slug: 'users', auth: true, fields: [{ name: 'role', type: 'select', options: ['coordinator', 'member'], defaultValue: 'member' }] },
  { slug: 'animals', access: { read: ({ req }) => Boolean(req.user) }, fields: [{ name: 'name', type: 'text' }, { name: 'private', type: 'checkbox' }], endpoints: studbookNumberEndpoints({ source, numbers }) },
  { slug: 'plain-animals', fields: [{ name: 'name', type: 'text' }], endpoints: studbookNumberEndpoints({ source, numbers: { ...numbers, oldNumbersField: undefined } }) },
  {
    slug: 'studbook-numbers',
    access: { read: () => true, create: coordinatorOnly, update: coordinatorOnly, delete: () => false },
    fields: [{ name: 'studbook', type: 'text', required: true }, { name: 'animal', type: 'text', required: true }, { name: 'number', type: 'text', required: true }, { name: 'oldNumbers', type: 'text', hasMany: true }],
  },
]

let payload: Payload
let mongo: MongoMemoryReplSet
const users = {} as Record<Role, TypedUser>
const animals: Record<string, string> = {}
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  payload = await getPayload({ config: await buildConfig({ collections, secret: 'test-secret-not-for-production', telemetry: false, typescript: { autoGenerate: false }, db: mongooseAdapter({ url: mongo.getUri('studbook'), ensureIndexes: true }) }) })
  for (const role of ['coordinator', 'member'] as const) users[role] = (await payload.create({ collection: 'users', data: { email: `${role}@example.com`, password: 'a-long-test-password', role } as never })) as TypedUser
  for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'secret']) animals[name] = String((await payload.create({ collection: 'animals' as never, data: { name, private: name === 'secret' } as never })).id)
})
afterAll(async () => {
  await payload?.destroy()
  await mongo?.stop()
})

const post = async (path: string, user: TypedUser | null, body: Record<string, unknown>, collection = 'animals') => {
  const endpoint = (payload.collections[collection as never]!.config.endpoints || []).find((e) => e.path === path && e.method === 'post')
  if (!endpoint) return null
  const req = await createLocalReq({ user: (user ?? undefined) as never }, payload)
  if (user === null) req.user = null
  req.routeParams = { studbook: 'sb1' }
  req.data = body as never
  const res = (await endpoint.handler(req)) as Response
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}
const assign = (animal: string, extra: Record<string, unknown> = {}, user: TypedUser | null = users.coordinator) => post('/studbook/:studbook/numbers', user, { animal: animals[animal] ?? animal, ...extra })
const renumberIt = (animal: string, extra: Record<string, unknown> = {}, user: TypedUser | null = users.coordinator) => post('/studbook/:studbook/numbers/renumber', user, { animal: animals[animal], ...extra })

describe('studbook numbering endpoints (real Payload)', () => {
  it('gives the next permanent number, a T number, or a given unused number such as the international one', async () => {
    expect((await assign('a'))!.body).toMatchObject({ studbookNumber: '1' })
    expect((await assign('b', { temporary: true }))!.body).toMatchObject({ studbookNumber: 'T1' })
    expect((await assign('c', { number: '512' }))!.status).toBe(201)
    expect((await assign('d'))!.body).toMatchObject({ studbookNumber: '513' })
  })

  it('never gives a number held by an animal this reader cannot see', async () => {
    await payload.create({ collection: 'studbook-numbers' as never, data: { studbook: 'sb1', animal: animals.secret, number: '514' } as never })
    const r = await assign('e')
    expect(r!.body).toMatchObject({ studbookNumber: '515' })
    expect(JSON.stringify(r!.body)).not.toContain(animals.secret!)
  })

  it('refuses: a reader without write access (403), anonymous, private or unknown animals (404), and bad or taken numbers', async () => {
    expect((await assign('f', {}, users.member))!.status).toBe(403)
    expect((await assign('f', {}, null))!.status).toBe(404)
    expect((await assign('secret'))!.status).toBe(404)
    expect((await assign('not-an-animal'))!.status).toBe(404)
    expect((await assign('f', { number: '01' }))!.status).toBe(400)
    expect((await assign('f', { number: '1' }))!.status).toBe(409)
    expect((await assign('a'))!.status).toBe(409)
    expect((await post('/studbook/:studbook/numbers', users.coordinator, {}))!.status).toBe(400)
  })

  it('renumbers: confirms a T number to the next permanent one, keeps the old one, and never gives an old number again', async () => {
    const r = await renumberIt('b')
    expect(r!.status).toBe(200)
    expect(r!.body).toMatchObject({ studbookNumber: '516', oldNumbers: ['T1'] })
    expect((await assign('f', { number: 'T1' }))!.status).toBe(409)
    expect((await assign('f', { temporary: true }))!.body).toMatchObject({ studbookNumber: 'T2' })
    const moved = await renumberIt('a', { to: '600' })
    expect(moved!.body).toMatchObject({ studbookNumber: '600', oldNumbers: ['1'] })
    expect((moved!.body.notices as string[])[0]).toMatch(/permanent number/)
    expect((await renumberIt('c', { to: '1' }))!.status).toBe(409)
    expect((await renumberIt('g'))!.status).toBe(409)
    expect((await renumberIt('c', {}, users.member))!.status).toBe(403)
  })

  it('gives two animals numbered at the same moment different numbers', async () => {
    const [x, y] = await Promise.all([assign('g'), assign('h')])
    expect([x!.status, y!.status]).toEqual([201, 201])
    expect(x!.body.studbookNumber).not.toBe(y!.body.studbookNumber)
    const { docs } = await payload.find({ collection: 'studbook-numbers' as never, pagination: false })
    const current = (docs as unknown as { number: string }[]).map((d) => d.number)
    expect(new Set(current).size).toBe(current.length)
  })

  it('offers no renumbering when old numbers have nowhere to be kept', () => {
    const paths = (payload.collections['plain-animals' as never]!.config.endpoints || []).map((e) => e.path).filter((p) => p.startsWith('/studbook'))
    expect(paths).toEqual(['/studbook/:studbook/numbers'])
  })
})
