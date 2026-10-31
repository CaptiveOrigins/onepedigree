import { indexPedigree, PEDIGREE_VIEWS, projectPedigree, validatePedigree, type PedigreeDocument } from '@captiveorigins/onepedigree-core'
import type { Payload, TypedUser } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { reptileBreeding } from '../../../fixtures'
import { onePedigree } from '../src'
import { callEndpoint, startPayload, usersCollection } from './helpers'

/** Test A (spec §36): the plugin creates its collections in an otherwise minimal Payload app. */
let payload: Payload
let stop: () => Promise<void>
let editor: TypedUser
const ids = new Map<string, string>()
const doc = (key: string) => ids.get(key)!

beforeAll(async () => {
  ;({ payload, stop } = await startPayload({
    collections: [usersCollection],
    plugins: [onePedigree({ collection: 'individuals', mode: 'managed', cohorts: { collection: 'cohorts', managed: true }, onReferencedIndividualDelete: 'detach' })],
  }))
  editor = (await payload.create({ collection: 'users', data: { email: 'editor@example.com', password: 'a-long-test-password', role: 'editor' } as never })) as TypedUser
  // The red-footed tortoise fixture, written through the Local API (cohorts first, then parents before children).
  for (const c of reptileBreeding.cohorts ?? []) ids.set(c.id, String((await payload.create({ collection: 'cohorts' as never, data: { name: c.label } as never })).id))
  for (const ind of reptileBreeding.individuals) {
    const created = await payload.create({
      collection: 'individuals' as never,
      data: {
        name: ind.label,
        sex: ind.sex,
        parentage: {
          parents: (ind.parentage?.parents ?? []).map((p) => ({ individual: doc(p.individual), role: p.role })),
          reproductiveMode: ind.parentage?.reproductiveMode,
          cohort: ind.parentage?.cohort ? doc(ind.parentage.cohort) : undefined,
        },
      } as never,
    })
    ids.set(ind.id, String(created.id))
  }
})
afterAll(async () => stop?.())

const update = (key: string, parents: { individual: string; role?: string }[], extra: Record<string, unknown> = {}) =>
  payload.update({ collection: 'individuals' as never, id: doc(key), data: { parentage: { parents, ...extra } } as never })

describe('managed collections', () => {
  it('creates only the individuals and cohorts collections (no edge, role or occurrence collections)', () => {
    const slugs = payload.config.collections.map((c) => c.slug).filter((s) => !s.startsWith('payload-'))
    expect(slugs.sort()).toEqual(['cohorts', 'individuals', 'users'])
    const fields = payload.collections['individuals' as never]!.config.fields.map((f) => ('name' in f ? f.name : null))
    expect(fields).toEqual(expect.arrayContaining(['name', 'parentage', 'pedigreePanel']))
  })

  it('serves every view, matching the in-memory projection of the same pedigree', async () => {
    const rename = (id: string) => [...ids].find(([, v]) => v === id)![0]
    for (const view of PEDIGREE_VIEWS) {
      const query = { view, relatedId: doc('luna'), ancestorDepth: 4, descendantDepth: 3 }
      const focal = view === 'descendants' || view === 'hourglass' ? 'rf-dam' : 'ember'
      const { status, body } = await callEndpoint(payload, 'individuals', '/:id/pedigree', { id: doc(focal) }, { user: editor, query })
      expect(status, view).toBe(200)
      expect(body.layout.nodes.length, view).toBe(body.projection.occurrences.length)
      const memory = projectPedigree(reptileBreeding, { focalId: focal, view, relatedId: 'luna', ancestorDepth: 4, descendantDepth: 3, includeCohortMembers: true })
      const served = (body.projection.occurrences as { individualId: string }[]).map((o) => rename(o.individualId)).sort()
      expect(served, view).toEqual(memory.occurrences.map((o) => o.individualId).sort())
    }
  })

  it('names cohorts in cohort markers', async () => {
    const { body } = await callEndpoint(payload, 'individuals', '/:id/pedigree', { id: doc('tinta') }, { user: null, query: { view: 'cohort' } })
    expect(body.projection.groups.find((g: { kind: string }) => g.kind === 'cohort').label).toBe('2022 clutch')
  })

  it('rejects cycles, self-parents and duplicates on every write, with field paths', async () => {
    await expect(update('rf-sire', [{ individual: doc('ember'), role: 'father' }])).rejects.toMatchObject({ data: { errors: [{ path: 'parentage.parents' }] } })
    const fieldError = (message: RegExp) => ({ data: { errors: [{ path: 'parentage.parents', message: expect.stringMatching(message) }] } })
    const errorsOf = async (p: Promise<unknown>) => ((await p.catch((e) => e)) as { data: { errors: { message: string }[] } }).data.errors.map((e) => e.message)
    await expect(update('tinta', [{ individual: doc('tinta') }])).rejects.toMatchObject(fieldError(/own parent/))
    expect(await errorsOf(update('luna', [{ individual: doc('rf-dam') }, { individual: doc('rf-dam') }]))).toEqual(['The same parent is listed more than once.'])
  })

  it('checks a proposed change without saving it', async () => {
    const { body } = await callEndpoint(payload, 'individuals', '/:id/pedigree/validate', { id: doc('rf-dam') }, { user: editor, body: { parents: [{ individual: doc('ember'), role: 'mother' }] } })
    expect(body.valid).toBe(false)
    expect(body.issues.map((i: { code: string }) => i.code)).toContain('PARENT_IS_DESCENDANT')
    const anonymous = await callEndpoint(payload, 'individuals', '/:id/pedigree/validate', { id: doc('rf-dam') }, { user: null, body: { parents: [] } })
    expect(anonymous.status).toBe(404)
  })

  it('keeps parents when the reproductive mode changes, and bumps the graph revision only for parent changes', async () => {
    const revision = async () => ((await payload.findGlobal({ slug: 'individuals-pedigree-graph' as never })) as { revision: number }).revision
    const before = await revision()
    const sol = await payload.findByID({ collection: 'individuals' as never, id: doc('sol'), depth: 0 })
    const parents = (sol as unknown as { parentage: { parents: { individual: string; role: string }[] } }).parentage.parents
    await update('sol', parents.map((p) => ({ individual: p.individual, role: p.role })), { reproductiveMode: 'parthenogenesis' })
    const after = (await payload.findByID({ collection: 'individuals' as never, id: doc('sol'), depth: 0 })) as unknown as { parentage: { parents: unknown[]; reproductiveMode: string } }
    expect(after.parentage.parents).toHaveLength(1)
    expect(after.parentage.reproductiveMode).toBe('parthenogenesis')
    expect(await revision()).toBe(before)
    await update('sol', [{ individual: doc('tinta'), role: 'mother' }, { individual: doc('pico'), role: 'father' }])
    expect(await revision()).toBe(before + 1)
  })

  it('edits mother and father through the pickers, backed by the one parents array', async () => {
    const read = async () =>
      (await payload.findByID({ collection: 'individuals' as never, id: doc('pico'), depth: 0 })) as unknown as {
        parentage: { mother: string; father: string; parents: { individual: string; role: string }[] }
      }
    const before = await read()
    expect(String(before.parentage.mother)).toBe(doc('rf-dam'))
    expect(String(before.parentage.father)).toBe(doc('rf-sire'))
    // Change only the father: the mother row stays, the father row is replaced, other rows stay.
    await payload.update({
      collection: 'individuals' as never,
      id: doc('pico'),
      data: { parentage: { ...before.parentage, parents: [...before.parentage.parents, { individual: doc('luna'), role: 'contributor' }], father: doc('tinta') } } as never,
    })
    const after = await read()
    expect(after.parentage.parents.map((p) => [String(p.individual), p.role])).toEqual([
      [doc('tinta'), 'father'],
      [doc('rf-dam'), 'mother'],
      [doc('luna'), 'contributor'],
    ])
    // Clearing a picker removes that role's row.
    await payload.update({ collection: 'individuals' as never, id: doc('pico'), data: { parentage: { ...after.parentage, father: null } } as never })
    expect((await read()).parentage.parents.map((p) => p.role)).toEqual(['mother', 'contributor'])
  })

  it('lists cohort members and relatives', async () => {
    const members = await callEndpoint(payload, 'cohorts', '/:id/members', { id: doc('clutch-2022') }, { user: null })
    expect(members.body.members.map((m: { label: string }) => m.label).sort()).toEqual(['Pico', 'Tinta'])
    const rel = await callEndpoint(payload, 'individuals', '/:id/relatives', { id: doc('tinta') }, { user: null })
    expect(rel.body.parents.map((p: { role: string }) => p.role)).toEqual(['mother', 'father'])
    // Pico's parents were edited above, so only Luna is still a full sibling.
    expect(rel.body.siblings.full.map((s: { label: string }) => s.label).sort()).toEqual(['Luna'])
    expect(rel.body.cohort.mates.map((s: { label: string }) => s.label)).toEqual(['Pico'])
  })

  it('detaches references when a parent is deleted (detach policy) and stays valid', async () => {
    await payload.delete({ collection: 'individuals' as never, id: doc('rf-sire') })
    const { docs } = await payload.find({ collection: 'individuals' as never, depth: 0, pagination: false })
    const individuals = (docs as { id: string; parentage?: { parents?: { individual: string }[] } }[]).map((d) => ({
      id: String(d.id),
      parentage: { parents: (d.parentage?.parents ?? []).map((p) => ({ individual: String(p.individual) })) },
    }))
    expect(individuals.flatMap((i) => i.parentage.parents).some((p) => p.individual === doc('rf-sire'))).toBe(false)
    const document: PedigreeDocument = { schemaVersion: 1, individuals }
    expect(validatePedigree(document).valid).toBe(true)
    expect(indexPedigree(document).individuals.size).toBe(reptileBreeding.individuals.length - 1)
  })
})
