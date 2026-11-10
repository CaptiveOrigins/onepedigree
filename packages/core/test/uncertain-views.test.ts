import { describe, expect, it } from 'vitest'
import { layoutSync, nodeSublabel, normalizePedigree, projectPedigree, type UncertainParentDisplay } from '../src/index.js'

// Made-up clutch: two siblings with the same wild-caught sire (WILD1), a dam known only as candidates (MULT),
// one of them private, with 10% left over as unknown; and an animal whose mother is simply unknown (UNK).
const doc = normalizePedigree({
  schemaVersion: 1,
  individuals: [
    { id: 'd1', label: 'Ruby', identifier: 'CO-A-0001' },
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
    expect(mult.d.candidates).toEqual([{ individual: 'd1', label: 'Ruby (CO-A-0001)', probability: 0.6 }])
    expect(mult.d.hiddenCandidates).toBe(1)
    expect(mult.d.remainder!.kind).toBe('unknown')
    expect(mult.d.remainder!.probability).toBeCloseTo(0.1, 10)
    const sub = nodeSublabel(p.individuals[mult.o.individualId])
    expect(sub).toBe('Ruby (CO-A-0001) 60% · 1 private · unknown 10%')
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
