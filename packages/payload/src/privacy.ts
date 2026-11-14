import { validations, ValidationError, type CollectionAfterReadHook, type CollectionBeforeValidateHook, type CollectionSlug, type PayloadRequest, type Where } from 'payload'

import { isBiologicalKind } from '@extantape/onepedigree-core'

import { getAt, idOf } from './mapping.js'
import type { ResolvedOptions } from './types.js'

/**
 * What a reader gets in place of a parent they may not read, on plain collection reads (REST, GraphQL, Admin, Local
 * API with access control): no ID, name or link. With `hiddenRecords: 'omit'` the parent is left out instead.
 */
export type PrivateParent = { private: true }
export const isPrivateParent = (v: unknown): v is PrivateParent =>
  Boolean(v) && typeof v === 'object' && !('id' in (v as object)) && (v as { private?: unknown }).private === true

/** Per request: which individuals its user may read. */
const READABLE = 'onepedigreeReadable'
const SELECTOR_ROLES = { mother: 'mother', father: 'father' } as const
/** Per request and record: stored parents the editor can't read, kept by `keepHiddenParents`. */
const KEPT = 'onepedigreeKeptParents'

/**
 * Wraps a parent field's validation. A stored parent that `keepHiddenParents` kept on this record is valid as it is:
 * Payload's own check would look it up with the editor's access whenever the field has `filterOptions` (multi-tenant
 * adds them), and refuse it, so the editor couldn't save the record at all. Every other value goes through the
 * field's own validation, or Payload's relationship validation.
 */
export const keptParentValidate =
  (original: ((value: unknown, options: unknown) => unknown) | undefined) =>
  (value: unknown, options: { id?: string | number; req?: PayloadRequest; [k: string]: unknown }) => {
    const kept = options?.id != null ? (options.req?.context[KEPT] as Map<string, Set<string>> | undefined)?.get(String(options.id)) : undefined
    const id = idOf(value)
    if (kept && id && kept.has(id)) return true
    return (original ?? (validations.relationship as (value: unknown, options: unknown) => unknown))(value, options)
  }

/** Per request: how many of the plugin's own reads are running that need stored IDs (they redact for themselves). */
const RAW = 'onepedigreeRawParents'

/**
 * Runs `read` with stored parent IDs left in place, for the plugin's own reads through access control: the pedigree
 * and relatives endpoints, which replace hidden parents with their own placeholders, and the parentage check. A
 * counter, not a flag, so overlapping reads can't switch redaction back on for each other. Never return these
 * documents to a reader as they are.
 */
export async function withStoredParents<T>(req: PayloadRequest, read: () => Promise<T>): Promise<T> {
  req.context[RAW] = ((req.context[RAW] as number | undefined) ?? 0) + 1
  try {
    return await read()
  } finally {
    req.context[RAW] = (req.context[RAW] as number) - 1
  }
}

/** The IDs among `ids` that the request's user may read. Cached on the request. */
export async function readableIds(req: PayloadRequest, opts: ResolvedOptions, ids: readonly string[]): Promise<Set<string>> {
  const cache = ((req.context[READABLE] as Map<string, boolean> | undefined) ??= new Map<string, boolean>())
  const unknown = [...new Set(ids)].filter((id) => !cache.has(id))
  if (unknown.length) {
    const read = req.payload.collections[opts.collection as CollectionSlug]?.config.access.read
    const all = read ? (await read({ req } as never)) === true : Boolean(req.user)
    let found = new Set(unknown)
    if (!all) {
      const { docs } = await req.payload.find({
        collection: opts.collection as CollectionSlug,
        where: { id: { in: unknown } } as Where,
        depth: 0,
        pagination: false,
        select: {} as never,
        overrideAccess: false,
        // No context flag here: Payload would copy it onto this request. These docs carry IDs only, so this hook
        // finds no parents in them and returns at once.
        req,
      })
      found = new Set((docs as unknown as { id: unknown }[]).map((d) => String(d.id)))
    }
    for (const id of unknown) cache.set(id, found.has(id))
  }
  return new Set(ids.filter((id) => cache.get(id)))
}

const setAt = (doc: Record<string, unknown>, path: string, value: unknown) => {
  const keys = path.split('.')
  let o: Record<string, unknown> = doc
  for (const k of keys.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== 'object') return
    o = o[k] as Record<string, unknown>
  }
  if (value === undefined) delete o[keys.at(-1)!]
  else o[keys.at(-1)!] = value
}

/** Every stored parent ID of a document, wherever the mapping keeps it (role fields, rows, pickers). */
function storedIds(doc: unknown, opts: ResolvedOptions): string[] {
  const m = opts.fields.parentage
  if (m.kind === 'role-fields') return Object.values(m.roles).flatMap((p) => idOf(getAt(doc, p)) ?? [])
  const rows = getAt(doc, `${m.path}.parents`)
  const fromRows = Array.isArray(rows) ? rows.flatMap((r) => idOf((r as Record<string, unknown>)?.[m.individualField]) ?? []) : []
  const fromPickers = Object.keys(SELECTOR_ROLES).flatMap((k) => idOf(getAt(doc, `${m.path}.${k}`)) ?? [])
  return [...fromRows, ...fromPickers]
}

/**
 * Plain reads (spec §42.4): a parent the reader may not read comes back as `{ private: true }`, or is left out with
 * `hiddenRecords: 'omit'`, at every depth. Trusted Local API reads (access control overridden) are unchanged.
 */
export const parentageAfterRead =
  (opts: ResolvedOptions): CollectionAfterReadHook =>
  async ({ doc, req, overrideAccess }) => {
    if (overrideAccess === true || ((req.context[RAW] as number | undefined) ?? 0) > 0 || !doc || typeof doc !== 'object') return doc
    const ids = storedIds(doc, opts)
    if (!ids.length) return doc
    const ok = await readableIds(req, opts, ids)
    const hidden = new Set(ids.filter((id) => !ok.has(id)))
    if (!hidden.size) return doc
    const isHidden = (v: unknown) => {
      const id = idOf(v)
      return id !== null && hidden.has(id)
    }
    // GraphQL resolves relationship values itself and needs an ID or nothing; there, a hidden parent is null.
    const placeholder = opts.hiddenRecords === 'placeholder' && req.payloadAPI !== 'GraphQL'
    const m = opts.fields.parentage
    if (m.kind === 'role-fields') {
      for (const path of Object.values(m.roles)) if (isHidden(getAt(doc, path))) setAt(doc, path, placeholder ? { private: true } : null)
      return doc
    }
    const rows = getAt(doc, `${m.path}.parents`)
    if (Array.isArray(rows))
      setAt(
        doc,
        `${m.path}.parents`,
        rows.flatMap((r: Record<string, unknown>) => {
          if (!isHidden(r?.[m.individualField])) return [r]
          return placeholder ? [{ ...r, [m.individualField]: { private: true } }] : req.payloadAPI === 'GraphQL' ? [{ ...r, [m.individualField]: null }] : []
        }),
      )
    for (const k of Object.keys(SELECTOR_ROLES))
      if (isHidden(getAt(doc, `${m.path}.${k}`))) setAt(doc, `${m.path}.${k}`, placeholder ? { private: true } : null)
    return doc
  }

const refuse = (opts: ResolvedOptions, path: string): never => {
  throw new ValidationError({
    collection: opts.collection,
    errors: [{ path, message: 'This parent is private to you, so you can’t change or remove it. Ask someone who can see it.' }],
  })
}

/**
 * The write side of the redaction: on an update with access control, parents the editor may not read are kept as
 * stored. A placeholder, an empty value or a missing row means "unchanged", so saving a form that showed a private
 * parent never erases it; replacing one with another parent is refused. Runs before field validation.
 */
export const keepHiddenParents =
  (opts: ResolvedOptions, trustedKey: string, skipKey: string): CollectionBeforeValidateHook =>
  async ({ data, originalDoc, req, operation, context }) => {
    if (operation !== 'update' || !data || !originalDoc || context[skipKey] || context[trustedKey] === true) return data
    const stored = storedIds(originalDoc, opts)
    if (!stored.length) return data
    const ok = await readableIds(req, opts, stored)
    const hidden = new Set(stored.filter((id) => !ok.has(id)))
    if (!hidden.size) return data
    // For `keptParentValidate`: these stored parents stay on this record, so field validation lets them through.
    const kept = ((req.context[KEPT] as Map<string, Set<string>> | undefined) ??= new Map<string, Set<string>>())
    kept.set(String(originalDoc.id), hidden)
    const d = data as Record<string, unknown>
    const m = opts.fields.parentage

    if (m.kind === 'role-fields') {
      for (const path of Object.values(m.roles)) {
        const before = idOf(getAt(originalDoc, path))
        const next = getAt(d, path)
        if (!before || !hidden.has(before) || next === undefined) continue
        if (next === null || isPrivateParent(next) || idOf(next) === before) setAt(d, path, before)
        else refuse(opts, path)
      }
      return d
    }

    for (const k of Object.keys(SELECTOR_ROLES) as (keyof typeof SELECTOR_ROLES)[]) {
      const path = `${m.path}.${k}`
      const next = getAt(d, path)
      if (next === undefined) continue
      const rows = (getAt(originalDoc, `${m.path}.parents`) ?? []) as Record<string, unknown>[]
      // The picker shows the biological row with its role (see `createRoleSelectorField`).
      const before = idOf(rows.find((r) => r?.[m.roleField] === SELECTOR_ROLES[k] && isBiologicalKind(r?.[m.kindField] as string | null | undefined))?.[m.individualField])
      if (!before || !hidden.has(before)) continue
      // Leave the picker out of the write: the rows below keep the private parent.
      if (next === null || isPrivateParent(next) || idOf(next) === before) setAt(d, path, undefined)
      else refuse(opts, path)
    }

    const incoming = getAt(d, `${m.path}.parents`)
    if (!Array.isArray(incoming)) return d
    const originals = ((getAt(originalDoc, `${m.path}.parents`) ?? []) as Record<string, unknown>[]).filter((r) => hidden.has(idOf(r?.[m.individualField]) ?? ''))
    const used = new Set<Record<string, unknown>>()
    const restore = (row: Record<string, unknown>) => {
      const match = originals.find((o) => !used.has(o) && row?.id != null && o.id === row.id) ?? originals.find((o) => !used.has(o))
      if (!match) return null
      used.add(match)
      return { ...match, [m.individualField]: idOf(match[m.individualField]) }
    }
    const rows: Record<string, unknown>[] = []
    for (const row of incoming as Record<string, unknown>[]) {
      const v = row?.[m.individualField]
      if (isPrivateParent(v)) {
        const r = restore(row)
        if (r) rows.push(r)
        continue
      }
      const id = idOf(v)
      if (id && hidden.has(id)) {
        const o = originals.find((x) => !used.has(x) && idOf(x[m.individualField]) === id)
        if (o) used.add(o)
      }
      rows.push(row)
    }
    // Private rows the editor didn't send (left out, or omitted from what they read) stay.
    for (const o of originals) if (!used.has(o)) rows.push({ ...o, [m.individualField]: idOf(o[m.individualField]) })
    setAt(d, `${m.path}.parents`, rows)
    return d
  }
