import { describe, expect, it } from 'vitest'

import {
  cloning,
  humanFamily,
  incomplete,
  invalidCycle,
  multiplePaternityClutch,
  parthenogenesis,
  reptileBreeding,
  selfing,
  sharedAncestors,
  synthetic,
} from '../../../fixtures'
import {
  getAncestors,
  getChildren,
  getCohortMembers,
  getCommonAncestors,
  getDescendants,
  getRelationshipPaths,
  getRepeatedIndividuals,
  getSiblings,
  indexPedigree,
  loadNeighborhood,
  normalizePedigree,
  parsePedigree,
  PedigreeFormatError,
  reproductiveStructure,
  serializePedigree,
  validateParentageChange,
  validatePedigree,
  type Individual,
  type PedigreeDocument,
} from '../src'
import { pedigreeDocumentSchema } from '../src/schema'

// Core's tsconfig has no ambient runtime types, so src can't use Node or DOM globals. Only these tests do.
declare const structuredClone: <T>(value: T) => T
declare const performance: { now(): number }

const codes = (d: PedigreeDocument, complete = true) => validatePedigree(d, { complete }).issues.map((i) => `${i.severity}:${i.code}`).sort()
const ids = (r: { individuals: readonly { id: string }[] }) => r.individuals.map((i) => i.id).sort()

describe('normalization and serialization', () => {
  it('is deterministic, fills unknowns with null and never mutates the input', () => {
    const input = structuredClone(humanFamily)
    const shuffled = { ...input, individuals: [...input.individuals].reverse() }
    const a = normalizePedigree(input)
    expect(normalizePedigree(shuffled)).toEqual(a)
    expect(input).toEqual(humanFamily)
    expect(a.individuals.find((i) => i.id === 'arthur')).toEqual({ id: 'arthur', label: 'Arthur', sex: 'male', parentage: null })
    expect(a.individuals.find((i) => i.id === 'gwen')!.parentage!.parents[0]).toEqual({ individual: 'ellen', role: 'mother' })
  })

  it('keeps unknown modes and roles unknown, and keeps parent order', () => {
    const z = normalizePedigree(incomplete).individuals.find((i) => i.id === 'z')!
    expect(z.parentage).toEqual({ parents: [{ individual: 'm', role: null }, { individual: 'x', role: null }], reproductiveMode: null, cohort: null })
  })

  it('rejects malformed input with a path', () => {
    expect(() => normalizePedigree({ schemaVersion: 1, individuals: [{ id: '' }] })).toThrow(PedigreeFormatError)
    expect(() => normalizePedigree({ schemaVersion: 1, individuals: [{ id: 'a', parentage: { parents: [{ role: 'mother' }] } }] })).toThrow(/parents\[0\]\.individual/)
    expect(() => normalizePedigree({ schemaVersion: 2, individuals: [] })).toThrow(/schema version/)
  })

  it('round-trips through JSON and refuses future schema versions', () => {
    for (const d of [humanFamily, reptileBreeding, parthenogenesis, cloning]) expect(parsePedigree(serializePedigree(d))).toEqual(normalizePedigree(d))
    expect(() => parsePedigree('{"schemaVersion":3,"individuals":[]}')).toThrow(/newer than this package/)
    expect(() => parsePedigree('not json')).toThrow(PedigreeFormatError)
  })

  it('exports a JSON Schema for the document', () => {
    expect(pedigreeDocumentSchema.properties.schemaVersion).toEqual({ const: 1 })
    expect(pedigreeDocumentSchema.properties.individuals.items.properties.parentage.oneOf[0].properties.reproductiveMode.enum).toContain('parthenogenesis')
  })
})

describe('validation', () => {
  it('accepts every valid fixture, whatever the reproductive mode', () => {
    for (const d of [humanFamily, reptileBreeding, parthenogenesis, selfing, cloning, sharedAncestors, multiplePaternityClutch])
      expect(validatePedigree(d).valid).toBe(true)
  })

  it('reports cycles, self-parents and duplicated parents as errors', () => {
    expect(codes(invalidCycle)).toEqual(['error:ANCESTRY_CYCLE', 'error:DUPLICATE_PARENT', 'error:SELF_PARENT'])
    const cycle = validatePedigree(invalidCycle).issues.find((i) => i.code === 'ANCESTRY_CYCLE')!
    expect([...cycle.relatedIds!].sort()).toEqual(['c1', 'c2', 'c3'])
  })

  it('treats incomplete parentage as a notice, never an error', () => {
    expect(codes(reptileBreeding)).toEqual(['notice:INCOMPLETE_PARENTAGE'])
    expect(codes(incomplete)).toEqual([])
  })

  it('reports unresolved references only for complete documents and cohort registries', () => {
    const partial: PedigreeDocument = { schemaVersion: 1, individuals: [{ id: 'a', parentage: { parents: [{ individual: 'ghost' }], cohort: 'k' } }] }
    expect(codes(partial)).toEqual(['error:UNRESOLVED_PARENT'])
    expect(codes(partial, false)).toEqual([])
    expect(codes({ ...partial, cohorts: [] }, false)).toEqual(['error:UNRESOLVED_COHORT'])
  })

  it('flags duplicate IDs, unknown modes and atypical structures', () => {
    const d: PedigreeDocument = {
      schemaVersion: 1,
      individuals: [
        { id: 'a' },
        { id: 'a' },
        { id: 'b' },
        { id: 'c', parentage: { parents: [{ individual: 'a' }, { individual: 'b' }], reproductiveMode: 'parthenogenesis' } },
        { id: 'd', parentage: { parents: [{ individual: 'a' }], reproductiveMode: 'budding' as never } },
      ],
    }
    expect(codes(d)).toEqual(['error:DUPLICATE_ID', 'error:UNKNOWN_REPRODUCTIVE_MODE', 'notice:ATYPICAL_PARENT_COUNT'])
  })

  it('notices a cohort whose members share no recorded parent, and runs host rules', () => {
    const d: PedigreeDocument = {
      schemaVersion: 1,
      individuals: [{ id: 'p' }, { id: 'q' }, { id: 'a', parentage: { parents: [{ individual: 'p' }], cohort: 'k' } }, { id: 'b', parentage: { parents: [{ individual: 'q' }], cohort: 'k' } }],
    }
    expect(codes(d)).toContain('notice:COHORT_WITHOUT_SHARED_PARENT')
    const rule = { id: 'no-a', validate: (i: Individual) => (i.id === 'a' ? [{ severity: 'error' as const, code: 'HOST', message: 'no' }] : []) }
    expect(validatePedigree(d, { rules: [rule] }).valid).toBe(false)
  })

  it('describes reproductive structure without changing parents', () => {
    const p = parthenogenesis.individuals[1]!
    expect(reproductiveStructure(p)).toEqual({ recordedParentCount: 1, reproductiveMode: 'parthenogenesis', typicalStructure: 'single', completeness: 'complete', atypical: false })
    expect(reproductiveStructure(reptileBreeding.individuals.find((i) => i.id === 'sol')!).completeness).toBe('incomplete')
    expect(reproductiveStructure(incomplete.individuals[1]!).completeness).toBe('unspecified')
  })

  it('refuses a parent that already descends from the child, against the stored graph', () => {
    const index = indexPedigree(humanFamily)
    expect(validateParentageChange(index, 'arthur', [{ individual: 'gwen', role: 'father' }]).issues.map((i) => i.code)).toEqual(['PARENT_IS_DESCENDANT'])
    expect(validateParentageChange(index, 'arthur', [{ individual: 'dana' }]).valid).toBe(true)
    expect(validateParentageChange(index, 'arthur', [{ individual: 'nobody' }]).issues[0]!.code).toBe('UNRESOLVED_PARENT')
    expect(validateParentageChange(indexPedigree(synthetic(6, 40)), 'g0-0', [{ individual: 'g5-1' }], { maxIndividuals: 10 }).issues.map((i) => i.code)).toContain(
      'TRAVERSAL_LIMIT',
    )
  })
})

describe('traversal', () => {
  const human = indexPedigree(humanFamily)

  it('walks ancestors and descendants by generation, each identity once', () => {
    expect(getAncestors(human, 'gwen').individuals).toEqual([
      { id: 'ellen', generation: 1 },
      { id: 'frank', generation: 1 },
      { id: 'beatrice', generation: 2 },
      { id: 'arthur', generation: 2 },
      { id: 'dana', generation: 2 },
      { id: 'carlos', generation: 2 },
    ])
    expect(ids(getDescendants(human, 'carlos'))).toEqual(['frank', 'gwen', 'hugo', 'iris'])
    expect(getChildren(human, 'ellen')).toEqual(['gwen', 'hugo', 'iris'])
  })

  it('stops at its bounds and says so', () => {
    expect(getAncestors(human, 'gwen', { maxGenerations: 1 })).toEqual({ individuals: [{ id: 'ellen', generation: 1 }, { id: 'frank', generation: 1 }], truncated: true })
    expect(getAncestors(human, 'gwen', { maxIndividuals: 3 }).truncated).toBe(true)
    expect(getAncestors(human, 'gwen').truncated).toBe(false)
  })

  it('tells full, partial and unresolved siblings apart', () => {
    expect(getSiblings(human, 'gwen')).toEqual({ full: ['hugo'], partial: ['iris'], unresolved: [] })
    // Same mother only: could be full or half siblings. (z is x's own offspring, so not a sibling.)
    expect(getSiblings(indexPedigree(incomplete), 'x')).toEqual({ full: [], partial: [], unresolved: ['y'] })
    // Clutch mates with multiple paternity are not all full siblings.
    expect(getSiblings(indexPedigree(multiplePaternityClutch), 'egg-1')).toEqual({ full: ['egg-3'], partial: ['egg-2'], unresolved: [] })
  })

  it('never lists an ancestor or a descendant as a sibling (backcross)', () => {
    // Ember's mother Tinta is also a daughter of Ember's father Atlas.
    expect(getSiblings(indexPedigree(reptileBreeding), 'ember')).toEqual({ full: [], partial: ['luna', 'pico', 'sol'], unresolved: [] })
    // And from Tinta's side, her offspring Ember (sharing Atlas) is not her half-sibling.
    expect(getSiblings(indexPedigree(reptileBreeding), 'tinta')).toEqual({ full: ['luna', 'pico'], partial: [], unresolved: [] })
  })

  it('keeps cohorts separate from siblings', () => {
    const r = indexPedigree(reptileBreeding)
    expect(getCohortMembers(r, 'clutch-2022')).toEqual(['pico', 'tinta'])
    expect(getSiblings(r, 'tinta').full).toEqual(['luna', 'pico'])
  })

  it('finds common ancestors and relationship paths', () => {
    expect(getCommonAncestors(human, ['gwen', 'iris']).map((a) => a.id)).toEqual(['ellen', 'carlos', 'arthur', 'beatrice'])
    const s = indexPedigree(sharedAncestors)
    const { paths } = getRelationshipPaths(s, 'focal', 'cousin')
    // f1 is reached only through half-a, so it is not a separate line; founder is (via half-a and half-b).
    expect(paths.map((p) => p.ancestor)).toEqual(['half-a', 'founder'])
    expect(paths[0]).toEqual({ ancestor: 'half-a', fromA: ['focal', 'half-a'], fromB: ['cousin', 'half-a'] })
    // Direct line: one is the other's ancestor.
    expect(getRelationshipPaths(human, 'gwen', 'arthur').paths[0]).toEqual({ ancestor: 'arthur', fromA: ['gwen', 'ellen', 'arthur'], fromB: ['arthur'] })
    expect(getRelationshipPaths(human, 'arthur', 'dana').paths).toEqual([])
  })

  it('finds ancestors reached through several lineage paths', () => {
    expect(getRepeatedIndividuals(indexPedigree(sharedAncestors), 'focal').repeated).toEqual([{ id: 'founder', paths: 2 }])
    expect(getRepeatedIndividuals(indexPedigree(reptileBreeding), 'ember').repeated.map((r) => r.id)).toEqual(['rf-sire'])
  })

  it('stays fast and recursion-free on large and deep graphs', () => {
    const big = indexPedigree(synthetic(50, 2000))
    const t = performance.now()
    const r = getAncestors(big, 'g49-0', { maxGenerations: 10, maxIndividuals: 5000 })
    expect(r.individuals.length).toBeGreaterThan(100)
    expect(performance.now() - t).toBeLessThan(500)
    const chain: Individual[] = Array.from({ length: 50_000 }, (_, i) => ({ id: `n${i}`, parentage: i ? { parents: [{ individual: `n${i - 1}` }] } : null }))
    expect(validatePedigree({ schemaVersion: 1, individuals: chain }).valid).toBe(true)
  })
})

describe('repository-backed traversal', () => {
  const store = new Map(reptileBreeding.individuals.map((i) => [i.id, i]))
  let queries = 0
  const repository = {
    getByIds: async (ids: readonly string[]) => {
      queries++
      return ids.flatMap((id) => (store.has(id) && id !== 'rf-dam' ? [store.get(id)!] : []))
    },
    findChildrenOf: async (ids: readonly string[]) => {
      queries++
      return [...store.values()].filter((i) => i.parentage?.parents.some((p) => ids.includes(p.individual)))
    },
  }
  const adapter = {
    getId: (r: Individual) => r.id,
    getParents: (r: Individual) => r.parentage?.parents ?? [],
    getReproductiveMode: (r: Individual) => r.parentage?.reproductiveMode ?? null,
    getCohortId: (r: Individual) => r.parentage?.cohort ?? null,
    getLabel: (r: Individual) => r.label ?? null,
  }

  it('loads a bounded neighborhood in one query per generation and matches in-memory traversal', async () => {
    queries = 0
    const n = await loadNeighborhood(repository, adapter, { focalIds: ['ember'], ancestorDepth: 2 })
    expect(queries).toBe(3)
    // rf-dam is hidden by the repository: reported, not invented.
    expect(n.unavailable).toEqual(['rf-dam'])
    expect(n.document.individuals.map((i) => i.id)).toEqual(['ember', 'rf-sire', 'tinta'])
    expect(validatePedigree(n.document, { complete: false }).valid).toBe(true)
    const memory = getAncestors(indexPedigree(reptileBreeding), 'ember', { maxGenerations: 2 })
    expect(ids(getAncestors(indexPedigree(n.document), 'ember', { maxGenerations: 2 }))).toEqual(ids(memory).filter((id) => id !== 'rf-dam'))
  })

  it('caps loaded individuals', async () => {
    const n = await loadNeighborhood(repository, adapter, { focalIds: ['rf-sire'], ancestorDepth: 0, descendantDepth: 3, maxNodes: 3 })
    expect(n.truncated).toBe(true)
    expect(n.document.individuals).toHaveLength(3)
  })
})

describe('parent terms and birthing events', () => {
  it('resolves presets, custom terms and fallbacks; stored roles are untouched', async () => {
    const { resolveParentTerms, roleLabel } = await import('../src')
    expect(resolveParentTerms(undefined)).toEqual({ maternal: 'Mother', paternal: 'Father' })
    expect(resolveParentTerms('dam-sire')).toEqual({ maternal: 'Dam', paternal: 'Sire' })
    expect(resolveParentTerms({ preset: 'female-male-parent' })).toEqual({ maternal: 'Female parent', paternal: 'Male parent' })
    expect(resolveParentTerms({ maternal: 'Queen', paternal: '' }, 'dam-sire')).toEqual({ maternal: 'Queen', paternal: 'Sire' })
    expect(resolveParentTerms('nonsense')).toEqual({ maternal: 'Mother', paternal: 'Father' })
    const terms = resolveParentTerms('dam-sire')
    expect([roleLabel('mother', terms), roleLabel('father', terms), roleLabel('donor', terms), roleLabel(null, terms)]).toEqual(['Dam', 'Sire', 'Donor', 'Parent'])
  })

  it('treats a cohort as one birthing event: different mothers are noticed, different fathers are fine', () => {
    expect(validatePedigree(multiplePaternityClutch).issues).toEqual([])
    const twoMothers: PedigreeDocument = {
      schemaVersion: 1,
      individuals: [
        { id: 'm1' },
        { id: 'm2' },
        { id: 'a', parentage: { parents: [{ individual: 'm1', role: 'mother' }], cohort: 'k' } },
        { id: 'b', parentage: { parents: [{ individual: 'm2', role: 'mother' }], cohort: 'k' } },
      ],
    }
    expect(validatePedigree(twoMothers).issues.map((i) => i.code)).toEqual(['COHORT_MIXED_BIRTH_PARENTS', 'COHORT_WITHOUT_SHARED_PARENT'])
  })
})

describe('uncertain parents (studbook MULT and UNK)', () => {
  const doc = (extra: Record<string, unknown>[] = [], uncertain: unknown[] = [], parents: unknown[] = []) =>
    normalizePedigree({ schemaVersion: 1, individuals: [{ id: 'dam' }, { id: 's1' }, { id: 's2' }, { id: 'kid', parentage: { parents: [{ individual: 'dam', role: 'mother' }, ...parents], uncertainParents: uncertain } }, ...extra] })
  const codes = (d: ReturnType<typeof doc>) => validatePedigree(d).issues.map((i) => i.code)

  it('keeps candidates with probabilities, and leaves documents without them unchanged', () => {
    const d = doc([], [{ role: 'father', candidates: [{ individual: 's1', probability: 0.6 }, { individual: 's2', probability: 0.4 }] }])
    expect(d.individuals.find((i) => i.id === 'kid')!.parentage!.uncertainParents).toEqual([{ role: 'father', candidates: [{ individual: 's1', probability: 0.6 }, { individual: 's2', probability: 0.4 }] }])
    expect(validatePedigree(d).valid).toBe(true)
    expect('uncertainParents' in doc().individuals.find((i) => i.id === 'kid')!.parentage!).toBe(false)
  })

  it('accepts an explicit unknown (no candidates) and a remainder left unknown', () => {
    expect(validatePedigree(doc([], [{ role: 'father', candidates: [] }])).valid).toBe(true)
    expect(validatePedigree(doc([], [{ role: 'father', candidates: [{ individual: 's1', probability: 0.5 }] }])).valid).toBe(true)
  })

  it('never counts candidates as parents', () => {
    const d = doc([], [{ role: 'father', candidates: [{ individual: 's1', probability: 1 }] }])
    expect(d.individuals.find((i) => i.id === 'kid')!.parentage!.parents.map((p) => p.individual)).toEqual(['dam'])
  })

  it('refuses bad probabilities, duplicates, the child itself, a recorded parent, a missing one, a descendant and a role both known and uncertain', () => {
    expect(codes(doc([], [{ role: 'father', candidates: [{ individual: 's1', probability: 0.7 }, { individual: 's2', probability: 0.5 }] }]))).toContain('CANDIDATE_PROBABILITY_SUM')
    expect(codes(doc([], [{ role: 'father', candidates: [{ individual: 's1', probability: 0 }] }]))).toContain('CANDIDATE_PROBABILITY')
    expect(codes(doc([], [{ role: 'father', candidates: [{ individual: 's1', probability: 0.3 }, { individual: 's1', probability: 0.3 }] }]))).toContain('DUPLICATE_CANDIDATE')
    expect(codes(doc([], [{ role: 'father', candidates: [{ individual: 'kid', probability: 0.5 }] }]))).toContain('SELF_PARENT')
    expect(codes(doc([], [{ role: 'father', candidates: [{ individual: 'dam', probability: 0.5 }] }]))).toContain('CANDIDATE_IS_PARENT')
    expect(codes(doc([], [{ role: 'father', candidates: [{ individual: 'ghost', probability: 0.5 }] }]))).toContain('UNRESOLVED_PARENT')
    expect(codes(doc([{ id: 'grandkid', parentage: { parents: [{ individual: 'kid', role: 'mother' }] } }], [{ role: 'father', candidates: [{ individual: 'grandkid', probability: 0.5 }] }]))).toContain('ANCESTRY_CYCLE')
    expect(codes(doc([], [{ role: 'father', candidates: [{ individual: 's1', probability: 0.5 }] }], [{ individual: 's2', role: 'father' }]))).toContain('ROLE_KNOWN_AND_UNCERTAIN')
  })

  it('refuses malformed input on reading', () => {
    expect(() => doc([], [{ role: 'father', candidates: [{ individual: 's1', probability: 'high' }] }])).toThrow(/probability/)
    expect(() => doc([], [{ role: 'father' }])).toThrow(/candidates/)
  })
})

describe('wild and shared unknown parents (studbook WILD, WILDn, UNKn)', () => {
  const kid = (slots: unknown[]) => normalizePedigree({ schemaVersion: 1, individuals: [{ id: 'kid', parentage: { parents: [], uncertainParents: slots } }] })
  it('keeps the kind and a key shared by clutchmates', () => {
    const d = kid([{ role: 'mother', kind: 'wild', shared: 'WILD1', candidates: [] }, { role: 'father', kind: 'wild', shared: 'WILD2', candidates: [] }])
    expect(d.individuals[0]!.parentage!.uncertainParents).toEqual([{ role: 'mother', kind: 'wild', shared: 'WILD1', candidates: [] }, { role: 'father', kind: 'wild', shared: 'WILD2', candidates: [] }])
    expect(validatePedigree(d).valid).toBe(true)
  })
  it('notes WILD mixed with UNK on one animal, and refuses an unknown kind', () => {
    expect(validatePedigree(kid([{ role: 'mother', kind: 'wild', candidates: [] }, { role: 'father', candidates: [] }])).issues.map((i) => i.code)).toContain('WILD_AND_UNKNOWN_MIXED')
    expect(() => kid([{ role: 'mother', kind: 'feral', candidates: [] }])).toThrow(/kind/)
  })
})
