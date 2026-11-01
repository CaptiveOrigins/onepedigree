import type { Individual, PedigreeDocument } from '../types'

/**
 * GEDCOM (5.5.1 and 7.0) to and from OnePedigree. GEDCOM is a human genealogy
 * format: families name a HUSB and WIFE explicitly, which map to the father and
 * mother roles (roles come from the family record, never from sex). Adopted,
 * foster and sealing links are kept as data, not as biological parentage.
 * Everything else useful (names, life events, notes, the original IDs) is kept
 * under `data.gedcom`, so a round trip loses little.
 */
type Line = { level: number; xref?: string; tag: string; value: string; children: Line[] }

export type GedcomEvent = { date?: string; place?: string }
export type GedcomData = {
  xref: string
  given?: string
  surname?: string
  birth?: GedcomEvent
  death?: GedcomEvent
  notes?: string[]
  /** Families this person belongs to other than by birth (adopted, foster…). */
  otherFamilies?: { family: string; relation: string }[]
}

/** Parse lines into a tree; CONT/CONC are folded into their parent's value. */
function parseLines(text: string): Line[] {
  const roots: Line[] = []
  const stack: Line[] = []
  for (const raw of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const m = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/.exec(raw)
    if (!m) continue
    const line: Line = { level: Number(m[1]), xref: m[2], tag: m[3]!.toUpperCase(), value: m[4] ?? '', children: [] }
    while (stack.length && stack.at(-1)!.level >= line.level) stack.pop()
    const parent = stack.at(-1)
    if (parent && (line.tag === 'CONT' || line.tag === 'CONC')) {
      parent.value += (line.tag === 'CONT' ? '\n' : '') + line.value
      continue
    }
    if (parent) parent.children.push(line)
    else roots.push(line)
    stack.push(line)
  }
  return roots
}

const child = (l: Line, tag: string) => l.children.find((c) => c.tag === tag)
const children = (l: Line, tag: string) => l.children.filter((c) => c.tag === tag)
const event = (l: Line | undefined): GedcomEvent | undefined => {
  if (!l) return undefined
  const date = child(l, 'DATE')?.value
  const place = child(l, 'PLAC')?.value
  return date || place ? { ...(date ? { date } : {}), ...(place ? { place } : {}) } : undefined
}
const SEX: Record<string, string> = { M: 'male', F: 'female', X: 'other', U: 'unknown' }
const id = (xref: string) => xref.replace(/@/g, '')

export type GedcomParseResult = { document: PedigreeDocument; warnings: string[] }

export function parseGedcom(text: string): GedcomParseResult {
  const records = parseLines(text)
  const warnings: string[] = []
  const people = new Map<string, Individual>()
  const info = new Map<string, GedcomData>()
  for (const r of records.filter((r) => r.tag === 'INDI' && r.xref)) {
    const name = child(r, 'NAME')
    const given = (name && child(name, 'GIVN')?.value) || undefined
    const surname = (name && child(name, 'SURN')?.value) || name?.value.match(/\/([^/]*)\//)?.[1]?.trim() || undefined
    const label = name?.value.replace(/\//g, '').replace(/\s+/g, ' ').trim() || [given, surname].filter(Boolean).join(' ') || id(r.xref!)
    const sex = SEX[child(r, 'SEX')?.value.trim().toUpperCase() ?? ''] ?? null
    const data: GedcomData = { xref: id(r.xref!) }
    if (given) data.given = given
    if (surname) data.surname = surname
    const birth = event(child(r, 'BIRT'))
    const death = event(child(r, 'DEAT'))
    if (birth) data.birth = birth
    if (death) data.death = death
    const notes = children(r, 'NOTE').map((n) => n.value).filter((v) => v && !/^@.+@$/.test(v))
    if (notes.length) data.notes = notes
    for (const famc of children(r, 'FAMC')) {
      const pedi = child(famc, 'PEDI')?.value.toLowerCase()
      if (pedi && pedi !== 'birth') (data.otherFamilies ??= []).push({ family: id(famc.value), relation: pedi })
    }
    info.set(id(r.xref!), data)
    people.set(id(r.xref!), { id: id(r.xref!), label, sex, parentage: null, data: { gedcom: data } })
  }
  // Families: who the parents are, and who is listed as a child.
  const families = new Map<string, { father?: string; mother?: string }>()
  const listedIn = new Map<string, string[]>()
  for (const f of records.filter((r) => r.tag === 'FAM' && r.xref)) {
    const father = child(f, 'HUSB')?.value
    const mother = child(f, 'WIFE')?.value
    families.set(id(f.xref!), { ...(father ? { father: id(father) } : {}), ...(mother ? { mother: id(mother) } : {}) })
    for (const c of children(f, 'CHIL')) {
      if (!people.has(id(c.value))) {
        warnings.push(`Family ${id(f.xref!)} names a missing child ${c.value}`)
        continue
      }
      listedIn.set(id(c.value), [...(listedIn.get(id(c.value)) ?? []), id(f.xref!)])
    }
  }
  // Birth parents come from one family: the person's first FAMC that isn't adopted/foster/sealing,
  // else the first family listing them as a child. Exact duplicates are ignored; other families
  // stay as data (`otherFamilies`), never combined into extra parents.
  const indi = new Map(records.filter((r) => r.tag === 'INDI' && r.xref).map((r) => [id(r.xref!), r]))
  let several = 0
  for (const [personId, kid] of people) {
    const nonBirth = new Set((info.get(personId)?.otherFamilies ?? []).map((o) => o.family))
    const ordered = [...new Set([...children(indi.get(personId)!, 'FAMC').map((f) => id(f.value)), ...(listedIn.get(personId) ?? [])])].filter(
      (f) => families.has(f) && !nonBirth.has(f),
    )
    const birth = ordered[0]
    if (!birth) continue
    const fam = families.get(birth)!
    const key = (f: { father?: string; mother?: string }) => `${f.father ?? ''}|${f.mother ?? ''}`
    const others = ordered.slice(1).filter((f) => key(families.get(f)!) !== key(fam))
    if (others.length) {
      several++
      const data = info.get(personId)!
      data.otherFamilies = [...(data.otherFamilies ?? []), ...others.map((family) => ({ family, relation: 'unrecorded' }))]
    }
    const parents = [
      ...(fam.mother && people.has(fam.mother) ? [{ individual: fam.mother, role: 'mother' }] : []),
      ...(fam.father && people.has(fam.father) ? [{ individual: fam.father, role: 'father' }] : []),
    ]
    // How they were conceived isn't recorded in GEDCOM: unknown stays unknown.
    if (parents.length) (kid as { parentage: Individual['parentage'] }).parentage = { parents }
  }
  if (several)
    warnings.push(
      `${several} ${several === 1 ? 'person is a child' : 'people are children'} of more than one family; the first family is used as birth parents (the others are kept with the person).`,
    )
  return { document: { schemaVersion: 1, individuals: [...people.values()] }, warnings }
}

const SEX_OUT: Record<string, string> = { male: 'M', female: 'F', other: 'X', m: 'M', f: 'F' }

/** Write GEDCOM 5.5.1 (UTF-8). Families are formed by each child's mother and father. */
export function serializeGedcom(doc: PedigreeDocument, opts: { source?: string } = {}): string {
  const out: string[] = ['0 HEAD', `1 SOUR ${opts.source ?? 'OnePedigree'}`, '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8']
  const xref = new Map(doc.individuals.map((ind, i) => [ind.id, `@I${i + 1}@`]))
  const families = new Map<string, { mother?: string; father?: string; children: string[] }>()
  for (const ind of doc.individuals) {
    const ps = ind.parentage?.parents ?? []
    const mother = ps.find((p) => p.role === 'mother' || p.role === 'dam')?.individual
    const father = ps.find((p) => p.role === 'father' || p.role === 'sire')?.individual
    if (!mother && !father) continue
    const key = `${mother ?? ''}|${father ?? ''}`
    const f = families.get(key) ?? { mother, father, children: [] }
    f.children.push(ind.id)
    families.set(key, f)
  }
  const famXref = new Map([...families.keys()].map((k, i) => [k, `@F${i + 1}@`]))
  const line = (level: number, tag: string, value = '') => {
    const [first, ...rest] = value.split('\n')
    out.push(`${level} ${tag}${first ? ` ${first}` : ''}`)
    for (const r of rest) out.push(`${level + 1} CONT ${r}`)
  }
  for (const ind of doc.individuals) {
    const g = (ind.data?.gedcom ?? ind.data ?? {}) as Partial<GedcomData>
    out.push(`0 ${xref.get(ind.id)} INDI`)
    const label = ind.label ?? ind.id
    line(1, 'NAME', g.surname && label.endsWith(g.surname) ? `${label.slice(0, -g.surname.length).trim()} /${g.surname}/` : label)
    const sex = SEX_OUT[(ind.sex ?? '').toLowerCase()]
    if (sex) line(1, 'SEX', sex)
    for (const [tag, ev] of [['BIRT', g.birth], ['DEAT', g.death]] as const)
      if (ev) {
        line(1, tag)
        if (ev.date) line(2, 'DATE', ev.date)
        if (ev.place) line(2, 'PLAC', ev.place)
      }
    for (const n of g.notes ?? []) line(1, 'NOTE', n)
    for (const [key, f] of families) {
      if (f.children.includes(ind.id)) line(1, 'FAMC', famXref.get(key))
      if (f.mother === ind.id || f.father === ind.id) line(1, 'FAMS', famXref.get(key))
    }
  }
  for (const [key, f] of families) {
    out.push(`0 ${famXref.get(key)} FAM`)
    if (f.father) line(1, 'HUSB', xref.get(f.father))
    if (f.mother) line(1, 'WIFE', xref.get(f.mother))
    for (const c of f.children) line(1, 'CHIL', xref.get(c))
  }
  out.push('0 TRLR')
  return `${out.join('\n')}\n`
}
