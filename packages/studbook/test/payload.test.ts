import { describe, expect, it } from 'vitest'
import type { PayloadRequest } from 'payload'
import type { Studbook, StudbookAnimal } from '../src/index.js'
import { getStudbook, studbookEndpoint, type StudbookEndpointOptions, type StudbookResponse } from '../src/payload.js'

// A made-up studbook. P is a private wild founder: counted everywhere, named nowhere.
const date = (d: string | null) => ({ date: d, precision: d ? ('day' as const) : ('unknown' as const) })
const animal = (a: Partial<StudbookAnimal> & Pick<StudbookAnimal, 'id' | 'studbookNumber'>): StudbookAnimal => ({ coId: `CO-A-${a.id}`, sex: 'unknown', birthType: 'captive', birth: date(null), parentage: null, status: 'alive', ...a })
const mother = (id: string) => ({ individual: id, role: 'mother' })
const father = (id: string) => ({ individual: id, role: 'father' })
const book: Studbook = {
  title: 'Made-up assurance studbook',
  currentness: '2026-11-01',
  animals: [
    animal({ id: 'w1', studbookNumber: '1', sex: 'female', birthType: 'wild', animalId: 'Ruby' }),
    animal({ id: 'w2', studbookNumber: '2', sex: 'male', birthType: 'wild' }),
    animal({ id: 'P', studbookNumber: '9', coId: 'CO-A-SECRET', animalId: 'Hidden', sex: 'female', birthType: 'wild', private: true }),
    animal({ id: 'c3', studbookNumber: '3', sex: 'male', parentage: { parents: [mother('w1'), father('w2')] }, birth: date('2015-06-01') }),
    animal({ id: 'c4', studbookNumber: '4', sex: 'female', parentage: { parents: [mother('P'), father('c3')] }, animalId: 'Fern' }),
    animal({ id: 'c5', studbookNumber: 'T1', parentage: { parents: [], uncertainParents: [{ role: 'father', candidates: [{ individual: 'w2', probability: 0.5 }, { individual: 'c3', probability: 0.5 }] }, { role: 'mother', candidates: [], kind: 'wild' }] } }),
    animal({ id: 'c6', studbookNumber: '6', parentage: { parents: [father('gone')] }, status: 'dead' }),
  ],
  events: [
    { animal: 'c4', type: 'birth', date: date('2020-05-01'), location: 'H1' },
    { animal: 'c4', type: 'transfer', date: date('2023-02-01'), location: 'H2' },
    { animal: 'P', type: 'capture', date: date('2010-01-01'), location: 'HSECRET' },
  ],
}

type User = { id: string; role: 'coordinator' | 'member' | 'outsider'; owns?: string[] }
const req = (user: User | null, url = 'http://localhost/api/animals/studbook/sb1', params: Record<string, string> = { studbook: 'sb1' }) => ({ user, url, routeParams: params }) as unknown as PayloadRequest
const u = (r: PayloadRequest) => r.user as unknown as User | null
const options: StudbookEndpointOptions = {
  source: ({ studbook, req }) => (studbook === 'sb1' && u(req) && u(req)!.role !== 'outsider' ? book : null),
  geneticsVisibleFor: ({ animal, req }) => u(req)?.role === 'coordinator' || Boolean(u(req)?.owns?.includes(animal.id)),
  canExport: ({ req }) => u(req)?.role === 'coordinator',
  holderLabel: (code, req) => (u(req)?.role === 'coordinator' ? `Holder ${code}` : 'Private holder'),
}
const coordinator: User = { id: 'u1', role: 'coordinator' }
const member: User = { id: 'u2', role: 'member', owns: ['c4'] }
const call = async (user: User | null, query = '', opts = options) => {
  const res = (await studbookEndpoint(opts).handler(req(user, `http://localhost/api/animals/studbook/sb1${query}`))) as Response
  return { status: res.status, headers: res.headers, text: await res.text() }
}
const view = (r: StudbookResponse, n: string) => r.animals.find((a) => 'studbookNumber' in a && a.studbookNumber === n) as Extract<StudbookResponse['animals'][number], { id: string }>

describe('studbook endpoint: privacy', () => {
  it('counts a private animal but names it nowhere: not as a row, a parent, a founder or a holder', async () => {
    const { status, text } = await call(coordinator)
    expect(status).toBe(200)
    for (const s of ['CO-A-SECRET', 'Hidden', '"P"', 'HSECRET', '"9"']) expect(text).not.toContain(s)
    const r = JSON.parse(text) as StudbookResponse
    expect(r.animals.filter((a) => 'private' in a)).toEqual([{ private: true }])
    expect(view(r, '4').dam).toBe('Private')
    expect(r.population!.founders.filter((f) => 'private' in f)).toHaveLength(1)
    // Still counted: six living animals (c6 is dead), the private founder among them.
    expect(r.population!.size).toBe(6)
  })

  it('gives a 404 to a reader the platform gives nothing, the same as a studbook that does not exist', async () => {
    expect((await call({ id: 'x', role: 'outsider' })).status).toBe(404)
    expect((await call(null)).status).toBe(404)
    const missing = (await studbookEndpoint(options).handler(req(coordinator, 'http://localhost/api/animals/studbook/nope', { studbook: 'nope' }))) as Response
    expect(missing.status).toBe(404)
  })
})

describe('studbook endpoint: who sees genetics', () => {
  it('the coordinator sees every animal\'s MK, F and Known, and the population summary', async () => {
    const r = JSON.parse((await call(coordinator)).text) as StudbookResponse
    for (const a of r.animals) if ('id' in a) expect(a.genetics).not.toBeNull()
    expect(r.basis).toBe('pedigree-based')
    expect(r.population!.geneDiversity).toBeGreaterThan(0)
    // c4's parents are unrelated (a wild founder and c3), so F = 0.
    expect(view(r, '4').genetics!.inbreeding).toBe(0)
  })

  it('a member sees numbers only for their own animal, and no population summary that would give the rest away', async () => {
    const r = JSON.parse((await call(member)).text) as StudbookResponse
    expect(view(r, '4').genetics).not.toBeNull()
    for (const a of r.animals) if ('id' in a && a.id !== 'c4') expect(a.genetics).toBeNull()
    expect(r.population).toBeNull()
    expect(r.canExport).toBe(false)
  })

  it('fails closed: a callback that throws or answers anything but true is a no', async () => {
    for (const geneticsVisibleFor of [() => { throw new Error('down') }, () => 'yes' as unknown as boolean, async () => 1 as unknown as boolean]) {
      const r = JSON.parse((await call(coordinator, '', { ...options, geneticsVisibleFor })).text) as StudbookResponse
      for (const a of r.animals) if ('id' in a) expect(a.genetics).toBeNull()
      expect(r.population).toBeNull()
    }
    const res = await call(coordinator, '?format=pmx', { ...options, canExport: () => { throw new Error('down') } })
    expect(res.status).toBe(403)
  })
})

describe('studbook endpoint: rows', () => {
  it('shows both IDs, parent codes (number, MULT, WILD, UNK for a parent with no record), and holders through holderLabel only', async () => {
    const r = JSON.parse((await call(coordinator)).text) as StudbookResponse
    expect(view(r, '4')).toMatchObject({ coId: 'CO-A-c4', animalId: 'Fern', sire: '3', holder: 'Holder H2' })
    expect(view(r, 'T1')).toMatchObject({ sire: 'MULT', dam: 'WILD' })
    expect(view(r, '6')).toMatchObject({ sire: 'UNK', dam: 'UNK', selected: false })
    expect(view(r, '1').holder).toBeNull()
    expect(view(JSON.parse((await call(member)).text) as StudbookResponse, '4').holder).toBe('Private holder')
    const { holderLabel: _, ...noLabels } = options
    expect(view(JSON.parse((await call(coordinator, '', noLabels)).text) as StudbookResponse, '4').holder).toBeNull()
    expect(r.animals.filter((a) => 'studbookNumber' in a).map((a) => (a as { studbookNumber: string }).studbookNumber)).toEqual(['1', '2', '3', '4', '6', 'T1'])
  })
})

describe('studbook endpoint: PMx export', () => {
  it('gives the coordinator a .ped file with holder names, and refuses a member', async () => {
    const res = await call(coordinator, '?format=pmx')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="sb1.ped"')
    expect(res.text).toMatch(/^Analysis date: 20261101/)
    expect(res.text).toContain('Holder H2')
    expect((await call(member, '?format=pmx')).status).toBe(403)
    expect((await call(null, '?format=pmx')).status).toBe(403)
  })

  it('answers 400 for an unknown format and 422 for a pedigree it cannot analyse', async () => {
    expect((await call(coordinator, '?format=xlsx')).status).toBe(400)
    const three: Studbook = { ...book, animals: [...book.animals, animal({ id: 'x', studbookNumber: '20', parentage: { parents: [mother('w1'), father('w2'), { individual: 'c3', role: 'donor' }] } })] }
    const res = await call(coordinator, '', { ...options, source: () => three })
    expect(res.status).toBe(422)
  })

  it('getStudbook gives null for nothing, for callers that render on the server', async () => {
    expect(await getStudbook(req({ id: 'x', role: 'outsider' }), options, 'sb1')).toBeNull()
  })
})
