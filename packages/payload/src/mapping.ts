import { adaptIndividual, REPRODUCTIVE_MODES, type Individual, type ParentReference, type PedigreeAdapter, type ReproductiveModeId } from '@captiveorigins/onepedigree-core'
import type { Where } from 'payload'

import type { OnePedigreePluginOptions, ResolvedOptions } from './types.js'

export const idOf = (v: unknown): string | null =>
  v && typeof v === 'object' && 'id' in v ? String((v as { id: unknown }).id) : v !== undefined && v !== null && v !== '' ? String(v) : null

export const getAt = (doc: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), doc)

export function resolveOptions(o: OnePedigreePluginOptions): ResolvedOptions {
  const mapping = o.fields?.parentage ?? { kind: 'parent-array' as const }
  const parentage =
    mapping.kind === 'role-fields'
      ? mapping
      : {
          kind: 'parent-array' as const,
          path: mapping.path ?? 'parentage',
          individualField: mapping.individualField ?? 'individual',
          roleField: mapping.roleField ?? 'role',
          reproductiveMode: mapping.reproductiveMode ?? `${mapping.path ?? 'parentage'}.reproductiveMode`,
          cohort: mapping.cohort ?? `${mapping.path ?? 'parentage'}.cohort`,
        }
  return {
    ...o,
    mode: o.mode ?? 'standard-fields',
    hiddenRecords: o.hiddenRecords ?? 'omit',
    onReferencedIndividualDelete: o.onReferencedIndividualDelete ?? 'restrict',
    fields: { label: o.fields?.label ?? 'name', sex: o.fields?.sex ?? 'sex', parentage, display: o.fields?.display ?? [] },
    cohorts: o.cohorts ? { collection: o.cohorts.collection, label: o.cohorts.label ?? 'name', managed: o.cohorts.managed ?? false } : null,
    limits: { maxDepth: o.limits?.maxDepth ?? 10, maxNodes: o.limits?.maxNodes ?? 500 },
    graphGlobal: `${o.collection}-pedigree-graph`,
    settingsGlobal: 'pedigree-settings',
  }
}

/** The stored parent references of a document (relationship values may be IDs or populated docs). */
export function readParents(doc: unknown, opts: ResolvedOptions): ParentReference[] {
  const m = opts.fields.parentage
  if (m.kind === 'role-fields')
    return Object.entries(m.roles).flatMap(([role, path]) => {
      const id = idOf(getAt(doc, path))
      return id ? [{ individual: id, role }] : []
    })
  const rows = getAt(doc, `${m.path}.parents`)
  if (!Array.isArray(rows)) return []
  return rows.flatMap((r) => {
    const id = idOf((r as Record<string, unknown>)?.[m.individualField])
    const role = (r as Record<string, unknown>)?.[m.roleField]
    return id ? [{ individual: id, role: typeof role === 'string' && role ? role : null }] : []
  })
}

export const readMode = (doc: unknown, opts: ResolvedOptions): ReproductiveModeId | null => {
  const path = opts.fields.parentage.reproductiveMode
  const v = path ? getAt(doc, path) : null
  return typeof v === 'string' && (REPRODUCTIVE_MODES as readonly string[]).includes(v) ? (v as ReproductiveModeId) : null
}

export const readCohort = (doc: unknown, opts: ResolvedOptions) => {
  const path = opts.fields.parentage.cohort
  return path && opts.cohorts ? idOf(getAt(doc, path)) : null
}

/** Paths that hold parent IDs, for queries and indexes. */
export function parentPaths(opts: ResolvedOptions): string[] {
  const m = opts.fields.parentage
  return m.kind === 'role-fields' ? Object.values(m.roles) : [`${m.path}.parents.${m.individualField}`]
}

/** Records that list any of `ids` as a parent. */
export const childrenWhere = (opts: ResolvedOptions, ids: readonly string[]): Where => ({
  or: parentPaths(opts).map((p) => ({ [p]: { in: [...ids] } })),
})

/** Fields to read for the graph (keeps queries small; never the whole document). */
export function graphSelect(opts: ResolvedOptions): Record<string, true> {
  const m = opts.fields.parentage
  const top = (p: string) => p.split('.')[0]!
  const keys = new Set<string>([opts.fields.label, ...(opts.fields.sex ? [opts.fields.sex] : []), ...opts.fields.display.map(top)])
  if (m.kind === 'role-fields') for (const p of Object.values(m.roles)) keys.add(top(p))
  else keys.add(top(m.path))
  for (const p of [m.reproductiveMode, m.cohort]) if (p) keys.add(top(p))
  return Object.fromEntries([...keys].map((k) => [k, true as const]))
}

export function documentAdapter(opts: ResolvedOptions): PedigreeAdapter<Record<string, unknown>> {
  return {
    getId: (d) => String(d.id),
    getParents: (d) => readParents(d, opts),
    getReproductiveMode: (d) => readMode(d, opts),
    getCohortId: (d) => readCohort(d, opts),
    getLabel: (d) => {
      const v = getAt(d, opts.fields.label)
      return typeof v === 'string' && v ? v : null
    },
    getSexLabel: (d) => {
      const v = opts.fields.sex ? getAt(d, opts.fields.sex) : null
      return typeof v === 'string' && v ? v : null
    },
    getDisplayData: (d) => Object.fromEntries(opts.fields.display.map((p) => [p, getAt(d, p) ?? null])),
  }
}

export const toIndividual = (doc: Record<string, unknown>, opts: ResolvedOptions): Individual => adaptIndividual(doc, documentAdapter(opts))
