import { indexPedigree, reproductiveStructure, type PedigreeIndex } from './normalize'
import { REPRODUCTIVE_MODES, type Individual, type IndividualId, type ParentReference, type PedigreeDocument, type PedigreeIssue } from './types'

/** A host-supplied rule, e.g. taxonomic compatibility. Rules add issues; they cannot remove built-in ones. */
export type ValidationRule = {
  id: string
  validate(individual: Individual, context: { index: PedigreeIndex }): readonly PedigreeIssue[]
}

export type ValidationOptions = {
  /**
   * The document holds every referenced parent (default true). False for a
   * partial neighborhood loaded from a repository: unresolved parents are then
   * not errors.
   */
  complete?: boolean
  rules?: readonly ValidationRule[]
}

export type ValidationResult = { valid: boolean; issues: readonly PedigreeIssue[] }

const issue = (severity: PedigreeIssue['severity'], code: string, message: string, extra: Partial<PedigreeIssue> = {}): PedigreeIssue => ({
  severity,
  code,
  message,
  ...extra,
})

/** Parent-reference problems of one parent list (shared by document and change validation). */
function parentIssues(childId: IndividualId, parents: readonly ParentReference[], resolves: (id: string) => boolean | null): PedigreeIssue[] {
  const out: PedigreeIssue[] = []
  const seen = new Set<string>()
  parents.forEach((p, i) => {
    const path = `parentage.parents[${i}]`
    if (p.individual === childId) out.push(issue('error', 'SELF_PARENT', 'An individual cannot be its own parent.', { individualId: childId, path }))
    if (seen.has(p.individual))
      out.push(issue('error', 'DUPLICATE_PARENT', 'The same parent appears more than once.', { individualId: childId, path, relatedIds: [p.individual] }))
    seen.add(p.individual)
    if (resolves(p.individual) === false)
      out.push(issue('error', 'UNRESOLVED_PARENT', 'The parent reference does not resolve.', { individualId: childId, path, relatedIds: [p.individual] }))
  })
  return out
}

/** Every ancestry cycle, each reported once with its members (iterative; no recursion limit). */
function findCycles(index: PedigreeIndex): IndividualId[][] {
  const state = new Map<IndividualId, 1 | 2>() // 1 on stack, 2 done
  const cycles: IndividualId[][] = []
  for (const start of index.individuals.keys()) {
    if (state.has(start)) continue
    const stack: { id: IndividualId; next: number }[] = [{ id: start, next: 0 }]
    const onPath: IndividualId[] = [start]
    state.set(start, 1)
    while (stack.length) {
      const top = stack[stack.length - 1]!
      const parents = (index.parentsOf.get(top.id) ?? []).map((p) => p.individual).filter((p) => index.individuals.has(p) && p !== top.id)
      if (top.next < parents.length) {
        const p = parents[top.next++]!
        const s = state.get(p)
        if (s === 1) cycles.push(onPath.slice(onPath.indexOf(p)))
        else if (s === undefined) {
          state.set(p, 1)
          stack.push({ id: p, next: 0 })
          onPath.push(p)
        }
      } else {
        state.set(top.id, 2)
        stack.pop()
        onPath.pop()
      }
    }
  }
  return cycles
}

/**
 * Structured errors and notices for a document; the input is not modified.
 * Incomplete parentage is not an error: missing information stays missing.
 */
export function validatePedigree(document: PedigreeDocument, options: ValidationOptions = {}): ValidationResult {
  const complete = options.complete ?? true
  const index = indexPedigree(document)
  const issues: PedigreeIssue[] = []
  const seen = new Set<IndividualId>()
  for (const ind of document.individuals) {
    if (seen.has(ind.id)) issues.push(issue('error', 'DUPLICATE_ID', 'The ID is used by more than one individual.', { individualId: ind.id }))
    seen.add(ind.id)
  }
  const cohortIds = new Set<string>()
  for (const c of document.cohorts ?? []) {
    if (cohortIds.has(c.id)) issues.push(issue('error', 'DUPLICATE_COHORT_ID', 'The ID is used by more than one cohort.', { relatedIds: [c.id] }))
    cohortIds.add(c.id)
  }

  for (const ind of index.individuals.values()) {
    const parents = ind.parentage?.parents ?? []
    issues.push(...parentIssues(ind.id, parents, (p) => (index.individuals.has(p) ? true : complete ? false : null)))
    const mode = ind.parentage?.reproductiveMode
    if (mode && !(REPRODUCTIVE_MODES as readonly string[]).includes(mode))
      issues.push(issue('error', 'UNKNOWN_REPRODUCTIVE_MODE', `"${mode}" is not a supported reproductive mode.`, { individualId: ind.id, path: 'parentage.reproductiveMode' }))
    const cohort = ind.parentage?.cohort
    if (cohort && index.hasCohortRegistry && !index.cohorts.has(cohort))
      issues.push(issue('error', 'UNRESOLVED_COHORT', 'The cohort reference does not resolve.', { individualId: ind.id, path: 'parentage.cohort', relatedIds: [cohort] }))
    const s = reproductiveStructure(ind)
    if (s.reproductiveMode === 'sexual' && s.recordedParentCount !== 2)
      issues.push(
        issue('notice', s.recordedParentCount < 2 ? 'INCOMPLETE_PARENTAGE' : 'ATYPICAL_PARENT_COUNT', `Sexual reproduction with ${s.recordedParentCount} recorded parent(s).`, {
          individualId: ind.id,
          path: 'parentage.parents',
        }),
      )
    if (s.typicalStructure === 'single' && s.recordedParentCount > 1)
      issues.push(
        issue('notice', 'ATYPICAL_PARENT_COUNT', `${s.reproductiveMode} usually has one parent; ${s.recordedParentCount} are recorded.`, {
          individualId: ind.id,
          path: 'parentage.parents',
        }),
      )
  }

  for (const cycle of findCycles(index))
    issues.push(issue('error', 'ANCESTRY_CYCLE', 'Parentage forms a cycle: an individual would be its own ancestor.', { individualId: cycle[0], relatedIds: cycle }))

  for (const [cohort, members] of index.membersOf) {
    if (members.length < 2) continue
    const sets = members.map((m) => new Set((index.parentsOf.get(m) ?? []).map((p) => p.individual)))
    const shared = [...sets[0]!].some((p) => sets.every((s) => s.has(p)))
    if (!shared && sets.every((s) => s.size > 0))
      issues.push(issue('notice', 'COHORT_WITHOUT_SHARED_PARENT', 'Cohort members share no recorded parent.', { relatedIds: [cohort, ...members] }))
  }

  for (const rule of options.rules ?? []) for (const ind of index.individuals.values()) issues.push(...rule.validate(ind, { index }))

  return { valid: !issues.some((i) => i.severity === 'error'), issues }
}

/**
 * Checks a proposed parent list for one individual against the persisted graph
 * (`index` must hold the child's full descendant line and the proposed
 * parents). A proposed parent that already descends from the child would close
 * a cycle. The descendant search is exhaustive up to `maxIndividuals`; reaching
 * that limit is reported as an error, never as "no cycle".
 */
export function validateParentageChange(
  index: PedigreeIndex,
  childId: IndividualId,
  parents: readonly ParentReference[],
  options: { maxIndividuals?: number } = {},
): ValidationResult {
  const issues = parentIssues(childId, parents, (p) => index.individuals.has(p))
  const limit = options.maxIndividuals ?? 100_000
  const proposed = new Set(parents.map((p) => p.individual))
  const seen = new Set<IndividualId>([childId])
  let frontier = [childId]
  while (frontier.length && issues.every((i) => i.code !== 'PARENT_IS_DESCENDANT')) {
    const next: IndividualId[] = []
    for (const id of frontier)
      for (const c of index.childrenOf.get(id) ?? []) {
        if (seen.has(c)) continue
        seen.add(c)
        if (proposed.has(c))
          issues.push(issue('error', 'PARENT_IS_DESCENDANT', 'The proposed parent already descends from this individual.', { individualId: childId, relatedIds: [c] }))
        next.push(c)
      }
    if (seen.size > limit) {
      issues.push(issue('error', 'TRAVERSAL_LIMIT', 'Too many descendants to verify this change safely.', { individualId: childId }))
      break
    }
    frontier = next
  }
  return { valid: !issues.some((i) => i.severity === 'error'), issues }
}
