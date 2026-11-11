import { getDescendants, getRelationshipPaths } from './graph'
import { indexPedigree, reproductiveStructure, type PedigreeIndex } from './normalize'
import type { CohortId, Individual, IndividualId, PedigreeDocument, PedigreeIssue, ReproductiveStructure, UncertainParent } from './types'
import { nameWithIdentifier } from './layout'

export type PedigreeViewId =
  | 'pedigree'
  | 'fan'
  | 'ahnentafel'
  | 'descendants'
  | 'hourglass'
  | 'cohort'
  | 'relationship'
  | 'timeline'
  | 'inbreeding'
  | 'population'
  | 'compact'
  | 'maternal'
  | 'paternal'

export const PEDIGREE_VIEWS: readonly PedigreeViewId[] = [
  'pedigree',
  'fan',
  'ahnentafel',
  'descendants',
  'hourglass',
  'cohort',
  'relationship',
  'timeline',
  'inbreeding',
  'population',
  'compact',
  'maternal',
  'paternal',
]

/** How an individual reached by several lineage paths is shown. */
export type OccurrenceMode = 'merge' | 'separate' | 'hybrid'

export type LineageRoleConfig = { maternal: readonly string[]; paternal: readonly string[] }
export const DEFAULT_LINEAGE_ROLES: LineageRoleConfig = { maternal: ['mother', 'dam', 'egg'], paternal: ['father', 'sire', 'sperm'] }

export type ProjectionOptions = {
  focalId: IndividualId
  view: PedigreeViewId
  ancestorDepth?: number
  descendantDepth?: number
  includeSiblings?: boolean
  includeCohortMembers?: boolean
  occurrenceMode?: OccurrenceMode
  maxNodes?: number
  /** Second individual of the relationship view. */
  relatedId?: IndividualId
  /** Cohort of the cohort view (default: the focal individual's). */
  cohortId?: CohortId
  lineageRoles?: LineageRoleConfig
  /**
   * How parents known only as candidates (studbook MULT) are drawn. `placeholder` (default): one made-up node per slot
   * listing the candidates and their chances. `branches`: each candidate the reader can see is drawn as its own parent
   * occurrence of the real individual, side by side, on a connector marked `uncertain` with its `probability`; private
   * candidates and the unrecorded remainder are one placeholder each. Display only: no calculation reads this.
   */
  uncertainParents?: UncertainParentsMode
}

export type UncertainParentsMode = 'placeholder' | 'branches'

export type IndividualOccurrence = {
  occurrenceId: string
  individualId: IndividualId
  /** 0 focal, positive ancestors, negative descendants; timeline/population: topological layer. */
  generation: number
  /** Identities from the focal individual (or layer root) to this occurrence. */
  lineagePath: readonly IndividualId[]
  /** The identity appears more than once in this projection (or is reached by several paths). */
  repeated: boolean
  /** Hybrid mode: a repeat that is not expanded; points at the expanded occurrence. */
  collapsedInto?: string
  /** Ahnentafel number (1 = focal). */
  ahnentafel?: number
  /** Relationship view: part of a connecting path; inbreeding view: on a converging path. */
  highlighted?: boolean
  /**
   * A parent that isn't known for certain (studbook MULT, WILD or UNK), drawn as a placeholder. Its individual is made
   * up for the view (see `UncertainParentDisplay` in its `data.uncertain`): don't link to it or look it up elsewhere.
   */
  uncertain?: true
  /**
   * `uncertainParents: 'branches'`: this is a real individual drawn as one possible parent of the child it's linked to,
   * with that slot's role, its chance and where the chances come from. Its own parents aren't drawn.
   */
  candidate?: UncertainCandidate
}

export type UncertainCandidate = { role: string | null; probability: number; basis: string | null }

/** What a placeholder for an uncertain parent shows. Candidates the reader can't see are only counted. */
export type UncertainParentDisplay = {
  kind: 'multiple' | 'wild' | 'unknown'
  role: string | null
  /** Siblings share this one unknown parent (studbook WILD1, UNK1). */
  shared: string | null
  /** Where the candidates come from, as recorded ("multi-sire mating"). */
  basis: string | null
  candidates: readonly { individual: IndividualId; label: string; probability: number }[]
  hiddenCandidates: number
  /** Probability left over for an unrecorded parent, and what it is. */
  remainder: { probability: number; kind: 'wild' | 'unknown' } | null
  /**
   * `uncertainParents: 'branches'`: this placeholder is one part of a slot drawn as alternative branches, either its
   * private candidates (counted in `hiddenCandidates`) or the unrecorded remainder (`remainder`), and its share.
   * `other` marks a remainder whose kind wasn't recorded.
   */
  branch?: { part: 'private' | 'remainder'; probability: number; other?: true }
}

export type ProjectedEdge = {
  id: string
  /** Parent occurrence. */
  source: string
  /** Child occurrence. */
  target: string
  role: string | null
  /** `uncertainParents: 'branches'`: the parent is one of several possibilities, with this chance. Draw it dashed and labelled. */
  uncertain?: true
  probability?: number
}

export type ProjectionGroup = { id: string; kind: 'cohort' | 'generation' | 'other-parent' | 'path'; label: string | null; occurrenceIds: readonly string[] }

export type PedigreeViewProjection = {
  view: PedigreeViewId
  focalId: IndividualId
  occurrenceMode: OccurrenceMode
  occurrences: readonly IndividualOccurrence[]
  edges: readonly ProjectedEdge[]
  /** The records the occurrences refer to (each once). */
  individuals: Readonly<Record<IndividualId, Individual>>
  /** Reproductive structure per individual with recorded parentage, for rendering junctions. */
  structures: Readonly<Record<IndividualId, ReproductiveStructure>>
  groups: readonly ProjectionGroup[]
  issues: readonly PedigreeIssue[]
  truncated: boolean
}

const notice = (code: string, message: string, extra: Partial<PedigreeIssue> = {}): PedigreeIssue => ({ severity: 'notice', code, message, ...extra })

/** Accumulates occurrences and edges with node limits and occurrence-mode handling. */
export class ProjectionBuilder {
  readonly occurrences: IndividualOccurrence[] = []
  readonly edges: ProjectedEdge[] = []
  readonly groups: ProjectionGroup[] = []
  readonly issues: PedigreeIssue[] = []
  truncated = false
  private readonly byIdentity = new Map<IndividualId, string[]>()
  private readonly edgeKeys = new Set<string>()
  private readonly placeholders = new Map<IndividualId, Individual>()
  private readonly candidateCounts = new Map<IndividualId, number>()

  constructor(
    readonly index: PedigreeIndex,
    readonly options: ProjectionOptions & { occurrenceMode: OccurrenceMode; maxNodes: number },
  ) {}

  get full() {
    return this.occurrences.length >= this.options.maxNodes
  }

  firstOccurrence(id: IndividualId) {
    return this.byIdentity.get(id)?.[0]
  }

  /**
   * An occurrence for `id`. Merge: one per identity. Separate: one per call.
   * Hybrid: later calls return a collapsed repeat (`expand: false`).
   */
  add(id: IndividualId, generation: number, lineagePath: readonly IndividualId[], extra: Partial<IndividualOccurrence> = {}) {
    const existing = this.byIdentity.get(id)
    if (existing && this.options.occurrenceMode === 'merge') return { occurrenceId: existing[0]!, expand: false, added: false }
    if (this.stopAtLimit()) return null
    const occurrenceId = `${id}#${existing?.length ?? 0}`
    const collapsed = existing && this.options.occurrenceMode === 'hybrid' ? existing[0] : undefined
    this.occurrences.push({ occurrenceId, individualId: id, generation, lineagePath, repeated: false, ...(collapsed ? { collapsedInto: collapsed } : {}), ...extra })
    this.byIdentity.set(id, [...(existing ?? []), occurrenceId])
    return { occurrenceId, expand: !collapsed, added: true }
  }

  private stopAtLimit() {
    if (!this.full) return false
    if (!this.truncated) this.issues.push(notice('NODE_LIMIT', `The view stops at ${this.options.maxNodes} individuals.`))
    this.truncated = true
    return true
  }

  edge(source: string, target: string, role: string | null, extra: Pick<ProjectedEdge, 'uncertain' | 'probability'> = {}) {
    const key = `${source}>${target}`
    if (this.edgeKeys.has(key)) return
    this.edgeKeys.add(key)
    this.edges.push({ id: `e${this.edges.length}`, source, target, role, ...extra })
  }

  /**
   * An occurrence of a real individual as one possible parent (`uncertainParents: 'branches'`). Always its own
   * occurrence, whatever the occurrence mode, so a candidate is never merged with (and never stops the expansion of)
   * the same individual drawn as a known ancestor elsewhere. Never expanded.
   */
  addCandidate(id: IndividualId, generation: number, lineagePath: readonly IndividualId[], candidate: UncertainCandidate) {
    if (this.stopAtLimit()) return null
    const n = this.candidateCounts.get(id) ?? 0
    this.candidateCounts.set(id, n + 1)
    const occurrenceId = `${id}#candidate${n}`
    this.occurrences.push({ occurrenceId, individualId: id, generation, lineagePath, repeated: false, candidate })
    return { occurrenceId }
  }

  /**
   * A placeholder occurrence for one uncertain parent slot of `childId`. A slot with a `shared` key is one individual
   * for every sibling (merged where the occurrence mode merges). Placeholders are never expanded further.
   */
  addUncertain(childId: IndividualId, slot: UncertainParent, slotIndex: number, generation: number, lineagePath: readonly IndividualId[]) {
    const id = this.placeholderId(childId, slot, slotIndex)
    if (!this.placeholders.has(id)) {
      const visible = this.visibleCandidates(slot)
      const total = slot.candidates.reduce((sum, c) => sum + c.probability, 0)
      const kind = slot.kind ?? 'unknown'
      const display: UncertainParentDisplay = {
        kind: slot.candidates.length ? 'multiple' : kind,
        role: slot.role ?? null,
        shared: slot.shared ?? null,
        basis: slot.basis ?? null,
        candidates: visible.map((c) => {
          const ind = this.index.individuals.get(c.individual)!
          return { individual: c.individual, label: nameWithIdentifier(ind.label, ind.identifier) || ind.id, probability: c.probability }
        }),
        hiddenCandidates: slot.candidates.length - visible.length,
        remainder: slot.candidates.length && total < 1 - 1e-9 ? { probability: 1 - total, kind } : null,
      }
      const role = slot.role ? ` ${slot.role}` : ' parent'
      const label = display.kind === 'multiple' ? `Possible${role}s` : display.kind === 'wild' ? `Wild${role}` : `Unknown${role}`
      this.placeholders.set(id, { id, label, data: { uncertain: display } })
    }
    return this.add(id, generation, [...lineagePath, id], { uncertain: true })
  }

  /** Candidates the reader may see: in the document and not private. Every other candidate is only ever counted. */
  visibleCandidates(slot: UncertainParent) {
    return slot.candidates.filter((c) => {
      const ind = this.index.individuals.get(c.individual)
      return ind && !ind.data?.private
    })
  }

  private placeholderId(childId: IndividualId, slot: UncertainParent, slotIndex: number, suffix = '') {
    let id = (slot.shared ? `~uncertain:shared:${slot.role ?? ''}:${slot.shared}` : `~uncertain:${childId}:${slotIndex}`) + suffix
    while (this.index.individuals.has(id)) id = `~${id}`
    return id
  }

  /**
   * One uncertain slot as alternative branches (`uncertainParents: 'branches'`): each visible candidate as its own
   * occurrence, then one placeholder for the private candidates and one for the unrecorded remainder, each on a
   * connector marked `uncertain` with its chance. A slot without visible candidates is one placeholder, as by default.
   * Returns false when the node limit stopped it.
   */
  addUncertainBranches(child: { occurrenceId: string; id: IndividualId; path: readonly IndividualId[] }, slot: UncertainParent, slotIndex: number, generation: number) {
    const role = slot.role ?? null
    const visible = this.visibleCandidates(slot)
    if (!visible.length) {
      const r = this.addUncertain(child.id, slot, slotIndex, generation, child.path)
      if (!r) return false
      this.edge(r.occurrenceId, child.occurrenceId, role)
      return true
    }
    // A candidate's own ancestry isn't followed: each candidate would bring a whole tree, the view would multiply with
    // every uncertain slot above it, and lines from different hypotheses would mix in one drawing as if all were true.
    for (const c of visible) {
      const r = this.addCandidate(c.individual, generation, [...child.path, c.individual], { role, probability: c.probability, basis: slot.basis ?? null })
      if (!r) return false
      this.edge(r.occurrenceId, child.occurrenceId, role, { uncertain: true, probability: c.probability })
    }
    const hidden = slot.candidates.filter((c) => !visible.includes(c))
    const hiddenShare = hidden.reduce((sum, c) => sum + c.probability, 0)
    const total = slot.candidates.reduce((sum, c) => sum + c.probability, 0)
    const label = `Possible ${slot.role ?? 'parent'}`
    const base = { kind: 'multiple' as const, role, shared: slot.shared ?? null, basis: slot.basis ?? null, candidates: [] }
    const parts: { suffix: string; probability: number; display: UncertainParentDisplay }[] = []
    if (hidden.length)
      parts.push({ suffix: ':private', probability: hiddenShare, display: { ...base, hiddenCandidates: hidden.length, remainder: null, branch: { part: 'private', probability: hiddenShare } } })
    if (total < 1 - 1e-9) {
      const remainder = { probability: 1 - total, kind: slot.kind ?? 'unknown' }
      parts.push({ suffix: ':remainder', probability: remainder.probability, display: { ...base, hiddenCandidates: 0, remainder, branch: { part: 'remainder', probability: remainder.probability, ...(slot.kind ? {} : { other: true as const }) } } })
    }
    for (const part of parts) {
      const id = this.placeholderId(child.id, slot, slotIndex, part.suffix)
      if (!this.placeholders.has(id)) this.placeholders.set(id, { id, label, data: { uncertain: part.display } })
      const r = this.add(id, generation, [...child.path, id], { uncertain: true })
      if (!r) return false
      this.edge(r.occurrenceId, child.occurrenceId, role, { uncertain: true, probability: part.probability })
    }
    return true
  }

  build(view: PedigreeViewId): PedigreeViewProjection {
    const count = new Map<IndividualId, number>()
    for (const o of this.occurrences) count.set(o.individualId, (count.get(o.individualId) ?? 0) + 1)
    for (const o of this.occurrences) if (count.get(o.individualId)! > 1) o.repeated = true
    const individuals: Record<IndividualId, Individual> = {}
    const structures: Record<IndividualId, ReproductiveStructure> = {}
    for (const o of this.occurrences) {
      const ind = this.index.individuals.get(o.individualId) ?? this.placeholders.get(o.individualId)
      if (!ind) continue
      individuals[ind.id] = ind
      if (ind.parentage) structures[ind.id] = reproductiveStructure(ind)
    }
    return {
      view,
      focalId: this.options.focalId,
      occurrenceMode: this.options.occurrenceMode,
      occurrences: this.occurrences,
      edges: this.edges,
      individuals,
      structures,
      groups: this.groups,
      issues: this.issues,
      truncated: this.truncated,
    }
  }
}

/** Ancestors of the focal occurrence, generation by generation (breadth-first, so node limits cut the farthest first). */
export function addAncestors(b: ProjectionBuilder, focal: { occurrenceId: string; id: IndividualId }, depth: number, filter?: (role: string | null) => boolean) {
  let frontier = [{ ...focal, path: [focal.id] as IndividualId[] }]
  for (let g = 1; g <= depth && frontier.length; g++) {
    const next: typeof frontier = []
    for (const child of frontier)
      for (const p of b.index.parentsOf.get(child.id) ?? []) {
        if (!b.index.individuals.has(p.individual) || child.path.includes(p.individual)) continue
        if (filter && !filter(p.role ?? null)) continue
        const r = b.add(p.individual, g, [...child.path, p.individual])
        if (!r) return
        b.edge(r.occurrenceId, child.occurrenceId, p.role ?? null)
        if (r.expand) next.push({ occurrenceId: r.occurrenceId, id: p.individual, path: [...child.path, p.individual] })
      }
    // Parents known only as candidates, wild or unknown: one placeholder per slot (or, opted in, the visible candidates
    // as alternative branches), not followed further.
    for (const child of frontier)
      for (const [i, slot] of (b.index.individuals.get(child.id)?.parentage?.uncertainParents ?? []).entries()) {
        if (filter && !filter(slot.role ?? null)) continue
        if (b.options.uncertainParents === 'branches') {
          if (!b.addUncertainBranches(child, slot, i, g)) return
          continue
        }
        const r = b.addUncertain(child.id, slot, i, g, child.path)
        if (!r) return
        b.edge(r.occurrenceId, child.occurrenceId, slot.role ?? null)
      }
    frontier = next
    if (g === depth && frontier.some((f) => (b.index.parentsOf.get(f.id) ?? []).some((p) => b.index.individuals.has(p.individual)) || Boolean(b.index.individuals.get(f.id)?.parentage?.uncertainParents?.length))) b.truncated = true
  }
}

/** Descendants of the focal occurrence; each child's other parents are recorded as groups. */
export function addDescendants(b: ProjectionBuilder, focal: { occurrenceId: string; id: IndividualId }, depth: number) {
  // Clutch mates next to each other (then by ID), so cohort markers stay compact.
  const cohortOf = (id: IndividualId) => b.index.individuals.get(id)?.parentage?.cohort ?? '\uffff'
  let frontier = [{ ...focal, path: [focal.id] as IndividualId[] }]
  for (let g = 1; g <= depth && frontier.length; g++) {
    const next: typeof frontier = []
    for (const parent of frontier)
      for (const c of [...(b.index.childrenOf.get(parent.id) ?? [])].sort((x, y) => cohortOf(x).localeCompare(cohortOf(y)) || x.localeCompare(y))) {
        if (parent.path.includes(c)) continue
        const role = (b.index.parentsOf.get(c) ?? []).find((p) => p.individual === parent.id)?.role ?? null
        const r = b.add(c, -g, [...parent.path, c])
        if (!r) return
        b.edge(parent.occurrenceId, r.occurrenceId, role)
        if (r.expand) next.push({ occurrenceId: r.occurrenceId, id: c, path: [...parent.path, c] })
      }
    frontier = next
    if (g === depth && frontier.some((f) => (b.index.childrenOf.get(f.id) ?? []).length)) b.truncated = true
  }
}

/** The focal individual's siblings at generation 0, linked to whichever of their parents are shown. */
function addSiblings(b: ProjectionBuilder) {
  const focalId = b.options.focalId
  const parents = new Set((b.index.parentsOf.get(focalId) ?? []).map((p) => p.individual))
  const siblings = new Set([...parents].flatMap((p) => b.index.childrenOf.get(p) ?? []))
  siblings.delete(focalId)
  // A parent can also be a child of the other parent (backcross): ancestors and descendants are not siblings.
  for (const o of b.occurrences) if (o.generation !== 0) siblings.delete(o.individualId)
  for (const d of getDescendants(b.index, focalId, { maxGenerations: 10, maxIndividuals: 5000 }).individuals) siblings.delete(d.id)
  for (const p of parents) siblings.delete(p)
  for (const s of [...siblings].sort()) {
    const r = b.add(s, 0, [s])
    if (!r) return
    for (const p of b.index.parentsOf.get(s) ?? []) {
      // Not a candidate occurrence: that one stands for a possibility for the focal individual only.
      const parentOcc = b.occurrences.find((o) => o.individualId === p.individual && o.generation === 1 && !o.candidate)
      if (parentOcc) b.edge(parentOcc.occurrenceId, r.occurrenceId, p.role ?? null)
    }
  }
}

const otherParentGroups = (b: ProjectionBuilder, parentId: IndividualId) => {
  const groups = new Map<string, string[]>()
  for (const o of b.occurrences) {
    if (o.generation !== -1) continue
    const others = (b.index.parentsOf.get(o.individualId) ?? []).map((p) => p.individual).filter((p) => p !== parentId)
    const key = others.sort().join('+') || '(unrecorded)'
    groups.set(key, [...(groups.get(key) ?? []), o.occurrenceId])
  }
  for (const [key, ids] of groups)
    b.groups.push({ id: `other-parent:${key}`, kind: 'other-parent', label: key === '(unrecorded)' ? null : key, occurrenceIds: ids })
}

/**
 * One frame per cohort per generation: a repeated individual drawn in two generations
 * gets a frame in each, never one stretched across both. Idempotent (views may add
 * cohort groups and then ask for them again). Extra frames of the same cohort get ids
 * `cohort:<id>#<generation>`.
 */
const cohortGroups = (b: ProjectionBuilder) => {
  const byCohort = new Map<string, Map<number, string[]>>()
  for (const o of b.occurrences) {
    const c = b.index.individuals.get(o.individualId)?.parentage?.cohort
    if (!c) continue
    const rows = byCohort.get(c) ?? new Map<number, string[]>()
    rows.set(o.generation, [...(rows.get(o.generation) ?? []), o.occurrenceId])
    byCohort.set(c, rows)
  }
  const existing = new Set(b.groups.filter((g) => g.kind === 'cohort').map((g) => g.id))
  for (const [c, rows] of byCohort) {
    const label = b.index.cohorts.get(c)?.label ?? null
    ;[...rows.entries()]
      .sort((x, y) => y[1].length - x[1].length || x[0] - y[0])
      .forEach(([generation, ids], i) => {
        const id = i === 0 ? `cohort:${c}` : `cohort:${c}#${generation}`
        if (!existing.has(id)) b.groups.push({ id, kind: 'cohort', label, occurrenceIds: ids })
      })
  }
}

/** Topological layers (0 = no loaded parents), for date-optional timelines and population views. */
function topologicalLayers(index: PedigreeIndex, ids: Set<IndividualId>) {
  const layer = new Map<IndividualId, number>()
  const visit = (start: IndividualId) => {
    const stack: { id: IndividualId; done: boolean }[] = [{ id: start, done: false }]
    const onStack = new Set<IndividualId>()
    while (stack.length) {
      const top = stack.pop()!
      if (layer.has(top.id)) continue
      const parents = (index.parentsOf.get(top.id) ?? []).map((p) => p.individual).filter((p) => ids.has(p))
      if (top.done) {
        layer.set(top.id, parents.length ? Math.max(...parents.map((p) => layer.get(p) ?? 0)) + 1 : 0)
        onStack.delete(top.id)
        continue
      }
      onStack.add(top.id)
      stack.push({ id: top.id, done: true })
      for (const p of parents) if (!layer.has(p) && !onStack.has(p)) stack.push({ id: p, done: false })
    }
  }
  for (const id of [...ids].sort()) visit(id)
  return layer
}

/** Individuals connected to the focal one through parentage (both directions), breadth-first and bounded. */
function connected(index: PedigreeIndex, focal: IndividualId, maxNodes: number, maxDistance: number) {
  const seen = new Set([focal])
  let frontier = [focal]
  let truncated = false
  for (let d = 0; d < maxDistance && frontier.length; d++) {
    const next: IndividualId[] = []
    for (const id of frontier)
      for (const n of [...(index.parentsOf.get(id) ?? []).map((p) => p.individual), ...(index.childrenOf.get(id) ?? [])]) {
        if (seen.has(n) || !index.individuals.has(n)) continue
        if (seen.size >= maxNodes) {
          truncated = true
          break
        }
        seen.add(n)
        next.push(n)
      }
    frontier = next
  }
  return { ids: seen, truncated: truncated || frontier.length > 0 }
}

/** Adds layered occurrences (merge mode) with an edge for every recorded parent link among them. */
function addLayered(b: ProjectionBuilder, ids: Set<IndividualId>, layers: Map<IndividualId, number>) {
  for (const id of [...ids].sort((x, y) => (layers.get(x)! - layers.get(y)!) || x.localeCompare(y))) b.add(id, layers.get(id)!, [id])
  for (const id of ids)
    for (const p of b.index.parentsOf.get(id) ?? []) {
      const s = b.firstOccurrence(p.individual)
      const t = b.firstOccurrence(id)
      if (s && t) b.edge(s, t, p.role ?? null)
    }
}

/**
 * The individuals and occurrences one view needs, as plain serializable data
 * (no geometry). Unknown or hidden records are never invented; notices
 * explain gaps (missing roles, node limits, unsupported numbering).
 */
export function projectPedigree(source: PedigreeDocument | PedigreeIndex, options: ProjectionOptions): PedigreeViewProjection {
  const index = 'individuals' in source && source.individuals instanceof Map ? (source as PedigreeIndex) : indexPedigree(source as PedigreeDocument)
  const view = options.view
  const defaults: Partial<Record<PedigreeViewId, OccurrenceMode>> = {
    descendants: 'separate',
    inbreeding: 'merge',
    relationship: 'merge',
    timeline: 'merge',
    population: 'merge',
    cohort: 'merge',
  }
  const occurrenceMode = view === 'fan' || view === 'ahnentafel' ? 'separate' : (options.occurrenceMode ?? defaults[view] ?? 'separate')
  const b = new ProjectionBuilder(index, { ...options, occurrenceMode, maxNodes: options.maxNodes ?? 500 })
  const roles = options.lineageRoles ?? DEFAULT_LINEAGE_ROLES
  if (!index.individuals.has(options.focalId)) {
    b.issues.push(notice('FOCAL_NOT_FOUND', 'The focal individual is not available.', { individualId: options.focalId }))
    return b.build(view)
  }
  const focal = () => {
    const r = b.add(options.focalId, 0, [options.focalId], view === 'ahnentafel' ? { ahnentafel: 1 } : {})!
    return { occurrenceId: r.occurrenceId, id: options.focalId }
  }
  const depth = (fallback: number) => Math.max(0, options.ancestorDepth ?? fallback)

  switch (view) {
    case 'pedigree':
    case 'fan': {
      addAncestors(b, focal(), depth(4))
      if (view === 'pedigree' && options.includeSiblings) addSiblings(b)
      break
    }
    case 'compact':
      addAncestors(b, focal(), Math.min(5, Math.max(3, options.ancestorDepth ?? 4)))
      break
    case 'maternal':
    case 'paternal': {
      const allowed = view === 'maternal' ? roles.maternal : roles.paternal
      const f = focal()
      addAncestors(b, f, depth(10), (role) => role !== null && allowed.includes(role))
      // Walk the line to explain where it stops.
      let at: IndividualId | undefined = options.focalId
      for (let g = 0; at && g < depth(10); g++) {
        const parents: readonly { individual: string; role?: string | null }[] = index.parentsOf.get(at) ?? []
        const next = parents.find((p) => p.role && allowed.includes(p.role) && index.individuals.has(p.individual))
        if (!next && parents.length && parents.some((p) => !p.role))
          b.issues.push(notice('INCOMPLETE_LINEAGE', `The ${view} line stops: a parent's role is not recorded.`, { individualId: at }))
        at = next?.individual
      }
      break
    }
    case 'ahnentafel': {
      const f = focal()
      let frontier = [{ ...f, n: 1, path: [f.id] }]
      for (let g = 1; g <= depth(5) && frontier.length; g++) {
        const next: typeof frontier = []
        for (const child of frontier) {
          for (const p of index.parentsOf.get(child.id) ?? []) {
            if (!index.individuals.has(p.individual) || child.path.includes(p.individual)) continue
            const n = p.role && roles.paternal.includes(p.role) ? child.n * 2 : p.role && roles.maternal.includes(p.role) ? child.n * 2 + 1 : undefined
            if (n === undefined)
              b.issues.push(
                notice('UNSUPPORTED_NUMBERING', p.role ? `Role "${p.role}" has no Ahnentafel number; shown unnumbered.` : 'A parent without a role is shown unnumbered.', {
                  individualId: child.id,
                  relatedIds: [p.individual],
                }),
              )
            const r = b.add(p.individual, g, [...child.path, p.individual], n !== undefined ? { ahnentafel: n } : {})
            if (!r) break
            b.edge(r.occurrenceId, child.occurrenceId, p.role ?? null)
            if (n !== undefined) next.push({ occurrenceId: r.occurrenceId, id: p.individual, n, path: [...child.path, p.individual] })
          }
        }
        frontier = next
      }
      break
    }
    case 'descendants': {
      addDescendants(b, focal(), Math.max(0, options.descendantDepth ?? 3))
      otherParentGroups(b, options.focalId)
      cohortGroups(b)
      break
    }
    case 'hourglass': {
      const f = focal()
      // A short look up and down: ancestors default to two generations (an hourglass, not a full pedigree).
      addAncestors(b, f, depth(2))
      addDescendants(b, f, Math.max(0, options.descendantDepth ?? 3))
      if (options.includeSiblings) addSiblings(b)
      break
    }
    case 'cohort': {
      const cohort = options.cohortId ?? index.individuals.get(options.focalId)?.parentage?.cohort
      if (!cohort) {
        b.issues.push(notice('NO_COHORT', 'The individual is not assigned to a cohort.', { individualId: options.focalId }))
        focal()
        break
      }
      const members = [...(index.membersOf.get(cohort) ?? [])].sort()
      const ids = new Set(members)
      for (const m of members) for (const p of index.parentsOf.get(m) ?? []) if (index.individuals.has(p.individual)) ids.add(p.individual)
      const layers = new Map([...ids].map((id) => [id, members.includes(id) ? 0 : 1]))
      for (const id of [...ids].sort((x, y) => layers.get(x)! - layers.get(y)! || x.localeCompare(y))) b.add(id, layers.get(id)!, [id])
      for (const m of members)
        for (const p of index.parentsOf.get(m) ?? []) {
          const s = b.firstOccurrence(p.individual)
          const t = b.firstOccurrence(m)
          if (s && t) b.edge(s, t, p.role ?? null)
        }
      b.groups.push({ id: `cohort:${cohort}`, kind: 'cohort', label: index.cohorts.get(cohort)?.label ?? null, occurrenceIds: members.map((m) => b.firstOccurrence(m)!).filter(Boolean) })
      break
    }
    case 'relationship': {
      const other = options.relatedId
      if (!other || !index.individuals.has(other)) {
        b.issues.push(notice('RELATED_NOT_FOUND', 'Choose a second individual to compare.', { individualId: options.focalId }))
        focal()
        break
      }
      const { paths, truncated } = getRelationshipPaths(index, options.focalId, other, { maxGenerations: depth(10) })
      b.truncated ||= truncated
      if (!paths.length) {
        b.issues.push(notice('NO_DOCUMENTED_RELATIONSHIP', 'No documented connection within the searched generations. This does not show the two are unrelated.'))
        focal()
        b.add(other, 0, [other])
        break
      }
      const ids = new Set(paths.flatMap((p) => [...p.fromA, ...p.fromB]))
      addLayered(b, ids, topologicalLayers(index, ids))
      for (const o of b.occurrences) o.highlighted = true
      paths.forEach((p, i) =>
        b.groups.push({ id: `path:${i}`, kind: 'path', label: p.ancestor, occurrenceIds: [...new Set([...p.fromA, ...p.fromB])].map((id) => b.firstOccurrence(id)!) }),
      )
      break
    }
    case 'timeline':
    case 'population': {
      const { ids, truncated } = connected(index, options.focalId, options.maxNodes ?? 500, view === 'timeline' ? depth(6) : depth(12))
      b.truncated ||= truncated
      if (truncated) b.issues.push(notice('NODE_LIMIT', 'Only part of the connected population is shown.'))
      addLayered(b, ids, topologicalLayers(index, ids))
      for (let l = 0, max = Math.max(...b.occurrences.map((o) => o.generation)); l <= max; l++)
        b.groups.push({ id: `generation:${l}`, kind: 'generation', label: null, occurrenceIds: b.occurrences.filter((o) => o.generation === l).map((o) => o.occurrenceId) })
      break
    }
    case 'inbreeding': {
      addAncestors(b, focal(), depth(6))
      // Merge mode: an identity reached by several paths is a converging (repeated) ancestor.
      const paths = new Map<IndividualId, number>()
      const count = (id: IndividualId, seen: IndividualId[]) => {
        for (const p of index.parentsOf.get(id) ?? []) {
          if (!b.firstOccurrence(p.individual) || seen.includes(p.individual)) continue
          paths.set(p.individual, (paths.get(p.individual) ?? 0) + 1)
          if (seen.length < depth(6)) count(p.individual, [...seen, p.individual])
        }
      }
      count(options.focalId, [options.focalId])
      const converging = new Set([...paths].filter(([, n]) => n > 1).map(([id]) => id))
      for (const o of b.occurrences) if (converging.has(o.individualId)) Object.assign(o, { repeated: true, highlighted: true })
      if (!converging.size) b.issues.push(notice('NO_REPEATED_ANCESTORS', 'No ancestor is reached through more than one path in the shown generations.'))
      break
    }
  }
  if (options.includeCohortMembers && view !== 'cohort') cohortGroups(b)
  const built = b.build(view)
  return built
}
