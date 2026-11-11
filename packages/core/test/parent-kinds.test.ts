import { describe, expect, it } from 'vitest'

import { fosterDam, fosterDamBiological, humanFamily, lineBreeding, multiplePaternityClutch, reptileBreeding, sharedAncestors } from '../../../fixtures'
import {
  biologicalParents,
  getBiologicalParents,
  getCommonAncestors,
  getRelationshipPaths,
  getRepeatedIndividuals,
  getSiblings,
  indexPedigree,
  layoutSync,
  normalizePedigree,
  parentLinkWords,
  PedigreeFormatError,
  projectPedigree,
  reproductiveStructure,
  serializeGedcom,
  serializePedigree,
  validatePedigree,
  type PedigreeDocument,
} from '../src'
import { pedigreeDocumentSchema } from '../src/schema'

const withKinds = (d: PedigreeDocument, kind: string): PedigreeDocument => ({
  ...d,
  individuals: d.individuals.map((i) => (i.parentage ? { ...i, parentage: { ...i.parentage, parents: i.parentage.parents.map((p) => ({ ...p, kind })) } } : i)),
})

describe('parent kinds: the model', () => {
  it('keeps a recorded kind and leaves documents without one byte for byte as before', () => {
    const plain = { schemaVersion: 1, individuals: [{ id: 'a' }, { id: 'b', parentage: { parents: [{ individual: 'a', role: 'mother' }] } }] }
    expect(serializePedigree(normalizePedigree(plain))).toBe(
      '{"schemaVersion":1,"individuals":[{"id":"a","label":null,"sex":null,"parentage":null},{"id":"b","label":null,"sex":null,"parentage":{"parents":[{"individual":"a","role":"mother"}],"reproductiveMode":null,"cohort":null}}]}',
    )
    // An explicit null or empty kind is the same as none.
    for (const kind of [null, '']) {
      const d = { ...plain, individuals: [{ id: 'a' }, { id: 'b', parentage: { parents: [{ individual: 'a', role: 'mother', kind }] } }] }
      expect(serializePedigree(normalizePedigree(d))).toBe(serializePedigree(normalizePedigree(plain)))
    }
    for (const d of [humanFamily, reptileBreeding, multiplePaternityClutch]) expect(JSON.stringify(normalizePedigree(d))).not.toMatch(/"kind"/)
    const kept = normalizePedigree({ schemaVersion: 1, individuals: [{ id: 'a' }, { id: 'b', parentage: { parents: [{ individual: 'a', role: 'father', kind: 'legal' }, { individual: 'c', kind: 'surrogate' }] } }] })
    expect(kept.individuals[1]!.parentage!.parents).toEqual([{ individual: 'a', role: 'father', kind: 'legal' }, { individual: 'c', role: null, kind: 'surrogate' }])
  })

  it('refuses a kind that is not text, with its path', () => {
    expect(() => normalizePedigree({ schemaVersion: 1, individuals: [{ id: 'b', parentage: { parents: [{ individual: 'a', kind: 3 }] } }] })).toThrow(PedigreeFormatError)
    expect(() => normalizePedigree({ schemaVersion: 1, individuals: [{ id: 'b', parentage: { parents: [{ individual: 'a', kind: true }] } }] })).toThrow(/parents\[0\]\.kind/)
  })

  it('puts kind in the JSON Schema as optional, nullable text', () => {
    const ref = pedigreeDocumentSchema.properties.individuals.items.properties.parentage.oneOf[0].properties.parents.items
    expect(ref.properties.kind.type).toEqual(['string', 'null'])
    expect(ref.properties.kind.examples).toEqual(['biological', 'legal', 'adoptive', 'social', 'donor'])
    expect(ref.required).toEqual(['individual'])
    expect(ref.additionalProperties).toBe(false)
  })
})

describe('parent kinds: biologicalParents, the one helper for calculations', () => {
  it('counts links with no kind or kind biological, and nothing else', () => {
    const parents = [
      { individual: 'a', role: 'mother' },
      { individual: 'b', role: 'father', kind: 'biological' },
      { individual: 'c', role: 'father', kind: 'legal' },
      { individual: 'd', role: 'mother', kind: 'adoptive' },
      { individual: 'e', role: 'dam', kind: 'social' },
      { individual: 'f', role: 'mother', kind: 'donor' },
      { individual: 'g', role: 'parent', kind: 'godparent' },
      { individual: 'h', role: 'father', kind: null },
    ]
    expect(biologicalParents({ parents }).map((p) => p.individual)).toEqual(['a', 'b', 'h'])
    expect(biologicalParents(null)).toEqual([])
    expect(biologicalParents(undefined)).toEqual([])
  })

  it('returns the recorded list itself when every link is biological, so documents without kinds cost nothing', () => {
    const parentage = normalizePedigree(humanFamily).individuals.find((i) => i.parentage?.parents.length)!.parentage!
    expect(biologicalParents(parentage)).toBe(parentage.parents)
  })

  it('getBiologicalParents reads it from an index', () => {
    const index = indexPedigree(normalizePedigree(fosterDam))
    expect(getBiologicalParents(index, 'pip').map((p) => p.individual)).toEqual(['maya', 'rio'])
    expect(getBiologicalParents(index, 'nobody')).toEqual([])
  })
})

describe('parent kinds: relatedness follows biological links only', () => {
  it('gives the same relatedness for documents without kinds as with every link marked biological', () => {
    for (const d of [humanFamily, sharedAncestors, lineBreeding, reptileBreeding]) {
      const a = indexPedigree(normalizePedigree(d))
      const b = indexPedigree(normalizePedigree(withKinds(d, 'biological')))
      for (const id of a.individuals.keys()) {
        expect(getSiblings(b, id)).toEqual(getSiblings(a, id))
        expect(getRepeatedIndividuals(b, id)).toEqual(getRepeatedIndividuals(a, id))
        for (const other of a.individuals.keys()) {
          expect(getRelationshipPaths(b, id, other)).toEqual(getRelationshipPaths(a, id, other))
          expect(getCommonAncestors(b, [id, other])).toEqual(getCommonAncestors(a, [id, other]))
        }
      }
    }
  })

  it('a foster dam changes no relatedness: siblings, paths, common ancestors and pedigree collapse match the document without her', () => {
    const fostered = indexPedigree(normalizePedigree(fosterDam))
    const plain = indexPedigree(normalizePedigree(fosterDamBiological))
    for (const id of plain.individuals.keys()) {
      expect(getSiblings(fostered, id)).toEqual(getSiblings(plain, id))
      expect(getRepeatedIndividuals(fostered, id)).toEqual(getRepeatedIndividuals(plain, id))
      for (const other of plain.individuals.keys()) {
        expect(getRelationshipPaths(fostered, id, other)).toEqual(getRelationshipPaths(plain, id, other))
        expect(getCommonAncestors(fostered, [id, other])).toEqual(getCommonAncestors(plain, [id, other]))
      }
    }
    // Pip and Sorrel share only the foster dam: not siblings.
    expect(getSiblings(fostered, 'pip')).toEqual({ full: [], partial: [], unresolved: [] })
    expect(getSiblings(fostered, 'sorrel').partial).toEqual(['rio'])
    // Pip's half-sibling parents make Kingston a repeated ancestor; the foster dam (Rio's own mother) doesn't add Saffron.
    expect(getRepeatedIndividuals(fostered, 'pip').repeated).toEqual([{ id: 'kingston', paths: 2 }])
  })

  it('counts biological parents for reproductive structure: a foster dam does not make a sexual birth atypical', () => {
    const pip = normalizePedigree(fosterDam).individuals.find((i) => i.id === 'pip')!
    expect(reproductiveStructure(pip)).toMatchObject({ recordedParentCount: 2, completeness: 'complete', atypical: false })
  })

  it('writes GEDCOM birth families from biological parents only', () => {
    const ged = serializeGedcom(normalizePedigree(fosterDam))
    const plain = serializeGedcom(normalizePedigree(fosterDamBiological))
    expect(ged).toBe(plain)
  })
})

describe('parent kinds: validation', () => {
  const v = (individuals: PedigreeDocument['individuals']) => validatePedigree(normalizePedigree({ schemaVersion: 1, individuals })).issues

  it('a foster dam beside both biological parents is valid and raises nothing', () => {
    expect(validatePedigree(normalizePedigree(fosterDam)).issues).toEqual([])
  })

  it('two biological links in one role is a notice; a legal and a biological father are not', () => {
    const two = v([{ id: 'a' }, { id: 'b' }, { id: 'c', parentage: { parents: [{ individual: 'a', role: 'father' }, { individual: 'b', role: 'father', kind: 'biological' }] } }])
    expect(two).toEqual([
      expect.objectContaining({ severity: 'notice', code: 'DUPLICATE_BIOLOGICAL_ROLE', individualId: 'c', relatedIds: ['a', 'b'], message: expect.stringMatching(/More than one biological father/) }),
    ])
    expect(v([{ id: 'a' }, { id: 'b' }, { id: 'c', parentage: { parents: [{ individual: 'a', role: 'father' }, { individual: 'b', role: 'father', kind: 'legal' }] } }])).toEqual([])
    // Generic roles may repeat (two `parent`s of unknown sex, two donors).
    expect(v([{ id: 'a' }, { id: 'b' }, { id: 'c', parentage: { parents: [{ individual: 'a', role: 'parent' }, { individual: 'b', role: 'parent' }] } }])).toEqual([])
  })

  it('a biological and a non-biological link to the same parent is the existing duplicate-parent error, saying which', () => {
    const issues = v([{ id: 'a' }, { id: 'c', parentage: { parents: [{ individual: 'a', role: 'mother' }, { individual: 'a', role: 'mother', kind: 'legal' }] } }])
    expect(issues.map((i) => [i.severity, i.code])).toEqual([['error', 'DUPLICATE_PARENT']])
    expect(issues[0]!.message).toMatch(/biological and a legal link/)
    // The same link twice keeps its old wording.
    expect(v([{ id: 'a' }, { id: 'c', parentage: { parents: [{ individual: 'a' }, { individual: 'a' }] } }])[0]!.message).toBe('The same parent appears more than once.')
  })

  it('a legal father beside an uncertain father slot, or among its candidates, is not a conflict', () => {
    expect(
      v([
        { id: 'l' },
        { id: 's1' },
        { id: 'k', parentage: { parents: [{ individual: 'l', role: 'father', kind: 'legal' }], uncertainParents: [{ role: 'father', candidates: [{ individual: 's1', probability: 0.5 }, { individual: 'l', probability: 0.5 }] }] } },
      ]),
    ).toEqual([])
    // A biological father still conflicts with an uncertain father slot.
    expect(v([{ id: 'f' }, { id: 'k', parentage: { parents: [{ individual: 'f', role: 'father' }], uncertainParents: [{ role: 'father', candidates: [] }] } }]).map((i) => i.code)).toContain('ROLE_KNOWN_AND_UNCERTAIN')
  })

  it('a cohort with a foster dam is still one birthing event with one mother', () => {
    const issues = validatePedigree(
      normalizePedigree({
        schemaVersion: 1,
        cohorts: [{ id: 'c1' }],
        individuals: [
          { id: 'm' },
          { id: 'f' },
          { id: 'k1', parentage: { parents: [{ individual: 'm', role: 'mother' }], cohort: 'c1' } },
          { id: 'k2', parentage: { parents: [{ individual: 'm', role: 'mother' }, { individual: 'f', role: 'mother', kind: 'social' }], cohort: 'c1' } },
        ],
      }),
    ).issues
    expect(issues.map((i) => i.code)).not.toContain('COHORT_MIXED_BIRTH_PARENTS')
  })

  it('still refuses a cycle made through a legal link', () => {
    const issues = v([
      { id: 'a', parentage: { parents: [{ individual: 'b', role: 'father', kind: 'legal' }] } },
      { id: 'b', parentage: { parents: [{ individual: 'a', role: 'father' }] } },
    ])
    expect(issues.map((i) => i.code)).toContain('ANCESTRY_CYCLE')
  })
})

describe('parent kinds: views', () => {
  const VIEWS = ['pedigree', 'fan', 'ahnentafel', 'descendants', 'hourglass', 'relationship', 'timeline', 'inbreeding', 'population', 'compact', 'maternal', 'paternal'] as const

  it('without kinds, every parentLinks mode projects exactly as by default', () => {
    for (const d of [humanFamily, sharedAncestors, lineBreeding]) {
      const n = normalizePedigree(d)
      const focal = n.individuals.at(-1)!.id
      for (const view of VIEWS) {
        const base = projectPedigree(n, { view, focalId: focal, relatedId: n.individuals[0]!.id, includeSiblings: true })
        expect(base.edges.some((e) => 'kind' in e)).toBe(false)
        for (const parentLinks of ['both', 'biological', 'recorded'] as const)
          expect(projectPedigree(n, { view, focalId: focal, relatedId: n.individuals[0]!.id, includeSiblings: true, parentLinks })).toEqual(base)
      }
    }
  })

  it("'both' (the default) draws the foster link, marked with its kind; layout carries the mark", () => {
    const p = projectPedigree(fosterDam, { view: 'pedigree', focalId: 'pip', ancestorDepth: 1 })
    expect(projectPedigree(fosterDam, { view: 'pedigree', focalId: 'pip', ancestorDepth: 1, parentLinks: 'both' })).toEqual(p)
    const foster = p.edges.find((e) => e.source === 'saffron#0')!
    expect(foster).toMatchObject({ target: 'pip#0', role: 'mother', kind: 'social' })
    expect(p.edges.filter((e) => e.kind)).toHaveLength(1)
    expect(layoutSync(p).edges.find((e) => e.id === foster.id)!.kind).toBe('social')
    expect(layoutSync(p).edges.filter((e) => e.kind)).toHaveLength(1)
  })

  it("'biological' hides the foster link and anyone reached only through it", () => {
    const p = projectPedigree(fosterDam, { view: 'pedigree', focalId: 'pip', ancestorDepth: 1 })
    const b = projectPedigree(fosterDam, { view: 'pedigree', focalId: 'pip', ancestorDepth: 1, parentLinks: 'biological' })
    expect(p.occurrences.map((o) => o.individualId).sort()).toEqual(['maya', 'pip', 'rio', 'saffron'])
    expect(b.occurrences.map((o) => o.individualId).sort()).toEqual(['maya', 'pip', 'rio'])
    expect(b.edges.some((e) => e.kind)).toBe(false)
    // Saffron is still drawn where she's a biological parent (Rio's mother).
    const deeper = projectPedigree(fosterDam, { view: 'pedigree', focalId: 'pip', ancestorDepth: 2, parentLinks: 'biological' })
    expect(deeper.edges.find((e) => e.source.startsWith('saffron#'))!.target).toMatch(/^rio#/)
    // Saffron's descendants view keeps Pip as her grandchild through Rio, but not as a fostered child.
    const down = projectPedigree(fosterDam, { view: 'descendants', focalId: 'saffron', parentLinks: 'biological' })
    expect(down.occurrences.filter((o) => o.individualId === 'pip').map((o) => o.generation)).toEqual([-2])
    expect(projectPedigree(fosterDam, { view: 'descendants', focalId: 'saffron' }).edges.filter((e) => e.kind).map((e) => e.kind)).toEqual(['social'])
  })

  it("'recorded' draws the parents of record: a non-biological link replaces the biological one in its role", () => {
    const r = projectPedigree(fosterDam, { view: 'pedigree', focalId: 'pip', ancestorDepth: 1, parentLinks: 'recorded' })
    expect(r.occurrences.map((o) => o.individualId).sort()).toEqual(['pip', 'rio', 'saffron'])
    expect(r.edges.map((e) => [e.source, e.role, e.kind ?? null]).sort()).toEqual([
      ['rio#0', 'father', null],
      ['saffron#0', 'mother', 'social'],
    ])
    // A role without a non-biological link is untouched, and so is an uncertain slot in another role.
    const legal = normalizePedigree({
      schemaVersion: 1,
      individuals: [
        { id: 'bf' },
        { id: 'lf' },
        { id: 'm' },
        { id: 'k', parentage: { parents: [{ individual: 'bf', role: 'father' }, { individual: 'lf', role: 'father', kind: 'legal' }, { individual: 'm', role: 'mother' }] } },
        { id: 'k2', parentage: { parents: [{ individual: 'lf', role: 'father', kind: 'adoptive' }], uncertainParents: [{ role: 'father', candidates: [] }, { role: 'mother', candidates: [] }] } },
      ],
    })
    const rk = projectPedigree(legal, { view: 'pedigree', focalId: 'k', parentLinks: 'recorded' })
    expect(rk.occurrences.map((o) => o.individualId).sort()).toEqual(['k', 'lf', 'm'])
    const rk2 = projectPedigree(legal, { view: 'pedigree', focalId: 'k2', parentLinks: 'recorded' })
    expect(rk2.occurrences.filter((o) => o.uncertain).map((o) => rk2.individuals[o.individualId]!.label)).toEqual(['Unknown mother'])
    const bk2 = projectPedigree(legal, { view: 'pedigree', focalId: 'k2', parentLinks: 'biological' })
    expect(bk2.occurrences.filter((o) => o.uncertain).map((o) => bk2.individuals[o.individualId]!.label).sort()).toEqual(['Unknown father', 'Unknown mother'])
  })

  it('the inbreeding and relationship views use biological links in every mode', () => {
    for (const parentLinks of ['both', 'recorded', 'biological'] as const) {
      const inb = projectPedigree(fosterDam, { view: 'inbreeding', focalId: 'pip', parentLinks })
      expect(inb.occurrences.filter((o) => o.highlighted).map((o) => o.individualId)).toEqual(['kingston'])
      const rel = projectPedigree(fosterDam, { view: 'relationship', focalId: 'pip', relatedId: 'sorrel', parentLinks })
      // Related only through Rio's mother Saffron, never through the foster link itself.
      expect(rel.groups.filter((g) => g.kind === 'path').map((g) => g.label)).toEqual(['saffron'])
    }
  })

  it('numbers only biological parents in the Ahnentafel and says why the foster dam has none', () => {
    const a = projectPedigree(fosterDam, { view: 'ahnentafel', focalId: 'pip', ancestorDepth: 1 })
    expect(a.occurrences.map((o) => [o.individualId, o.ahnentafel ?? null])).toEqual([
      ['pip', 1],
      ['maya', 3],
      ['rio', 2],
      ['saffron', null],
    ])
    expect(a.issues).toEqual([expect.objectContaining({ code: 'UNSUPPORTED_NUMBERING', message: 'A social mother has no Ahnentafel number; shown unnumbered.' })])
  })

  it('names a link by kind and role', () => {
    expect(parentLinkWords({ kind: 'legal', role: 'father' })).toBe('legal father')
    expect(parentLinkWords({ kind: 'social', role: null })).toBe('social parent')
    expect(parentLinkWords({ role: 'dam' })).toBe('dam')
  })
})
