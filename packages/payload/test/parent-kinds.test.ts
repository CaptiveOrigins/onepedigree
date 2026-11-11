import { handleEndpoints, type Access, type CollectionConfig, type Payload, type TypedUser, type Where } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { onePedigree } from '../src'
import { startPayload, usersCollection } from './helpers'

/**
 * Parent kinds (agreed with OneLineage, 2026-11-10): a link's `kind` is stored in its parents row, and a hidden
 * parent on a kind-bearing link is redacted exactly like any other, keeping only its role and kind. Standard fields
 * with Mother/Father pickers and placeholders, as the platform installs them.
 */
const role = (u: unknown) => (u as { role?: string } | null)?.role
const uid = (u: unknown) => (u as { id?: string } | null)?.id
const read: Access = ({ req }) =>
  role(req.user) === 'admin' ? true : ({ or: [{ visibility: { equals: 'public' } }, ...(req.user ? [{ owner: { equals: uid(req.user) } }] : [])] } as Where)
const write: Access = ({ req }) => (role(req.user) === 'admin' ? true : req.user ? ({ owner: { equals: uid(req.user) } } as Where) : false)
const animals: CollectionConfig = {
  slug: 'animals',
  access: { read, create: write, update: write, delete: write },
  fields: [
    { name: 'name', type: 'text' },
    { name: 'visibility', type: 'select', options: ['public', 'private'], defaultValue: 'public' },
    { name: 'owner', type: 'relationship', relationTo: 'users' },
  ],
}

type Row = { individual: unknown; role?: string | null; kind?: string | null }
type Doc = { id: string; parentage?: { mother?: unknown; father?: unknown; parents?: Row[] } }

let payload: Payload
let stop: () => Promise<void>
const users: Record<string, TypedUser> = {}
const a: Record<string, string> = {}
const create = async (key: string, data: Record<string, unknown>) => {
  a[key] = String((await payload.create({ collection: 'animals' as never, data: { name: key, ...data } as never })).id)
}
const rest = async (path: string) => {
  const res = await handleEndpoints({ config: payload.config, request: new Request(`http://localhost/api${path}`) })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

beforeAll(async () => {
  ;({ payload, stop } = await startPayload({
    collections: [usersCollection, animals],
    plugins: [onePedigree({ collection: 'animals', mode: 'standard-fields', hiddenRecords: 'placeholder' })],
  }))
  users.owner = (await payload.create({ collection: 'users', data: { email: 'owner@example.com', password: 'a-long-test-password', role: 'viewer' } as never })) as TypedUser
  // L is a private legal father; M the public biological mother; F the public biological father; K the kit.
  await create('L', { visibility: 'private', owner: users.owner.id })
  await create('M', {})
  await create('F', {})
  await create('K', {
    parentage: { parents: [{ individual: a.M, role: 'mother' }, { individual: a.F, role: 'father' }, { individual: a.L, role: 'father', kind: 'legal' }] },
  })
})
afterAll(async () => stop?.())

describe('parent kinds in the Payload plugin', () => {
  it('stores a kind on the parents row, and none where none was given', async () => {
    const k = (await payload.findByID({ collection: 'animals' as never, id: a.K!, depth: 0 })) as unknown as Doc
    expect(k.parentage!.parents!.map((r) => [r.role, r.kind ?? null])).toEqual([
      ['mother', null],
      ['father', null],
      ['father', 'legal'],
    ])
  })

  it('plain reads redact a hidden parent on a legal link exactly as any other, keeping its role and kind', async () => {
    const { status, body } = await rest(`/animals/${a.K}?depth=0`)
    expect(status).toBe(200)
    expect(JSON.stringify(body)).not.toContain(a.L!)
    const rows = (body as unknown as Doc).parentage!.parents!
    expect(rows[2]).toMatchObject({ individual: { private: true }, role: 'father', kind: 'legal' })
    // The Father picker shows the biological father, not the legal one.
    expect((body as unknown as Doc).parentage!.father).toBe(a.F)
  })

  it('the pedigree endpoint draws the hidden legal father as an anonymous placeholder on a legal link', async () => {
    const { body } = await rest(`/animals/${a.K}/pedigree?view=pedigree`)
    expect(JSON.stringify(body)).not.toContain(a.L!)
    const p = body.projection as { edges: { source: string; role: string | null; kind?: string }[]; individuals: Record<string, { data?: { private?: boolean } }> }
    const legal = p.edges.filter((e) => e.kind)
    expect(legal).toHaveLength(1)
    expect(legal[0]).toMatchObject({ role: 'father', kind: 'legal' })
    expect(p.individuals[legal[0]!.source.replace(/#\d+$/, '')]!.data?.private).toBe(true)
  })

  it('the relatives endpoint lists the legal father as private, with its kind, and siblings ignore it', async () => {
    const { body } = await rest(`/animals/${a.K}/relatives`)
    expect(JSON.stringify(body)).not.toContain(a.L!)
    expect((body as { parents: unknown[] }).parents).toContainEqual(expect.objectContaining({ role: 'father', kind: 'legal', individual: { private: true } }))
  })

  it('changing the Father picker replaces the biological father and keeps the legal one', async () => {
    await create('F2', {})
    await payload.update({ collection: 'animals' as never, id: a.K!, data: { parentage: { father: a.F2 } } as never })
    const k = (await payload.findByID({ collection: 'animals' as never, id: a.K!, depth: 0 })) as unknown as Doc
    expect(k.parentage!.parents!.map((r) => [r.individual, r.role, r.kind ?? null]).sort()).toEqual(
      [
        [a.F2, 'father', null],
        [a.L, 'father', 'legal'],
        [a.M, 'mother', null],
      ].sort(),
    )
  })
})
