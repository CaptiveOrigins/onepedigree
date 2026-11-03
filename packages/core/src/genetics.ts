/**
 * Genetics: gene definitions, each individual's genotype, and pure
 * inheritance arithmetic (offspring odds, possible-het percentages, consistency
 * checks, carrier inference). Species-neutral: the host supplies the catalog and
 * maps its own sex labels; OnePedigree never guesses a genotype it isn't given.
 *
 * Model: every gene variant sits at a locus (one gene). Variants sharing a locus are
 * alternative alleles of one gene (an allelic complex); a variant without `locus`
 * has its own. Each individual carries two alleles per autosomal locus, or one
 * (hemizygous) or two per sex-linked locus depending on its sex.
 */

export type InheritanceMode =
  /** Shows with two copies; one copy is a carrier (het). */
  | 'recessive'
  /** One copy shows; two copies show a stronger form ("super"). Breeders often say "co-dominant". */
  | 'incomplete-dominant'
  /** One copy shows; two copies look the same. */
  | 'dominant'
  /** Both alleles show side by side. */
  | 'codominant'
  /** Many genes; improved by selection, no simple odds. */
  | 'polygenic'
  /** Reported as heritable; inheritance not established. */
  | 'unknown'

export type GeneDefinition = {
  id: string
  label: string
  mode: InheritanceMode
  /** Genes with the same locus are alleles of one gene (e.g. a complex). Default: the gene's own id. */
  locus?: string
  /** Sex-linked: on the Z (ZW systems: females have one copy) or X (XY: males have one). */
  linkage?: 'Z' | 'X'
  /** Word for two copies of an incomplete dominant (default "Super"). */
  superLabel?: string
  synonyms?: readonly string[]
  description?: string
}

export type GenotypeState =
  /** Shows it; copy count not stated (a recessive or sex-linked hemizygote is certain anyway). */
  | 'visual'
  /** One copy, shows (incomplete dominant / dominant). */
  | 'single'
  /** Two copies (incomplete dominant "super", or homozygous dominant). */
  | 'super'
  /** Carries one copy without showing (recessive). */
  | 'het'
  /** May carry one copy, with a probability. */
  | 'possible-het'
  /** Known not to carry it. */
  | 'non-carrier'
  | 'unknown'

export type GenotypeBasis = 'reported' | 'proven-breeding' | 'genetic-test' | 'inferred'

export type GenotypeRecord = {
  gene: string
  state: GenotypeState
  /** For `possible-het`: 0–1 (e.g. 0.66, 0.5). */
  probability?: number
  basis?: GenotypeBasis
}

/** How the host's sex labels map to the chromosome system (needed only for sex-linked genes). */
export type SexClass = 'homogametic' | 'heterogametic' | 'unknown'

const WILD = '+'
type Pair = readonly [string, string] // sorted allele pair; WILD = wild type; hemizygotes use '' as the second allele
type Dist = Map<string, number> // pair key -> probability
const key = (p: Pair) => p.join('|')
const pair = (a: string, b: string): Pair => (a <= b ? [a, b] : [b, a]) as Pair

export const locusOf = (t: GeneDefinition) => t.locus ?? t.id
const calculable = (t: GeneDefinition) => t.mode !== 'polygenic' && t.mode !== 'unknown'

export type GenotypeAssumption = { gene: string; note: string }

/**
 * An individual's genotype distribution at one locus from its records. Genes at the
 * locus without a record are taken as absent (wild type) and reported as an assumption,
 * the way breeders read an unlisted gene. Returns null when the records contradict
 * each other or a needed copy count is unknown.
 */
export function locusGenotype(
  catalog: readonly GeneDefinition[],
  locus: string,
  records: readonly GenotypeRecord[],
  sex: SexClass = 'unknown',
): { dist: Dist; assumptions: GenotypeAssumption[] } | { dist: null; reason: string } {
  const genes = catalog.filter((t) => locusOf(t) === locus)
  if (!genes.length) return { dist: null, reason: `Unknown locus ${locus}` }
  if (!genes.every(calculable)) return { dist: null, reason: 'Polygenic or unproven inheritance has no simple odds' }
  const linkage = genes[0]!.linkage
  // ZW: females are heterogametic; XY: males. Either way the heterogametic sex has one copy.
  const hemizygous = Boolean(linkage) && sex === 'heterogametic'
  if (linkage && sex === 'unknown') return { dist: null, reason: 'Sex-linked: the sex is needed' }
  const assumptions: GenotypeAssumption[] = []
  // Each gene contributes a distribution over its copy count.
  const copies: { gene: GeneDefinition; options: [number, number][] }[] = []
  for (const t of genes) {
    const r = records.find((x) => x.gene === t.id)
    const state = r?.state ?? 'unknown'
    let options: [number, number][] | null
    switch (state) {
      case 'non-carrier':
        options = [[0, 1]]
        break
      case 'het':
        options = hemizygous ? null : [[1, 1]]
        break
      case 'possible-het': {
        const p = r?.probability
        options = p === undefined || p < 0 || p > 1 || hemizygous ? null : [[1, p], [0, 1 - p]]
        break
      }
      case 'single':
        options = [[1, 1]]
        break
      case 'super':
        options = hemizygous ? null : [[2, 1]]
        break
      case 'visual':
        if (hemizygous) options = [[1, 1]]
        else if (t.mode === 'recessive') options = [[2, 1]]
        else {
          options = [[1, 1]]
          assumptions.push({ gene: t.id, note: `${t.label}: visual taken as one copy (not proven ${t.superLabel ?? 'super'}/homozygous)` })
        }
        break
      default:
        options = [[0, 1]]
        if (state === 'unknown' && r) assumptions.push({ gene: t.id, note: `${t.label}: unknown, taken as not carried` })
        else if (!r) assumptions.push({ gene: t.id, note: `${t.label}: not recorded, taken as not carried` })
    }
    if (!options) return { dist: null, reason: `${t.label}: "${state}" is not possible for this sex or lacks a probability` }
    copies.push({ gene: t, options })
  }
  const slots = hemizygous ? 1 : 2
  const dist: Dist = new Map()
  const walk = (i: number, alleles: string[], p: number) => {
    if (p === 0) return
    if (alleles.length > slots) return
    if (i === copies.length) {
      const full = [...alleles, ...Array(slots - alleles.length).fill(WILD)]
      const k = key(slots === 1 ? ([full[0]!, ''] as Pair) : pair(full[0]!, full[1]!))
      dist.set(k, (dist.get(k) ?? 0) + p)
      return
    }
    for (const [n, q] of copies[i]!.options) walk(i + 1, [...alleles, ...Array(n).fill(copies[i]!.gene.id)], p * q)
  }
  walk(0, [], 1)
  const total = [...dist.values()].reduce((a, b) => a + b, 0)
  if (total < 1e-9) return { dist: null, reason: 'The recorded genes at this locus need more than two copies' }
  for (const [k, v] of dist) dist.set(k, v / total)
  return { dist, assumptions }
}

const gametes = (k: string): Map<string, number> => {
  const [a, b] = k.split('|') as [string, string]
  const out = new Map<string, number>()
  if (b === '') out.set(a, 1)
  else {
    out.set(a, (out.get(a) ?? 0) + 0.5)
    out.set(b, (out.get(b) ?? 0) + 0.5)
  }
  return out
}

/** One expected offspring class at a locus: the per-gene states it has and its probability. */
export type OffspringClass = {
  probability: number
  /** Sex of this class, for sex-linked loci (`heterogametic` = ZW females / XY males). */
  sex?: Exclude<SexClass, 'unknown'>
  /** States per gene at this locus (genes not listed are absent). */
  genes: { gene: string; state: Exclude<GenotypeState, 'possible-het' | 'unknown' | 'non-carrier'> }[]
  /** Shows any gene. */
  visual: boolean
}

export type LocusOdds =
  | { locus: string; calculable: true; classes: OffspringClass[]; assumptions: GenotypeAssumption[] }
  | { locus: string; calculable: false; reason: string }

function describePair(catalog: readonly GeneDefinition[], k: string): Pick<OffspringClass, 'genes' | 'visual'> {
  const [a, b] = k.split('|') as [string, string]
  const alleles = [a, b].filter((x) => x && x !== WILD)
  const hemi = b === ''
  const genes: OffspringClass['genes'] = []
  let visual = false
  for (const id of [...new Set(alleles)]) {
    const t = catalog.find((x) => x.id === id)!
    const n = alleles.filter((x) => x === id).length
    let state: OffspringClass['genes'][number]['state']
    if (t.mode === 'recessive') {
      // A recessive shows when both alleles are recessive alleles of this locus (or hemizygous).
      const allRecessive = (hemi ? [a] : [a, b]).every((x) => x !== WILD && catalog.find((c) => c.id === x)?.mode === 'recessive')
      state = hemi || n === 2 || allRecessive ? 'visual' : 'het'
    } else state = n === 2 ? 'super' : 'single'
    if (state !== 'het') visual = true
    genes.push({ gene: id, state })
  }
  return { genes, visual }
}

/**
 * Expected offspring at each locus of the given genes for one pairing. Sex-linked
 * loci are split by offspring sex. Loci are independent (no linkage between genes).
 */
export function pairingOdds(
  catalog: readonly GeneDefinition[],
  mother: { records: readonly GenotypeRecord[]; sex?: SexClass },
  father: { records: readonly GenotypeRecord[]; sex?: SexClass },
  geneIds: readonly string[] = [...new Set([...mother.records, ...father.records].map((r) => r.gene))],
): LocusOdds[] {
  const loci = [...new Set(geneIds.flatMap((id) => {
    const t = catalog.find((x) => x.id === id)
    return t ? [locusOf(t)] : []
  }))]
  return loci.map((locus): LocusOdds => {
    const def = catalog.find((t) => locusOf(t) === locus)!
    const linkage = def.linkage
    const ms = linkage ? (mother.sex ?? 'unknown') : 'unknown'
    const fs = linkage ? (father.sex ?? 'unknown') : 'unknown'
    const m = locusGenotype(catalog, locus, mother.records, ms)
    if (!m.dist) return { locus, calculable: false, reason: `Mother: ${m.reason}` }
    const f = locusGenotype(catalog, locus, father.records, fs)
    if (!f.dist) return { locus, calculable: false, reason: `Father: ${f.reason}` }
    const classes = new Map<string, OffspringClass>()
    const add = (k: string, p: number, sex?: Exclude<SexClass, 'unknown'>) => {
      const id = `${sex ?? ''}#${k}`
      const c = classes.get(id)
      if (c) c.probability += p
      else classes.set(id, { probability: p, ...(sex ? { sex } : {}), ...describePair(catalog, k) })
    }
    for (const [mk, mp] of m.dist) for (const [fk, fp] of f.dist) {
      if (!linkage) {
        for (const [ga, pa] of gametes(mk)) for (const [gb, pb] of gametes(fk)) add(key(pair(ga, gb)), mp * fp * pa * pb)
        continue
      }
      // Sex-linked: the heterogametic parent passes its single linked allele to homogametic young only.
      const het = ms === 'heterogametic' ? { k: mk } : { k: fk }
      const hom = ms === 'heterogametic' ? { k: fk } : { k: mk }
      const single = gametes(het.k)
      for (const [g, pg] of gametes(hom.k)) {
        for (const [s, ps] of single) add(key(pair(g, s)), mp * fp * pg * ps * 0.5, 'homogametic')
        add(key([g, ''] as Pair), mp * fp * pg * 0.5, 'heterogametic')
      }
    }
    // Most likely first; ties: more genes, then visual, then by name (stable output).
    const name = (c: OffspringClass) => `${c.sex ?? ''}${c.genes.map((t) => t.gene).join('+')}`
    const list = [...classes.values()]
      .filter((c) => c.probability > 1e-12)
      .sort((a, b) => b.probability - a.probability || b.genes.length - a.genes.length || Number(b.visual) - Number(a.visual) || name(a).localeCompare(name(b)))
    return { locus, calculable: true, classes: list, assumptions: [...m.assumptions, ...f.assumptions] }
  })
}

/**
 * What a not-yet-tested offspring of this pairing should be recorded as for one
 * recessive gene, given that it looks normal: e.g. 66% possible het from two hets,
 * 50% from a het and a non-carrier, 100% het from a visual and a non-carrier.
 */
export function expectedNormalLookingRecord(catalog: readonly GeneDefinition[], gene: string, odds: LocusOdds, sex?: Exclude<SexClass, 'unknown'>): GenotypeRecord | null {
  if (!odds.calculable) return null
  const classes = odds.classes.filter((c) => !c.visual && (!sex || !c.sex || c.sex === sex))
  const total = classes.reduce((n, c) => n + c.probability, 0)
  if (total === 0) return null
  const carrier = classes.filter((c) => c.genes.some((t) => t.gene === gene && t.state === 'het')).reduce((n, c) => n + c.probability, 0) / total
  const def = catalog.find((t) => t.id === gene)
  if (!def) return null
  if (carrier > 1 - 1e-9) return { gene, state: 'het', basis: 'inferred' }
  if (carrier < 1e-9) return { gene, state: 'non-carrier', basis: 'inferred' }
  return { gene, state: 'possible-het', probability: Math.round(carrier * 100) / 100, basis: 'inferred' }
}

export type GenotypeIssue = { code: 'impossible-offspring'; gene: string; message: string }

/**
 * Whether a recorded offspring state could come from the recorded parents. A
 * mismatch usually means a misrecorded parent or genotype: it is a notice to check,
 * never an automatic correction.
 */
export function checkOffspring(
  catalog: readonly GeneDefinition[],
  mother: { records: readonly GenotypeRecord[]; sex?: SexClass },
  father: { records: readonly GenotypeRecord[]; sex?: SexClass },
  child: { records: readonly GenotypeRecord[]; sex?: SexClass },
): GenotypeIssue[] {
  const issues: GenotypeIssue[] = []
  for (const r of child.records) {
    const t = catalog.find((x) => x.id === r.gene)
    if (!t || !calculable(t) || !['visual', 'single', 'super', 'het'].includes(r.state)) continue
    // Only judge parents whose records at this locus are definite (no unknowns assumed).
    const definite = (recs: readonly GenotypeRecord[]) => catalog.filter((x) => locusOf(x) === locusOf(t)).every((x) => {
      const s = recs.find((y) => y.gene === x.id)?.state
      return s !== undefined && s !== 'unknown'
    })
    if (!definite(mother.records) || !definite(father.records)) continue
    const odds = pairingOdds(catalog, mother, father, [t.id])[0]!
    if (!odds.calculable) continue
    const sex = t.linkage && child.sex && child.sex !== 'unknown' ? child.sex : undefined
    const possible = odds.classes.filter((c) => !sex || !c.sex || c.sex === sex)
    const wanted = r.state === 'visual' ? (s: string) => s === 'visual' || s === 'single' || s === 'super' : (s: string) => s === r.state
    if (!possible.some((c) => c.genes.some((x) => x.gene === t.id && wanted(x.state))))
      issues.push({ code: 'impossible-offspring', gene: t.id, message: `${t.label}: the recorded parents can't produce a ${r.state} offspring. Check the parents or the genotypes.` })
  }
  return issues
}

/**
 * What offspring prove about a parent, for recessive genes: a visual offspring
 * proves each parent carries at least one copy. Suggestions only (`basis:
 * 'inferred'`); the host asks the keeper to confirm. Nothing is suggested when the
 * parent's record already says as much.
 */
export function carrierFromOffspring(
  catalog: readonly GeneDefinition[],
  parent: { records: readonly GenotypeRecord[]; sex?: SexClass },
  offspring: readonly { records: readonly GenotypeRecord[]; sex?: SexClass }[],
): GenotypeRecord[] {
  const out: GenotypeRecord[] = []
  for (const t of catalog.filter((x) => x.mode === 'recessive')) {
    const shows = offspring.some((o) => {
      const s = o.records.find((r) => r.gene === t.id)?.state
      if (s !== 'visual') return false
      // Sex-linked: a hemizygous young got its only copy from the homogametic parent.
      if (t.linkage && o.sex === 'heterogametic') return parent.sex === 'homogametic'
      return true
    })
    if (!shows) continue
    const current = parent.records.find((r) => r.gene === t.id)?.state
    if (current === 'visual' || current === 'het' || current === 'super' || current === 'single') continue
    out.push({ gene: t.id, state: t.linkage && parent.sex === 'heterogametic' ? 'visual' : 'het', basis: 'inferred' })
  }
  return out
}

/** The summary an animal's genotype adds up to (breeders call the visible part its morph) (e.g. "Pastel Clown", "Super Pastel het Pied 66%"). */
export function genotypeSummary(catalog: readonly GeneDefinition[], records: readonly GenotypeRecord[], { normal = 'Normal', het = 'het', possible = 'possible het' }: { normal?: string; het?: string; possible?: string } = {}): string {
  const label = (id: string) => catalog.find((t) => t.id === id)?.label ?? id
  const shown: string[] = []
  const carried: string[] = []
  for (const r of records) {
    const t = catalog.find((x) => x.id === r.gene)
    if (r.state === 'super') shown.push(`${t?.superLabel ?? 'Super'} ${label(r.gene)}`)
    else if (r.state === 'visual' || r.state === 'single') shown.push(label(r.gene))
    else if (r.state === 'het') carried.push(`${het} ${label(r.gene)}`)
    else if (r.state === 'possible-het') carried.push(`${r.probability !== undefined ? `${Math.round(r.probability * 100)}% ` : ''}${possible} ${label(r.gene)}`)
  }
  return [...(shown.length ? shown : [normal]), ...carried].join(' ')
}
