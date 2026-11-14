import { lifeLabel, lifeSpan, type Individual, type PedigreeViewProjection } from '@extantape/onepedigree-core'

import { DEFAULT_TERMS, labelOf, type Terminology } from './describe.js'

export type AhnentafelListProps = {
  projection: PedigreeViewProjection
  terminology?: Partial<Terminology>
  /** Words for the two parents (default Father/Mother), e.g. Sire/Dam. */
  parentWords?: { paternal: string; maternal: string }
  getIndividualHref?: (individual: Individual) => string | null | undefined
  onSelect?: (individualId: string) => void
  selectedIndividualId?: string | null
  className?: string
}

/** "Father’s mother" for Ahnentafel number 6: each bit after the first is a step (0 = paternal, 1 = maternal). */
export function ahnentafelRelation(n: number, words = { paternal: 'Father', maternal: 'Mother' }): string {
  if (n <= 1) return ''
  const steps = n
    .toString(2)
    .slice(1)
    .split('')
    .map((b) => (b === '0' ? words.paternal : words.maternal))
  return steps.map((w, i) => (i === 0 ? w : w.toLowerCase())).join('’s ')
}

/**
 * The Ahnentafel as genealogists use it: a numbered list of ancestors by
 * generation (1 = the focal individual, 2n = father, 2n + 1 = mother), with
 * life years and the relationship spelled out. Server-renderable.
 */
export function AhnentafelList(props: AhnentafelListProps) {
  const terms = { ...DEFAULT_TERMS, ...props.terminology }
  const rows = props.projection.occurrences.filter((o) => o.ahnentafel !== undefined).sort((a, b) => a.ahnentafel! - b.ahnentafel!)
  const generations = new Map<number, typeof rows>()
  for (const r of rows) {
    const g = Math.floor(Math.log2(r.ahnentafel!)) + 1
    generations.set(g, [...(generations.get(g) ?? []), r])
  }
  const unnumbered = props.projection.occurrences.filter((o) => o.ahnentafel === undefined)
  return (
    <div className={['op-ahnentafel', props.className].filter(Boolean).join(' ')}>
      {[...generations].map(([g, list]) => (
        <section key={g} className="op-ahnentafel-generation" aria-label={`Generation ${g}`}>
          <h3>Generation {g}</h3>
          <ol>
            {list.map((o) => {
              const individual = props.projection.individuals[o.individualId]
              const href = individual ? props.getIndividualHref?.(individual) : null
              const name = labelOf(individual, terms)
              const years = lifeLabel(lifeSpan(individual))
              return (
                <li key={o.occurrenceId} value={o.ahnentafel} data-selected={props.selectedIndividualId === o.individualId || undefined}>
                  <span className="op-ahnentafel-number">{o.ahnentafel}.</span>{' '}
                  {href ? (
                    <a href={href}>{name}</a>
                  ) : props.onSelect ? (
                    <button type="button" onClick={() => props.onSelect!(o.individualId)}>
                      {name}
                    </button>
                  ) : (
                    <span>{name}</span>
                  )}
                  {years && <span className="op-ahnentafel-years"> {years}</span>}
                  {o.ahnentafel! > 1 && <span className="op-ahnentafel-relation"> · {ahnentafelRelation(o.ahnentafel!, props.parentWords)}</span>}
                </li>
              )
            })}
          </ol>
        </section>
      ))}
      {unnumbered.length > 0 && (
        <p className="op-ahnentafel-note">
          {unnumbered.length} {unnumbered.length === 1 ? terms.individual : terms.individuals} without a mother/father role are not numbered.
        </p>
      )}
    </div>
  )
}
