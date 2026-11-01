import type { Individual, PedigreeDocument } from '../types'

/**
 * CSV (or TSV) to OnePedigree: the common breeder and studbook spreadsheet
 * layout, one row per individual with its parents' IDs. Columns are found by
 * name (id, name, sex, mother/dam, father/sire, birth/hatch date…) or mapped
 * explicitly. Other columns are kept in `data`. Unknown parent IDs are reported,
 * and the reference is dropped.
 */
export type CsvMapping = {
  id: string
  label?: string
  sex?: string
  /** Column whose IDs are the maternal parents (role `mother`, or `maternalRole`). */
  mother?: string
  /** Column whose IDs are the paternal parents (role `father`, or `paternalRole`). */
  father?: string
  maternalRole?: string
  paternalRole?: string
}

const ALIASES: Record<keyof Omit<CsvMapping, 'maternalRole' | 'paternalRole'>, string[]> = {
  id: ['id', 'animal id', 'individual', 'individual id', 'studbook', 'studbook id', 'stud #', 'number', 'code', 'tag'],
  label: ['name', 'label', 'animal name', 'call name'],
  sex: ['sex', 'gender'],
  mother: ['mother', 'dam', 'mother id', 'dam id', 'female parent', 'maternal'],
  father: ['father', 'sire', 'father id', 'sire id', 'male parent', 'paternal'],
}

/** Split CSV/TSV text into rows (quotes, escaped quotes and newlines in quotes handled). */
export function parseCsvRows(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const delimiter = (src.split(/\r?\n/, 1)[0]!.match(/\t/g)?.length ?? 0) > (src.split(/\r?\n/, 1)[0]!.match(/,/g)?.length ?? 0) ? '\t' : src.split(/\r?\n/, 1)[0]!.includes(';') && !src.split(/\r?\n/, 1)[0]!.includes(',') ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === delimiter) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}

/** Guess the mapping from header names. */
export function guessCsvMapping(header: string[]): Partial<CsvMapping> {
  const norm = header.map((h) => h.trim().toLowerCase())
  const found: Partial<CsvMapping> = {}
  for (const [key, names] of Object.entries(ALIASES) as [keyof typeof ALIASES, string[]][]) {
    const i = norm.findIndex((h) => names.includes(h))
    if (i >= 0) found[key] = header[i]
  }
  return found
}

export type CsvParseResult = { document: PedigreeDocument; warnings: string[]; mapping: CsvMapping }

export function parseCsv(text: string, mapping?: Partial<CsvMapping>): CsvParseResult {
  const [header = [], ...rows] = parseCsvRows(text)
  const m = { ...guessCsvMapping(header), ...mapping } as CsvMapping
  if (!m.id) throw new Error('No ID column found; map one (e.g. "id").')
  const col = (name?: string) => (name ? header.indexOf(name) : -1)
  const [ci, cl, cs, cm, cf] = [col(m.id), col(m.label), col(m.sex), col(m.mother), col(m.father)]
  const used = new Set([ci, cl, cs, cm, cf])
  const warnings: string[] = []
  const ids = new Set(rows.map((r) => r[ci]?.trim()).filter(Boolean))
  const individuals: Individual[] = []
  for (const [n, r] of rows.entries()) {
    const id = r[ci]?.trim()
    if (!id) {
      warnings.push(`Row ${n + 2} has no ID; skipped`)
      continue
    }
    const ref = (i: number, role: string) => {
      const v = i >= 0 ? r[i]?.trim() : ''
      if (!v || /^(0|-|\?|unknown|unk|wild|wc)$/i.test(v)) return []
      if (!ids.has(v)) {
        warnings.push(`${id}: parent "${v}" is not in the file; left unknown`)
        return []
      }
      return [{ individual: v, role }]
    }
    const parents = [...ref(cm, m.maternalRole ?? 'mother'), ...ref(cf, m.paternalRole ?? 'father')]
    const data = Object.fromEntries(header.flatMap((h, i) => (used.has(i) || !r[i]?.trim() ? [] : [[h, r[i]!.trim()]])))
    individuals.push({
      id,
      label: cl >= 0 ? r[cl]?.trim() || id : id,
      sex: cs >= 0 ? r[cs]?.trim() || null : null,
      parentage: parents.length ? { parents } : null,
      ...(Object.keys(data).length ? { data } : {}),
    })
  }
  return { document: { schemaVersion: 1, individuals }, warnings, mapping: m }
}
