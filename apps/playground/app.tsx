import { carrierFromOffspring, layoutSync, PEDIGREE_VIEWS, projectPedigree, type OccurrenceMode, type PedigreeViewId, type TraitDefinition, type TraitRecord } from '@captiveorigins/onepedigree-core'
import { PedigreeExplorer, THEME_PRESETS, VIEW_LABELS, type TraitMark } from '@captiveorigins/onepedigree-react'
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { DATASETS, type DatasetName } from './fixtures'

// Illustrative recessive trait (not a real morph): the focal individual shows it;
// its parents are suggested as carriers from that offspring (carrierFromOffspring).
const EXAMPLE: TraitDefinition[] = [{ id: 'example', label: 'Example recessive (illustrative)', mode: 'recessive' }]

/** Development playground: every view for every fixture (no application logic). */
function Playground() {
  const [dataset, setDataset] = useState<DatasetName>('Reptile breeding (red-footed tortoises)')
  const [view, setView] = useState<PedigreeViewId>((new URLSearchParams(location.search).get('view') as PedigreeViewId) || 'pedigree')
  const [depth, setDepth] = useState(4)
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical')
  const [mode, setMode] = useState<OccurrenceMode | ''>('')
  const params = new URLSearchParams(location.search)
  const [theme, setTheme] = useState(params.get('theme') ?? 'classic')
  const d = DATASETS[dataset]
  const projection = useMemo(
    () => projectPedigree(d.doc, { focalId: view === 'descendants' || view === 'hourglass' ? d.founder : d.focal, relatedId: d.related, view, ancestorDepth: depth, descendantDepth: depth, includeSiblings: true, ...(mode ? { occurrenceMode: mode } : {}) }),
    [d, view, depth, mode],
  )
  // Drag nodes to rearrange them where order is a choice (descendants, hourglass, cohort, population, relationship).
  const [nodeOrder, setNodeOrder] = useState<string[]>([])
  const layout = useMemo(() => layoutSync(projection, { orientation, nodeOrder }), [projection, orientation, nodeOrder])
  const [trait, setTrait] = useState<'' | 'example'>('')
  const marks = useMemo(() => {
    const m = new Map<string, TraitMark>([[d.focal, { state: 'visual', basis: 'reported' }]])
    const focal = d.doc.individuals.find((i) => i.id === d.focal)
    for (const p of focal?.parentage?.parents ?? []) {
      const records: TraitRecord[] = []
      for (const s of carrierFromOffspring(EXAMPLE, { records }, [{ records: [{ trait: 'example', state: 'visual' }] }])) m.set(p.individual, s)
    }
    return m
  }, [d])
  const select = <T extends string>(label: string, value: T, options: readonly T[], set: (v: T) => void, names?: Record<string, string>) => (
    <label>
      {label}{' '}
      <select value={value} onChange={(e) => set(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {names?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <div>
      <h1>OnePedigree playground</h1>
      <div className="controls">
        {select('Dataset', dataset, Object.keys(DATASETS) as DatasetName[], setDataset)}
        {select('View', view, PEDIGREE_VIEWS, setView, VIEW_LABELS)}
        <label>
          Generations <input type="number" min={1} max={10} value={depth} onChange={(e) => setDepth(Number(e.target.value))} />
        </label>
        {select('Orientation', orientation, ['vertical', 'horizontal'] as const, setOrientation)}
        {select('Repeated individuals', mode, ['', 'separate', 'merge', 'hybrid'] as const, setMode, { '': 'view default' })}
        {select('Trait', trait, ['', 'example'] as const, setTrait, { '': 'none', example: EXAMPLE[0]!.label })}
        {select('Theme', theme, THEME_PRESETS.map((t) => t.id), setTheme, Object.fromEntries(THEME_PRESETS.map((t) => [t.id, t.label])))}
      </div>
      {projection.issues.length > 0 && (
        <ul className="notices">
          {projection.issues.map((i, n) => (
            <li key={n}>
              {i.code}: {i.message}
            </li>
          ))}
        </ul>
      )}
      {/* key: a new preset restarts the explorer's editable theme */}
      <PedigreeExplorer key={theme} projection={projection} layout={layout} height="70vh" theme={theme} themeEditor nodeOrder={nodeOrder} onNodeOrderChange={setNodeOrder} {...(trait ? { traitOverlay: { label: EXAMPLE[0]!.label, marks, mode: 'recessive' as const } } : {})} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Playground />)
