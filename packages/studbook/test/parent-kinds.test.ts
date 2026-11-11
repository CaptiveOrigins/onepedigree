import { normalizePedigree, type PedigreeDocument } from '@captiveorigins/onepedigree-core'
import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { fosterDam, fosterDamBiological, lineBreeding, halfSiblings } from '../../../fixtures'
import { kinshipAnalysis, toPed, type Studbook, type StudbookAnimal } from '../src/index.js'
import { getStudbook } from '../src/payload.js'

// Parent kinds (agreed with OneLineage, 2026-11-10): only biological links count. A foster dam is a `social` link.
const withKinds = (d: PedigreeDocument, kind: string): PedigreeDocument => ({
  ...d,
  individuals: d.individuals.map((i) => (i.parentage ? { ...i, parentage: { ...i.parentage, parents: i.parentage.parents.map((p) => ({ ...p, kind })) } } : i)),
})
const strip = (r: ReturnType<typeof kinshipAnalysis>) => ({ individuals: r.individuals, population: r.population, founders: r.founders, unknownShare: r.unknownShare })

describe('kinship with parent kinds', () => {
  it('without kinds, MK and F are unchanged, and the same with every link marked biological', () => {
    const r = kinshipAnalysis(normalizePedigree(lineBreeding))
    // Opal: Coral × Rio, where Rio and Coral's mother Maya are half-sibs through Kingston: F = 1/16.
    expect(r.individuals.find((i) => i.id === 'opal')!.inbreeding).toBeCloseTo(0.0625, 10)
    for (const d of [lineBreeding, halfSiblings]) expect(strip(kinshipAnalysis(normalizePedigree(withKinds(d, 'biological'))))).toEqual(strip(kinshipAnalysis(normalizePedigree(d))))
  })

  it('a foster link is left out of F, kinship, MK, GD, FGE and founders', () => {
    const fostered = kinshipAnalysis(normalizePedigree(fosterDam))
    const plain = kinshipAnalysis(normalizePedigree(fosterDamBiological))
    expect(strip(fostered)).toEqual(strip(plain))
    // Pip is a half-sib mating's kit (F = 1/8). Counting Saffron as a third parent would have been refused outright.
    expect(fostered.individuals.find((i) => i.id === 'pip')!.inbreeding).toBeCloseTo(0.125, 10)
    // Pip and Saffron are related only through Rio (Saffron's son): kinship 1/8, not a mother's 1/4.
    expect(fostered.kinship('pip', 'saffron')).toBeCloseTo(plain.kinship('pip', 'saffron'), 12)
    expect(fostered.kinship('pip', 'saffron')).toBeCloseTo(0.125, 10)
  })
})

const day = (date: string) => ({ date, precision: 'exact' as const })
const animal = (id: string, n: string, over: Partial<StudbookAnimal> = {}): StudbookAnimal => ({
  id, studbookNumber: n, coId: `CO-A${n}`, sex: 'female', birthType: 'captive', birth: day('2020-05-01'), parentage: null, status: 'alive', ...over,
})
const book: Studbook = {
  title: 'Made-up foster clutch',
  currentness: '2026-11-11',
  animals: [
    animal('dam', '1'),
    animal('sire', '2', { sex: 'male' }),
    animal('foster', '3'),
    animal('kit', '4', { parentage: { parents: [{ individual: 'foster', role: 'dam', kind: 'social' }, { individual: 'dam', role: 'dam' }, { individual: 'sire', role: 'sire' }] } }),
    // Fostered with no recorded biological dam: PMx and the table say UNK, never the foster dam.
    animal('kit2', '5', { parentage: { parents: [{ individual: 'foster', role: 'foster dam', kind: 'social' }, { individual: 'sire', role: 'sire' }] } }),
  ],
  events: [],
}

describe('studbook exports and rows with parent kinds', () => {
  it('PMx gets the biological sire and dam only; a foster dam is never written', () => {
    const l = toPed(book).trimEnd().split('\n')
    expect(l.find((x) => x.startsWith('4; '))!.split('; ').slice(0, 3)).toEqual(['4', '2', '1'])
    // A non-biological role PMx can't place ("foster dam") is skipped, not refused.
    expect(l.find((x) => x.startsWith('5; '))!.split('; ').slice(0, 3)).toEqual(['5', '2', 'UNK'])
  })

  it('the studbook rows show the biological dam, and genetics ignore the foster link', async () => {
    const req = { user: { id: 'u' }, url: 'http://localhost/api/animals/studbook/sb', routeParams: { studbook: 'sb' } } as unknown as PayloadRequest
    const r = (await getStudbook(req, { source: () => book, geneticsVisibleFor: () => true, canExport: () => true }, 'sb'))!
    const row = (n: string) => r.animals.find((a) => 'studbookNumber' in a && a.studbookNumber === n) as { dam: string; sire: string; meanKinship?: number }
    expect(row('4')).toMatchObject({ sire: '2', dam: '1' })
    expect(row('5')).toMatchObject({ sire: '2', dam: 'UNK' })
    const withoutFoster: Studbook = { ...book, animals: book.animals.map((a) => (a.parentage ? { ...a, parentage: { ...a.parentage, parents: a.parentage.parents.filter((p) => !p.kind) } } : a)) }
    const plain = (await getStudbook(req, { source: () => withoutFoster, geneticsVisibleFor: () => true, canExport: () => true }, 'sb'))!
    expect(r.population).toEqual(plain.population)
    expect(r.animals).toEqual(plain.animals)
  })
})
