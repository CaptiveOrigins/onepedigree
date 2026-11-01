import {
  layoutSync,
  PEDIGREE_VIEWS,
  PARENT_TERM_PRESETS,
  projectPedigree,
  validatePedigree,
  type Individual,
  type PedigreeDocument,
  type PedigreeViewId,
} from '@captiveorigins/onepedigree-core'
import { PedigreeExplorer, THEME_PRESETS, VIEW_LABELS } from '@captiveorigins/onepedigree-react'
import { useEffect, useMemo, useState } from 'react'

import { exportAs, newProject, pickAndOpen, projectDisplay, projectDoc, projectTitle, saveProject, type Display, type Project } from './files'
import { checkForUpdates, loadSettings, saveSettings, type Settings } from './updates'

const field = { display: 'grid', gap: 4, marginBottom: 10 } as const

export function App() {
  const [project, setProject] = useState<Project | null>(null)
  const [dirty, setDirty] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>({ autoUpdate: true })
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s)
      if (s.autoUpdate) void checkForUpdates(false).then((m) => m && setStatus(m))
    })
  }, [])

  const doc = project ? projectDoc(project) : null
  const display = project ? projectDisplay(project) : ({} as Display)
  const view = (display.view as PedigreeViewId) || 'pedigree'
  const focal = display.focal && doc?.individuals.some((i) => i.id === display.focal) ? display.focal : (doc?.individuals[0]?.id ?? null)

  const projection = useMemo(() => {
    if (!doc || !focal) return null
    try {
      return projectPedigree(doc, { focalId: focal, view, ancestorDepth: display.generations ?? 4, descendantDepth: display.generations ?? 4, includeSiblings: true })
    } catch {
      return null
    }
  }, [doc, focal, view, display.generations])
  const layout = useMemo(() => (projection ? layoutSync(projection) : null), [projection])
  const issues = useMemo(() => (doc ? validatePedigree(doc).issues : []), [doc])

  const setDisplay = (patch: Partial<Display>) => {
    if (!project) return
    setDirty(true)
    if (project.kind === 'json') setProject({ ...project, display: { ...project.display, ...patch } })
    else setProject({ ...project, companion: { ...project.companion, display: { ...(project.companion.display ?? {}), ...patch } } })
  }
  const setDoc = (next: PedigreeDocument) => {
    if (project?.kind !== 'json') return
    setDirty(true)
    setProject({ ...project, doc: next })
  }
  /** Extra fields: in the document for JSON projects; in the companion for GEDCOM (the GEDCOM is never changed). */
  const setExtra = (id: string, key: string, value: string | null) => {
    if (!project) return
    setDirty(true)
    if (project.kind === 'json') {
      setDoc({
        ...project.doc,
        individuals: project.doc.individuals.map((i) => {
          if (i.id !== id) return i
          const data = { ...(i.data ?? {}) } as Record<string, unknown>
          if (value === null) delete data[key]
          else data[key] = value
          return { ...i, data }
        }),
      })
    } else {
      const extras = { ...(project.companion.individuals ?? {}) }
      const mine = { ...(extras[id] ?? {}), data: { ...(extras[id]?.data ?? {}) } }
      if (value === null) delete mine.data[key]
      else mine.data[key] = value
      extras[id] = mine
      setProject({ ...project, companion: { ...project.companion, individuals: extras } })
    }
  }

  const open = async () => {
    try {
      const p = await pickAndOpen()
      if (p) {
        setProject(p)
        setDirty(p.kind === 'json' && !p.path)
        setSelected(null)
        setStatus(p.warnings.length ? p.warnings.join(' ') : `Opened ${projectTitle(p)}`)
      }
    } catch (e) {
      setStatus(`Could not open: ${(e as Error).message}`)
    }
  }
  const save = async (as = false) => {
    if (!project) return
    try {
      const saved = await saveProject(project, as)
      if (saved) {
        setProject(saved)
        setDirty(false)
        setStatus(saved.kind === 'gedcom' ? 'Saved your extras in the companion file (the GEDCOM is unchanged).' : 'Saved.')
      }
    } catch (e) {
      setStatus(`Could not save: ${(e as Error).message}`)
    }
  }

  const person = doc?.individuals.find((i) => i.id === selected)
  const editable = project?.kind === 'json'
  const terms = PARENT_TERM_PRESETS[display.parentTerms ?? 'mother-father'].terms

  const addIndividual = () => {
    if (!project || project.kind !== 'json') return
    const id = `i${Date.now().toString(36)}`
    setDoc({ ...project.doc, individuals: [...project.doc.individuals, { id, label: 'New individual', sex: null, parentage: null }] })
    setSelected(id)
    if (!focal) setDisplay({ focal: id })
  }
  const updatePerson = (patch: Partial<Individual>) => {
    if (!project || project.kind !== 'json' || !person) return
    setDoc({ ...project.doc, individuals: project.doc.individuals.map((i) => (i.id === person.id ? { ...i, ...patch } : i)) })
  }
  const setParent = (role: 'mother' | 'father', parentId: string) => {
    if (!person) return
    const others = (person.parentage?.parents ?? []).filter((p) => p.role !== role)
    const parents = parentId ? [...others, { individual: parentId, role }] : others
    updatePerson({ parentage: parents.length ? { ...(person.parentage ?? {}), parents } : null })
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', height: '100vh' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #ddd' }}>
        <strong style={{ marginInlineEnd: 8 }}>OnePedigree</strong>
        <button onClick={() => { setProject(newProject()); setDirty(true); setSelected(null) }}>New</button>
        <button onClick={open}>Open…</button>
        <button onClick={() => save()} disabled={!project}>Save{dirty ? ' •' : ''}</button>
        {project?.kind === 'json' && <button onClick={() => save(true)}>Save as…</button>}
        <button onClick={() => project && exportAs(project, 'gedcom')} disabled={!project}>Export GEDCOM</button>
        <button onClick={() => project && exportAs(project, 'json')} disabled={!project}>Export JSON</button>
        {project && (
          <>
            <label>
              View{' '}
              <select value={view} onChange={(e) => setDisplay({ view: e.target.value })}>
                {PEDIGREE_VIEWS.map((v) => (
                  <option key={v} value={v}>
                    {VIEW_LABELS[v]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Generations <input type="number" min={1} max={12} value={display.generations ?? 4} onChange={(e) => setDisplay({ generations: Number(e.target.value) })} style={{ width: 48 }} />
            </label>
            <label>
              Parents{' '}
              <select value={display.parentTerms ?? 'mother-father'} onChange={(e) => setDisplay({ parentTerms: e.target.value as Display['parentTerms'] })}>
                {Object.entries(PARENT_TERM_PRESETS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Colors{' '}
              <select value={display.theme ?? 'classic'} onChange={(e) => setDisplay({ theme: e.target.value })}>
                {THEME_PRESETS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={() => setShowSettings((v) => !v)}>Settings</button>
      </header>
      <div style={{ padding: '4px 12px', minHeight: 22, fontSize: 13, color: '#555', borderBottom: '1px solid #eee' }}>
        {project ? `${projectTitle(project)}${display.species ? ` · ${display.species}` : ''} · ${doc?.individuals.length ?? 0} individuals${issues.length ? ` · ${issues.length} notices` : ''}` : ''}
        {status && <span style={{ marginInlineStart: 12 }}>{status}</span>}
      </div>
      <main style={{ display: 'grid', gridTemplateColumns: '1fr 320px', minHeight: 0 }}>
        <section style={{ minWidth: 0, overflow: 'hidden' }}>
          {!project ? (
            <div style={{ padding: 32, maxWidth: 560 }}>
              <h1>OnePedigree</h1>
              <p>Open a GEDCOM family tree, a OnePedigree JSON file, or a spreadsheet (CSV with ID, mother/dam and father/sire columns), or start a new pedigree for any species.</p>
              <p>A GEDCOM stays exactly as it is: your extra fields and view settings are kept in a companion file beside it.</p>
              <button onClick={open}>Open a file…</button>{' '}
              <button onClick={() => { setProject(newProject()); setDirty(true) }}>New pedigree</button>
            </div>
          ) : projection && layout ? (
            <PedigreeExplorer
              key={`${display.theme}-${view}`}
              projection={projection}
              layout={layout}
              theme={display.theme ?? 'classic'}
              height="calc(100vh - 90px)"
              onSelectIndividual={(id) => setSelected(id)}
              themeEditor
            />
          ) : (
            <p style={{ padding: 32 }}>{editable ? 'Add an individual to begin.' : 'Nothing to show yet.'}</p>
          )}
        </section>
        <aside style={{ borderInlineStart: '1px solid #ddd', padding: 12, overflowY: 'auto' }}>
          {showSettings ? (
            <div>
              <h3>Settings</h3>
              <label style={{ display: 'flex', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={settings.autoUpdate}
                  onChange={async (e) => {
                    const next = { ...settings, autoUpdate: e.target.checked }
                    setSettings(next)
                    await saveSettings(next)
                  }}
                />
                Check for updates automatically
              </label>
              <p>
                <button onClick={async () => setStatus((await checkForUpdates(true)) ?? 'You have the latest version.')}>Check for updates now</button>
              </p>
              {project && (
                <label style={field}>
                  Species or subject of this project
                  <input value={display.species ?? ''} onChange={(e) => setDisplay({ species: e.target.value })} placeholder="e.g. Chelonoidis carbonarius" />
                </label>
              )}
            </div>
          ) : !project ? null : (
            <div>
              {editable && <button onClick={addIndividual}>Add individual</button>}
              <label style={{ ...field, marginTop: 10 }}>
                Focus on
                <select value={focal ?? ''} onChange={(e) => setDisplay({ focal: e.target.value })}>
                  {doc!.individuals.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label ?? i.id}
                    </option>
                  ))}
                </select>
              </label>
              {person ? (
                <div>
                  <h3>{person.label ?? person.id}</h3>
                  {editable ? (
                    <>
                      <label style={field}>
                        Name <input value={person.label ?? ''} onChange={(e) => updatePerson({ label: e.target.value })} />
                      </label>
                      <label style={field}>
                        Sex <input value={person.sex ?? ''} onChange={(e) => updatePerson({ sex: e.target.value || null })} placeholder="female, male, unknown…" />
                      </label>
                      {(['mother', 'father'] as const).map((role) => (
                        <label key={role} style={field}>
                          {role === 'mother' ? terms.maternal : terms.paternal}
                          <select value={person.parentage?.parents.find((p) => p.role === role)?.individual ?? ''} onChange={(e) => setParent(role, e.target.value)}>
                            <option value="">Unknown</option>
                            {doc!.individuals
                              .filter((i) => i.id !== person.id)
                              .map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.label ?? i.id}
                                </option>
                              ))}
                          </select>
                        </label>
                      ))}
                    </>
                  ) : (
                    <p style={{ fontSize: 13, color: '#666' }}>From the GEDCOM (names and parents are edited in your genealogy app). Add your own fields below; they are saved in the companion file.</p>
                  )}
                  <h4>Extra fields</h4>
                  {Object.entries((person.data ?? {}) as Record<string, unknown>)
                    .filter(([k, v]) => k !== 'gedcom' && typeof v !== 'object')
                    .map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        <span style={{ minWidth: 90 }}>{k}</span>
                        <input value={String(v)} onChange={(e) => setExtra(person.id, k, e.target.value)} />
                        <button onClick={() => setExtra(person.id, k, null)} title="Remove">×</button>
                      </div>
                    ))}
                  <button
                    onClick={() => {
                      const key = prompt('Field name (e.g. Morph, Microchip, Weight)')
                      if (key) setExtra(person.id, key, '')
                    }}
                  >
                    Add field
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: '#666' }}>Select someone in the pedigree to see or edit them.</p>
              )}
              {issues.length > 0 && (
                <>
                  <h4>Notices</h4>
                  <ul style={{ fontSize: 12, paddingInlineStart: 16 }}>
                    {issues.slice(0, 20).map((i, n) => (
                      <li key={n}>{i.message}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}
