import { normalizeIndividual } from './normalize'
import type { CohortId, Individual, IndividualId, ParentReference, PedigreeDocument, ReproductiveModeId } from './types'

/** Reads existing records without changing their storage format. */
export type PedigreeAdapter<T> = {
  getId(record: T): IndividualId
  getParents(record: T): readonly ParentReference[]
  getReproductiveMode?(record: T): ReproductiveModeId | null
  getCohortId?(record: T): CohortId | null
  getLabel?(record: T): string | null
  /** A host identifier shown beside the label (see `Individual.identifier`). */
  getIdentifier?(record: T): string | null
  getSexLabel?(record: T): string | null
  /** Only explicitly approved presentation data. */
  getDisplayData?(record: T): Readonly<Record<string, unknown>>
}

/** Database access stays outside the engine. Implementations apply the caller's access rules. */
export interface PedigreeRepository<T> {
  getByIds(ids: readonly string[]): Promise<readonly T[]>
  findChildrenOf(ids: readonly string[]): Promise<readonly T[]>
}

export interface CohortRepository<T> {
  getCohortsByIds(ids: readonly string[]): Promise<readonly T[]>
  findIndividualsByCohort(ids: readonly string[]): Promise<readonly T[]>
}

/** A host record as a canonical individual. */
export function adaptIndividual<T>(record: T, adapter: PedigreeAdapter<T>): Individual {
  const parents = adapter.getParents(record)
  const mode = adapter.getReproductiveMode?.(record) ?? null
  const cohort = adapter.getCohortId?.(record) ?? null
  return normalizeIndividual({
    id: adapter.getId(record),
    label: adapter.getLabel?.(record) ?? null,
    identifier: adapter.getIdentifier?.(record) ?? null,
    sex: adapter.getSexLabel?.(record) ?? null,
    parentage: parents.length || mode || cohort ? { parents, reproductiveMode: mode, cohort } : null,
    data: adapter.getDisplayData?.(record),
  })
}

export type NeighborhoodOptions = {
  focalIds: readonly IndividualId[]
  ancestorDepth?: number
  descendantDepth?: number
  /** Include every individual sharing a parent with a loaded one (default false). */
  includeSiblings?: boolean
  /** Hard cap on loaded individuals (default 500). */
  maxNodes?: number
}

export type Neighborhood = {
  /** A partial document: validate it with `{ complete: false }`. */
  document: PedigreeDocument
  truncated: boolean
  /** Referenced IDs the repository did not return (missing, or hidden by access rules). */
  unavailable: readonly IndividualId[]
}

/**
 * Loads a bounded neighborhood around focal individuals, one query per
 * generation and direction (never one per individual).
 */
export async function loadNeighborhood<T>(repository: PedigreeRepository<T>, adapter: PedigreeAdapter<T>, options: NeighborhoodOptions): Promise<Neighborhood> {
  const maxNodes = options.maxNodes ?? 500
  const loaded = new Map<IndividualId, Individual>()
  const requested = new Set<IndividualId>()
  let truncated = false
  const take = (records: readonly T[]) => {
    const added: Individual[] = []
    for (const r of records) {
      const ind = adaptIndividual(r, adapter)
      if (loaded.has(ind.id)) continue
      if (loaded.size >= maxNodes) {
        truncated = true
        break
      }
      loaded.set(ind.id, ind)
      added.push(ind)
    }
    return added
  }
  const fetchIds = async (ids: IndividualId[]) => {
    const want = ids.filter((id) => !loaded.has(id) && !requested.has(id))
    want.forEach((id) => requested.add(id))
    return want.length ? take(await repository.getByIds(want)) : []
  }

  let up = await fetchIds([...options.focalIds])
  const focal = [...up]
  for (let g = 0; g < (options.ancestorDepth ?? 4) && up.length && !truncated; g++)
    up = await fetchIds(up.flatMap((i) => (i.parentage?.parents ?? []).map((p) => p.individual)))
  let down = focal
  for (let g = 0; g < (options.descendantDepth ?? 0) && down.length && !truncated; g++)
    down = take(await repository.findChildrenOf(down.map((i) => i.id)))
  if (options.includeSiblings && !truncated) {
    const parentIds = [...new Set([...loaded.values()].flatMap((i) => (i.parentage?.parents ?? []).map((p) => p.individual)))].filter((id) => loaded.has(id))
    if (parentIds.length) take(await repository.findChildrenOf(parentIds))
  }
  const unavailable = [...requested].filter((id) => !loaded.has(id)).sort()
  return {
    document: { schemaVersion: 1, individuals: [...loaded.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) },
    truncated,
    unavailable,
  }
}
