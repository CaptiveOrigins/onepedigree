import {
  getSiblings,
  indexPedigree,
  layoutSync,
  loadNeighborhood,
  PEDIGREE_VIEWS,
  projectPedigree,
  type Individual,
  type OccurrenceMode,
  type ParentReference,
  type PedigreeDocument,
  type PedigreeIssue,
  type PedigreeRepository,
  type PedigreeViewId,
  type ReproductiveModeId,
  roleLabel,
} from '@captiveorigins/onepedigree-core'
import { addDataAndFileToRequest, APIError, type CollectionSlug, type Endpoint, type GlobalSlug, type PayloadRequest, type Where } from 'payload'

import { checkParentage } from './integrity.js'
import { childrenWhere, documentAdapter, graphSelect, termsFor, toIndividual } from './mapping.js'
import { withStoredParents } from './privacy.js'
import type { ResolvedOptions } from './types.js'

type Doc = Record<string, unknown>

/** Reads as the requester (access control applies) unless `trusted`. */
export function payloadRepository(req: PayloadRequest, opts: ResolvedOptions, trusted = false): PedigreeRepository<Doc> {
  // Stored IDs, so hidden parents can be told apart from unloaded ones and redacted below (see `redact`).
  const find = async (where: Where) =>
    (
      await withStoredParents(req, () => req.payload.find({
        collection: opts.collection as CollectionSlug,
        where,
        depth: 0,
        limit: opts.limits.maxNodes,
        pagination: false,
        select: graphSelect(opts, req.user) as never,
        overrideAccess: trusted,
        req,
      }))
    ).docs as Doc[]
  return { getByIds: (ids) => find({ id: { in: [...ids] } }), findChildrenOf: (ids) => find(childrenWhere(opts, ids)) }
}

const int = (v: string | null, fallback: number, max: number) => {
  const n = v === null ? fallback : Math.floor(Number(v))
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : fallback
}

const hrefFor = (opts: ResolvedOptions, id: string) => opts.navigation?.individualUrl?.replace('{id}', encodeURIComponent(id)) ?? null

/**
 * Removes every reference to a record the requester did not receive. With
 * `placeholder`, requested-but-hidden parents become anonymous "private"
 * individuals (fresh IDs per response, no name); otherwise they are omitted.
 * Returns whether unloaded (not hidden) parents exist, i.e. the view is limited.
 */
export function redact(individuals: Individual[], hidden: ReadonlySet<string>, opts: ResolvedOptions) {
  const loaded = new Set(individuals.map((i) => i.id))
  const placeholders = new Map<string, string>()
  let beyond = false
  let hiddenSeen = false
  const out: Individual[] = individuals.map((ind) => {
    const parents: ParentReference[] = []
    for (const p of ind.parentage?.parents ?? []) {
      if (loaded.has(p.individual)) parents.push(p)
      else if (hidden.has(p.individual)) {
        hiddenSeen = true
        if (opts.hiddenRecords === 'placeholder') {
          if (!placeholders.has(p.individual)) placeholders.set(p.individual, `private-${placeholders.size + 1}`)
          parents.push({ individual: placeholders.get(p.individual)!, role: p.role ?? null })
        }
      } else beyond = true
    }
    const data = { ...(ind.data ?? {}), href: hrefFor(opts, ind.id) }
    return { ...ind, data, parentage: ind.parentage ? { ...ind.parentage, parents } : null }
  })
  for (const id of placeholders.values()) out.push({ id, label: null, sex: null, parentage: null, data: { private: true } })
  return { individuals: out, beyond, hiddenSeen }
}

async function readable(req: PayloadRequest, collection: string, id: string) {
  return withStoredParents(req, () => req.payload.findByID({ collection: collection as CollectionSlug, id, depth: 0, overrideAccess: false, disableErrors: true, req }))
}

async function canUpdate(req: PayloadRequest, opts: ResolvedOptions, id: string) {
  const access = req.payload.collections[opts.collection as CollectionSlug]?.config.access.update
  if (!access) return Boolean(req.user)
  const result = await access({ req, id, data: undefined } as never)
  if (result === true) return true
  if (!result) return false
  return (await req.payload.count({ collection: opts.collection as CollectionSlug, where: { and: [result as Where, { id: { equals: id } }] }, overrideAccess: true, req })).totalDocs > 0
}

const DOWN_VIEWS = new Set<PedigreeViewId>(['descendants', 'hourglass', 'population', 'timeline'])

export type PedigreeQuery = Partial<Record<'view' | 'ancestorDepth' | 'descendantDepth' | 'maxNodes' | 'relatedId' | 'cohortId' | 'occurrenceMode' | 'includeSiblings' | 'orientation' | 'layout', string>>

/**
 * A permission-filtered projection (and layout) of one view, read as the
 * request's user. The endpoint uses it; host pages call it too (with a
 * request from `createLocalReq`). Null when the focal record is not readable.
 */
export async function getPedigree(req: PayloadRequest, opts: ResolvedOptions, id: string, query: PedigreeQuery = {}) {
  if (!(await readable(req, opts.collection, id))) return null
  const q = { get: (k: keyof PedigreeQuery) => query[k] ?? null }
  const enabled = opts.views?.enabled ?? PEDIGREE_VIEWS
  const view = (q.get('view') ?? opts.views?.default ?? 'pedigree') as PedigreeViewId
  if (!enabled.includes(view)) throw new APIError('Unknown or disabled view.', 400)
  const max = opts.limits.maxDepth
  const ancestorDepth = int(q.get('ancestorDepth'), 4, max)
  const descendantDepth = int(q.get('descendantDepth'), 3, max)
  const maxNodes = int(q.get('maxNodes'), opts.limits.maxNodes, opts.limits.maxNodes)
  const relatedId = q.get('relatedId') && (await readable(req, opts.collection, q.get('relatedId')!)) ? q.get('relatedId')! : undefined
  const modeParam = q.get('occurrenceMode')
  const occurrenceMode = modeParam === 'merge' || modeParam === 'separate' || modeParam === 'hybrid' ? (modeParam as OccurrenceMode) : undefined

  const focalIds = [id, ...(relatedId ? [relatedId] : [])]
  let cohortId: string | undefined
  if (view === 'cohort' && opts.cohorts) {
    cohortId = q.get('cohortId') ?? undefined
    const self = (await readable(req, opts.collection, id)) as Doc
    cohortId ??= String(toIndividual(self, opts).parentage?.cohort ?? '') || undefined
    if (cohortId) {
      const { docs } = await req.payload.find({
        collection: opts.collection as CollectionSlug,
        where: { [opts.fields.parentage.cohort!]: { equals: cohortId } },
        depth: 0,
        limit: maxNodes,
        pagination: false,
        select: {} as never,
        overrideAccess: false,
        req,
      })
      focalIds.push(...(docs as unknown as { id: string }[]).map((d) => String(d.id)))
    }
  }
  const both = view === 'population' || view === 'timeline'
  const n = await loadNeighborhood(payloadRepository(req, opts), documentAdapter(opts, req.user), {
    focalIds,
    ancestorDepth: view === 'cohort' ? 1 : view === 'descendants' ? 0 : relatedId ? max : ancestorDepth,
    descendantDepth: DOWN_VIEWS.has(view) ? descendantDepth : 0,
    includeSiblings: both || q.get('includeSiblings') === 'true',
    maxNodes,
  })
  const { individuals, beyond, hiddenSeen } = redact([...n.document.individuals], new Set(n.unavailable), opts)
  // Names of the cohorts involved that the requester may read (for cohort markers).
  const cohortIds = [...new Set(individuals.map((i) => i.parentage?.cohort).filter((c): c is string => Boolean(c)))]
  const cohorts =
    opts.cohorts && cohortIds.length
      ? (
          await req.payload.find({
            collection: opts.cohorts.collection as CollectionSlug,
            where: { id: { in: cohortIds } },
            depth: 0,
            pagination: false,
            overrideAccess: false,
            req,
          })
        ).docs.map((c) => ({ id: String(c.id), label: typeof (c as Doc)[opts.cohorts!.label] === 'string' ? ((c as Doc)[opts.cohorts!.label] as string) : null }))
      : []
  const document: PedigreeDocument = { schemaVersion: 1, individuals, cohorts }
  const projection = projectPedigree(document, {
    focalId: id,
    view,
    ancestorDepth,
    descendantDepth,
    relatedId,
    cohortId,
    maxNodes,
    includeSiblings: q.get('includeSiblings') === 'true',
    includeCohortMembers: true,
    lineageRoles: opts.lineageRoles,
    ...(occurrenceMode ? { occurrenceMode } : {}),
  })
  const issues: PedigreeIssue[] = [...projection.issues]
  if (hiddenSeen) issues.push({ severity: 'notice', code: 'HIDDEN_RECORD', message: 'Some related records are private and not shown.' })
  const result = { ...projection, issues, truncated: projection.truncated || n.truncated || beyond }
  const revision = ((await req.payload.findGlobal({ slug: opts.graphGlobal as GlobalSlug, depth: 0, overrideAccess: true, req })) as { revision?: number })?.revision ?? 0
  const orientation = q.get('orientation') === 'horizontal' ? 'horizontal' : 'vertical'
  return {
    schemaVersion: 1 as const,
    revision,
    projection: result,
    layout: q.get('layout') === 'false' ? null : layoutSync(result, { orientation }),
  }
}

/** GET /:id/pedigree?view=…: a permission-filtered projection (and layout) for one view. */
export const pedigreeEndpoint = (opts: ResolvedOptions): Endpoint => ({
  path: '/:id/pedigree',
  method: 'get',
  handler: async (req) => {
    const params = new URL(req.url ?? 'http://local', 'http://local').searchParams
    const result = await getPedigree(req, opts, String(req.routeParams?.id), Object.fromEntries(params) as PedigreeQuery)
    return result ? Response.json(result) : Response.json({ error: 'Not found' }, { status: 404 })
  },
})

export type Summary = { id: string; label: string | null; identifier: string | null; sex: string | null; href: string | null } | { private: true }
const summary = (ind: Individual, opts: ResolvedOptions): Summary => ({
  id: ind.id,
  label: ind.label ?? null,
  identifier: ind.identifier ?? null,
  sex: ind.sex ?? null,
  href: hrefFor(opts, ind.id),
})

/** Parents, offspring, siblings (full / partial / unresolved) and cohort mates the request's user may see. Null when not readable. */
export async function getRelatives(req: PayloadRequest, opts: ResolvedOptions, id: string) {
  if (!(await readable(req, opts.collection, id))) return null
  const n = await loadNeighborhood(payloadRepository(req, opts), documentAdapter(opts, req.user), { focalIds: [id], ancestorDepth: 1, descendantDepth: 1, includeSiblings: true, maxNodes: opts.limits.maxNodes })
  const { individuals } = redact([...n.document.individuals], new Set(n.unavailable), opts)
  const index = indexPedigree({ schemaVersion: 1, individuals })
  const at = (x: string): Summary => (index.individuals.get(x)?.data?.private ? { private: true } : summary(index.individuals.get(x)!, opts))
  const self = index.individuals.get(id)!
  const s = getSiblings(index, id)
  const cohort = self.parentage?.cohort
  const cohortMates = cohort ? [...(index.membersOf.get(cohort) ?? [])].filter((m) => m !== id) : []
  const terms = await termsFor(opts, req.user)
  return {
    parents: (self.parentage?.parents ?? []).map((p) => ({ role: p.role ?? null, label: roleLabel(p.role, terms, opts.lineageRoles), individual: at(p.individual) })),
    children: [...(index.childrenOf.get(id) ?? [])].map(at),
    siblings: { full: s.full.map(at), partial: s.partial.map(at), unresolved: s.unresolved.map(at) },
    cohort: cohort ? { id: cohort, mates: cohortMates.map(at) } : null,
  }
}

/** GET /:id/relatives */
export const relativesEndpoint = (opts: ResolvedOptions): Endpoint => ({
  path: '/:id/relatives',
  method: 'get',
  handler: async (req) => {
    const result = await getRelatives(req, opts, String(req.routeParams?.id))
    return result ? Response.json(result) : Response.json({ error: 'Not found' }, { status: 404 })
  },
})

/** POST /:id/pedigree/validate { parents, reproductiveMode, cohort }: check a proposed change without saving. */
export const validateEndpoint = (opts: ResolvedOptions): Endpoint => ({
  path: '/:id/pedigree/validate',
  method: 'post',
  handler: async (req) => {
    const id = String(req.routeParams?.id)
    if (!(await readable(req, opts.collection, id)) || !(await canUpdate(req, opts, id))) return Response.json({ error: 'Not found' }, { status: 404 })
    await addDataAndFileToRequest(req)
    const body = (req.data ?? {}) as { parents?: unknown; reproductiveMode?: unknown; cohort?: unknown }
    const parents = Array.isArray(body.parents)
      ? body.parents.flatMap((p) =>
          p && typeof p === 'object' && typeof (p as ParentReference).individual === 'string'
            ? [{ individual: (p as ParentReference).individual, role: typeof (p as ParentReference).role === 'string' ? (p as ParentReference).role : null }]
            : [],
        )
      : []
    const issues = await checkParentage(req, opts, {
      id,
      parents,
      reproductiveMode: typeof body.reproductiveMode === 'string' ? (body.reproductiveMode as ReproductiveModeId) : null,
      cohort: typeof body.cohort === 'string' ? body.cohort : null,
    })
    return Response.json({ valid: !issues.some((i) => i.severity === 'error'), issues })
  },
})

/** GET /api/<cohorts>/:id/members: members the requester may see (from each member's parentage). */
export const cohortMembersEndpoint = (opts: ResolvedOptions): Endpoint => ({
  path: '/:id/members',
  method: 'get',
  handler: async (req) => {
    const id = String(req.routeParams?.id)
    if (!opts.cohorts || !(await readable(req, opts.cohorts.collection, id))) return Response.json({ error: 'Not found' }, { status: 404 })
    const { docs } = await req.payload.find({
      collection: opts.collection as CollectionSlug,
      where: { [opts.fields.parentage.cohort!]: { equals: id } },
      depth: 0,
      limit: opts.limits.maxNodes,
      pagination: false,
      select: graphSelect(opts, req.user) as never,
      overrideAccess: false,
      req,
    })
    return Response.json({ members: docs.map((d) => summary(toIndividual(d as Doc, opts, req.user), opts)) })
  },
})
