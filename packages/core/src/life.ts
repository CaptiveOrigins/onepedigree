import type { Individual } from './types'

/**
 * Birth and death, for labels ("1950 – 2010") and timelines. Read from the
 * individual's display data, never required: `data.born` / `data.died`
 * (a year, an ISO date or any text containing a year), `data.living: true` or `data.status: 'alive'`,
 * and GEDCOM imports' `data.gedcom.birth.date` / `death.date` ("12 MAR 1950",
 * "ABT 1900", "BET 1900 AND 1910"). Hosts map their own fields into `data`.
 */
export type LifeSpan = {
  /** Year, with a fraction when the month (and day) are known (1950.5 ≈ July 1950). */
  born: number | null
  died: number | null
  /** Recorded as alive (so "present" rather than "unknown"). */
  living: boolean
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** A year (with month/day fraction when known) from a number, ISO date or GEDCOM date; null when there is none. */
export function yearOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const s = value.trim().toUpperCase()
  const iso = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(s)
  if (iso) {
    const y = Number(iso[1])
    const m = Number(iso[2] ?? 0)
    const d = Number(iso[3] ?? 0)
    if (!y) return null
    return m ? y + (m - 1) / 12 + (d ? (d - 1) / 365 : 0) : y
  }
  // GEDCOM: the first year mentioned ("ABT 1900", "BET 1900 AND 1910", "12 MAR 1950").
  const ged = /(?:(\d{1,2})\s+)?(?:(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+)?(\d{3,4})\b/.exec(s)
  if (!ged) return null
  const y = Number(ged[3])
  const m = ged[2] ? MONTHS.indexOf(ged[2]) + 1 : 0
  const d = Number(ged[1] ?? 0)
  return m ? y + (m - 1) / 12 + (d ? (d - 1) / 365 : 0) : y
}

const pick = (data: Record<string, unknown>, keys: string[]) => keys.map((k) => data[k]).find((v) => v !== undefined && v !== null && v !== '')

export function lifeSpan(individual: Individual | undefined): LifeSpan {
  const data = (individual?.data ?? {}) as Record<string, unknown>
  const ged = (data.gedcom ?? {}) as { birth?: { date?: string }; death?: { date?: string } }
  return {
    born: yearOf(pick(data, ['born', 'birthDate', 'birth']) ?? ged.birth?.date),
    died: yearOf(pick(data, ['died', 'deathDate', 'death']) ?? ged.death?.date),
    // `status: 'alive'` is how keeper records (e.g. Captive Origins animals) say so.
    living: data.living === true || data.status === 'alive',
  }
}

export type LifeWords = { unknown: string; present: string }
const WORDS: LifeWords = { unknown: 'unknown', present: 'present' }

/** "1950 – 2010", "1950 – unknown", "unknown – 2010", "2024 – present"; empty when nothing is known. */
export function lifeLabel(span: LifeSpan, words: Partial<LifeWords> = {}): string {
  const w = { ...WORDS, ...words }
  if (span.born === null && span.died === null) return ''
  const born = span.born === null ? w.unknown : String(Math.floor(span.born))
  const died = span.died !== null ? String(Math.floor(span.died)) : span.living ? w.present : w.unknown
  return `${born} – ${died}`
}
