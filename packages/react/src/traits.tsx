import type { TraitRecord } from '@captiveorigins/onepedigree-core'

/** One individual's state for the trait being shown (from its `TraitRecord`). */
export type TraitMark = Pick<TraitRecord, 'state' | 'probability' | 'basis'>

/** Shows one heritable trait on every node with the usual genetic pedigree symbols. */
export type TraitOverlay = {
  /** The trait's name (legend title). */
  label: string
  /** Marks by individual id; individuals without one are drawn as unknown. */
  marks: ReadonlyMap<string, TraitMark>
  /** Recessive traits show het symbols; others show single/super. */
  mode?: 'recessive' | 'incomplete-dominant' | 'dominant' | 'codominant' | 'polygenic' | 'unknown'
}

export type TraitWords = Record<'visual' | 'single' | 'super' | 'het' | 'claimedHet' | 'possibleHet' | 'nonCarrier' | 'unknown' | 'inferred', string>

export const TRAIT_WORDS: TraitWords = {
  visual: 'Visual: shows the trait',
  single: 'One copy (shows)',
  super: 'Two copies ("super")',
  het: 'Het: carries one copy, proven',
  claimedHet: 'Het: carries one copy, not proven',
  possibleHet: 'Possible het (chance shown)',
  nonCarrier: 'Does not carry it',
  unknown: 'Unknown',
  inferred: 'suggested from relatives',
}

export function traitWord(mark: TraitMark | undefined, words: TraitWords = TRAIT_WORDS): string {
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
export function TraitGlyph({ mark, words }: { mark: TraitMark | undefined; words?: TraitWords }) {
  const state = mark?.state ?? 'unknown'
  const proven = mark?.basis === 'proven-breeding' || mark?.basis === 'genetic-test'
  const half = `M 0 ${-R} A ${R} ${R} 0 0 0 0 ${R} Z`
  return (
    <g className="op-trait" data-state={state} data-basis={mark?.basis} aria-hidden="true">
      <title>{traitWord(mark, words)}</title>
      {state === 'super' && <circle className="op-trait-ring" r={R + 3} />}
      <circle className="op-trait-outline" r={R} data-dashed={(state === 'het' && !proven) || state === 'unknown' || mark?.basis === 'inferred' || undefined} />
      {(state === 'visual' || state === 'single' || state === 'super') && <circle className="op-trait-fill" r={R} />}
      {state === 'het' && <path className="op-trait-fill" d={half} />}
      {state === 'possible-het' && <circle className="op-trait-fill" r={2} />}
      {state === 'possible-het' && mark?.probability !== undefined && (
        <text className="op-trait-text" x={-R - 3} y={3.5} textAnchor="end">
          {Math.round(mark.probability * 100)}%
        </text>
      )}
      {state === 'unknown' && (
        <text className="op-trait-text" y={3.5} textAnchor="middle">
          ?
        </text>
      )}
    </g>
  )
}

/** Legend for the overlay: every symbol with its meaning (also the tooltips). */
export function TraitLegend({ overlay, words = TRAIT_WORDS }: { overlay: TraitOverlay; words?: TraitWords }) {
  const recessive = (overlay.mode ?? 'recessive') === 'recessive'
  const items: TraitMark[] = recessive
    ? [{ state: 'visual' }, { state: 'het', basis: 'proven-breeding' }, { state: 'het', basis: 'reported' }, { state: 'possible-het', probability: 0.66 }, { state: 'non-carrier' }, { state: 'unknown' }]
    : [{ state: 'single' }, { state: 'super' }, { state: 'non-carrier' }, { state: 'unknown' }]
  return (
    <div className="op-trait-legend" role="group" aria-label={overlay.label}>
      <strong>{overlay.label}</strong>
      <ul>
        {items.map((m, i) => (
          <li key={i}>
            <svg width={m.state === 'possible-het' ? 44 : 22} height={22} viewBox={m.state === 'possible-het' ? '-33 -11 44 22' : '-11 -11 22 22'} aria-hidden="true">
              <TraitGlyph mark={m} words={words} />
            </svg>
            {traitWord(m, words)}
          </li>
        ))}
      </ul>
    </div>
  )
}
