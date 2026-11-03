import type { GenotypeRecord, InheritanceMode, SexClass } from '@captiveorigins/onepedigree-core'

/** One individual's state for the gene being shown (from its `GenotypeRecord`). */
export type GenotypeMark = Pick<GenotypeRecord, 'state' | 'probability' | 'basis'>

/** Shows one heritable gene on every node with the usual genetic pedigree symbols. */
export type GeneOverlay = {
  /** The gene's name (legend title). */
  label: string
  /** Marks by individual id; individuals without one are drawn as unknown. */
  marks: ReadonlyMap<string, GenotypeMark>
  /** Recessive genes show het symbols; others show single/super. */
  mode?: 'recessive' | 'incomplete-dominant' | 'dominant' | 'codominant' | 'polygenic' | 'unknown'
}

export type GenotypeWords = Record<'visual' | 'single' | 'super' | 'het' | 'claimedHet' | 'possibleHet' | 'nonCarrier' | 'unknown' | 'inferred', string>

export const GENOTYPE_WORDS: GenotypeWords = {
  visual: 'Visual: shows it',
  single: 'One copy (shows)',
  super: 'Two copies ("super")',
  het: 'Het: carries one copy, proven',
  claimedHet: 'Het: carries one copy, not proven',
  possibleHet: 'Possible het (chance shown)',
  nonCarrier: 'Does not carry it',
  unknown: 'Unknown',
  inferred: 'suggested from relatives',
}

export function genotypeWord(mark: GenotypeMark | undefined, words: GenotypeWords = GENOTYPE_WORDS): string {
  if (!mark) return words.unknown
  const w =
    mark.state === 'visual' ? words.visual
    : mark.state === 'single' ? words.single
    : mark.state === 'super' ? words.super
    : mark.state === 'het' ? (mark.basis === 'proven-breeding' || mark.basis === 'genetic-test' ? words.het : words.claimedHet)
    : mark.state === 'possible-het' ? `${words.possibleHet}${mark.probability !== undefined ? `: ${Math.round(mark.probability * 100)}%` : ''}`
    : mark.state === 'non-carrier' ? words.nonCarrier
    : words.unknown
  return mark.basis === 'inferred' ? `${w} (${words.inferred})` : w
}

const R = 6

/** The symbol (SVG, centered on 0,0). */
export function GenotypeGlyph({ mark, words }: { mark: GenotypeMark | undefined; words?: GenotypeWords }) {
  const state = mark?.state ?? 'unknown'
  const proven = mark?.basis === 'proven-breeding' || mark?.basis === 'genetic-test'
  const half = `M 0 ${-R} A ${R} ${R} 0 0 0 0 ${R} Z`
  return (
    <g className="op-gene" data-state={state} data-basis={mark?.basis} aria-hidden="true">
      <title>{genotypeWord(mark, words)}</title>
      {state === 'super' && <circle className="op-gene-ring" r={R + 3} />}
      <circle className="op-gene-outline" r={R} data-dashed={(state === 'het' && !proven) || state === 'unknown' || mark?.basis === 'inferred' || undefined} />
      {(state === 'visual' || state === 'single' || state === 'super') && <circle className="op-gene-fill" r={R} />}
      {state === 'het' && <path className="op-gene-fill" d={half} />}
      {state === 'possible-het' && <circle className="op-gene-fill" r={2} />}
      {state === 'possible-het' && mark?.probability !== undefined && (
        <text className="op-gene-text" x={-R - 3} y={3.5} textAnchor="end">
          {Math.round(mark.probability * 100)}%
        </text>
      )}
      {state === 'unknown' && (
        <text className="op-gene-text" y={3.5} textAnchor="middle">
          ?
        </text>
      )}
    </g>
  )
}

/** Legend for the overlay: every symbol with its meaning (also the tooltips). */
export function GeneLegend({ overlay, words = GENOTYPE_WORDS }: { overlay: GeneOverlay; words?: GenotypeWords }) {
  const recessive = (overlay.mode ?? 'recessive') === 'recessive'
  const items: GenotypeMark[] = recessive
    ? [{ state: 'visual' }, { state: 'het', basis: 'proven-breeding' }, { state: 'het', basis: 'reported' }, { state: 'possible-het', probability: 0.66 }, { state: 'non-carrier' }, { state: 'unknown' }]
    : [{ state: 'single' }, { state: 'super' }, { state: 'non-carrier' }, { state: 'unknown' }]
  return (
    <div className="op-gene-legend" role="group" aria-label={overlay.label}>
      <strong>{overlay.label}</strong>
      <ul>
        {items.map((m, i) => (
          <li key={i}>
            <svg width={m.state === 'possible-het' ? 44 : 22} height={22} viewBox={m.state === 'possible-het' ? '-33 -11 44 22' : '-11 -11 22 22'} aria-hidden="true">
              <GenotypeGlyph mark={m} words={words} />
            </svg>
            {genotypeWord(m, words)}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A gene shown as allele dots, with its own color (to tell genes apart; meaning comes from shape). */
export type GeneKey = { id: string; label: string; color: string; mode?: InheritanceMode; linkage?: 'Z' | 'X' }

/** Several genes on every node: two dots per gene, one per copy. */
export type GenotypeDisplay = {
  /** Genes to show, in order (up to four fit on a node). */
  genes: readonly GeneKey[]
  /** Each individual's records; a gene without a record is drawn as unknown. */
  records: ReadonlyMap<string, readonly GenotypeRecord[]>
  /** Needed for sex-linked genes: the heterogametic sex has one copy (one dot). */
  sexOf?: (individualId: string) => SexClass
}

/** How many of the two copies carry the variant: [filled, possible, unknown] out of `slots`. */
function copies(record: GenotypeRecord | undefined, mode: InheritanceMode | undefined, slots: 1 | 2): { filled: number; possible: number; unknown: number } {
  const state = record?.state ?? 'unknown'
  if (state === 'unknown') return { filled: 0, possible: 0, unknown: slots }
  if (state === 'non-carrier') return { filled: 0, possible: 0, unknown: 0 }
  if (state === 'possible-het') return { filled: 0, possible: 1, unknown: 0 }
  if (state === 'het' || state === 'single') return { filled: 1, possible: 0, unknown: 0 }
  if (state === 'super') return { filled: slots, possible: 0, unknown: 0 }
  // visual: two copies for a recessive (or one when hemizygous); one assumed otherwise
  return { filled: slots === 1 || mode === 'recessive' ? slots : 1, possible: 0, unknown: 0 }
}

/** Allele dots for one gene (SVG, starting at 0,0, vertically centered on 0). */
export function GenotypeDots({ gene, record, hemizygous = false, r = 4.5, words }: { gene: GeneKey; record: GenotypeRecord | undefined; hemizygous?: boolean; r?: number; words?: GenotypeWords }) {
  const slots = hemizygous ? 1 : 2
  const c = copies(record, gene.mode, slots)
  const dots: ('filled' | 'possible' | 'unknown' | 'empty')[] = []
  for (let i = 0; i < c.filled; i++) dots.push('filled')
  for (let i = 0; i < c.possible; i++) dots.push('possible')
  for (let i = 0; i < c.unknown; i++) dots.push('unknown')
  while (dots.length < slots) dots.push('empty')
  return (
    <g className="op-dots" data-gene={gene.id} aria-hidden="true">
      <title>{`${gene.label}: ${genotypeWord(record ? { state: record.state, ...(record.probability !== undefined ? { probability: record.probability } : {}), ...(record.basis ? { basis: record.basis } : {}) } : undefined, words)}`}</title>
      {dots.map((d, i) => (
        <circle key={i} className="op-dot" data-dot={d} cx={r + i * (2 * r + 2)} cy={0} r={r} style={d === 'filled' ? { fill: gene.color } : undefined} />
      ))}
    </g>
  )
}

/** Width of one gene's dots plus the gap after it. */
export const dotsWidth = (r = 4.5) => 2 * (2 * r) + 2 + 8

/** The genotypes line for one individual (several genes side by side). */
export function GenotypeStrip({ display, individualId, r = 4.5, max = 4 }: { display: GenotypeDisplay; individualId: string; r?: number; max?: number }) {
  const recs = display.records.get(individualId) ?? []
  const sex = display.sexOf?.(individualId) ?? 'unknown'
  return (
    <g className="op-genotypes">
      {display.genes.slice(0, max).map((g, i) => (
        <g key={g.id} transform={`translate(${i * dotsWidth(r)} 0)`}>
          <GenotypeDots gene={g} record={recs.find((x) => x.gene === g.id)} hemizygous={Boolean(g.linkage) && sex === 'heterogametic'} r={r} />
        </g>
      ))}
    </g>
  )
}

/** Plain-language genotypes for an individual (screen readers, tooltips). */
export function genotypeText(display: GenotypeDisplay, individualId: string, words: GenotypeWords = GENOTYPE_WORDS): string {
  const recs = display.records.get(individualId) ?? []
  return display.genes
    .map((g) => {
      const r = recs.find((x) => x.gene === g.id)
      return `${g.label}: ${genotypeWord(r ? { state: r.state, ...(r.probability !== undefined ? { probability: r.probability } : {}), ...(r.basis ? { basis: r.basis } : {}) } : undefined, words)}`
    })
    .join('; ')
}

/** Key for allele dots: each gene's color, and what the dots mean. */
export function GenotypeKey({ display, labels = {} }: { display: GenotypeDisplay; labels?: Partial<Record<'title' | 'two' | 'one' | 'none' | 'possible' | 'unknown', string>> }) {
  const l = { title: 'Genes', two: 'two copies', one: 'one copy', none: 'none', possible: 'possible (dashed)', unknown: 'not known', ...labels }
  const demo: GeneKey = { id: 'demo', label: '', color: '#7a625c', mode: 'recessive' }
  const sample = (record: GenotypeRecord | undefined, text: string) => (
    <li>
      <svg width={22} height={12} viewBox="0 -6 22 12" aria-hidden="true">
        <GenotypeDots gene={demo} record={record} r={4} />
      </svg>
      {text}
    </li>
  )
  return (
    <div className="op-gene-legend op-genotype-key" role="group" aria-label={l.title}>
      <strong>{l.title}</strong>
      <ul>
        {display.genes.map((g) => (
          <li key={g.id}>
            <span className="op-gene-swatch" style={{ background: g.color }} aria-hidden="true" />
            {g.label}
          </li>
        ))}
      </ul>
      <ul>
        {sample({ gene: 'demo', state: 'super' }, l.two)}
        {sample({ gene: 'demo', state: 'het' }, l.one)}
        {sample({ gene: 'demo', state: 'non-carrier' }, l.none)}
        {sample({ gene: 'demo', state: 'possible-het' }, l.possible)}
        {sample(undefined, l.unknown)}
      </ul>
    </div>
  )
}
