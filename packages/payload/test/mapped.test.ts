import { indexPedigree, validatePedigree } from '@captiveorigins/onepedigree-core'
import type { Access, CollectionConfig, Payload, TypedUser } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { onePedigree } from '../src'
import { callEndpoint, startPayload, usersCollection } from './helpers'

/**
 * Test B (spec §36): an existing `animals` collection with its own dam/sire
 * fields is mapped, not duplicated. Plus the security scenarios of spec §42.4.
 */
const role = (u: unknown) => (u as { role?: string } | null)?.role
const readAccess: Access = ({ req }) => (role(req.user) === 'admin' || role(req.user) === 'editor' || role(req.user) === 'viewer' ? true : { visibility: { equals: 'public' } })
const writeAccess: Access = ({ req }) => (role(req.user) === 'admin' || role(req.user) === 'editor' ? true : role(req.user) === 'public-editor' ? { visibility: { equals: 'public' } } : false)

const animals: CollectionConfig = {
  slug: 'animals',
  admin: { useAsTitle: 'name' },
  access: { read: readAccess, create: writeAccess, update: writeAccess, delete: writeAccess },
  fields: [
    { name: 'name', type: 'text' },
    { name: 'sex', type: 'select', options: ['female', 'male', 'unknown'] },
    { name: 'visibility', type: 'select', options: ['public', 'private'], defaultValue: 'public', index: true },
    { name: 'dam', type: 'relationship', relationTo: 'animals', index: true },
    { name: 'sire', type: 'relationship', relationTo: 'animals', index: true },
    { name: 'clutch', type: 'relationship', relationTo: 'clutches', index: true },
  ],
}
const clutches: CollectionConfig = {
  slug: 'clutches',
  access: { read: () => true },
  fields: [
    { name: 'name', type: 'text' },
    { name: 'mother', type: 'relationship', relationTo: 'animals' },
  ],
}

let payload: Payload
let stop: () => Promise<void>
const users: Record<string, TypedUser> = {}
const a: Record<string, string> = {}

const create = async (key: string, data: Record<string, unknown>) => {
  const d = await payload.create({ collection: 'animals' as never, data: { name: key, ...data } as never })
  a[key] = String(d.id)
}

beforeAll(async () => {
  ;({ payload, stop } = await startPayload({
    collections: [usersCollection, animals, clutches],
    plugins: [
      onePedigree({
        collection: 'animals',
        mode: 'mapped',
        fields: { label: 'name', sex: 'sex', parentage: { kind: 'role-fields', roles: { mother: 'dam', father: 'sire' }, cohort: 'clutch' } },
        cohorts: { collection: 'clutches', birthParentField: 'mother' },
        terminology: { parents: 'dam-sire', userPreference: 'parentTerms' },
        hiddenRecords: 'placeholder',
        navigation: { individualUrl: '/animals/{id}' },
        limits: { maxDepth: 3, maxNodes: 200 },
      }),
    ],
  }))
  for (const r of ['admin', 'editor', 'viewer', 'public-editor'])
    users[r] = (await payload.create({ collection: 'users', data: { email: `${r}@example.com`, password: 'a-long-test-password', role: r } as never })) as TypedUser
  const clutch = String((await payload.create({ collection: 'clutches' as never, data: { name: 'Clutch 2026-001' } as never })).id)
  await create('Founder Dam', { sex: 'female' })
  await create('Secret Sire', { sex: 'male', visibility: 'private' })
  await create('Public Sire', { sex: 'male' })
  await create('Tinta', { sex: 'female', dam: a['Founder Dam'], sire: a['Secret Sire'] })
  await create('Pico', { sex: 'male', dam: a['Founder Dam'], sire: a['Secret Sire'] })
  await create('Ember', { dam: a.Tinta, sire: a['Public Sire'], clutch })
  await create('Sol', { dam: a.Tinta, sire: a['Public Sire'], clutch })
  await create('Hidden Hatchling', { dam: a.Tinta, visibility: 'private', clutch })
  // A deep line to test depth limits.
  let parent = a.Ember!
  for (let i = 1; i <= 6; i++) {
    await create(`Gen ${i}`, { dam: parent })
    parent = a[`Gen ${i}`]!
  }
})
afterAll(async () => stop?.())

const pedigree = (id: string, user: TypedUser | null, query: Record<string, string | number> = {}) =>
  callEndpoint(payload, 'animals', '/:id/pedigree', { id }, { user, query: { view: 'pedigree', ...query } })

describe('existing collection mapping', () => {
  it('uses the existing collection and fields: no individuals collection, no injected parentage group', () => {
    const slugs = payload.config.collections.map((c) => c.slug).filter((s) => !s.startsWith('payload-'))
    expect(slugs.sort()).toEqual(['animals', 'clutches', 'users'])
    const names = payload.collections['animals' as never]!.config.fields.map((f) => ('name' in f ? f.name : null))
    expect(names).not.toContain('parentage')
    expect(names).toEqual(expect.arrayContaining(['dam', 'sire', 'pedigreePanel']))
  })

  it('reads dam/sire as mother/father roles', async () => {
    const { body } = await pedigree(a.Ember!, users.editor!, { view: 'ahnentafel', ancestorDepth: 1 })
    const numbers = Object.fromEntries((body.projection.occurrences as { individualId: string; ahnentafel: number }[]).map((o) => [o.individualId, o.ahnentafel]))
    expect(numbers).toEqual({ [a.Ember!]: 1, [a['Public Sire']!]: 2, [a.Tinta!]: 3 })
  })
})

describe('birthing events and parent labels', () => {
  const clutchId = async () => String((await payload.find({ collection: 'clutches' as never })).docs[0]!.id)

  it('allows different fathers in one birthing event but only its mother', async () => {
    const id = await clutchId()
    // Members (Ember, Sol, Hidden Hatchling) were born to Tinta: another mother is refused.
    await expect(payload.update({ collection: 'clutches' as never, id, data: { mother: a['Founder Dam'] } as never })).rejects.toMatchObject({
      data: { errors: [{ path: 'mother', message: expect.stringMatching(/different mother/) }] },
    })
    await payload.update({ collection: 'clutches' as never, id, data: { mother: a.Tinta } as never })
    // Sol keeps a different (or no) father: fine. Changing a member's mother is refused.
    await payload.update({ collection: 'animals' as never, id: a.Sol!, data: { sire: a.Pico } as never })
    await expect(payload.update({ collection: 'animals' as never, id: a.Ember!, data: { dam: a['Founder Dam'] } as never })).rejects.toMatchObject({
      data: { errors: [{ path: 'clutch', message: expect.stringMatching(/birthing event/) }] },
    })
    await payload.update({ collection: 'animals' as never, id: a.Sol!, data: { sire: a['Public Sire'] } as never })
  })

  it('labels parents in the site default terms, or the user’s own', async () => {
    const labels = async (user: TypedUser | null) =>
      (await callEndpoint(payload, 'animals', '/:id/relatives', { id: a.Ember! }, { user })).body.parents.map((p: { label: string }) => p.label)
    expect(await labels(null)).toEqual(['Dam', 'Sire'])
    const own = (await payload.update({ collection: 'users', id: users.viewer!.id, data: { parentTerms: { preset: 'mother-father' } } as never })) as TypedUser
    expect(await labels(own)).toEqual(['Mother', 'Father'])
    const custom = (await payload.update({ collection: 'users', id: users.viewer!.id, data: { parentTerms: { preset: 'custom', maternal: 'Hen', paternal: '' } } as never })) as TypedUser
    expect(await labels(custom)).toEqual(['Hen', 'Sire'])
  })
})

describe('security (spec §42.4)', () => {
  it('denies a private animal to the public', async () => {
    expect((await pedigree(a['Secret Sire']!, null)).status).toBe(404)
    expect((await callEndpoint(payload, 'animals', '/:id/relatives', { id: a['Hidden Hatchling']! }, { user: null })).status).toBe(404)
  })

  it('discloses nothing about a private parent of a public animal (not its ID, name or link)', async () => {
    const { status, body } = await pedigree(a.Tinta!, null, { ancestorDepth: 2 })
    expect(status).toBe(200)
    const json = JSON.stringify(body)
    expect(json).not.toContain(a['Secret Sire']!)
    expect(json).not.toContain('Secret Sire')
    expect(json).toContain('private-1')
    expect(body.projection.issues.map((i: { code: string }) => i.code)).toContain('HIDDEN_RECORD')
    // Signed-in viewers may read it, so they see it.
    expect(JSON.stringify((await pedigree(a.Tinta!, users.viewer!, { ancestorDepth: 2 })).body)).toContain('Secret Sire')
  })

  it('does not reveal private offspring or cohort members through lists or counts', async () => {
    const rel = await callEndpoint(payload, 'animals', '/:id/relatives', { id: a.Ember! }, { user: null })
    expect(JSON.stringify(rel.body)).not.toContain('Hidden Hatchling')
    expect(rel.body.cohort.mates.map((m: { label: string }) => m.label)).toEqual(['Sol'])
    const tinta = await callEndpoint(payload, 'animals', '/:id/relatives', { id: a.Tinta! }, { user: null })
    expect(tinta.body.children.map((m: { label: string }) => m.label).sort()).toEqual(['Ember', 'Sol'])
    const members = await callEndpoint(payload, 'clutches', '/:id/members', { id: String((await payload.find({ collection: 'clutches' as never })).docs[0]!.id) }, { user: null })
    expect(members.body.members).toHaveLength(2)
  })

  it('bounds excessive traversal requests', async () => {
    const { body } = await pedigree(a['Gen 6']!, null, { ancestorDepth: 999 })
    expect(Math.max(...(body.projection.occurrences as { generation: number }[]).map((o) => o.generation))).toBe(3)
    expect(body.projection.truncated).toBe(true)
    const big = await callEndpoint(payload, 'animals', '/:id/pedigree', { id: a['Founder Dam']! }, { user: null, query: { view: 'population', maxNodes: 100000 } })
    expect(big.body.projection.occurrences.length).toBeLessThanOrEqual(200)
  })

  it('refuses edits by users without update access', async () => {
    await expect(payload.update({ collection: 'animals' as never, id: a.Sol!, data: { sire: a.Pico } as never, user: users.viewer, overrideAccess: false })).rejects.toThrow()
    const v = await callEndpoint(payload, 'animals', '/:id/pedigree/validate', { id: a.Sol! }, { user: users.viewer!, body: { parents: [] } })
    expect(v.status).toBe(404)
  })

  it('rejects a cycle, through the mapped fields', async () => {
    await expect(payload.update({ collection: 'animals' as never, id: a['Founder Dam']!, data: { dam: a['Gen 6'] } as never, user: users.editor, overrideAccess: false })).rejects.toMatchObject({
      data: { errors: [{ path: 'dam', message: expect.stringMatching(/descends/) }] },
    })
  })

  it('rejects a parent the editor cannot read, without saying whether it exists', async () => {
    const attempt = payload.update({ collection: 'animals' as never, id: a.Sol!, data: { sire: a['Secret Sire'] } as never, user: users['public-editor'], overrideAccess: false })
    await expect(attempt).rejects.toThrow()
    const after = (await payload.findByID({ collection: 'animals' as never, id: a.Sol!, depth: 0 })) as unknown as { sire: string }
    expect(String(after.sire)).toBe(a['Public Sire'])
  })

  it('refuses to delete a recorded parent (restrict policy)', async () => {
    await expect(payload.delete({ collection: 'animals' as never, id: a.Tinta! })).rejects.toThrow(/recorded parent/)
  })

  it('commits at most one of two concurrent edits that would together form a cycle', async () => {
    // Several rounds on fresh pairs: timing varies, the guarantee must not.
    for (let round = 0; round < 6; round++) {
      await create(`X${round}`, {})
      await create(`Y${round}`, {})
      const results = await Promise.allSettled([
        payload.update({ collection: 'animals' as never, id: a[`X${round}`]!, data: { dam: a[`Y${round}`] } as never }),
        payload.update({ collection: 'animals' as never, id: a[`Y${round}`]!, data: { dam: a[`X${round}`] } as never }),
      ])
      expect(results.filter((r) => r.status === 'fulfilled').length, `round ${round}`).toBeLessThanOrEqual(1)
    }
    const { docs } = await payload.find({ collection: 'animals' as never, depth: 0, pagination: false })
    const individuals = (docs as { id: string; dam?: string | null; sire?: string | null }[]).map((d) => ({
      id: String(d.id),
      parentage: { parents: [d.dam, d.sire].filter(Boolean).map((p) => ({ individual: String(p) })) },
    }))
    expect(validatePedigree({ schemaVersion: 1, individuals }).issues.filter((i) => i.code === 'ANCESTRY_CYCLE')).toEqual([])
    expect(indexPedigree({ schemaVersion: 1, individuals }).individuals.size).toBe(docs.length)
  })
})
