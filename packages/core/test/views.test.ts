import { describe, expect, it } from 'vitest'

import { cloning, humanFamily, incomplete, multiplePaternityClutch, parthenogenesis, reptileBreeding, selfing, sharedAncestors, synthetic } from '../../../fixtures'
import { generationLabel, layoutSync, PEDIGREE_VIEWS, projectPedigree, REORDERABLE_VIEWS, relativesByGeneration, type PedigreeDocument, type PedigreeViewProjection } from '../src'

const who = (p: PedigreeViewProjection) => p.occurrences.map((o) => o.individualId).sort()
const codes = (p: PedigreeViewProjection) => p.issues.map((i) => i.code)

describe('views', () => {
  it('pedigree: ancestors to the requested depth, one edge per parent link', () => {
    const p = projectPedigree(humanFamily, { focalId: 'gwen', view: 'pedigree', ancestorDepth: 2 })
    expect(who(p)).toEqual(['arthur', 'beatrice', 'carlos', 'dana', 'ellen', 'frank', 'gwen'])
    expect(p.edges).toHaveLength(6)
    expect(p.individuals.gwen!.label).toBe('Gwen')
    expect(p.structures.gwen).toMatchObject({ reproductiveMode: 'sexual', completeness: 'complete' })
    expect(projectPedigree(humanFamily, { focalId: 'gwen', view: 'pedigree', ancestorDepth: 1 }).truncated).toBe(true)
    const withSiblings = projectPedigree(humanFamily, { focalId: 'gwen', view: 'pedigree', ancestorDepth: 1, includeSiblings: true })
    expect(who(withSiblings)).toEqual(['ellen', 'frank', 'gwen', 'hugo', 'iris'])
    // Backcross: Tinta is Ember's mother and a daughter of Ember's father; she is not a sibling.
    const backcross = projectPedigree(reptileBreeding, { focalId: 'ember', view: 'pedigree', ancestorDepth: 1, includeSiblings: true })
    expect(backcross.occurrences.filter((o) => o.generation === 0).map((o) => o.individualId).sort()).toEqual(['ember', 'luna', 'pico', 'sol'])
  })

  it('separate, merge and hybrid treat a repeated ancestor differently but keep one identity', () => {
    const view = (occurrenceMode: 'separate' | 'merge' | 'hybrid') =>
      projectPedigree(sharedAncestors, { focalId: 'focal', view: 'pedigree', ancestorDepth: 2, occurrenceMode })
    const founder = (p: PedigreeViewProjection) => p.occurrences.filter((o) => o.individualId === 'founder')
    expect(founder(view('separate'))).toHaveLength(2)
    expect(founder(view('separate')).every((o) => o.repeated)).toBe(true)
    expect(founder(view('merge'))).toHaveLength(1)
    expect(view('merge').edges.filter((e) => e.source === 'founder#0')).toHaveLength(2)
    const hybrid = founder(view('hybrid'))
    expect(hybrid[1]!.collapsedInto).toBe(hybrid[0]!.occurrenceId)
  })

  it('fan: ancestors in rings, each parent taking a share of its child’s arc', () => {
    const p = projectPedigree(humanFamily, { focalId: 'gwen', view: 'fan', ancestorDepth: 2 })
    const l = layoutSync(p)
    expect(l.kind).toBe('radial')
    const arc = (id: string) => l.nodes.find((n) => n.occurrenceId === `${id}#0`)!.arc!
    expect(arc('frank').startAngle).toBeLessThan(arc('ellen').startAngle) // father, then mother
    expect(arc('frank').endAngle - arc('frank').startAngle).toBeCloseTo((arc('gwen').endAngle - arc('gwen').startAngle) / 2)
    expect(arc('carlos').innerRadius).toBe(arc('frank').outerRadius)
  })

  it('ahnentafel: numbers by configured roles; other contributors stay unnumbered with a notice', () => {
    const p = projectPedigree(humanFamily, { focalId: 'gwen', view: 'ahnentafel', ancestorDepth: 2 })
    const n = Object.fromEntries(p.occurrences.map((o) => [o.individualId, o.ahnentafel]))
    expect(n).toEqual({ gwen: 1, frank: 2, ellen: 3, carlos: 4, dana: 5, arthur: 6, beatrice: 7 })
    const z = projectPedigree(incomplete, { focalId: 'z', view: 'ahnentafel' })
    expect(codes(z)).toEqual(['UNSUPPORTED_NUMBERING', 'UNSUPPORTED_NUMBERING'])
    expect(z.occurrences.filter((o) => o.ahnentafel === undefined)).toHaveLength(2)
  })

  it('descendants: grouped by generation, other parent and cohort', () => {
    const p = projectPedigree(humanFamily, { focalId: 'carlos', view: 'descendants' })
    expect(who(p)).toEqual(['carlos', 'frank', 'gwen', 'hugo', 'iris'])
    expect(p.occurrences.find((o) => o.individualId === 'gwen')!.generation).toBe(-2)
    expect(p.groups.filter((g) => g.kind === 'other-parent').map((g) => g.label).sort()).toEqual(['dana', 'ellen'])
    const r = projectPedigree(reptileBreeding, { focalId: 'rf-dam', view: 'descendants', descendantDepth: 1 })
    expect(r.groups.filter((g) => g.kind === 'cohort').map((g) => g.label).sort()).toEqual(['2022 clutch', '2024 clutch'])
  })

  it('hourglass: ancestors above, descendants below the focal individual', () => {
    const p = projectPedigree(humanFamily, { focalId: 'frank', view: 'hourglass', ancestorDepth: 1, descendantDepth: 1 })
    expect(Object.fromEntries(p.occurrences.map((o) => [o.individualId, o.generation]))).toEqual({ frank: 0, carlos: 1, dana: 1, gwen: -1, hugo: -1 })
    const l = layoutSync(p)
    const y = (id: string) => l.nodes.find((n) => n.occurrenceId === `${id}#0`)!.y
    expect(y('carlos')).toBeLessThan(y('frank'))
    expect(y('gwen')).toBeGreaterThan(y('frank'))
  })

  it('relatives by generation: every relative once, ancestors first, focal left out', () => {
    const p = projectPedigree(humanFamily, { focalId: 'frank', view: 'hourglass', ancestorDepth: 2, descendantDepth: 2, includeSiblings: true })
    const groups = relativesByGeneration(p)
    expect(groups.map((g) => g.generation)).toEqual([...groups.map((g) => g.generation)].sort((a, b) => b - a))
    expect(groups.flatMap((g) => g.individualIds)).not.toContain('frank')
    const ids = groups.flatMap((g) => g.individualIds)
    expect(new Set(ids).size).toBe(ids.length)
    expect(groups.find((g) => g.generation === 1)).toMatchObject({ kind: 'parents', individualIds: expect.arrayContaining(['carlos', 'dana']) })
    expect(groups.find((g) => g.generation === -1)).toMatchObject({ kind: 'offspring', individualIds: expect.arrayContaining(['gwen', 'hugo']) })
    expect([1, 2, 3, 5, 0, -1, -2, -3, -4].map(generationLabel)).toEqual([
      'Parents',
      'Grandparents',
      'Great-grandparents',
      '3× great-grandparents',
      'Siblings',
      'Offspring',
      'Grand-offspring',
      'Great-grand-offspring',
      '2× great-grand-offspring',
    ])
  })

  it('cohort: members with their own (possibly different) parents', () => {
    const p = projectPedigree(multiplePaternityClutch, { focalId: 'egg-1', view: 'cohort' })
    expect(who(p)).toEqual(['dam', 'egg-1', 'egg-2', 'egg-3', 'sire-1', 'sire-2'])
    expect(p.groups[0]).toMatchObject({ kind: 'cohort', label: 'Clutch 2026-001' })
    expect(p.edges.filter((e) => e.target === 'egg-2#0').map((e) => e.source).sort()).toEqual(['dam#0', 'sire-2#0'])
    expect(codes(projectPedigree(humanFamily, { focalId: 'gwen', view: 'cohort' }))).toEqual(['NO_COHORT'])
  })

  it('relationship: the connecting paths, highlighted; no path is not "unrelated"', () => {
    const p = projectPedigree(sharedAncestors, { focalId: 'focal', view: 'relationship', relatedId: 'cousin' })
    expect(who(p)).toEqual(['cousin', 'focal', 'founder', 'half-a', 'half-b'])
    expect(p.occurrences.every((o) => o.highlighted)).toBe(true)
    expect(p.groups.filter((g) => g.kind === 'path').map((g) => g.label)).toEqual(['half-a', 'founder'])
    const none = projectPedigree(humanFamily, { focalId: 'arthur', view: 'relationship', relatedId: 'dana' })
    expect(codes(none)).toEqual(['NO_DOCUMENTED_RELATIONSHIP'])
  })

  it('timeline: date-free generational layers from the topology', () => {
    const p = projectPedigree(reptileBreeding, { focalId: 'tinta', view: 'timeline' })
    expect(Object.fromEntries(p.occurrences.map((o) => [o.individualId, o.generation]))).toEqual({
      'rf-dam': 0,
      'rf-sire': 0,
      luna: 1,
      pico: 1,
      tinta: 1,
      ember: 2,
      sol: 2,
    })
    expect(p.groups.filter((g) => g.kind === 'generation')).toHaveLength(3)
  })

  it('inbreeding: converging ancestors marked, without coefficients', () => {
    const p = projectPedigree(reptileBreeding, { focalId: 'ember', view: 'inbreeding' })
    expect(p.occurrences.filter((o) => o.repeated).map((o) => o.individualId)).toEqual(['rf-sire'])
    expect(codes(projectPedigree(humanFamily, { focalId: 'gwen', view: 'inbreeding' }))).toEqual(['NO_REPEATED_ANCESTORS'])
  })

  it('population: the connected group, bounded', () => {
    expect(who(projectPedigree(humanFamily, { focalId: 'gwen', view: 'population' }))).toHaveLength(9)
    const big = projectPedigree(synthetic(8, 40), { focalId: 'g4-0', view: 'population', maxNodes: 50 })
    expect(big.occurrences).toHaveLength(50)
    expect(big.truncated).toBe(true)
    expect(codes(big)).toContain('NODE_LIMIT')
  })

  it('compact: three to five generations', () => {
    const deep = synthetic(10, 16)
    const gens = (d: number) => Math.max(...projectPedigree(deep, { focalId: 'g9-0', view: 'compact', ancestorDepth: d }).occurrences.map((o) => o.generation))
    expect(gens(10)).toBe(5)
    expect(gens(1)).toBe(3)
  })

  it('maternal and paternal: follow roles, not sex, and say where the line stops', () => {
    const m = projectPedigree(humanFamily, { focalId: 'gwen', view: 'maternal' })
    expect(who(m)).toEqual(['beatrice', 'ellen', 'gwen'])
    expect(who(projectPedigree(humanFamily, { focalId: 'gwen', view: 'paternal' }))).toEqual(['carlos', 'frank', 'gwen'])
    // A male can be the focal individual of a maternal line.
    expect(who(projectPedigree(humanFamily, { focalId: 'hugo', view: 'maternal' }))).toEqual(['beatrice', 'ellen', 'hugo'])
    expect(codes(projectPedigree(incomplete, { focalId: 'z', view: 'maternal' }))).toEqual(['INCOMPLETE_LINEAGE'])
    expect(who(projectPedigree(parthenogenesis, { focalId: 'p2', view: 'maternal' }))).toEqual(['p0', 'p1', 'p2'])
  })

  it('stops at the node limit and says so', () => {
    const p = projectPedigree(synthetic(12, 64), { focalId: 'g11-0', view: 'pedigree', ancestorDepth: 10, maxNodes: 40 })
    expect(p.occurrences).toHaveLength(40)
    expect(codes(p)).toContain('NODE_LIMIT')
  })

  it('reports a missing focal individual instead of inventing one', () => {
    expect(codes(projectPedigree(humanFamily, { focalId: 'nobody', view: 'pedigree' }))).toEqual(['FOCAL_NOT_FOUND'])
  })
})

describe('layout', () => {
  const fixtures: [PedigreeDocument, string, string?][] = [
    [humanFamily, 'gwen', 'iris'],
    [reptileBreeding, 'ember', 'luna'],
    [sharedAncestors, 'focal', 'cousin'],
    [multiplePaternityClutch, 'egg-1', 'egg-2'],
    [parthenogenesis, 'p2'],
    [selfing, 'plant-b'],
    [cloning, 'clone-2'],
    [incomplete, 'z', 'y'],
  ]

  it('gives every occurrence of every view a non-overlapping, deterministic position', () => {
    for (const [doc, focalId, relatedId] of fixtures)
      for (const view of PEDIGREE_VIEWS)
        for (const orientation of ['vertical', 'horizontal'] as const) {
          const p = projectPedigree(doc, { focalId, view, relatedId, includeSiblings: true })
          const l = layoutSync(p, { orientation })
          expect(l.nodes.length, `${view} ${focalId}`).toBe(p.occurrences.length)
          expect(layoutSync(p, { orientation })).toEqual(l)
          if (l.kind === 'radial') continue
          for (const a of l.nodes)
            for (const b of l.nodes)
              if (a !== b) {
                const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
                expect(overlap, `${view} ${orientation} ${a.occurrenceId}/${b.occurrenceId}`).toBe(false)
              }
          for (const e of l.edges) expect(e.points.length).toBe(4)
          expect(l.bounds.width).toBeGreaterThan(0)
        }
  })

  it('gives each parent group its own connector line, so half-siblings are distinguishable', () => {
    const l = layoutSync(projectPedigree(humanFamily, { focalId: 'carlos', view: 'population' }))
    const laneY = (target: string) => l.edges.find((e) => e.target === target)!.points[1]!.y
    // Gwen and Hugo (Ellen + Frank) share a line; Iris (Ellen + Carlos) gets another.
    expect(laneY('gwen#0')).toBe(laneY('hugo#0'))
    expect(laneY('iris#0')).not.toBe(laneY('gwen#0'))
  })

  it('lays ancestors above the focal individual (vertical) or to one side (horizontal)', () => {
    const p = projectPedigree(humanFamily, { focalId: 'gwen', view: 'pedigree', ancestorDepth: 1 })
    const v = layoutSync(p)
    const h = layoutSync(p, { orientation: 'horizontal' })
    const node = (l: typeof v, id: string) => l.nodes.find((n) => n.occurrenceId === id)!
    expect(node(v, 'ellen#0').y).toBeLessThan(node(v, 'gwen#0').y)
    expect(node(h, 'ellen#0').x).toBeLessThan(node(h, 'gwen#0').x)
    // The focal individual is centered under its parents.
    expect(node(v, 'gwen#0').x).toBeCloseTo((node(v, 'frank#0').x + node(v, 'ellen#0').x) / 2)
  })
})

describe('chosen display order (drag in the explorer)', () => {
  const xs = (l: ReturnType<typeof layoutSync>, ids: string[]) => ids.map((id) => l.nodes.find((n) => n.occurrenceId === id)!.x)
  it('reorders children in descendant branches and leaves the data alone', () => {
    const p = projectPedigree(reptileBreeding, { focalId: 'rf-dam', view: 'descendants', descendantDepth: 1 })
    const before = layoutSync(p)
    const row = before.nodes.filter((n) => p.occurrences.find((o) => o.occurrenceId === n.occurrenceId)!.generation === -1).sort((a, b) => a.x - b.x).map((n) => n.occurrenceId)
    expect(row.length).toBeGreaterThan(1)
    const reversed = [...row].reverse()
    const after = layoutSync(p, { nodeOrder: reversed })
    const ax = xs(after, reversed)
    expect(ax).toEqual([...ax].sort((a, b) => a - b))
    expect(JSON.stringify(p)).toBe(JSON.stringify(projectPedigree(reptileBreeding, { focalId: 'rf-dam', view: 'descendants', descendantDepth: 1 })))
  })

  it('keeps conventions where order is not a choice (ancestors)', () => {
    const p = projectPedigree(humanFamily, { focalId: 'carlos', view: 'pedigree' })
    const ids = p.occurrences.map((o) => o.occurrenceId)
    expect(layoutSync(p, { nodeOrder: [...ids].reverse() })).toEqual(layoutSync(p))
    expect(REORDERABLE_VIEWS.has('pedigree')).toBe(false)
  })
})
