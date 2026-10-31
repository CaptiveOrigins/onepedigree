/**
 * OnePedigree schema version 1 contracts (Living Technical Documentation 0.5).
 * Field names and reproductive-mode IDs are versioned public contracts.
 */

export type IndividualId = string
export type CohortId = string

/** How an individual originated. Absent (null/undefined) means unknown. */
export type ReproductiveModeId = 'sexual' | 'parthenogenesis' | 'self' | 'asexual' | 'cloning' | 'other'

export const REPRODUCTIVE_MODES: readonly ReproductiveModeId[] = ['sexual', 'parthenogenesis', 'self', 'asexual', 'cloning', 'other']

/** Built-in parent roles; any other string is allowed. Roles are never inferred from sex. */
export type ParentRole = 'mother' | 'father' | 'egg' | 'sperm' | 'donor' | 'parent' | 'contributor' | (string & {})

export type ParentReference = {
  individual: IndividualId
  role?: ParentRole | null
}

export type Parentage = {
  /** Zero or more identified contributors. The parent count is always `parents.length`. */
  parents: readonly ParentReference[]
  reproductiveMode?: ReproductiveModeId | null
  cohort?: CohortId | null
}

export type Individual = {
  id: IndividualId
  label?: string | null
  /** Host-defined sex or sex-category label. Assigns no reproductive role. */
  sex?: string | null
  parentage?: Parentage | null
  /** Opaque host display data, ignored by graph semantics. */
  data?: Readonly<Record<string, unknown>>
}

export type Cohort = {
  id: CohortId
  label?: string | null
  data?: Readonly<Record<string, unknown>>
}

export type PedigreeDocument = {
  schemaVersion: 1
  individuals: readonly Individual[]
  cohorts?: readonly Cohort[]
}

export type IssueSeverity = 'error' | 'notice'

export type PedigreeIssue = {
  severity: IssueSeverity
  code: string
  message: string
  individualId?: IndividualId
  path?: string
  relatedIds?: readonly string[]
}

/** Bounds every traversal must respect. */
export type TraversalOptions = {
  /** Generations to follow (default 10). */
  maxGenerations?: number
  /** Distinct individuals to return at most (default 1000). */
  maxIndividuals?: number
}

export type TraversalResult = {
  /** Distinct individuals found, nearest generation first; each with the generation it was first reached at. */
  individuals: readonly { id: IndividualId; generation: number }[]
  truncated: boolean
}

/** Typical parent structure of each mode. */
export const MODE_STRUCTURE: Record<ReproductiveModeId, 'single' | 'pair' | 'variable'> = {
  sexual: 'pair',
  parthenogenesis: 'single',
  self: 'single',
  asexual: 'single',
  cloning: 'variable',
  other: 'variable',
}

export type ReproductiveStructure = {
  recordedParentCount: number
  reproductiveMode: ReproductiveModeId | null
  typicalStructure: 'single' | 'pair' | 'variable' | null
  completeness: 'complete' | 'incomplete' | 'unspecified'
  atypical: boolean
}
