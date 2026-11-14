import { useId, useMemo, useState } from 'react'

/**
 * One studbook animal, as the reader may see it. The caller decides what reaches the table: a private animal comes in
 * with `private: true` and is drawn as a placeholder, holder names are already resolved (or "Private holder"), and
 * `genetics` is present only where the reader may see it (the coordinator for every animal, a member for their own).
 */
export type StudbookRow = {
  id: string
  studbookNumber: string
  oldNumbers?: readonly string[]
  /** The registry's own ID for the animal. */
  coId: string
  /** The keeper's own Animal ID. */
  animalId?: string
  sex: 'female' | 'male' | 'unknown' | 'abnormal' | 'hermaphrodite'
  birthType: 'wild' | 'captive' | 'unknown'
  /** As it should read, with any estimate shown (e.g. "2019 (year only)"). */
  birthDate?: string
  /** Sortable form of the birth date, yyyy-mm-dd or a prefix of it. */
  birthSort?: string
  /** A parent's studbook number, or UNK, WILD or MULT. */
  sire?: string
  dam?: string
  status: 'alive' | 'dead' | 'lost-to-follow-up'
  holder?: string
  private?: boolean
  genetics?: { meanKinship: number; inbreeding: number }
}

export type StudbookTableLabels = {
  search: string
  searchHint: string
  showing: (shown: number, total: number) => string
  aliveOnly: string
  number: string
  was: string
  coId: string
  animalId: string
  sex: string
  born: string
  origin: string
  sire: string
  dam: string
  status: string
  holder: string
  mk: string
  mkLong: string
  f: string
  fLong: string
  notShown: string
  none: string
  privateAnimal: string
  basisTitle: string
  basisText: string
  empty: string
  sortBy: (column: string) => string
  words: Record<StudbookRow['sex'] | StudbookRow['birthType'] | StudbookRow['status'], string>
}

export const STUDBOOK_TABLE_LABELS: StudbookTableLabels = {
  search: 'Find an animal',
  searchHint: 'Studbook number, old number, registry ID or Animal ID',
  showing: (shown, total) => `Showing ${shown} of ${total} animals`,
  aliveOnly: 'Living animals only',
  number: 'Studbook no.',
  was: 'was',
  coId: 'Registry ID',
  animalId: 'Animal ID',
  sex: 'Sex',
  born: 'Born or hatched',
  origin: 'Origin',
  sire: 'Sire',
  dam: 'Dam',
  status: 'Status',
  holder: 'Holder',
  mk: 'MK',
  mkLong: 'Mean kinship',
  f: 'F',
  fLong: 'Inbreeding',
  notShown: 'Not shown to you',
  none: 'None recorded',
  privateAnimal: 'Private animal. It counts in every analysis, but its details are hidden.',
  basisTitle: 'Mean kinship and inbreeding are pedigree-based',
  basisText:
    'They are worked out from the recorded parents only, treating founders as unrelated unless the studbook says otherwise. A wrong or missing parent changes them, and DNA could show the animals are more or less related than this. Lower mean kinship means an animal carries rarer genes for this population.',
  empty: 'No animals match.',
  sortBy: (c) => `Sort by ${c}`,
  words: {
    female: 'Female', male: 'Male', unknown: 'Unknown', abnormal: 'Abnormal', hermaphrodite: 'Hermaphrodite',
    wild: 'Wild', captive: 'Captive',
    alive: 'Alive', dead: 'Dead', 'lost-to-follow-up': 'Lost to follow-up',
  },
}

type SortKey = 'number' | 'born' | 'mk' | 'f'
type Sort = { key: SortKey; dir: 'ascending' | 'descending' }

/** Permanent numbers in order, then temporary ones (T1, T2…). */
const numberKey = (n: string): [number, number] => (n.startsWith('T') ? [1, Number(n.slice(1)) || 0] : [0, Number(n) || 0])

function compare(a: StudbookRow, b: StudbookRow, key: SortKey): number {
  if (key === 'number') {
    const [x, y] = [numberKey(a.studbookNumber), numberKey(b.studbookNumber)]
    return x[0] - y[0] || x[1] - y[1]
  }
  if (key === 'born') return a.birthSort!.localeCompare(b.birthSort!)
  return key === 'mk' ? a.genetics!.meanKinship - b.genetics!.meanKinship : a.genetics!.inbreeding - b.genetics!.inbreeding
}

/** Rows with no value for the sort column go last, whichever way it's sorted. */
const missing = (r: StudbookRow, key: SortKey) => (key === 'number' ? false : key === 'born' ? !r.birthSort : !r.genetics)

const fixed = (n: number) => n.toFixed(4)

export type StudbookTableProps = {
  rows: readonly StudbookRow[]
  /** The studbook's name, read out as the table's caption. */
  caption: string
  /** The date the studbook is current to. */
  currentness?: string
  onSelect?: (id: string) => void
  labels?: Partial<StudbookTableLabels>
  /** Start with every animal rather than only the living. */
  showAll?: boolean
  className?: string
}

/**
 * The studbook as a table: both IDs on every animal, search by any number or ID, sortable by studbook number, birth,
 * mean kinship and inbreeding. Private animals stay in the count as placeholders and never match a search.
 */
export function StudbookTable({ rows, caption, currentness, onSelect, labels: partial, showAll = false, className }: StudbookTableProps) {
  const l = { ...STUDBOOK_TABLE_LABELS, ...partial, words: { ...STUDBOOK_TABLE_LABELS.words, ...partial?.words } }
  const [query, setQuery] = useState('')
  const [aliveOnly, setAliveOnly] = useState(!showAll)
  const [sort, setSort] = useState<Sort>({ key: 'number', dir: 'ascending' })
  const ids = { search: useId(), hint: useId() }
  const withGenetics = rows.some((r) => !r.private && r.genetics)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (r: StudbookRow) =>
      !q || (!r.private && [r.studbookNumber, ...(r.oldNumbers ?? []), r.coId, r.animalId ?? ''].some((v) => v.toLowerCase().includes(q)))
    const kept = rows.filter((r) => matches(r) && (!aliveOnly || r.private || r.status === 'alive'))
    const sign = sort.dir === 'ascending' ? 1 : -1
    // Private animals last, in no revealing order.
    return [...kept].sort((a, b) => {
      if (a.private || b.private) return Number(Boolean(a.private)) - Number(Boolean(b.private))
      const [ma, mb] = [missing(a, sort.key), missing(b, sort.key)]
      if (ma || mb) return Number(ma) - Number(mb) || compare(a, b, 'number')
      return sign * compare(a, b, sort.key) || compare(a, b, 'number')
    })
  }, [rows, query, aliveOnly, sort])

  const header = (key: SortKey, text: string, title?: string) => (
    <th scope="col" aria-sort={sort.key === key ? sort.dir : undefined} className={key === 'mk' || key === 'f' ? 'op-studbook-num' : undefined}>
      <button
        type="button"
        className="op-studbook-sort"
        // The visible text stays in the name (WCAG 2.5.3), so "MK" works for voice control as well as "Mean kinship".
        aria-label={l.sortBy(title ? `${text} (${title})` : text)}
        onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'ascending' ? 'descending' : 'ascending' }))}
      >
        {title ? <abbr title={title}>{text}</abbr> : text}
        <span aria-hidden="true">{sort.key === key ? (sort.dir === 'ascending' ? ' ▲' : ' ▼') : ''}</span>
      </button>
    </th>
  )
  const columns = 10 + (withGenetics ? 2 : 0)
  const dash = (why: string) => (
    <>
      <span aria-hidden="true">—</span>
      <span className="op-visually-hidden">{why}</span>
    </>
  )

  return (
    <div className={['op-studbook', className].filter(Boolean).join(' ')}>
      <div className="op-studbook-controls">
        <label htmlFor={ids.search}>{l.search}</label>
        <input id={ids.search} type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-describedby={ids.hint} />
        <span id={ids.hint} className="op-studbook-hint">{l.searchHint}</span>
        <label className="op-studbook-check">
          <input type="checkbox" checked={aliveOnly} onChange={(e) => setAliveOnly(e.target.checked)} />
          {l.aliveOnly}
        </label>
      </div>
      <p role="status" className="op-studbook-count">{l.showing(shown.length, rows.length)}</p>
      {withGenetics && (
        <details className="op-studbook-basis">
          <summary>{l.basisTitle}</summary>
          <p>{l.basisText}</p>
        </details>
      )}
      <div className="op-studbook-scroll" tabIndex={0} role="region" aria-label={caption}>
        <table>
          <caption>
            {caption}
            {currentness && <span className="op-studbook-currentness"> · {currentness}</span>}
          </caption>
          <thead>
            <tr>
              {header('number', l.number)}
              <th scope="col">{l.coId}</th>
              <th scope="col">{l.animalId}</th>
              <th scope="col">{l.sex}</th>
              {header('born', l.born)}
              <th scope="col">{l.origin}</th>
              <th scope="col">{l.sire}</th>
              <th scope="col">{l.dam}</th>
              <th scope="col">{l.status}</th>
              <th scope="col">{l.holder}</th>
              {withGenetics && header('mk', l.mk, l.mkLong)}
              {withGenetics && header('f', l.f, l.fLong)}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={columns}>{l.empty}</td>
              </tr>
            )}
            {shown.map((r, i) =>
              r.private ? (
                <tr key={`private-${i}`} className="op-studbook-private">
                  <td colSpan={columns}>{l.privateAnimal}</td>
                </tr>
              ) : (
                <tr key={r.id} data-status={r.status}>
                  <th scope="row">
                    {onSelect ? (
                      <button type="button" className="op-studbook-open" onClick={() => onSelect(r.id)}>
                        {r.studbookNumber}
                      </button>
                    ) : (
                      r.studbookNumber
                    )}
                    {r.oldNumbers?.length ? <span className="op-studbook-old"> ({l.was} {r.oldNumbers.join(', ')})</span> : null}
                  </th>
                  <td>{r.coId}</td>
                  <td>{r.animalId ?? dash(l.none)}</td>
                  <td>{l.words[r.sex]}</td>
                  <td>{r.birthDate ?? l.words.unknown}</td>
                  <td>{l.words[r.birthType]}</td>
                  <td>{r.sire ?? 'UNK'}</td>
                  <td>{r.dam ?? 'UNK'}</td>
                  <td>{l.words[r.status]}</td>
                  <td>{r.holder ?? dash(l.none)}</td>
                  {withGenetics && <td className="op-studbook-num">{r.genetics ? fixed(r.genetics.meanKinship) : dash(l.notShown)}</td>}
                  {withGenetics && <td className="op-studbook-num">{r.genetics ? fixed(r.genetics.inbreeding) : dash(l.notShown)}</td>}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
