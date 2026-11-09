import { createRequire } from 'node:module'

import { configToSchema } from '@payloadcms/graphql'
import { createLocalReq, handleEndpoints, type Access, type CollectionConfig, type Payload, type TypedUser, type Where } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { onePedigree } from '../src'
import { startPayload, usersCollection } from './helpers'

// The CommonJS build, as @payloadcms/graphql loads it (Vite would hand this file the ESM one: another "realm").
const { graphql } = createRequire(import.meta.url)('graphql') as typeof import('graphql')

/**
 * Plain collection reads never reveal a parent the reader may not read (spec §42.4; found on a hosted site
 * 2026-11-09): REST, GraphQL, Local API with access control, single and list, at every depth. Standard parentage
 * fields with Mother/Father pickers and placeholders, as the platform installs them. And the write side: an editor
 * who sees a placeholder can save the record without erasing or replacing the private parent.
 */
const role = (u: unknown) => (u as { role?: string } | null)?.role
const uid = (u: unknown) => (u as { id?: string } | null)?.id
const read: Access = ({ req }) =>
  role(req.user) === 'admin' ? true : ({ or: [{ visibility: { equals: 'public' } }, ...(req.user ? [{ owner: { equals: uid(req.user) } }] : [])] } as Where)
const write: Access = ({ req }) => (role(req.user) === 'admin' ? true : req.user ? ({ owner: { equals: uid(req.user) } } as Where) : false)

const animals = (slug: string): CollectionConfig => ({
  slug,
  access: { read, create: write, update: write, delete: write },
  fields: [
    { name: 'name', type: 'text' },
    { name: 'visibility', type: 'select', options: ['public', 'private'], defaultValue: 'public' },
    { name: 'owner', type: 'relationship', relationTo: 'users' },
  ],
})

type Doc = { id: string; parentage?: { mother?: unknown; father?: unknown; parents?: { id?: string; individual: unknown; role?: string | null }[] } }

let payload: Payload
let stop: () => Promise<void>
const users: Record<string, TypedUser> = {}
const a: Record<string, string> = {}
const tokens: Record<string, string> = {}

const create = async (key: string, data: Record<string, unknown>) => {
  a[key] = String((await payload.create({ collection: 'animals' as never, data: { name: key, ...data } as never })).id)
}
const trusted = async (key: string) => (await payload.findByID({ collection: 'animals' as never, id: a[key]!, depth: 0 })) as unknown as Doc
const asUser = (who: string | null, key: string, depth = 0) =>
  payload.findByID({ collection: 'animals' as never, id: a[key]!, depth, overrideAccess: false, user: who ? users[who] : null } as never) as unknown as Promise<Doc>

/** A real REST request through Payload's own handler, signed in with a JWT when `who` is given. */
const rest = async (path: string, who: string | null = null, init: RequestInit = {}) => {
  const headers = new Headers(init.headers)
  if (who) headers.set('Authorization', `JWT ${tokens[who]}`)
  if (init.body) headers.set('Content-Type', 'application/json')
  const res = await handleEndpoints({ config: payload.config, request: new Request(`http://localhost/api${path}`, { ...init, headers }) })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

beforeAll(async () => {
  ;({ payload, stop } = await startPayload({
    collections: [usersCollection, animals('animals')],
    plugins: [onePedigree({ collection: 'animals', mode: 'standard-fields', hiddenRecords: 'placeholder' })],
  }))
  for (const [name, r] of [['admin', 'admin'], ['owner', 'viewer'], ['keeper', 'viewer'], ['member', 'viewer']] as const) {
    users[name] = (await payload.create({ collection: 'users', data: { email: `${name}@example.com`, password: 'a-long-test-password', role: r } as never })) as TypedUser
    const login = await handleEndpoints({
      config: payload.config,
      request: new Request('http://localhost/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `${name}@example.com`, password: 'a-long-test-password' }),
      }),
    })
    tokens[name] = ((await login.json()) as { token: string }).token
  }
  // P is private to its owner. Q is public, kept by someone else, and P is its mother.
  await create('P', { visibility: 'private', owner: users.owner!.id })
  await create('S', { owner: users.keeper!.id })
  await create('S2', { owner: users.keeper!.id })
  await create('Q', { owner: users.keeper!.id, parentage: { parents: [{ individual: a.P, role: 'mother' }, { individual: a.S, role: 'father' }] } })
  await create('G', { owner: users.keeper!.id, parentage: { parents: [{ individual: a.Q, role: 'mother' }] } })
})
afterAll(async () => stop?.())

const expectRedacted = (doc: Doc) => {
  expect(JSON.stringify(doc)).not.toContain(a.P!)
  expect(doc.parentage?.mother).toEqual({ private: true })
  expect(doc.parentage?.parents?.[0]).toMatchObject({ individual: { private: true }, role: 'mother' })
}

describe('plain reads of a public animal with a private parent', () => {
  it('REST, single, depth 0 and 1: anonymous readers get a placeholder, never the ID', async () => {
    expect((await rest(`/animals/${a.P}`)).status).toBe(404)
    for (const depth of [0, 1]) {
      const { status, body } = await rest(`/animals/${a.Q}?depth=${depth}`)
      expect(status).toBe(200)
      expectRedacted(body as unknown as Doc)
      // The public father still shows: as an ID at depth 0, populated at depth 1.
      const father = (body as unknown as Doc).parentage!.parents![1]!.individual
      expect(depth ? (father as { id: string }).id : father).toBe(a.S)
    }
  })

  it('REST, list: the same in every listed record, at depth 2 through a populated parent', async () => {
    const { body } = await rest(`/animals?depth=2&limit=100`)
    const docs = body.docs as Doc[]
    expect(docs.map((d) => d.id)).not.toContain(a.P)
    expect(JSON.stringify(body)).not.toContain(a.P!)
    expectRedacted(docs.find((d) => d.id === a.Q)!)
    const g = docs.find((d) => d.id === a.G)!
    expectRedacted(g.parentage!.parents![0]!.individual as Doc)
  })

  it('an unrelated signed-in member gets the placeholder too', async () => {
    expectRedacted((await rest(`/animals/${a.Q}?depth=1`, 'member')).body as unknown as Doc)
    expectRedacted(await asUser('member', 'Q', 1))
  })

  it('the private parent’s owner and admins see it', async () => {
    for (const who of ['owner', 'admin']) {
      const doc = (await rest(`/animals/${a.Q}?depth=0`, who)).body as unknown as Doc
      expect(doc.parentage?.mother).toBe(a.P)
      expect(doc.parentage?.parents?.[0]?.individual).toBe(a.P)
    }
  })

  it('Local API with access control: anonymous, single and list', async () => {
    expectRedacted(await asUser(null, 'Q'))
    const { docs } = await payload.find({ collection: 'animals' as never, depth: 1, overrideAccess: false, user: null } as never)
    expect(JSON.stringify(docs)).not.toContain(a.P!)
  })

  it('GraphQL: the private parent is null, and its ID is nowhere in the response', async () => {
    const { schema } = configToSchema(payload.config)
    const ask = async (who: string | null) => {
      const req = await createLocalReq({ user: (who ? users[who] : undefined) as never }, payload)
      if (!who) req.user = null
      ;(req as { payloadAPI: string }).payloadAPI = 'GraphQL'
      return graphql({
        schema,
        source: `{ Animal(id: "${a.Q}") { id parentage { mother { id name } father { id name } parents { role individual { id name } } } }
                  Animals(limit: 100) { docs { id parentage { mother { id } parents { individual { id } } } } } }`,
        contextValue: { req, headers: new Headers() },
      })
    }
    const anon = await ask(null)
    expect(JSON.stringify(anon)).not.toContain(a.P!)
    const q = (anon.data as { Animal: { parentage: { mother: unknown; father: { id: string }; parents: { role: string; individual: unknown }[] } } }).Animal
    expect(q.parentage.mother).toBeNull()
    expect(q.parentage.father.id).toBe(a.S)
    expect(q.parentage.parents[0]).toEqual({ role: 'mother', individual: null })
    // The owner reads it as usual.
    expect(JSON.stringify(await ask('owner'))).toContain(a.P!)
  })

  it('trusted server reads (access control overridden) are unchanged', async () => {
    expect((await trusted('Q')).parentage?.parents?.find((p) => p.role === 'mother')?.individual).toBe(a.P)
  })
})

describe('saving a record that shows a placeholder', () => {
  it('keeps the private parent when the keeper saves what they read, as the Admin form does', async () => {
    const seen = (await rest(`/animals/${a.Q}`, 'keeper')).body as unknown as Doc
    expectRedacted(seen)
    const { status } = await rest(`/animals/${a.Q}`, 'keeper', { method: 'PATCH', body: JSON.stringify({ name: 'Q renamed', parentage: seen.parentage }) })
    expect(status).toBe(200)
    const after = await trusted('Q')
    expect(after.parentage?.parents?.map((p) => [p.individual, p.role])).toEqual([[a.P, 'mother'], [a.S, 'father']])
  })

  it('treats an empty Mother picker or a missing row as unchanged, so it never erases the private parent', async () => {
    await payload.update({ collection: 'animals' as never, id: a.Q!, data: { parentage: { mother: null } } as never, user: users.keeper, overrideAccess: false })
    await payload.update({ collection: 'animals' as never, id: a.Q!, data: { parentage: { parents: [{ individual: a.S, role: 'father' }] } } as never, user: users.keeper, overrideAccess: false })
    expect((await trusted('Q')).parentage?.parents?.map((p) => p.individual).sort()).toEqual([a.P, a.S].sort())
  })

  it('lets the keeper change the parents they can see, keeping the private one', async () => {
    const seen = await asUser('keeper', 'Q')
    await payload.update({ collection: 'animals' as never, id: a.Q!, data: { parentage: { ...seen.parentage, father: a.S2 } } as never, user: users.keeper, overrideAccess: false })
    const after = await trusted('Q')
    // The picker puts its new row first.
    expect(after.parentage?.parents?.map((p) => [p.individual, p.role])).toEqual([[a.S2, 'father'], [a.P, 'mother']])
  })

  it('refuses replacing the private parent with another', async () => {
    const attempt = payload.update({ collection: 'animals' as never, id: a.Q!, data: { parentage: { mother: a.S } } as never, user: users.keeper, overrideAccess: false })
    await expect(attempt).rejects.toMatchObject({ data: { errors: [{ path: 'parentage.mother', message: expect.stringMatching(/private to you/) }] } })
    expect((await trusted('Q')).parentage?.parents?.find((p) => p.role === 'mother')?.individual).toBe(a.P)
  })

  it('REST writes check readability: a parent the editor can’t read is refused, on update and create', async () => {
    // REST, GraphQL and the Admin leave overrideAccess unset; until alpha.16 that counted as trusted.
    const update = await rest(`/animals/${a.G}`, 'keeper', { method: 'PATCH', body: JSON.stringify({ parentage: { parents: [{ individual: a.P, role: 'father' }] } }) })
    expect(update.status).toBe(400)
    expect(JSON.stringify(update.body)).toMatch(/does not exist or you cannot access it/)
    expect((await trusted('G')).parentage?.parents?.map((p) => p.individual)).toEqual([a.Q])
    const created = await rest(`/animals`, 'keeper', { method: 'POST', body: JSON.stringify({ name: 'new', owner: users.keeper!.id, parentage: { parents: [{ individual: a.P, role: 'mother' }] } }) })
    expect(created.status).toBe(400)
    // The owner may.
    expect((await rest(`/animals`, 'owner', { method: 'POST', body: JSON.stringify({ name: 'mine', owner: users.owner!.id, parentage: { parents: [{ individual: a.P, role: 'mother' }] } }) })).status).toBe(201)
  })

  it('leaves trusted writes alone: server code can still remove the parent', async () => {
    await payload.update({ collection: 'animals' as never, id: a.G!, data: { parentage: { parents: [] } } as never })
    expect((await trusted('G')).parentage?.parents).toEqual([])
  })
})
