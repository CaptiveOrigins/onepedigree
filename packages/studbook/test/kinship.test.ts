import { normalizePedigree, projectPedigree } from '@captiveorigins/onepedigree-core'
import { describe, expect, it } from 'vitest'
import { kinshipAnalysis } from '../src/index.js'

type Ind = { id: string; parentage?: unknown }
const kid = (id: string, mother: string, father: string): Ind => ({ id, parentage: { parents: [{ individual: mother, role: 'mother' }, { individual: father, role: 'father' }] } })
const doc = (individuals: Ind[]) => normalizePedigree({ schemaVersion: 1, individuals })
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 10)
const F = (r: ReturnType<typeof kinshipAnalysis>, id: string) => r.individuals.find((i) => i.id === id)!.inbreeding

describe('kinship and inbreeding (textbook values)', () => {
  it('full-sib mating gives F = 0.25, half-sib 0.125, parent-offspring 0.25, first cousins 0.0625', () => {
    const r = kinshipAnalysis(doc([
      { id: 'A' }, { id: 'B' }, { id: 'X' }, { id: 'Y' },
      kid('C', 'A', 'B'), kid('D', 'A', 'B'), kid('E', 'C', 'D'),      // full sibs
      kid('H1', 'A', 'B'), kid('H2', 'A', 'X'), kid('H', 'H1', 'H2'),  // half sibs (mother A)
      kid('P', 'C', 'B'),                                              // B with his daughter C
      kid('K1', 'C', 'X'), kid('K2', 'Y', 'D'), kid('K', 'K1', 'K2'),  // first cousins
    ]))
    close(F(r, 'E'), 0.25)
    close(F(r, 'H'), 0.125)
    close(F(r, 'P'), 0.25)
    close(F(r, 'K'), 0.0625)
    close(r.kinship('C', 'D'), 0.25)
    close(r.kinship('A', 'A'), 0.5)
    expect(r.basis).toBe('pedigree-based')
  })

  it('N unrelated founders: GD = 1 - 1/(2N), FGE = N, every founder represented equally', () => {
    const r = kinshipAnalysis(doc([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]))
    close(r.population.geneDiversity, 1 - 1 / 8)
    close(r.population.founderGenomeEquivalents, 4)
    expect(r.founders.map((f) => f.representation)).toEqual([0.25, 0.25, 0.25, 0.25])
    close(r.population.known, 1)
  })

  it('MK over a chosen population includes self, as PMx does', () => {
    const r = kinshipAnalysis(doc([{ id: 'A' }, { id: 'B' }, kid('C', 'A', 'B'), kid('D', 'A', 'B')]), { population: ['C', 'D'] })
    // C: kinship with itself 0.5 and with its full sib 0.25.
    close(r.individuals.find((i) => i.id === 'C')!.meanKinship, 0.375)
    close(r.population.geneDiversity, 1 - 0.375)
    expect(r.population.size).toBe(2)
  })

  it('counts a MULT parent by expectation, and the remainder as unknown', () => {
    const r = kinshipAnalysis(doc([
      { id: 'A' }, { id: 'B' }, { id: 'S2' }, kid('D', 'A', 'B'), kid('S1', 'A', 'B'),
      { id: 'X', parentage: { parents: [{ individual: 'D', role: 'mother' }], uncertainParents: [{ role: 'father', candidates: [{ individual: 'S1', probability: 0.5 }, { individual: 'S2', probability: 0.5 }] }] } },
      { id: 'Y', parentage: { parents: [{ individual: 'D', role: 'mother' }], uncertainParents: [{ role: 'father', candidates: [{ individual: 'S1', probability: 0.5 }] }] } },
    ]))
    // S1 is D's full brother (kinship 0.25), S2 unrelated: F = 0.5 * 0.25.
    close(F(r, 'X'), 0.125)
    close(F(r, 'Y'), 0.125)
    // Y's father is S1 half the time and unknown otherwise: half its paternal genome is unknown.
    close(r.individuals.find((i) => i.id === 'Y')!.known, 0.75)
  })

  it('clutchmates sharing an unknown parent are related; unique unknown parents are not', () => {
    const unk = (id: string, mother: string, shared?: string): Ind => ({ id, parentage: { parents: [{ individual: mother, role: 'mother' }], uncertainParents: [{ role: 'father', candidates: [], ...(shared ? { shared } : {}) }] } })
    const shared = kinshipAnalysis(doc([{ id: 'M1' }, { id: 'M2' }, unk('a', 'M1', 'UNK1'), unk('b', 'M2', 'UNK1')]))
    close(shared.kinship('a', 'b'), 0.125)
    const unique = kinshipAnalysis(doc([{ id: 'M1' }, { id: 'M2' }, unk('a', 'M1'), unk('b', 'M2')]))
    close(unique.kinship('a', 'b'), 0)
  })

  it('splits genes between founder animals and unknown parents, summing to 1', () => {
    const r = kinshipAnalysis(doc([{ id: 'A' }, { id: 'B' }, { id: 'C', parentage: { parents: [{ individual: 'A', role: 'mother' }] } }, kid('D', 'C', 'B')]), { population: ['D'] })
    expect(r.founders).toEqual([{ id: 'B', representation: 0.5 }, { id: 'A', representation: 0.25 }])
    close(r.unknownShare, 0.25)
  })

  it('refuses more than two parents, a cycle, and a population member not in the pedigree', () => {
    const three = doc([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'k', parentage: { parents: [{ individual: 'a' }, { individual: 'b' }, { individual: 'c' }] } }])
    expect(() => kinshipAnalysis(three)).toThrow(/3 parents/)
    const loop = doc([{ id: 'a', parentage: { parents: [{ individual: 'b' }] } }, { id: 'b', parentage: { parents: [{ individual: 'a' }] } }])
    expect(() => kinshipAnalysis(loop)).toThrow(/cycle/)
    expect(() => kinshipAnalysis(doc([{ id: 'a' }]), { population: ['z'] })).toThrow(/isn't in this pedigree/)
  })
})

describe('drawing uncertain parents as branches is display only', () => {
  it("gives identical kinship results whichever way the views draw candidates, and leaves the document as it was", () => {
    // Kinship reads the document, never a projection: no code path is shared. This guards against a projection that
    // changes the document it reads, which would change every number after it.
    const d = doc([
      { id: 'S1' }, { id: 'S2' }, { id: 'D' },
      { id: 'X', parentage: { parents: [{ individual: 'D', role: 'mother' }], uncertainParents: [{ role: 'father', basis: 'multi-sire mating', candidates: [{ individual: 'S1', probability: 0.5 }, { individual: 'S2', probability: 0.3 }] }] } },
      { id: 'Y', parentage: { parents: [{ individual: 'D', role: 'mother' }], uncertainParents: [{ role: 'father', candidates: [], kind: 'wild', shared: 'WILD1' }] } },
      { id: 'Z', parentage: { parents: [{ individual: 'D', role: 'mother' }], uncertainParents: [{ role: 'father', candidates: [], kind: 'wild', shared: 'WILD1' }] } },
    ])
    const summary = (r: ReturnType<typeof kinshipAnalysis>) => ({ individuals: r.individuals, population: r.population, founders: r.founders, unknownShare: r.unknownShare, xy: r.kinship('X', 'Y'), yz: r.kinship('Y', 'Z') })
    const before = JSON.stringify(d)
    const plain = summary(kinshipAnalysis(d))
    for (const uncertainParents of ['placeholder', 'branches'] as const) {
      for (const focalId of ['X', 'Y']) for (const view of ['pedigree', 'hourglass', 'fan'] as const) projectPedigree(d, { view, focalId, uncertainParents })
      expect(summary(kinshipAnalysis(d))).toEqual(plain)
    }
    expect(JSON.stringify(d)).toBe(before)
  })
})
