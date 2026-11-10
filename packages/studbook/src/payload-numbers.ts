import type { CollectionSlug, Endpoint, PayloadRequest, Where } from 'payload'
import { isPermanentNumber, isTemporaryNumber, nextStudbookNumber, renumber, usedNumbers, type NumberedAnimal } from './numbers.js'
import type { Studbook } from './types.js'

/**
 * Studbook numbers kept in a Payload collection, one document per (studbook, animal) (docs/architecture/studbook.md):
 *
 * - `POST /studbook/:studbook/numbers { animal, temporary?, number? }` gives an animal its first number: the next
 *   unused permanent (or T) number, or a given unused one such as the international number.
 * - `POST /studbook/:studbook/numbers/renumber { animal, to? }` moves it to a new number (by default the next
 *   permanent one, which confirms a T number) and keeps the old one. Only offered with `oldNumbersField`, because
 *   without a record of old numbers they could be given again.
 *
 * Who may number is the platform's call twice over: the animal must be in what `source` gives this reader, and the
 * write runs with the reader's own access (`overrideAccess: false`), so the number collection's access rules decide.
 * Which numbers are taken is read with full access, so a number held by an animal this reader can't see is still
 * never given again. The response names only the animal asked about.
 *
 * Two people numbering at the same moment could pick the same number. After writing, the endpoint checks; the later
 * write (by document ID) steps back and tries the next number, so one number never ends up on two animals.
 */
export type StudbookNumbersOptions = {
  collection: string
  studbookField: string
  animalField: string
  numberField: string
  oldNumbersField?: string
}

type Doc = Record<string, unknown> & { id: string | number }
const idOf = (v: unknown) => String(v && typeof v === 'object' && 'id' in v ? (v as { id: unknown }).id : v)

async function allNumbers(req: PayloadRequest, n: StudbookNumbersOptions, studbook: string) {
  const { docs } = await req.payload.find({
    collection: n.collection as CollectionSlug,
    where: { [n.studbookField]: { equals: studbook } } as Where,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return (docs as Doc[]).map((d) => ({
    doc: d,
    animal: { id: idOf(d[n.animalField]), studbookNumber: String(d[n.numberField] ?? ''), oldNumbers: n.oldNumbersField ? ((d[n.oldNumbersField] as unknown[]) ?? []).map(String) : [] } as NumberedAnimal,
  }))
}

/** Earlier-written first: numeric IDs by value (SQL), others as text (MongoDB ObjectIds start with their time). */
const compareIds = (a: string | number, b: string | number) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)))

/**
 * True when this document lost a race for its number: another animal held it before (as an old number), or holds it
 * now and was written first.
 */
async function lostRace(req: PayloadRequest, n: StudbookNumbersOptions, studbook: string, mine: Doc, number: string) {
  const others = (await allNumbers(req, n, studbook)).filter((x) => String(x.doc.id) !== String(mine.id))
  if (others.some((x) => x.animal.oldNumbers?.includes(number))) return true
  return others.some((x) => x.animal.studbookNumber === number && compareIds(x.doc.id, mine.id) < 0)
}

type Body = { animal?: unknown; temporary?: unknown; number?: unknown; to?: unknown }
const body = async (req: PayloadRequest): Promise<Body> => {
  try {
    return ((req.data as Body | undefined) ?? (await req.json?.()) ?? {}) as Body
  } catch {
    return {}
  }
}
const problem = (status: number, error: string) => Response.json({ error }, { status })
const forbidden = (e: unknown) => (e as { status?: number })?.status === 403 || (e as Error)?.name === 'Forbidden'

export function studbookNumberEndpoints(options: {
  source: (args: { studbook: string; req: PayloadRequest }) => Promise<Studbook | null> | Studbook | null
  numbers: StudbookNumbersOptions
  path?: string
}): Endpoint[] {
  const n = options.numbers
  const base = options.path ?? '/studbook/:studbook/numbers'
  const MAX_TRIES = 5

  /** The animal, if this reader may see it in this studbook (private ones can't be numbered through the API). */
  const visibleAnimal = async (req: PayloadRequest, studbook: string, animal: string) => {
    if (!req.user) return false
    try {
      const book = await options.source({ studbook, req })
      return Boolean(book?.animals.some((a) => a.id === animal && !a.private))
    } catch {
      return false
    }
  }

  const assign: Endpoint = {
    path: base,
    method: 'post',
    handler: async (req) => {
      const studbook = String(req.routeParams?.studbook ?? '')
      const b = await body(req)
      const animal = typeof b.animal === 'string' ? b.animal : ''
      if (!animal) return problem(400, 'Give the animal to number')
      if (!(await visibleAnimal(req, studbook, animal))) return problem(404, 'Not found')
      const wanted = typeof b.number === 'string' ? b.number : null
      if (wanted !== null && !isPermanentNumber(wanted) && !isTemporaryNumber(wanted)) return problem(400, `"${wanted}" isn't a studbook number: use digits with no leading zero, or T and digits`)
      for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
        const all = await allNumbers(req, n, studbook)
        if (all.some((x) => x.animal.id === animal)) return problem(409, 'This animal already has a studbook number; renumber it instead')
        const animals = all.map((x) => x.animal)
        if (wanted !== null && usedNumbers(animals).has(wanted)) return problem(409, `${wanted} has already been used in this studbook, and numbers are never reused`)
        const number = wanted ?? nextStudbookNumber(animals, { temporary: b.temporary === true })
        let created: Doc
        try {
          created = (await req.payload.create({
            collection: n.collection as CollectionSlug,
            data: { [n.studbookField]: studbook, [n.animalField]: animal, [n.numberField]: number, ...(n.oldNumbersField ? { [n.oldNumbersField]: [] } : {}) } as never,
            overrideAccess: false,
            user: req.user,
            req,
          })) as unknown as Doc
        } catch (e) {
          if (forbidden(e)) return problem(403, 'You may not number animals in this studbook')
          throw e
        }
        if (!(await lostRace(req, n, studbook, created, number))) return Response.json({ animal, studbookNumber: number, oldNumbers: [] }, { status: 201 })
        // Someone else took this number first: step back (our own document, just written) and try again.
        await req.payload.delete({ collection: n.collection as CollectionSlug, id: created.id, overrideAccess: true, req })
        if (wanted !== null) return problem(409, `${wanted} was just given to another animal`)
      }
      return problem(409, 'Numbers are being given out too quickly to pick one; try again')
    },
  }

  const move: Endpoint = {
    path: `${base}/renumber`,
    method: 'post',
    handler: async (req) => {
      const oldField = n.oldNumbersField!
      const studbook = String(req.routeParams?.studbook ?? '')
      const b = await body(req)
      const animal = typeof b.animal === 'string' ? b.animal : ''
      if (!animal) return problem(400, 'Give the animal to renumber')
      if (!(await visibleAnimal(req, studbook, animal))) return problem(404, 'Not found')
      const to = typeof b.to === 'string' ? b.to : undefined
      for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
        const all = await allNumbers(req, n, studbook)
        const mine = all.find((x) => x.animal.id === animal)
        if (!mine) return problem(409, 'This animal has no studbook number yet; give it one first')
        const r = renumber(all.map((x) => x.animal), animal, to)
        const error = r.issues.find((i) => i.severity === 'error')
        if (error) return Response.json({ error: error.message, code: error.code }, { status: 409 })
        try {
          await req.payload.update({
            collection: n.collection as CollectionSlug,
            id: mine.doc.id,
            data: { [n.numberField]: r.animal.studbookNumber, [oldField]: r.animal.oldNumbers } as never,
            overrideAccess: false,
            user: req.user,
            req,
          })
        } catch (e) {
          if (forbidden(e)) return problem(403, 'You may not renumber animals in this studbook')
          throw e
        }
        if (!(await lostRace(req, n, studbook, mine.doc, r.animal.studbookNumber)))
          return Response.json({ animal, studbookNumber: r.animal.studbookNumber, oldNumbers: r.animal.oldNumbers, notices: r.issues.map((i) => i.message) })
        // Lost the number to a simultaneous change: put ours back as it was, then try again.
        await req.payload.update({ collection: n.collection as CollectionSlug, id: mine.doc.id, data: { [n.numberField]: mine.animal.studbookNumber, [oldField]: mine.animal.oldNumbers } as never, overrideAccess: true, req })
        if (to !== undefined) return problem(409, `${to} was just given to another animal`)
      }
      return problem(409, 'Numbers are being given out too quickly to pick one; try again')
    },
  }

  return n.oldNumbersField ? [assign, move] : [assign]
}
