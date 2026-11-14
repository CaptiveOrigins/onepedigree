import { describe, expect, it } from 'vitest'
import { candidateWords, layoutSync, nodeSublabel, normalizePedigree, projectPedigree, uncertainSublabel, type UncertainParentDisplay } from '../src/index.js'

// Made-up clutch: two siblings with the same wild-caught sire (WILD1), a dam known only as candidates (MULT),
// one of them private, with 10% left over as unknown; and an animal whose mother is simply unknown (UNK).
const doc = normalizePedigree({
  schemaVersion: 1,
  individuals: [
    { id: 'd1', label: 'Ruby', identifier: 'REG-A-0001' },
    { id: 'd2', label: 'Hidden', data: { private: true } },
    { id: 'gm', label: 'Grandmother' },
    { id: 'k1', label: 'Kit one', parentage: { parents: [], uncertainParents: [
      { role: 'father', candidates: [], kind: 'wild', shared: 'WILD1' },
      { role: 'mother', candidates: [{ individual: 'd1', probability: 0.6 }, { individual: 'd2', probability: 0.3 }] },
    ] } },
    { id: 'k2', label: 'Kit two', parentage: { parents: [{ individual: 'gm', role: 'mother' }], uncertainParents: [{ role: 'father', candidates: [], kind: 'wild', shared: 'WILD1' }] } },
    { id: 'u', label: 'Lone', parentage: { parents: [], uncertainParents: [{ role: 'mother', candidates: [] }] } },
  ],
})
const uncertainOf = (p: ReturnType<typeof projectPedigree>) => p.occurrences.filter((o) => o.uncertain).map((o) => ({ o, d: p.individuals[o.individualId]!.data!.uncertain as UncertainParentDisplay, label: p.individuals[o.individualId]!.label }))

describe('uncertain parents in pedigree views', () => {
  it('draws one placeholder per slot, linked to the child by role, and never follows it further', () => {
    const p = projectPedigree(doc, { view: 'pedigree', focalId: 'k1' })
    const u = uncertainOf(p)
    expect(u.map((x) => x.label).sort()).toEqual(['Possible mothers', 'Wild father'])
    for (const { o } of u) {
      expect(o.generation).toBe(1)
      expect(p.edges.find((e) => e.source === o.occurrenceId)!.target).toBe('k1#0')
    }
    // The candidates are listed on the placeholder, not drawn as parents.
    expect(p.occurrences.map((o) => o.individualId)).not.toContain('d1')
  })

  it('lists visible candidates with their chances, only counts private ones, and gives the leftover share', () => {
    const p = projectPedigree(doc, { view: 'pedigree', focalId: 'k1' })
    const mult = uncertainOf(p).find((x) => x.d.kind === 'multiple')!
    expect(mult.d.candidates).toEqual([{ individual: 'd1', label: 'Ruby (REG-A-0001)', probability: 0.6 }])
    expect(mult.d.hiddenCandidates).toBe(1)
    expect(mult.d.remainder!.kind).toBe('unknown')
    expect(mult.d.remainder!.probability).toBeCloseTo(0.1, 10)
    const sub = nodeSublabel(p.individuals[mult.o.individualId])
    expect(sub).toBe('Ruby (REG-A-0001) 60% · 1 private · unknown 10%')
    // The placeholder names nothing private. (The child's own record is the host's to filter, as for known parents.)
    expect(JSON.stringify(mult.d)).not.toMatch(/Hidden|d2/)
    expect(p.individuals.d2).toBeUndefined()
  })

  it('shows a shared wild parent once for clutchmates when the view merges, and says it is shared', () => {
    const p = projectPedigree(doc, { view: 'hourglass', focalId: 'gm', descendantDepth: 1, ancestorDepth: 1, occurrenceMode: 'merge' })
    const k2 = projectPedigree(doc, { view: 'pedigree', focalId: 'k2', occurrenceMode: 'merge' })
    const wild = uncertainOf(k2).find((x) => x.d.kind === 'wild')!
    expect(wild.d.shared).toBe('WILD1')
    expect(nodeSublabel(k2.individuals[wild.o.individualId])).toBe('shared by clutchmates')
    // Both kits' wild sire is the same placeholder identity.
    const k1 = projectPedigree(doc, { view: 'pedigree', focalId: 'k1' })
    expect(uncertainOf(k1).find((x) => x.d.kind === 'wild')!.o.individualId).toBe(wild.o.individualId)
    expect(p.issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('a plain unknown parent is "Unknown mother"; maternal and paternal lines keep only their role', () => {
    expect(uncertainOf(projectPedigree(doc, { view: 'pedigree', focalId: 'u' })).map((x) => x.label)).toEqual(['Unknown mother'])
    expect(uncertainOf(projectPedigree(doc, { view: 'maternal', focalId: 'k1' })).map((x) => x.label)).toEqual(['Possible mothers'])
    expect(uncertainOf(projectPedigree(doc, { view: 'paternal', focalId: 'k1' })).map((x) => x.label)).toEqual(['Wild father'])
  })

  it('leaves documents without uncertain parents unchanged, and lays placeholders out like any node', () => {
    const plain = normalizePedigree({ schemaVersion: 1, individuals: [{ id: 'a' }, { id: 'b', parentage: { parents: [{ individual: 'a', role: 'mother' }] } }] })
    expect(projectPedigree(plain, { view: 'pedigree', focalId: 'b' }).occurrences.some((o) => o.uncertain)).toBe(false)
    const p = projectPedigree(doc, { view: 'pedigree', focalId: 'k1' })
    expect(layoutSync(p).nodes).toHaveLength(p.occurrences.length)
  })

  it('a placeholder never takes the ID of a real individual', () => {
    const clash = normalizePedigree({ schemaVersion: 1, individuals: [{ id: '~uncertain:c:0' }, { id: 'c', parentage: { parents: [], uncertainParents: [{ role: 'mother', candidates: [] }] } }] })
    const p = projectPedigree(clash, { view: 'pedigree', focalId: 'c' })
    const u = p.occurrences.find((o) => o.uncertain)!
    expect(u.individualId).not.toBe('~uncertain:c:0')
    expect(p.individuals[u.individualId]!.label).toBe('Unknown mother')
  })
})

describe('the basis of uncertain parents', () => {
  const withBasis = normalizePedigree({
    schemaVersion: 1,
    individuals: [
      { id: 's1', label: 'Sire one' },
      { id: 'pup', label: 'Pup', parentage: { parents: [], uncertainParents: [{ role: 'father', basis: 'multi-sire mating', candidates: [{ individual: 's1', probability: 0.7 }] }] } },
    ],
  })

  it('is kept by the normalizer and shown with the slot without changing anything else', () => {
    expect(withBasis.individuals.find((i) => i.id === 'pup')!.parentage!.uncertainParents![0]!.basis).toBe('multi-sire mating')
    const p = projectPedigree(withBasis, { view: 'pedigree', focalId: 'pup' })
    const placeholder = Object.values(p.individuals).find((i) => i.data?.uncertain)!
    expect((placeholder.data!.uncertain as UncertainParentDisplay).basis).toBe('multi-sire mating')
    expect(uncertainSublabel(placeholder.data!.uncertain as UncertainParentDisplay)).toBe('Sire one 70% · unknown 30% · multi-sire mating')
  })

  it('is left out when not recorded, so documents without it are unchanged', () => {
    const plain = normalizePedigree({ schemaVersion: 1, individuals: [{ id: 'pup', parentage: { parents: [], uncertainParents: [{ role: 'father', candidates: [] }] } }] })
    expect(plain.individuals[0]!.parentage!.uncertainParents![0]).not.toHaveProperty('basis')
  })
})

describe("uncertain parents as alternative branches (uncertainParents: 'branches')", () => {
  // Made-up litter: a pup whose sire is one of two visible males, one private male, or (5%) someone not recorded;
  // its dam is known and is herself a daughter of one of the candidate sires. A second pup's dam is known only as
  // private or unrecorded candidates. Two clutchmates share a wild sire.
  const litter = normalizePedigree({
    schemaVersion: 1,
    individuals: [
      { id: 'gs', label: 'Grandsire' },
      { id: 's1', label: 'Sire one', identifier: 'REG-M-0001', parentage: { parents: [{ individual: 'gs', role: 'father' }] } },
      { id: 's2', label: 'Sire two' },
      { id: 'h', label: 'Hidden male', data: { private: true } },
      { id: 'dam', label: 'Dam', parentage: { parents: [{ individual: 's1', role: 'father' }] } },
      { id: 'pup', label: 'Pup', parentage: { parents: [{ individual: 'dam', role: 'mother' }], uncertainParents: [{
        role: 'father', basis: 'multi-sire mating',
        candidates: [{ individual: 's1', probability: 0.5 }, { individual: 's2', probability: 0.2 }, { individual: 'h', probability: 0.25 }],
      }] } },
      { id: 'lone', label: 'Lone', parentage: { parents: [], uncertainParents: [{ role: 'mother', kind: 'wild', candidates: [{ individual: 'h', probability: 0.6 }, { individual: 'gone', probability: 0.3 }] }] } },
      { id: 'k1', label: 'Kit one', parentage: { parents: [], uncertainParents: [{ role: 'father', candidates: [], kind: 'wild', shared: 'WILD1' }] } },
      { id: 'k2', label: 'Kit two', parentage: { parents: [], uncertainParents: [{ role: 'father', candidates: [], kind: 'wild', shared: 'WILD1' }] } },
    ],
  })
  const branches = (focalId: string, extra: Partial<Parameters<typeof projectPedigree>[1]> = {}) => projectPedigree(litter, { view: 'pedigree', focalId, uncertainParents: 'branches', ...extra })

  it('is opt-in: by default, and with "placeholder", every view projects exactly as before', () => {
    for (const focalId of ['pup', 'lone', 'k1'])
      for (const view of ['pedigree', 'hourglass', 'fan', 'maternal', 'paternal', 'compact', 'inbreeding'] as const) {
        const before = projectPedigree(litter, { view, focalId })
        expect(projectPedigree(litter, { view, focalId, uncertainParents: 'placeholder' })).toEqual(before)
        expect(before.occurrences.some((o) => o.candidate)).toBe(false)
        expect(before.edges.some((e) => e.uncertain || e.probability !== undefined)).toBe(false)
      }
    expect(uncertainOf(projectPedigree(litter, { view: 'pedigree', focalId: 'pup' })).map((x) => x.label)).toEqual(['Possible fathers'])
  })

  it('draws each visible candidate as its own parent occurrence, and the private ones and the remainder as one placeholder each', () => {
    const p = branches('pup')
    const candidates = p.occurrences.filter((o) => o.candidate)
    expect(candidates.map((o) => [o.individualId, o.generation, o.candidate])).toEqual([
      ['s1', 1, { role: 'father', probability: 0.5, basis: 'multi-sire mating' }],
      ['s2', 1, { role: 'father', probability: 0.2, basis: 'multi-sire mating' }],
    ])
    // Real records, so a host can link them.
    expect(p.individuals.s1!.label).toBe('Sire one')
    const parts = uncertainOf(p)
    expect(parts.map((x) => [x.label, uncertainSublabel(x.d)])).toEqual([
      ['Possible father', '1 private, 25% · multi-sire mating'],
      ['Possible father', 'other, 5% · multi-sire mating'],
    ])
    expect(parts[1]!.d.branch).toMatchObject({ part: 'remainder', other: true })
    expect(parts[1]!.d.branch!.probability).toBeCloseTo(0.05, 10)
    // Every branch hangs off the pup on a connector marked uncertain, with its chance; the chances add up to 1.
    const pupOcc = p.occurrences.find((o) => o.individualId === 'pup')!.occurrenceId
    const branchEdges = p.edges.filter((e) => e.uncertain)
    expect(branchEdges).toHaveLength(4)
    for (const e of branchEdges) expect([e.target, e.role]).toEqual([pupOcc, 'father'])
    expect(branchEdges.reduce((s, e) => s + e.probability!, 0)).toBeCloseTo(1, 10)
    expect(branchEdges.map((e) => e.probability)).toEqual([0.5, 0.2, 0.25, expect.closeTo(0.05, 10)])
    // The known dam's link is unchanged.
    expect(p.edges.find((e) => e.role === 'mother')).not.toHaveProperty('uncertain')
  })

  it("never names, links or draws a candidate the reader can't see", () => {
    const p = branches('pup')
    expect(p.occurrences.map((o) => o.individualId)).not.toContain('h')
    expect(p.individuals.h).toBeUndefined()
    // Nothing the view adds names it. (The pup's own record is the host's to filter, as for known parents.)
    const { pup: _own, ...drawn } = p.individuals
    expect(JSON.stringify({ ...p, individuals: drawn })).not.toMatch(/Hidden male|"h"/)
  })

  it("doesn't follow a candidate's own ancestry, but a candidate who is also a known ancestor is expanded there", () => {
    const sep = branches('pup')
    // s1 appears twice: as a possible father (not followed) and as the dam's father (followed to gs).
    const s1 = sep.occurrences.filter((o) => o.individualId === 's1')
    expect(s1.map((o) => [o.generation, Boolean(o.candidate), o.repeated])).toEqual([[1, true, true], [2, false, true]])
    const gsEdges = sep.edges.filter((e) => e.source.startsWith('gs#'))
    expect(gsEdges.map((e) => e.target)).toEqual([s1.find((o) => !o.candidate)!.occurrenceId])
    // Merge mode keeps the candidate apart, so the known ancestor still expands.
    const merged = branches('pup', { occurrenceMode: 'merge' })
    expect(merged.occurrences.filter((o) => o.individualId === 's1')).toHaveLength(2)
    expect(merged.occurrences.some((o) => o.individualId === 'gs')).toBe(true)
    // Without the known link, the candidate's parents never appear.
    expect(branches('pup', { ancestorDepth: 1 }).occurrences.some((o) => o.individualId === 'gs')).toBe(false)
  })

  it('a slot with only private or unrecorded candidates looks exactly as by default', () => {
    expect(branches('lone')).toEqual(projectPedigree(litter, { view: 'pedigree', focalId: 'lone' }))
    const [only] = uncertainOf(branches('lone'))
    expect([only!.label, nodeSublabel(branches('lone').individuals[only!.o.individualId])]).toEqual(['Possible mothers', '2 private · wild 10%'])
  })

  it('shared wild keys are one placeholder for clutchmates, as by default', () => {
    for (const focalId of ['k1', 'k2']) expect(branches(focalId, { occurrenceMode: 'merge' })).toEqual(projectPedigree(litter, { view: 'pedigree', focalId, occurrenceMode: 'merge' }))
    expect(uncertainOf(branches('k1'))[0]!.o.individualId).toBe(uncertainOf(branches('k2'))[0]!.o.individualId)
  })

  it('keeps maternal and paternal lines to their role, and lays branches out like any node, with their marks', () => {
    expect(branches('pup', { view: 'maternal' }).occurrences.some((o) => o.candidate || o.uncertain)).toBe(false)
    expect(branches('pup', { view: 'paternal' }).occurrences.filter((o) => o.candidate)).toHaveLength(2)
    const p = branches('pup')
    const layout = layoutSync(p)
    expect(layout.nodes).toHaveLength(p.occurrences.length)
    expect(layout.edges.filter((e) => e.uncertain).map((e) => Math.round(e.probability! * 100))).toEqual([50, 20, 25, 5])
    expect(layoutSync(projectPedigree(litter, { view: 'pedigree', focalId: 'pup' })).edges.some((e) => 'probability' in e || 'uncertain' in e)).toBe(false)
  })

  it('words a candidate for its spoken name', () => {
    const c = branches('pup').occurrences.find((o) => o.individualId === 's1' && o.candidate)!.candidate!
    expect(candidateWords(c)).toBe('possible father, 50%, multi-sire mating')
    expect(candidateWords({ role: null, probability: 0.7, basis: null }, 'Possible')).toBe('Possible parent, 70%')
  })

  it('reads the document without changing it', () => {
    const before = JSON.stringify(litter)
    for (const view of ['pedigree', 'hourglass', 'fan', 'inbreeding'] as const) branches('pup', { view })
    expect(JSON.stringify(litter)).toBe(before)
  })
})
