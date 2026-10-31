import { reproductiveStructure, type PedigreeIndex } from './normalize'
import type { CohortId, IndividualId, ParentReference, TraversalOptions, TraversalResult } from './types'

const DEFAULT_GENERATIONS = 10
const DEFAULT_INDIVIDUALS = 1000

const bounds = (o: TraversalOptions = {}) => ({
  maxGenerations: Math.max(0, Math.floor(o.maxGenerations ?? DEFAULT_GENERATIONS)),
  maxIndividuals: Math.max(1, Math.floor(o.maxIndividuals ?? DEFAULT_INDIVIDUALS)),
})

/** Direct parent references (as recorded, in order). */
export const getParents = (index: PedigreeIndex, id: IndividualId): readonly ParentReference[] => index.parentsOf.get(id) ?? []

/** Direct offspring, derived in reverse from their parentage. */
export const getChildren = (index: PedigreeIndex, id: IndividualId): readonly IndividualId[] => index.childrenOf.get(id) ?? []

/** Breadth-first walk one direction, one generation at a time, within bounds (cycle-safe). */
function walk(index: PedigreeIndex, start: IndividualId, step: (id: IndividualId) => Iterable<IndividualId>, options?: TraversalOptions): TraversalResult {
  const { maxGenerations, maxIndividuals } = bounds(options)
  const found: { id: IndividualId; generation: number }[] = []
  const seen = new Set([start])
  let frontier = [start]
  let truncated = false
  for (let generation = 1; generation <= maxGenerations && frontier.length; generation++) {
    const next: IndividualId[] = []
    for (const id of frontier)
      for (const n of step(id)) {
        // Only loaded individuals: an unresolved or hidden reference is not exposed.
        if (seen.has(n) || !index.individuals.has(n)) continue
        if (found.length >= maxIndividuals) {
          truncated = true
          break
        }
        seen.add(n)
        found.push({ id: n, generation })
        next.push(n)
      }
    frontier = next
    if (truncated) break
    if (generation === maxGenerations && frontier.some((id) => [...step(id)].some((n) => !seen.has(n) && index.individuals.has(n)))) truncated = true
  }
  return { individuals: found, truncated }
}

/** Ancestors to a bounded depth; each identity once, at the nearest generation it is reached. */
export const getAncestors = (index: PedigreeIndex, id: IndividualId, options?: TraversalOptions) =>
  walk(index, id, (x) => getParents(index, x).map((p) => p.individual), options)

/** Descendants to a bounded depth, batched by generation. */
export const getDescendants = (index: PedigreeIndex, id: IndividualId, options?: TraversalOptions) => walk(index, id, (x) => getChildren(index, x), options)

const parentKey = (index: PedigreeIndex, id: IndividualId) =>
  [...new Set(getParents(index, id).map((p) => p.individual))].sort().join('\u0000')

/** Parentage is complete enough to compare: the mode's typical count is recorded, or two parents when the mode is unknown. */
const parentSetComplete = (index: PedigreeIndex, id: IndividualId) => {
  const ind = index.individuals.get(id)
  if (!ind) return false
  const s = reproductiveStructure(ind)
  return s.completeness === 'complete' || (s.reproductiveMode === null && s.recordedParentCount >= 2)
}

export type SiblingGroups = {
  /** Same recorded parent set, and that set is complete. */
  full: readonly IndividualId[]
  /** Share at least one recorded parent, but not every one. */
  partial: readonly IndividualId[]
  /** Same recorded parents, but parentage is incomplete: full or partial siblings cannot be told apart. */
  unresolved: readonly IndividualId[]
}

/** Siblings by recorded parentage. Missing parentage is never treated as proof of relatedness or unrelatedness. */
export function getSiblings(index: PedigreeIndex, id: IndividualId): SiblingGroups {
  const mine = new Set(getParents(index, id).map((p) => p.individual))
  const full: IndividualId[] = []
  const partial: IndividualId[] = []
  const unresolved: IndividualId[] = []
  if (!mine.size) return { full, partial, unresolved }
  const candidates = new Set([...mine].flatMap((p) => getChildren(index, p)))
  candidates.delete(id)
  // In a backcross a parent is also a child of the other parent (and an offspring shares a parent):
  // ancestors and descendants are never listed as siblings.
  for (const a of getAncestors(index, id, { maxGenerations: 10, maxIndividuals: 5000 }).individuals) candidates.delete(a.id)
  for (const d of getDescendants(index, id, { maxGenerations: 10, maxIndividuals: 5000 }).individuals) candidates.delete(d.id)
  const key = parentKey(index, id)
  for (const c of [...candidates].sort()) {
    if (parentKey(index, c) === key) (parentSetComplete(index, id) && parentSetComplete(index, c) ? full : unresolved).push(c)
    else partial.push(c)
  }
  return { full, partial, unresolved }
}

/** Individuals with the same complete, non-empty recorded parent set. */
export const getFullSiblings = (index: PedigreeIndex, id: IndividualId) => getSiblings(index, id).full

/** Individuals sharing at least one but not every recorded parent. */
export const getHalfSiblings = (index: PedigreeIndex, id: IndividualId) => getSiblings(index, id).partial

/** Members of a cohort, from each member's own parentage. */
export const getCohortMembers = (index: PedigreeIndex, cohort: CohortId): readonly IndividualId[] => [...(index.membersOf.get(cohort) ?? [])].sort()

/** Ancestors shared by every given individual (an individual counts as its own generation-0 ancestor), nearest first. */
export function getCommonAncestors(index: PedigreeIndex, ids: readonly IndividualId[], options?: TraversalOptions) {
  if (!ids.length) return []
  const distances = ids.map((id) => {
    const m = new Map<IndividualId, number>([[id, 0]])
    for (const a of getAncestors(index, id, options).individuals) m.set(a.id, a.generation)
    return m
  })
  return [...distances[0]!.keys()]
    .filter((a) => distances.every((d) => d.has(a)))
    .map((a) => ({ id: a, generations: distances.map((d) => d.get(a)!) }))
    .sort((x, y) => {
      const sum = (g: number[]) => g.reduce((a, b) => a + b, 0)
      return Math.max(...x.generations) - Math.max(...y.generations) || sum(x.generations) - sum(y.generations) || x.id.localeCompare(y.id)
    })
}

/** Every upward lineage path from `start` (start first), bounded in depth and count. */
function lineagePaths(index: PedigreeIndex, start: IndividualId, maxGenerations: number, maxPaths: number) {
  const paths: IndividualId[][] = []
  let truncated = false
  const stack: IndividualId[][] = [[start]]
  while (stack.length) {
    const path = stack.pop()!
    paths.push(path)
    if (paths.length >= maxPaths) {
      truncated = stack.length > 0
      break
    }
    if (path.length - 1 >= maxGenerations) continue
    const parents = getParents(index, path[path.length - 1]!)
      .map((p) => p.individual)
      .filter((p) => index.individuals.has(p))
    for (const p of [...parents].reverse()) if (!path.includes(p)) stack.push([...path, p])
  }
  return { paths, truncated }
}

export type RelationshipPath = {
  /** Where the two lines meet; one of the pair when one descends from the other. */
  ancestor: IndividualId
  /** From the first individual up to the ancestor. */
  fromA: readonly IndividualId[]
  /** From the second individual up to the ancestor. */
  fromB: readonly IndividualId[]
}

/**
 * Documented lineage paths connecting two individuals, through each common
 * ancestor (lines meet only at the ancestor). No path found means no
 * documented connection, not that the two are unrelated.
 */
export function getRelationshipPaths(
  index: PedigreeIndex,
  a: IndividualId,
  b: IndividualId,
  options: { maxGenerations?: number; maxPaths?: number } = {},
): { paths: readonly RelationshipPath[]; truncated: boolean } {
  const maxGenerations = options.maxGenerations ?? DEFAULT_GENERATIONS
  const maxPaths = options.maxPaths ?? 100
  const up = (id: IndividualId) => lineagePaths(index, id, maxGenerations, 10_000)
  const fromA = up(a)
  const fromB = up(b)
  const byEnd = new Map<IndividualId, IndividualId[][]>()
  for (const p of fromB.paths) byEnd.set(p[p.length - 1]!, [...(byEnd.get(p[p.length - 1]!) ?? []), p])
  const paths: RelationshipPath[] = []
  let truncated = fromA.truncated || fromB.truncated
  outer: for (const pa of fromA.paths) {
    const end = pa[pa.length - 1]!
    for (const pb of byEnd.get(end) ?? []) {
      const shared = pa.filter((x) => pb.includes(x))
      if (shared.length !== 1) continue
      if (paths.length >= maxPaths) {
        truncated = true
        break outer
      }
      paths.push({ ancestor: end, fromA: pa, fromB: pb })
    }
  }
  paths.sort((x, y) => x.fromA.length + x.fromB.length - (y.fromA.length + y.fromB.length))
  return { paths, truncated }
}

/** Ancestors reached through more than one lineage path from the focal individual (pedigree collapse), with their path counts. */
export function getRepeatedIndividuals(index: PedigreeIndex, focal: IndividualId, options: { maxGenerations?: number; maxPaths?: number } = {}) {
  const { paths, truncated } = lineagePaths(index, focal, options.maxGenerations ?? DEFAULT_GENERATIONS, options.maxPaths ?? 10_000)
  const counts = new Map<IndividualId, number>()
  for (const p of paths) if (p.length > 1) counts.set(p[p.length - 1]!, (counts.get(p[p.length - 1]!) ?? 0) + 1)
  const repeated = [...counts].filter(([, n]) => n > 1).map(([id, paths]) => ({ id, paths }))
  return { repeated: repeated.sort((x, y) => y.paths - x.paths || x.id.localeCompare(y.id)), truncated }
}
