import { biologicalParents } from '@extantape/onepedigree-core'
import type { Studbook, StudbookAnimal, StudbookDate, StudbookEvent } from './types.js'

/**
 * PMx primary input, as a `.ped` file (PMx User Manual v1.0, pages 139–141): the free program studbook keepers use for
 * genetic and demographic analysis. Written so an official program can analyse our data in its own tools.
 *
 *   Analysis date: yyyymmdd
 *   Number of animals: n
 *   UDFs: AnimalID
 *   ID; SireID; DamID; Sex; Selected; Dead; Birth Date; Death Date; Location; Local ID; Other ID; AnimalID
 *   *SIRE: id; probability      (after a MULT sire; the same with *DAM)
 *   *MOVE: DateIn; InEst; InType; DateOut; OutEst; OutType; Location; Notes
 *
 * IDs are studbook numbers. Other ID is the registry ID and the AnimalID column the keeper's own, so both IDs
 * travel (owner, 2026-11-09). Locations are holder codes unless `holderLabel` names them, which only those allowed to
 * export see (contract with the platform). Fields can't hold `;`, `:` or tabs: an ID or code with one is refused, and
 * free-text notes have them replaced.
 */
export class PmxError extends Error {}

export type PmxOptions = {
  /** Analysis date, `yyyy-mm-dd`. Default: the studbook's currentness date. */
  analysisDate?: string
  /** Turns a holder code into the name an exporter may see. Default: the code itself. */
  holderLabel?: (code: string) => string
}

const FORBIDDEN = /[;:\t\r\n]/
const ymd = (iso: string | null | undefined) => (iso ? iso.replace(/-/g, '').slice(0, 8) : '')
const safe = (value: string, what: string) => {
  if (FORBIDDEN.test(value)) throw new PmxError(`${what} "${value}" contains ; : or a tab, which PMx can't read`)
  return value
}
const text = (value: string | undefined) => (value ?? '').replace(/[;:\t\r\n]+/g, ' ').trim()

/** PMx's estimate codes: Exact, Y, M, D, U, with an optional number of units. */
export function estimateCode(d: StudbookDate): string {
  if (d.precision === 'unknown' || !d.date) return 'U'
  if (d.precision === 'exact' || d.precision === 'day') return 'Exact'
  if (d.precision === 'month') return 'M'
  if (d.precision === 'year') return 'Y'
  const days = d.plusMinusDays ?? 0
  return days >= 365 ? `Y${Math.round(days / 365)}` : days >= 30 ? `M${Math.round(days / 30)}` : `D${Math.max(1, days)}`
}

/** PMx sex codes 0–7 (page 138). Fertility comes later with reproductive status (Must 8); until then, fertile. */
export function sexCode(a: StudbookAnimal): number {
  return { female: 0, male: 1, unknown: 5, abnormal: 4, hermaphrodite: 5 }[a.sex]
}

export const SIRE_ROLES: readonly string[] = ['father', 'sire', 'sperm']
export const DAM_ROLES: readonly string[] = ['mother', 'dam', 'egg']

type ParentField = { code: string; candidates?: { number: string; probability: number }[] }

export function toPed(book: Studbook, options: PmxOptions = {}): string {
  const numberOf = new Map(book.animals.map((a) => [a.id, safe(a.studbookNumber, 'Studbook number')]))
  const holder = (code: string) => safe(options.holderLabel ? options.holderLabel(code) : code, 'Location')
  const eventsOf = new Map<string, StudbookEvent[]>()
  for (const e of book.events) eventsOf.set(e.animal, [...(eventsOf.get(e.animal) ?? []), e])
  // Shared unknown and wild parents get one stable code each, so PMx inserts one founder for the clutch.
  const sharedCodes = new Map<string, string>()
  const sharedCode = (kind: string, key: string) => {
    const k = `${kind}:${key}`
    if (!sharedCodes.has(k)) sharedCodes.set(k, `${kind === 'wild' ? 'WLD' : 'UNK'}${[...sharedCodes.keys()].filter((x) => x.startsWith(`${kind}:`)).length + 1}`)
    return sharedCodes.get(k)!
  }

  const parentFields = (a: StudbookAnimal): { sire: ParentField; dam: ParentField } => {
    const out: { sire?: ParentField; dam?: ParentField } = {}
    const slot = (role: string | null | undefined) => {
      if (role && SIRE_ROLES.includes(role)) return 'sire' as const
      if (role && DAM_ROLES.includes(role)) return 'dam' as const
      throw new PmxError(`Studbook ${a.studbookNumber} has a parent with role "${role ?? 'none'}"; PMx needs each parent as sire or dam`)
    }
    // PMx's sire and dam are the genetic parents, so only biological links are written: a foster dam, a legal owner's
    // pick or any other non-biological link would put the wrong animal into PMx's kinship.
    for (const p of biologicalParents(a.parentage)) {
      const which = slot(p.role)
      // A parent with no studbook record is unknown to PMx (research: "a name or number with no record is unknown").
      out[which] = { code: numberOf.get(p.individual) ?? 'UNK' }
    }
    for (const u of a.parentage?.uncertainParents ?? []) {
      const which = slot(u.role)
      const known = u.candidates.filter((c) => numberOf.has(c.individual)).map((c) => ({ number: numberOf.get(c.individual)!, probability: c.probability }))
      if (known.length) out[which] = { code: 'MULT', candidates: known }
      else out[which] = { code: u.shared ? sharedCode(u.kind ?? 'unknown', u.shared) : u.kind === 'wild' ? 'WILD' : 'UNK' }
    }
    return { sire: out.sire ?? { code: 'UNK' }, dam: out.dam ?? { code: 'UNK' } }
  }

  const moves = (a: StudbookAnimal): string[] => {
    const evs = [...(eventsOf.get(a.id) ?? [])].sort((x, y) => (x.date.date ?? '').localeCompare(y.date.date ?? ''))
    const lines: string[] = []
    let open: { date: StudbookDate; type: string; location: string; notes?: string } | null = null
    const close = (date: StudbookDate, type: string) => {
      if (!open) return
      lines.push(`*MOVE: ${ymd(open.date.date)}; ${estimateCode(open.date)}; ${open.type}; ${ymd(date.date)}; ${estimateCode(date)}; ${type}; ${holder(open.location)}; ${text(open.notes)}`)
      open = null
    }
    for (const e of evs) {
      if (e.type === 'birth' || e.type === 'capture' || e.type === 'recapture' || e.type === 'return-from-ltf') open = { date: e.date, type: e.type === 'birth' ? 'birth' : e.type === 'return-from-ltf' ? 'found' : 'capture', location: e.location, ...(e.notes ? { notes: e.notes } : {}) }
      else if (e.type === 'transfer') { close(e.date, 'export'); open = { date: e.date, type: 'import', location: e.location, ...(e.notes ? { notes: e.notes } : {}) } }
      else close(e.date, e.type === 'death' ? 'death' : e.type === 'release' ? 'release' : 'lost')
    }
    if (open) close({ date: options.analysisDate ?? book.currentness, precision: 'exact' }, 'alive')
    return lines
  }

  const lines = [`Analysis date: ${ymd(options.analysisDate ?? book.currentness)}`, `Number of animals: ${book.animals.length}`, 'UDFs: AnimalID']
  for (const a of [...book.animals].sort((x, y) => Number(x.studbookNumber.replace(/\D/g, '')) - Number(y.studbookNumber.replace(/\D/g, '')) || x.studbookNumber.localeCompare(y.studbookNumber))) {
    const { sire, dam } = parentFields(a)
    const evs = eventsOf.get(a.id) ?? []
    const last = [...evs].sort((x, y) => (x.date.date ?? '').localeCompare(y.date.date ?? '')).at(-1)
    const death = evs.find((e) => e.type === 'death')
    const selected = a.selected ?? a.status === 'alive'
    lines.push([
      numberOf.get(a.id)!, sire.code, dam.code, sexCode(a), selected ? 'T' : 'F', a.status === 'dead' ? 'T' : 'F',
      a.birth.precision === 'unknown' ? '' : ymd(a.birth.date), death && death.date.precision !== 'unknown' ? ymd(death.date.date) : '',
      last ? holder(last.location) : '', last?.localId ? safe(last.localId, 'Local ID') : '', safe(a.coId, 'Registry ID'), a.animalId ? safe(a.animalId, 'Animal ID') : '',
    ].join('; '))
    for (const c of sire.candidates ?? []) lines.push(`*SIRE: ${c.number}; ${c.probability}`)
    for (const c of dam.candidates ?? []) lines.push(`*DAM: ${c.number}; ${c.probability}`)
    lines.push(...moves(a))
  }
  return `${lines.join('\n')}\n`
}
