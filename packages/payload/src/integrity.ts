import {
  reproductiveStructure,
  validatePedigree,
  type Individual,
  type ParentReference,
  type PedigreeIssue,
  type ReproductiveModeId,
} from '@captiveorigins/onepedigree-core'
import {
  APIError,
  ValidationError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionBeforeOperationHook,
  type CollectionSlug,
  type GlobalSlug,
  type PayloadRequest,
} from 'payload'

import { childrenWhere, getAt, graphSelect, idOf, maternalRoles, readCohort, readMode, readParents, toIndividual } from './mapping.js'
import type { ResolvedOptions } from './types.js'

/** Context flag for the plugin's own writes (detaching references, internal updates). */
export const SKIP = 'onepedigreeInternal'
/** Set per operation: whether access control is bypassed (trusted server code), so parent readability is not checked. */
export const TRUSTED = 'onepedigreeOverrideAccess'
const MAX_DESCENDANTS = 100_000

const err = (code: string, message: string, path?: string, relatedIds?: string[]): PedigreeIssue => ({
  severity: 'error',
  code,
  message,
  ...(path ? { path } : {}),
  ...(relatedIds ? { relatedIds } : {}),
})

const parentsPath = (opts: ResolvedOptions) => (opts.fields.parentage.kind === 'parent-array' ? `${opts.fields.parentage.path}.parents` : Object.values(opts.fields.parentage.roles)[0]!)

/**
 * Checks a proposed parentage for one individual against the stored graph:
 * self-reference, duplicates, parents the requester cannot read (or that do
 * not exist), cycles through the full descendant line (read with full access:
 * integrity must not depend on what the editor can see), host rules, and
 * structural notices.
 */
export async function checkParentage(
  req: PayloadRequest,
  opts: ResolvedOptions,
  proposal: { id?: string | null; parents: readonly ParentReference[]; reproductiveMode?: ReproductiveModeId | null; cohort?: string | null; doc?: Record<string, unknown> },
  { trusted = false }: { trusted?: boolean } = {},
): Promise<PedigreeIssue[]> {
  const issues: PedigreeIssue[] = []
  const path = parentsPath(opts)
  const ids = proposal.parents.map((p) => p.individual)
  if (proposal.id && ids.includes(proposal.id)) issues.push(err('SELF_PARENT', 'An individual cannot be its own parent.', path))
  if (new Set(ids).size !== ids.length) issues.push(err('DUPLICATE_PARENT', 'The same parent is listed more than once.', path))

  const unique = [...new Set(ids)]
  const visible = unique.length
    ? ((
        await req.payload.find({
          collection: opts.collection as CollectionSlug,
          where: { id: { in: unique } },
          depth: 0,
          pagination: false,
          select: graphSelect(opts) as never,
          overrideAccess: trusted,
          req,
        })
      ).docs as unknown as Record<string, unknown>[])
    : []
  const seen = new Set(visible.map((d) => String(d.id)))
  // Same message whether missing or private: nothing is revealed about records the editor cannot read.
  for (const p of unique) if (!seen.has(p)) issues.push(err('UNRESOLVED_PARENT', 'A parent does not exist or you cannot access it.', path, [p]))

  // Loops are checked only among parents the editor can read. Others are already refused as unresolved, and saying
  // one would loop would reveal that a private record exists and descends from this one.
  const proposed = new Set(unique.filter((p) => seen.has(p)))
  if (proposal.id && proposed.size) {
    const reached = new Set([proposal.id])
    let frontier = [proposal.id]
    while (frontier.length && !issues.some((i) => i.code === 'PARENT_IS_DESCENDANT')) {
      const { docs } = await req.payload.find({
        collection: opts.collection as CollectionSlug,
        where: childrenWhere(opts, frontier),
        depth: 0,
        pagination: false,
        select: {} as never,
        overrideAccess: true,
        req,
      })
      frontier = []
      for (const d of docs as unknown as { id: string }[]) {
        const c = String(d.id)
        if (reached.has(c)) continue
        reached.add(c)
        if (proposed.has(c)) issues.push(err('PARENT_IS_DESCENDANT', 'This parent already descends from the individual; the pedigree would loop.', path, [c]))
        frontier.push(c)
      }
      if (reached.size > MAX_DESCENDANTS) {
        issues.push(err('TRAVERSAL_LIMIT', 'Too many descendants to verify this change safely.', path))
        break
      }
    }
  }

  // A cohort is one birthing event: the member's recorded mother must be the cohort's birthing parent.
  if (proposal.cohort && opts.cohorts?.birthParentField) {
    const cohort = await req.payload.findByID({
      collection: opts.cohorts.collection as CollectionSlug,
      id: proposal.cohort,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      req,
    })
    const birthParent = idOf(cohort ? getAt(cohort, opts.cohorts.birthParentField) : null)
    const mothers = proposal.parents.filter((p) => p.role && maternalRoles(opts).includes(p.role)).map((p) => p.individual)
    if (birthParent && mothers.some((m) => m !== birthParent))
      issues.push(err('COHORT_BIRTH_PARENT_MISMATCH', 'This mother differs from the mother of the selected birthing event (cohort).', opts.fields.parentage.cohort ?? path))
  }

  // Host rules and structural notices on the proposed record with its visible parents.
  const self: Individual = {
    ...(proposal.doc ? toIndividual({ ...proposal.doc, id: proposal.id ?? '(new)' }, opts) : { id: proposal.id ?? '(new)' }),
    parentage: { parents: proposal.parents, reproductiveMode: proposal.reproductiveMode ?? null, cohort: proposal.cohort ?? null },
  }
  // The record itself is never one of its own parents here (reported above as SELF_PARENT).
  const others = visible.filter((d) => String(d.id) !== self.id).map((d) => toIndividual(d as Record<string, unknown>, opts))
  const document = { schemaVersion: 1 as const, individuals: [self, ...others] }
  const result = validatePedigree(document, { complete: false, rules: opts.rules, birthParentRoles: maternalRoles(opts) })
  for (const i of result.issues)
    if (i.individualId === self.id && !['SELF_PARENT', 'DUPLICATE_PARENT', 'ANCESTRY_CYCLE'].includes(i.code)) issues.push({ ...i, path: i.path ?? path })
  // Rules may report on other records too; only errors about this write block it.
  return issues
}

const same = (a: readonly ParentReference[], b: readonly ParentReference[]) =>
  a.length === b.length && a.every((p, i) => p.individual === b[i]!.individual && (p.role ?? null) === (b[i]!.role ?? null))

/**
 * Validates parentage on every write path (Admin, REST, GraphQL, Local API,
 * imports) and serializes parentage changes: the graph revision global is
 * updated in the same transaction, so two concurrent parentage writes cannot
 * both commit (MongoDB write conflict) and jointly create a cycle.
 */
export const parentageBeforeChange =
  (opts: ResolvedOptions): CollectionBeforeChangeHook =>
  async ({ data, originalDoc, req, context, operation }) => {
    if (context[SKIP]) return data
    const merged = { ...(originalDoc ?? {}), ...data } as Record<string, unknown>
    const id = operation === 'update' ? (idOf(originalDoc?.id) ?? null) : null
    const parents = readParents(merged, opts)
    const mode = readMode(merged, opts)
    const cohort = readCohort(merged, opts)
    const before = originalDoc ? readParents(originalDoc, opts) : []
    if (operation === 'update' && same(parents, before) && mode === readMode(originalDoc, opts) && cohort === readCohort(originalDoc, opts)) return data

    const issues = await checkParentage(req, opts, { id, parents, reproductiveMode: mode, cohort, doc: merged }, { trusted: context[TRUSTED] === true })
    const errors = issues.filter((i) => i.severity === 'error')
    if (errors.length)
      throw new ValidationError({
        collection: opts.collection,
        errors: errors.map((e) => ({ path: e.path ?? 'parentage', message: e.message })),
      })

    if (!same(parents, before)) {
      const current = (await req.payload.findGlobal({ slug: opts.graphGlobal as GlobalSlug, depth: 0, overrideAccess: true, req })) as { revision?: number }
      await req.payload.updateGlobal({
        slug: opts.graphGlobal as GlobalSlug,
        data: { revision: (current?.revision ?? 0) + 1 } as never,
        overrideAccess: true,
        context: { [SKIP]: true },
        req,
      })
    }
    return data
  }

/** Records whether this create/update bypasses access control (Local API default), for the readability check. */
export const rememberAccessMode: CollectionBeforeOperationHook = ({ args, operation, context }) => {
  if (operation === 'create' || operation === 'update' || operation === 'updateByID')
    context[TRUSTED] = (args as { overrideAccess?: boolean }).overrideAccess !== false
  return args
}

/** Deleting a recorded parent: refuse (archive instead) or remove the references, per the plugin option. */
export const parentBeforeDelete =
  (opts: ResolvedOptions): CollectionBeforeDeleteHook =>
  async ({ id, req, context }) => {
    if (context[SKIP]) return
    const { docs } = await req.payload.find({
      collection: opts.collection as CollectionSlug,
      where: childrenWhere(opts, [String(id)]),
      depth: 0,
      pagination: false,
      limit: opts.onReferencedIndividualDelete === 'restrict' ? 1 : 0,
      overrideAccess: true,
      req,
    })
    if (!docs.length) return
    if (opts.onReferencedIndividualDelete === 'restrict')
      throw new APIError('This individual is a recorded parent. Archive it instead, or remove it from its offspring first.', 409)
    const m = opts.fields.parentage
    for (const child of docs) {
      const data =
        m.kind === 'role-fields'
          ? Object.fromEntries(Object.values(m.roles).filter((p) => idOf(getAt(child, p)) === String(id)).map((p) => [p, null]))
          : {
              [m.path]: {
                ...((getAt(child, m.path) as object) ?? {}),
                parents: ((getAt(child, `${m.path}.parents`) as Record<string, unknown>[]) ?? []).filter((r) => idOf(r[m.individualField]) !== String(id)),
              },
            }
      await req.payload.update({ collection: opts.collection as CollectionSlug, id: child.id, data: data as never, overrideAccess: true, context: { [SKIP]: true }, req })
    }
  }

/** Structure of a document's recorded parentage (for Admin notices). */
export const structureOf = (doc: Record<string, unknown>, opts: ResolvedOptions) => reproductiveStructure(toIndividual(doc, opts))


/**
 * Cohorts: setting or changing the birthing parent is refused while members
 * record a different mother (fix the members first, or move them to their own cohort).
 */
export const cohortBirthParentBeforeChange =
  (opts: ResolvedOptions): CollectionBeforeChangeHook =>
  async ({ data, originalDoc, req, operation, context }) => {
    const field = opts.cohorts?.birthParentField
    if (!field || operation !== 'update' || context[SKIP]) return data
    const next = idOf(getAt({ ...originalDoc, ...data }, field))
    if (!next || next === idOf(getAt(originalDoc, field))) return data
    const { docs } = await req.payload.find({
      collection: opts.collection as CollectionSlug,
      where: { [opts.fields.parentage.cohort!]: { equals: originalDoc!.id } },
      depth: 0,
      pagination: false,
      select: graphSelect(opts) as never,
      overrideAccess: true,
      req,
    })
    const conflicting = (docs as unknown as Record<string, unknown>[]).filter((d) =>
      readParents(d, opts).some((p) => p.role && maternalRoles(opts).includes(p.role) && p.individual !== next),
    ).length
    if (conflicting)
      throw new ValidationError({
        collection: opts.cohorts!.collection,
        errors: [{ path: field, message: `${conflicting} member(s) of this birthing event record a different mother.` }],
      })
    return data
  }
