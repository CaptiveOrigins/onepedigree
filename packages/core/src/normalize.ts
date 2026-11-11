import {
  MODE_STRUCTURE,
  REPRODUCTIVE_MODES,
  type Cohort,
  type CohortId,
  type Individual,
  type IndividualId,
  type ParentReference,
  type PedigreeDocument,
  type ReproductiveModeId,
  type ReproductiveStructure,
} from './types'
import { biologicalParents } from './kinds'

/** Input that cannot be read as a pedigree at all (not a validation finding). */
export class PedigreeFormatError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(`${message} (${path})`)
    this.name = 'PedigreeFormatError'
  }
}

/** Derived lookups over a document. Never persisted; rebuilt from the records. */
export type PedigreeIndex = {
  readonly document: PedigreeDocument
  readonly individuals: ReadonlyMap<IndividualId, Individual>
  readonly cohorts: ReadonlyMap<CohortId, Cohort>
  /** Whether `cohorts` is a registry to check references against. */
  readonly hasCohortRegistry: boolean
  readonly parentsOf: ReadonlyMap<IndividualId, readonly ParentReference[]>
  /** Derived in reverse from parentage; children are never stored. */
  readonly childrenOf: ReadonlyMap<IndividualId, readonly IndividualId[]>
  readonly membersOf: ReadonlyMap<CohortId, readonly IndividualId[]>
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const optText = (v: unknown, path: string): string | null => {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') throw new PedigreeFormatError('Expected text', path)
  return v
}
const id = (v: unknown, path: string): string => {
  if (typeof v !== 'string' || v.length === 0) throw new PedigreeFormatError('Expected a non-empty string ID', path)
  return v
}
const data = (v: unknown, path: string) => {
  if (v === undefined || v === null) return undefined
  if (!isRecord(v)) throw new PedigreeFormatError('Expected an object', path)
  return Object.freeze({ ...v })
}

/** One individual in canonical form (absent optional values become null). Does not modify the input. */
export function normalizeIndividual(input: unknown, path = 'individual'): Individual {
  if (!isRecord(input)) throw new PedigreeFormatError('Expected an individual object', path)
  const parentage = input.parentage === undefined || input.parentage === null ? null : normalizeParentage(input.parentage, `${path}.parentage`)
  const extra = data(input.data, `${path}.data`)
  return Object.freeze({
    id: id(input.id, `${path}.id`),
    label: optText(input.label, `${path}.label`),
    sex: optText(input.sex, `${path}.sex`),
    // Only when present, so documents without identifiers are unchanged.
    ...(input.identifier !== undefined && input.identifier !== null ? { identifier: optText(input.identifier, `${path}.identifier`) } : {}),
    parentage,
    ...(extra ? { data: extra } : {}),
  })
}

/**
 * Parentage in canonical form. Parent order and roles are kept as given; a
 * missing role or mode stays null (unknown) and is never derived.
 */
export function normalizeParentage(input: unknown, path = 'parentage') {
  if (!isRecord(input)) throw new PedigreeFormatError('Expected a parentage object', path)
  const raw = input.parents ?? []
  if (!Array.isArray(raw)) throw new PedigreeFormatError('Expected a parents array', `${path}.parents`)
  const parents = raw.map((p, i): ParentReference => {
    const at = `${path}.parents[${i}]`
    if (!isRecord(p)) throw new PedigreeFormatError('Expected a parent reference object', at)
    const kind = optText(p.kind, `${at}.kind`)
    // Only when recorded, so documents without kinds are unchanged.
    return Object.freeze({ individual: id(p.individual, `${at}.individual`), role: optText(p.role, `${at}.role`), ...(kind ? { kind } : {}) })
  })
  const rawUncertain = input.uncertainParents
  if (rawUncertain !== undefined && rawUncertain !== null && !Array.isArray(rawUncertain)) throw new PedigreeFormatError('Expected an uncertainParents array', `${path}.uncertainParents`)
  const uncertain = (rawUncertain ?? []).map((u, i) => {
    const at = `${path}.uncertainParents[${i}]`
    if (!isRecord(u)) throw new PedigreeFormatError('Expected an uncertain parent object', at)
    if (!Array.isArray(u.candidates)) throw new PedigreeFormatError('Expected a candidates array', `${at}.candidates`)
    const candidates = u.candidates.map((c, j) => {
      const cat = `${at}.candidates[${j}]`
      if (!isRecord(c)) throw new PedigreeFormatError('Expected a candidate object', cat)
      if (typeof c.probability !== 'number' || !Number.isFinite(c.probability)) throw new PedigreeFormatError('Expected a probability number', `${cat}.probability`)
      return Object.freeze({ individual: id(c.individual, `${cat}.individual`), probability: c.probability })
    })
    const kind = optText(u.kind, `${at}.kind`)
    if (kind !== null && kind !== 'wild' && kind !== 'unknown') throw new PedigreeFormatError('Expected kind "wild" or "unknown"', `${at}.kind`)
    const shared = optText(u.shared, `${at}.shared`)
    const basis = optText(u.basis, `${at}.basis`)
    return Object.freeze({ role: optText(u.role, `${at}.role`), candidates: Object.freeze(candidates), ...(kind ? { kind } : {}), ...(shared ? { shared } : {}), ...(basis ? { basis } : {}) })
  })
  return Object.freeze({
    parents: Object.freeze(parents),
    // Only when recorded, so documents without uncertain parents are unchanged.
    ...(uncertain.length ? { uncertainParents: Object.freeze(uncertain) } : {}),
    reproductiveMode: optText(input.reproductiveMode, `${path}.reproductiveMode`) as ReproductiveModeId | null,
    cohort: optText(input.cohort, `${path}.cohort`),
  })
}

/**
 * A document in canonical form: individuals and cohorts sorted by ID (so equal
 * inputs give equal output), optional values null. The input is not modified.
 */
export function normalizePedigree(input: unknown): PedigreeDocument {
  if (!isRecord(input)) throw new PedigreeFormatError('Expected a pedigree document object', 'document')
  if (input.schemaVersion !== 1) throw new PedigreeFormatError(`Unsupported schema version ${String(input.schemaVersion)}`, 'schemaVersion')
  if (!Array.isArray(input.individuals)) throw new PedigreeFormatError('Expected an individuals array', 'individuals')
  const individuals = input.individuals.map((v, i) => normalizeIndividual(v, `individuals[${i}]`))
  const cohorts =
    input.cohorts === undefined
      ? undefined
      : Array.isArray(input.cohorts)
        ? input.cohorts.map((c, i) => {
            const at = `cohorts[${i}]`
            if (!isRecord(c)) throw new PedigreeFormatError('Expected a cohort object', at)
            const extra = data(c.data, `${at}.data`)
            return Object.freeze({ id: id(c.id, `${at}.id`), label: optText(c.label, `${at}.label`), ...(extra ? { data: extra } : {}) })
          })
        : (() => {
            throw new PedigreeFormatError('Expected a cohorts array', 'cohorts')
          })()
  const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  return Object.freeze({
    schemaVersion: 1 as const,
    individuals: Object.freeze([...individuals].sort(byId)),
    ...(cohorts ? { cohorts: Object.freeze([...cohorts].sort(byId)) } : {}),
  })
}

/** Lookups for a (normalized or already canonical) document. Duplicate IDs keep the first record; validation reports them. */
export function indexPedigree(document: PedigreeDocument): PedigreeIndex {
  const individuals = new Map<IndividualId, Individual>()
  const parentsOf = new Map<IndividualId, readonly ParentReference[]>()
  const childrenOf = new Map<IndividualId, IndividualId[]>()
  const membersOf = new Map<CohortId, IndividualId[]>()
  for (const ind of document.individuals) {
    if (individuals.has(ind.id)) continue
    individuals.set(ind.id, ind)
    const parents = ind.parentage?.parents ?? []
    parentsOf.set(ind.id, parents)
    for (const p of new Set(parents.map((x) => x.individual))) childrenOf.set(p, [...(childrenOf.get(p) ?? []), ind.id])
    const cohort = ind.parentage?.cohort
    if (cohort) membersOf.set(cohort, [...(membersOf.get(cohort) ?? []), ind.id])
  }
  const cohorts = new Map<CohortId, Cohort>()
  for (const c of document.cohorts ?? []) if (!cohorts.has(c.id)) cohorts.set(c.id, c)
  return { document, individuals, cohorts, hasCohortRegistry: document.cohorts !== undefined, parentsOf, childrenOf, membersOf }
}

/**
 * How an individual's biological parents compare with its reproductive mode. Legal, adoptive, social and other
 * non-biological links aren't counted: a foster dam doesn't make a sexual birth atypical.
 */
export function reproductiveStructure(individual: Individual): ReproductiveStructure {
  const count = biologicalParents(individual.parentage).length
  const raw = individual.parentage?.reproductiveMode ?? null
  const mode = raw && (REPRODUCTIVE_MODES as readonly string[]).includes(raw) ? raw : null
  const typical = mode ? MODE_STRUCTURE[mode] : null
  const completeness =
    typical === 'pair' ? (count >= 2 ? 'complete' : 'incomplete') : typical === 'single' ? (count >= 1 ? 'complete' : 'incomplete') : 'unspecified'
  const atypical = (typical === 'pair' && count > 2) || (typical === 'single' && count > 1)
  return { recordedParentCount: count, reproductiveMode: mode, typicalStructure: typical, completeness, atypical }
}
