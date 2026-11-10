import type { IndividualId, PedigreeDocument } from '@captiveorigins/onepedigree-core'

/**
 * Pedigree-based genetics (owner, 2026-11-10; studbook research §3): kinship by the tabular method, and from it
 * inbreeding (F), mean kinship (MK), gene diversity (GD), founder genome equivalents (FGE), founder representation and
 * pedigree completeness ("Known"), following PMx's definitions so numbers match.
 *
 * Assumptions, stated so every result can carry them:
 * - Founders, and every unknown or wild parent, are unrelated and not inbred unless the pedigree records otherwise.
 * - Each unknown or wild parent is a unique individual, except where clutchmates share one (a `shared` key: UNK1, WILD1).
 * - A parent known only as candidates (MULT) counts by expectation: each candidate weighted by its probability, any
 *   remainder as an unknown parent. This is an expected value, not the kinship of any one true pedigree.
 * - Every individual has at most two parents (sexual, diploid). Others are refused rather than guessed.
 */
export const PEDIGREE_BASED = 'pedigree-based' as const

export type KinshipOptions = {
  /** The managed population MK, GD and FGE are taken over (PMx's "selected" animals). Default: every individual. */
  population?: readonly IndividualId[]
}

export type Founder = { id: IndividualId; representation: number }

export type KinshipResult = {
  basis: typeof PEDIGREE_BASED
  /** Pairwise kinship between any two individuals in the document. */
  kinship: (a: IndividualId, b: IndividualId) => number
  individuals: { id: IndividualId; inbreeding: number; meanKinship: number; known: number }[]
  population: { size: number; meanKinship: number; geneDiversity: number; founderGenomeEquivalents: number; meanInbreeding: number; known: number }
  /** Founder animals' share of the population's genes, largest first. `unknown` is what traces to unknown parents of non-founders. */
  founders: Founder[]
  unknownShare: number
}

type Slot = { source: string; weight: number }[]

export class KinshipError extends Error {}

export function kinshipAnalysis(doc: PedigreeDocument, options: KinshipOptions = {}): KinshipResult {
  const ids = new Set(doc.individuals.map((i) => i.id))
  const slots = new Map<string, Slot[]>()
  const founderAnimals = new Set<string>()
  for (const ind of doc.individuals) {
    const p = ind.parentage
    const s: Slot[] = []
    let phantoms = 0
    const phantom = (kind: string, shared?: string | null) => (shared ? `~${kind}:${shared}` : `~${kind}:${ind.id}:${phantoms++}`)
    for (const parent of p?.parents ?? []) s.push(ids.has(parent.individual) ? [{ source: parent.individual, weight: 1 }] : [{ source: phantom('unknown'), weight: 1 }])
    for (const u of p?.uncertainParents ?? []) {
      const known = u.candidates.filter((c) => ids.has(c.individual))
      const total = known.reduce((t, c) => t + c.probability, 0)
      const slot: Slot = known.map((c) => ({ source: c.individual, weight: c.probability }))
      // Candidates missing from the document count with the unknown remainder.
      if (total < 1 - 1e-12) slot.push({ source: phantom(u.kind ?? 'unknown', u.shared), weight: 1 - total })
      s.push(slot)
    }
    if (s.length > 2) throw new KinshipError(`${ind.id} has ${s.length} parents; kinship here assumes at most two`)
    if (s.every((slot) => slot.every((x) => x.source.startsWith('~')))) founderAnimals.add(ind.id)
    while (s.length < 2) s.push([{ source: phantom('unknown'), weight: 1 }])
    slots.set(ind.id, s)
  }

  // Ancestors first: phantoms, then individuals once every source in their slots is placed.
  const order: string[] = []
  const placed = new Set<string>()
  const phantomsSeen = new Set<string>()
  for (const s of slots.values()) for (const slot of s) for (const x of slot) if (x.source.startsWith('~') && !phantomsSeen.has(x.source)) { phantomsSeen.add(x.source); order.push(x.source); placed.add(x.source) }
  const pending = [...slots.keys()].sort()
  while (pending.length) {
    const before = pending.length
    for (let i = 0; i < pending.length; ) {
      const id = pending[i]!
      if (slots.get(id)!.every((slot) => slot.every((x) => placed.has(x.source)))) { order.push(id); placed.add(id); pending.splice(i, 1) } else i++
    }
    if (pending.length === before) throw new KinshipError(`Parentage forms a cycle among ${pending.slice(0, 5).join(', ')}`)
  }

  const n = order.length
  const at = new Map(order.map((id, i) => [id, i]))
  const f = new Float64Array(n * n)
  const get = (a: number, b: number) => f[a * n + b]!
  const set = (a: number, b: number, v: number) => { f[a * n + b] = v; f[b * n + a] = v }
  for (let i = 0; i < n; i++) {
    const s = slots.get(order[i]!)
    if (!s) { set(i, i, 0.5); continue } // a phantom founder: unrelated, not inbred
    const [s1, s2] = s as [Slot, Slot]
    for (let j = 0; j < i; j++) {
      let v = 0
      for (const x of s1) v += x.weight * get(at.get(x.source)!, j)
      for (const y of s2) v += y.weight * get(at.get(y.source)!, j)
      set(i, j, v / 2)
    }
    let F = 0
    for (const x of s1) for (const y of s2) F += x.weight * y.weight * get(at.get(x.source)!, at.get(y.source)!)
    set(i, i, (1 + F) / 2)
  }
  const kin = (a: IndividualId, b: IndividualId) => {
    const i = at.get(a), j = at.get(b)
    if (i === undefined || j === undefined || !ids.has(a) || !ids.has(b)) throw new KinshipError(`No individual ${i === undefined || !ids.has(a) ? a : b} in this pedigree`)
    return get(i, j)
  }
  const inbreeding = (id: string) => 2 * kin(id, id) - 1

  // Founder contributions: the expected share of each individual's genes from each founder animal.
  const founders = [...founderAnimals].sort()
  const fIndex = new Map(founders.map((x, k) => [x, k]))
  const m = founders.length
  const contrib = new Map<string, Float64Array>()
  for (const id of order) {
    const c = new Float64Array(m)
    if (id.startsWith('~')) { contrib.set(id, c); continue }
    if (fIndex.has(id)) c[fIndex.get(id)!] = 1
    else for (const slot of slots.get(id)!) for (const x of slot) { const px = contrib.get(x.source)!; for (let k = 0; k < m; k++) c[k] = c[k]! + (x.weight * px[k]!) / 2 }
    contrib.set(id, c)
  }

  const population = options.population ?? [...ids].sort()
  for (const id of population) if (!ids.has(id)) throw new KinshipError(`The population names ${id}, which isn't in this pedigree`)
  const N = population.length
  const mk = (id: string) => (N ? population.reduce((t, j) => t + kin(id, j), 0) / N : 0)
  const known = (id: string) => contrib.get(id)!.reduce((t, v) => t + v, 0)
  const individuals = [...ids].sort().map((id) => ({ id, inbreeding: inbreeding(id), meanKinship: mk(id), known: known(id) }))
  const meanKinship = N ? population.reduce((t, i) => t + mk(i), 0) / N : 0
  const representation = founders.map((fd, k) => ({ id: fd, representation: N ? population.reduce((t, i) => t + (contrib.get(i)?.[k] ?? 0), 0) / N : 0 }))
  const knownShare = N ? population.reduce((t, i) => t + known(i), 0) / N : 0
  return {
    basis: PEDIGREE_BASED,
    kinship: kin,
    individuals,
    population: {
      size: N,
      meanKinship,
      geneDiversity: 1 - meanKinship,
      founderGenomeEquivalents: meanKinship > 0 ? 1 / (2 * meanKinship) : Infinity,
      meanInbreeding: N ? population.reduce((t, i) => t + inbreeding(i), 0) / N : 0,
      known: knownShare,
    },
    founders: representation.filter((r) => r.representation > 0).sort((a, b) => b.representation - a.representation || a.id.localeCompare(b.id)),
    unknownShare: 1 - knownShare,
  }
}
