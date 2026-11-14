import type { PedigreeIssue } from '@extantape/onepedigree-core'

/**
 * Studbook numbers, by the rules studbook keepers use (PopLink 2.5.2; docs/architecture/studbook.md):
 * - Numbers are text, so "01" and "1" never compare equal by accident.
 * - Permanent numbers run 1, 2, 3… within one studbook: digits only, no leading zero, no letters, no codes.
 * - Temporary numbers are "T" and a number (T1, T2…), for an animal that isn't confirmed yet.
 * - A number is never reused, including one an animal has moved off. Every old number stays in `oldNumbers`.
 * - A regional studbook may take the international number, so any unused permanent number can be given, not only the next.
 * Nothing here stores anything: the caller saves the result, so the counter is per studbook by construction.
 */
export type NumberedAnimal = { id: string; studbookNumber: string; oldNumbers?: readonly string[] }

const PERMANENT = /^[1-9]\d*$/
const TEMPORARY = /^T[1-9]\d*$/

export const isPermanentNumber = (n: string): boolean => PERMANENT.test(n)
export const isTemporaryNumber = (n: string): boolean => TEMPORARY.test(n)

/** Every number the studbook has ever used: current and old. */
export function usedNumbers(animals: readonly NumberedAnimal[]): Set<string> {
  const used = new Set<string>()
  for (const a of animals) {
    used.add(a.studbookNumber)
    for (const o of a.oldNumbers ?? []) used.add(o)
  }
  return used
}

/** The next number never used in this studbook: one past the highest permanent (or temporary) number ever given. */
export function nextStudbookNumber(animals: readonly NumberedAnimal[], options: { temporary?: boolean } = {}): string {
  let max = 0n
  for (const n of usedNumbers(animals)) {
    const digits = options.temporary ? (isTemporaryNumber(n) ? n.slice(1) : null) : isPermanentNumber(n) ? n : null
    if (digits !== null && BigInt(digits) > max) max = BigInt(digits)
  }
  return `${options.temporary ? 'T' : ''}${max + 1n}`
}

export type Renumbered = { animal: NumberedAnimal; issues: PedigreeIssue[] }

/**
 * Moves an animal to a new number, keeping the old one in `oldNumbers`. With no number given it takes the next
 * permanent one, which is how a temporary number is confirmed. Refuses (returns the animal unchanged, with an error)
 * a number that is malformed or already used anywhere in the studbook.
 */
export function renumber(animals: readonly NumberedAnimal[], id: string, to?: string): Renumbered {
  const animal = animals.find((a) => a.id === id)
  if (!animal) throw new Error(`No animal ${id} in this studbook`)
  const next = to ?? nextStudbookNumber(animals)
  const refuse = (code: string, message: string): Renumbered => ({ animal, issues: [{ severity: 'error', code, message, individualId: id }] })
  if (!isPermanentNumber(next) && !isTemporaryNumber(next)) return refuse('INVALID_STUDBOOK_NUMBER', `"${next}" isn't a studbook number: use digits with no leading zero, or T and digits for a temporary number`)
  if (usedNumbers(animals).has(next)) return refuse('STUDBOOK_NUMBER_USED', `${next} has already been used in this studbook, and numbers are never reused`)
  const issues: PedigreeIssue[] = isPermanentNumber(animal.studbookNumber)
    ? [{ severity: 'notice', code: 'PERMANENT_NUMBER_CHANGED', message: `${animal.studbookNumber} was a permanent number; it is kept as an old number and won't be given again`, individualId: id }]
    : []
  return { animal: { ...animal, studbookNumber: next, oldNumbers: [...(animal.oldNumbers ?? []), animal.studbookNumber] }, issues }
}

/** Checks a whole studbook's numbers, for imports and before export. Gaps are only a notice: imported books often have them. */
export function checkStudbookNumbers(animals: readonly NumberedAnimal[]): PedigreeIssue[] {
  const issues: PedigreeIssue[] = []
  const current = new Map<string, string>()
  const old = new Map<string, string>()
  for (const a of animals) {
    const n = a.studbookNumber
    if (!isPermanentNumber(n) && !isTemporaryNumber(n)) issues.push({ severity: 'error', code: 'INVALID_STUDBOOK_NUMBER', message: `${a.id} has studbook number "${n}", which isn't digits with no leading zero, or T and digits`, individualId: a.id })
    const other = current.get(n)
    if (other !== undefined) issues.push({ severity: 'error', code: 'DUPLICATE_STUDBOOK_NUMBER', message: `${a.id} and ${other} both have studbook number ${n}`, individualId: a.id, relatedIds: [other] })
    else current.set(n, a.id)
    for (const o of a.oldNumbers ?? []) {
      if (o === n) issues.push({ severity: 'error', code: 'STUDBOOK_NUMBER_REUSED', message: `${a.id} lists its current number ${n} as an old number`, individualId: a.id })
      const prior = old.get(o)
      if (prior !== undefined && prior !== a.id) issues.push({ severity: 'error', code: 'STUDBOOK_NUMBER_REUSED', message: `Old number ${o} is listed for both ${prior} and ${a.id}`, individualId: a.id, relatedIds: [prior] })
      else old.set(o, a.id)
    }
  }
  for (const [o, owner] of old) {
    const holder = current.get(o)
    if (holder !== undefined && holder !== owner) issues.push({ severity: 'error', code: 'STUDBOOK_NUMBER_REUSED', message: `${holder} has number ${o}, which ${owner} used before; numbers are never reused`, individualId: holder, relatedIds: [owner] })
  }
  const permanent = [...usedNumbers(animals)].filter(isPermanentNumber).map(Number).filter(Number.isSafeInteger)
  const seen = new Set(permanent)
  const max = Math.max(0, ...permanent)
  const missing: number[] = []
  for (let i = 1; i <= max && missing.length <= 20; i++) if (!seen.has(i)) missing.push(i)
  if (missing.length) issues.push({ severity: 'notice', code: 'STUDBOOK_NUMBER_GAP', message: `Permanent numbers skip ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ' and more' : ''}. Gaps are allowed in imported books, but new numbers continue from ${max + 1}` })
  return issues
}
