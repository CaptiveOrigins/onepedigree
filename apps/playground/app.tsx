import { layoutSync, PEDIGREE_VIEWS, projectPedigree, type OccurrenceMode, type PedigreeViewId } from '@captiveorigins/onepedigree-core'
import { PedigreeExplorer, VIEW_LABELS } from '@captiveorigins/onepedigree-react'
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { DATASETS, type DatasetName } from './fixtures'

/** Development playground: every view for every fixture (no application logic). */
function Playground() {
  const [dataset, setDataset] = useState<DatasetName>('Reptile breeding (red-footed tortoises)')
  const [view, setView] = useState<PedigreeViewId>('pedigree')
  const [depth, setDepth] = useState(4)
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical')
  const [mode, setMode] = useState<OccurrenceMode | ''>('')
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto')
  const d = DATASETS[dataset]
  const projection = useMemo(
    () => projectPedigree(d.doc, { focalId: view === 'descendants' || view === 'hourglass' ? d.founder : d.focal, relatedId: d.related, view, ancestorDepth: depth, descendantDepth: depth, includeSiblings: true, ...(mode ? { occurrenceMode: mode } : {}) }),
    [d, view, depth, mode],
  )
  const layout = useMemo(() => layoutSync(projection, { orientation }), [projection, orientation])
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
    <div data-theme={theme}>
      <h1>OnePedigree playground</h1>
      <div className="controls">
        {select('Dataset', dataset, Object.keys(DATASETS) as DatasetName[], setDataset)}
        {select('View', view, PEDIGREE_VIEWS, setView, VIEW_LABELS)}
        <label>
          Generations <input type="number" min={1} max={10} value={depth} onChange={(e) => setDepth(Number(e.target.value))} />
        </label>
        {select('Orientation', orientation, ['vertical', 'horizontal'] as const, setOrientation)}
        {select('Repeated individuals', mode, ['', 'separate', 'merge', 'hybrid'] as const, setMode, { '': 'view default' })}
        {select('Theme', theme, ['auto', 'light', 'dark'] as const, setTheme)}
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
      <PedigreeExplorer projection={projection} layout={layout} height="70vh" />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Playground />)
