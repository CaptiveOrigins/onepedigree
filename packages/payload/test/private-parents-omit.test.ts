import type { Access, CollectionConfig, Payload, TypedUser, Where } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { onePedigree } from '../src'
import { startPayload, usersCollection } from './helpers'

/** Like private-parents.test.ts, with the default `hiddenRecords: 'omit'` (its own file: one Payload instance per file). */
const uid = (u: unknown) => (u as { id?: string } | null)?.id
const read: Access = ({ req }) => ({ or: [{ visibility: { equals: 'public' } }, ...(req.user ? [{ owner: { equals: uid(req.user) } }] : [])] }) as Where
const write: Access = ({ req }) => (req.user ? ({ owner: { equals: uid(req.user) } } as Where) : false)
const animals = (slug: string): CollectionConfig => ({
  slug,
  access: { read, create: write, update: write, delete: write },
  fields: [
    { name: 'name', type: 'text' },
    { name: 'visibility', type: 'select', options: ['public', 'private'], defaultValue: 'public' },
    { name: 'owner', type: 'relationship', relationTo: 'users' },
  ],
})
type Doc = { id: string; parentage?: { mother?: unknown; parents?: { individual: unknown }[] } }

describe('with hiddenRecords: omit', () => {
  let p2: Payload
  let stop2: () => Promise<void>
  beforeAll(async () => {
    ;({ payload: p2, stop: stop2 } = await startPayload({
      collections: [usersCollection, animals('animals')],
      plugins: [onePedigree({ collection: 'animals', mode: 'standard-fields' })],
    }))
  })
  afterAll(async () => stop2?.())

  it('leaves the private parent out of reads, and keeps it on save', async () => {
    const keeper = (await p2.create({ collection: 'users', data: { email: 'k@example.com', password: 'a-long-test-password' } as never })) as TypedUser
    const owner = (await p2.create({ collection: 'users', data: { email: 'o@example.com', password: 'a-long-test-password' } as never })) as TypedUser
    const priv = String((await p2.create({ collection: 'animals' as never, data: { visibility: 'private', owner: owner.id } as never })).id)
    const child = String((await p2.create({ collection: 'animals' as never, data: { owner: keeper.id, parentage: { parents: [{ individual: priv, role: 'mother' }] } } as never })).id)
    const seen = (await p2.findByID({ collection: 'animals' as never, id: child, overrideAccess: false, user: keeper } as never)) as unknown as Doc
    expect(JSON.stringify(seen)).not.toContain(priv)
    expect(seen.parentage?.parents).toEqual([])
    expect(seen.parentage?.mother).toBeNull()
    await p2.update({ collection: 'animals' as never, id: child, data: { name: 'saved', parentage: seen.parentage } as never, user: keeper, overrideAccess: false })
    const after = (await p2.findByID({ collection: 'animals' as never, id: child, depth: 0 })) as unknown as Doc
    expect(after.parentage?.parents?.map((p) => p.individual)).toEqual([priv])
  })
})
