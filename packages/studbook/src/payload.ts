import type { Endpoint, PayloadRequest } from 'payload'
import { biologicalParents, type PedigreeDocument } from '@captiveorigins/onepedigree-core'
import { KinshipError, kinshipAnalysis, PEDIGREE_BASED, type KinshipResult } from './kinship.js'
import { DAM_ROLES, PmxError, SIRE_ROLES, toPed } from './pmx.js'
import type { Studbook, StudbookAnimal, StudbookDate } from './types.js'

/**
 * The studbook for Payload: `GET /<collection>/studbook/:studbook` (docs/architecture/studbook.md). The platform
 * supplies the data and every access decision; this module only computes and redacts:
 *
 * - `source` reads one studbook as the request's user. `null` is a 404, so a studbook the reader can't open looks the
 *   same as one that doesn't exist.
 * - Every animal is in the analysis. A private animal comes back as `{ private: true }` and nothing else, and is named
 *   nowhere else either: a private parent is "Private", a private founder is counted without its number.
 * - An animal's MK, F and Known come back only where `geneticsVisibleFor` says yes (owner, 2026-11-10: the coordinator
 *   for every animal, a member for their own). The population's GD, FGE and founders come back only when the reader
 *   may see every animal's numbers, private animals included (asked of `geneticsVisibleFor`; their rows stay
 *   placeholders), because GD is 1 − mean MK and would give the hidden ones away.
 * - Holders appear only through `holderLabel`, which decides per reader (owner, 2026-10-31: keeper names only to the
 *   custody chain). Without it, holders are left out.
 * - `?format=pmx` is the PMx `.ped` file, for those `canExport` allows (the coordinator and the studbook keeper);
 *   anyone else gets 403. It holds the whole studbook, because PMx needs every animal to analyse any of them.
 * Any callback that throws, or a decision that isn't a plain `true`, counts as no.
 */
export type StudbookEndpointOptions = {
  source: (args: { studbook: string; req: PayloadRequest }) => Promise<Studbook | null> | Studbook | null
  geneticsVisibleFor: (args: { studbook: string; animal: StudbookAnimal; req: PayloadRequest }) => Promise<boolean> | boolean
  canExport: (args: { studbook: string; req: PayloadRequest }) => Promise<boolean> | boolean
  holderLabel?: (code: string, req: PayloadRequest) => Promise<string> | string
  /** Default `/studbook/:studbook`. */
  path?: string
}

export type StudbookParentCode = string
export type StudbookCandidate = ({ studbookNumber: string } | { private: true }) & { probability: number }
export type StudbookAnimalView =
  | { private: true }
  | {
      id: string
      studbookNumber: string
      oldNumbers: string[]
      coId: string
      animalId: string | null
      sex: StudbookAnimal['sex']
      birthType: StudbookAnimal['birthType']
      birth: StudbookDate
      /** A studbook number, or Private, MULT, WILD or UNK. */
      sire: StudbookParentCode
      dam: StudbookParentCode
      /** Candidates for a MULT sire or dam, with probabilities. A private candidate is counted, never numbered. */
      mult: { sire?: StudbookCandidate[]; dam?: StudbookCandidate[] } | null
      status: StudbookAnimal['status']
      selected: boolean
      holder: string | null
      genetics: { meanKinship: number; inbreeding: number; known: number } | null
    }

export type StudbookResponse = {
  schemaVersion: 1
  studbook: string
  title: string
  currentness: string
  basis: typeof PEDIGREE_BASED
  canExport: boolean
  /** The managed population (selected, else living animals). Null unless the reader may see every animal's numbers. */
  population: (KinshipResult['population'] & { founders: (({ studbookNumber: string } | { private: true }) & { representation: number })[]; unknownShare: number }) | null
  animals: StudbookAnimalView[]
}

/** True only for a plain `true`; a throw or anything else is no. */
const yes = async (decide: () => Promise<boolean> | boolean) => {
  try {
    return (await decide()) === true
  } catch {
    return false
  }
}

const inPopulation = (a: StudbookAnimal) => a.selected ?? a.status === 'alive'

function parentCode(a: StudbookAnimal, roles: readonly string[], byId: Map<string, StudbookAnimal>): StudbookParentCode {
  // Sire and dam are the genetic parents, as in the analysis and PMx: a foster dam is never shown as the dam.
  const known = biologicalParents(a.parentage).find((p) => p.role && roles.includes(p.role))
  if (known) {
    const parent = byId.get(known.individual)
    // A parent with no record in the studbook is treated as unknown (PopLink).
    return !parent ? 'UNK' : parent.private ? 'Private' : parent.studbookNumber
  }
  const slot = a.parentage?.uncertainParents?.find((u) => u.role && roles.includes(u.role))
  if (slot) return slot.candidates.length ? 'MULT' : slot.kind === 'wild' ? 'WILD' : 'UNK'
  return 'UNK'
}

function candidates(a: StudbookAnimal, roles: readonly string[], byId: Map<string, StudbookAnimal>): StudbookCandidate[] | undefined {
  // Only for a MULT slot: a known parent takes precedence, as in parentCode.
  if (biologicalParents(a.parentage).some((p) => p.role && roles.includes(p.role))) return undefined
  const slot = a.parentage?.uncertainParents?.find((u) => u.role && roles.includes(u.role))
  if (!slot?.candidates.length) return undefined
  return slot.candidates.map((c) => {
    const animal = byId.get(c.individual)
    // A candidate with no record in the studbook is as unknown as a private one: counted, never named.
    return animal && !animal.private ? { studbookNumber: animal.studbookNumber, probability: c.probability } : { private: true as const, probability: c.probability }
  })
}

/** The latest recorded location of an animal: its holder code. */
function currentHolder(book: Studbook, id: string): string | null {
  const events = book.events.filter((e) => e.animal === id && e.location).sort((x, y) => (x.date.date ?? '').localeCompare(y.date.date ?? ''))
  return events.at(-1)?.location ?? null
}

/** The studbook as the request's user may see it. Null when `source` gives nothing. Throws KinshipError for a pedigree it can't analyse. */
export async function getStudbook(req: PayloadRequest, options: StudbookEndpointOptions, studbook: string): Promise<StudbookResponse | null> {
  const book = await options.source({ studbook, req })
  if (!book) return null
  const byId = new Map(book.animals.map((a) => [a.id, a]))
  const doc: PedigreeDocument = { schemaVersion: 1, individuals: book.animals.map((a) => ({ id: a.id, parentage: a.parentage })) }
  const population = book.animals.filter(inPopulation).map((a) => a.id)
  const analysis = kinshipAnalysis(doc, population.length ? { population } : {})
  const genetics = new Map(analysis.individuals.map((i) => [i.id, i]))
  const holders = new Map<string, string | null>()
  const holderOf = async (code: string | null) => {
    if (!code || !options.holderLabel) return null
    if (!holders.has(code)) holders.set(code, await options.holderLabel(code, req))
    return holders.get(code) ?? null
  }

  let seesAll = true
  const animals: StudbookAnimalView[] = []
  for (const a of [...book.animals].sort((x, y) => x.studbookNumber.localeCompare(y.studbookNumber, 'en', { numeric: true }))) {
    if (a.private) {
      animals.push({ private: true })
      // Its row stays a placeholder whatever the answer, but the summary would give its MK away.
      if (!(await yes(() => options.geneticsVisibleFor({ studbook, animal: a, req })))) seesAll = false
      continue
    }
    const visible = await yes(() => options.geneticsVisibleFor({ studbook, animal: a, req }))
    if (!visible) seesAll = false
    const g = genetics.get(a.id)
    animals.push({
      id: a.id,
      studbookNumber: a.studbookNumber,
      oldNumbers: [...(a.oldNumbers ?? [])],
      coId: a.coId,
      animalId: a.animalId ?? null,
      sex: a.sex,
      birthType: a.birthType,
      birth: a.birth,
      sire: parentCode(a, SIRE_ROLES, byId),
      dam: parentCode(a, DAM_ROLES, byId),
      mult: (() => {
        const sire = candidates(a, SIRE_ROLES, byId)
        const dam = candidates(a, DAM_ROLES, byId)
        return sire || dam ? { ...(sire ? { sire } : {}), ...(dam ? { dam } : {}) } : null
      })(),
      status: a.status,
      selected: inPopulation(a),
      holder: await holderOf(currentHolder(book, a.id)),
      genetics: visible && g ? { meanKinship: g.meanKinship, inbreeding: g.inbreeding, known: g.known } : null,
    })
  }

  return {
    schemaVersion: 1,
    studbook,
    title: book.title,
    currentness: book.currentness,
    basis: PEDIGREE_BASED,
    canExport: await yes(() => options.canExport({ studbook, req })),
    population:
      seesAll && population.length
        ? {
            ...analysis.population,
            founders: analysis.founders.map((f) => {
              const animal = byId.get(f.id)
              return animal && !animal.private ? { studbookNumber: animal.studbookNumber, representation: f.representation } : { private: true as const, representation: f.representation }
            }),
            unknownShare: analysis.unknownShare,
          }
        : null,
    animals,
  }
}

/** The PMx `.ped` file, or null when the reader may not export (or `source` gives nothing). */
export async function getStudbookPed(req: PayloadRequest, options: StudbookEndpointOptions, studbook: string): Promise<string | null> {
  if (!(await yes(() => options.canExport({ studbook, req })))) return null
  const book = await options.source({ studbook, req })
  if (!book) return null
  const labels = new Map<string, string>()
  if (options.holderLabel) for (const code of new Set(book.events.map((e) => e.location).filter(Boolean))) labels.set(code, await options.holderLabel(code, req))
  return toPed(book, { holderLabel: (code) => labels.get(code) ?? code })
}

export const studbookEndpoint = (options: StudbookEndpointOptions): Endpoint => ({
  path: options.path ?? '/studbook/:studbook',
  method: 'get',
  handler: async (req) => {
    const studbook = String(req.routeParams?.studbook ?? '')
    const format = new URL(req.url ?? 'http://local', 'http://local').searchParams.get('format')
    try {
      if (format === 'pmx') {
        const allowed = await yes(() => options.canExport({ studbook, req }))
        if (!allowed) return Response.json({ error: 'Only the coordinator and the studbook keeper may export this studbook' }, { status: 403 })
        const ped = await getStudbookPed(req, options, studbook)
        if (ped === null) return Response.json({ error: 'Not found' }, { status: 404 })
        const name = studbook.replace(/[^A-Za-z0-9_-]/g, '_') || 'studbook'
        return new Response(ped, { headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': `attachment; filename="${name}.ped"` } })
      }
      if (format !== null && format !== 'json') return Response.json({ error: `Unknown format "${format}"; use json or pmx` }, { status: 400 })
      const result = await getStudbook(req, options, studbook)
      return result ? Response.json(result) : Response.json({ error: 'Not found' }, { status: 404 })
    } catch (e) {
      if (e instanceof KinshipError || e instanceof PmxError) return Response.json({ error: e.message }, { status: 422 })
      throw e
    }
  },
})

export { studbookNumberEndpoints, type StudbookNumbersOptions } from './payload-numbers.js'
