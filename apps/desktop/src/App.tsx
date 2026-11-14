import {
  isBiologicalKind,
  layoutSync,
  PEDIGREE_VIEWS,
  PARENT_TERM_PRESETS,
  projectPedigree,
  validatePedigree,
  type Individual,
  type PedigreeDocument,
  type PedigreeViewId,
} from '@extantape/onepedigree-core'
import { PedigreeExplorer, THEME_PRESETS, VIEW_LABELS } from '@extantape/onepedigree-react'
import { invoke } from '@tauri-apps/api/core'
import { ask } from '@tauri-apps/plugin-dialog'
import { useEffect, useMemo, useState } from 'react'

import { exportAs, ForeignCompanionError, newProject, pickAndOpen, projectDisplay, projectDoc, projectTitle, saveProject, type Display, type Project } from './files'
import { checkForUpdates, loadSettings, saveSettings, type Appearance, type Settings } from './updates'

const projectFileName = (path: string) => path.split('/').pop() ?? path

/** Views that only make sense for managed populations (breeding programs), not family trees of people. */
const NOT_FOR_PEOPLE: readonly PedigreeViewId[] = ['population', 'inbreeding', 'cohort']

/** Light or dark right now: the setting, or the system when it is Auto. */
function useDark(appearance: Appearance) {
  const query = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
  const [system, setSystem] = useState(Boolean(query?.matches))
  useEffect(() => {
    if (!query) return
    const on = (e: MediaQueryListEvent) => setSystem(e.matches)
    query.addEventListener('change', on)
    return () => query.removeEventListener('change', on)
  }, [query])
  useEffect(() => {
    document.documentElement.dataset.appearance = appearance
  }, [appearance])
  return appearance === 'dark' || (appearance === 'auto' && system)
}

/** The same notice many times becomes one line with a count. */
function grouped(messages: string[]) {
  const counts = new Map<string, number>()
  for (const m of messages) counts.set(m, (counts.get(m) ?? 0) + 1)
  return [...counts].map(([message, count]) => (count > 1 ? `${message} (${count}×)` : message))
}

export function App() {
  const [project, setProject] = useState<Project | null>(null)
  const [dirty, setDirty] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [status, setStatus] = useState<{ text: string; details?: string[] } | null>(null)
  const [settings, setSettings] = useState<Settings>({ autoUpdate: true, appearance: 'auto' })
  const [showSettings, setShowSettings] = useState(false)
  const [newField, setNewField] = useState('')
  const dark = useDark(settings.appearance)

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s)
      if (s.autoUpdate) void checkForUpdates(false).then((m) => m && setStatus({ text: m }))
    })
  }, [])
  const changeSettings = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    await saveSettings(next)
  }

  const doc = project ? projectDoc(project) : null
  const display = project ? projectDisplay(project) : ({} as Display)
  const forPeople = project?.kind === 'gedcom' || /^humans?$/i.test(display.species ?? '')
  const views = PEDIGREE_VIEWS.filter((v) => !(forPeople && NOT_FOR_PEOPLE.includes(v)))
  const view = views.includes(display.view as PedigreeViewId) ? (display.view as PedigreeViewId) : 'pedigree'
  const focal = display.focal && doc?.individuals.some((i) => i.id === display.focal) ? display.focal : (doc?.individuals[0]?.id ?? null)
  const generations = display.generations ?? 4

  const projection = useMemo(() => {
    if (!doc || !focal) return null
    try {
      return projectPedigree(doc, {
        focalId: focal,
        view,
        // An hourglass looks a short way up: half the generations (at least one).
        ancestorDepth: view === 'hourglass' ? Math.max(1, Math.ceil(generations / 2)) : generations,
        descendantDepth: generations,
        includeSiblings: true,
        relatedId: display.related,
      })
    } catch {
      return null
    }
  }, [doc, focal, view, generations, display.related])
  // Drag nodes to rearrange them where order is a choice (descendants, hourglass, cohort, population, relationship).
  const [nodeOrder, setNodeOrder] = useState<string[]>([])
  const layout = useMemo(() => (projection ? layoutSync(projection, { nodeOrder }) : null), [projection, nodeOrder])
  const issues = useMemo(() => (doc ? validatePedigree(doc).issues : []), [doc])

  const setDisplay = (patch: Partial<Display>) => {
    if (!project) return
    setDirty(true)
    setProject((p) => {
      if (!p) return p
      if (p.kind === 'json') return { ...p, display: { ...p.display, ...patch } }
      return { ...p, companion: { ...p.companion, display: { ...(p.companion.display ?? {}), ...patch } } }
    })
  }
  const setDoc = (next: (doc: PedigreeDocument) => PedigreeDocument) => {
    setDirty(true)
    setProject((p) => (p?.kind === 'json' ? { ...p, doc: next(p.doc) } : p))
  }
  /** Extra fields: in the document for JSON projects; in the companion for GEDCOM (the GEDCOM is never changed). */
  const setExtra = (id: string, key: string, value: string | null) => {
    setDirty(true)
    setProject((p) => {
      if (!p) return p
      if (p.kind === 'json')
        return {
          ...p,
          doc: {
            ...p.doc,
            individuals: p.doc.individuals.map((i) => {
              if (i.id !== id) return i
              const data = { ...(i.data ?? {}) } as Record<string, unknown>
              if (value === null) delete data[key]
              else data[key] = value
              return { ...i, data }
            }),
          },
        }
      const extras = { ...(p.companion.individuals ?? {}) }
      const mine = { ...(extras[id] ?? {}), data: { ...(extras[id]?.data ?? {}) } }
      if (value === null) delete mine.data[key]
      else mine.data[key] = value
      extras[id] = mine
      return { ...p, companion: { ...p.companion, individuals: extras } }
    })
  }

  const open = async () => {
    try {
      const p = await pickAndOpen()
      if (p) {
        setProject(p)
        setDirty(p.kind === 'json' && !p.path)
        setSelected(null)
        setStatus(p.warnings.length ? { text: p.warnings[0]!, details: p.warnings.slice(1) } : { text: `Opened ${projectTitle(p)}` })
      }
    } catch (e) {
      setStatus({ text: `Could not open that file: ${(e as Error).message} Check that it's a GEDCOM, CSV or OnePedigree JSON file, then try again.` })
    }
  }
  const save = async (as = false) => {
    if (!project) return
    try {
      const saved = await saveProject(project, as)
      if (saved) {
        setProject(saved)
        setDirty(false)
        const elsewhere = saved.kind === 'gedcom' && project.kind === 'gedcom' && saved.companionPath !== project.companionPath
        setStatus({
          text:
            saved.kind !== 'gedcom'
              ? 'Saved.'
              : elsewhere
                ? `Saved your extras in ${projectFileName(saved.companionPath)} (the GEDCOM is unchanged). Next time, open that file to get them back with the GEDCOM.`
                : 'Saved your extras in the companion file (the GEDCOM is unchanged).',
        })
      }
    } catch (e) {
      if (e instanceof ForeignCompanionError) {
        // Never replace a file this app didn't write: say so, and offer another file instead.
        setStatus({ text: `Not saved: ${e.message} Your changes are still open here.` })
        const elsewhere = await ask(`${e.message} Save your extras in a new companion file beside the GEDCOM instead?`, {
          title: 'A different file has the companion name',
          kind: 'warning',
          okLabel: 'Choose a file…',
          cancelLabel: "Don't save",
        })
        if (elsewhere) await save(true)
        return
      }
      setStatus({ text: `Could not save: ${(e as Error).message} Your changes are still open here. Try Save As to pick another location.` })
    }
  }
  const startNew = () => {
    setProject(newProject())
    setDirty(true)
    setSelected(null)
  }

  const person = doc?.individuals.find((i) => i.id === selected)
  const editable = project?.kind === 'json'
  const terms = PARENT_TERM_PRESETS[display.parentTerms ?? 'mother-father'].terms

  const addIndividual = () => {
    if (project?.kind !== 'json') return
    const id = `i${Date.now().toString(36)}`
    // One update: the new individual, and the focus when the tree was empty.
    setDirty(true)
    setProject((p) =>
      p?.kind === 'json'
        ? {
            ...p,
            doc: { ...p.doc, individuals: [...p.doc.individuals, { id, label: 'New individual', sex: null, parentage: null }] },
            display: p.doc.individuals.length ? p.display : { ...p.display, focal: id },
          }
        : p,
    )
    setSelected(id)
  }
  const updatePerson = (patch: Partial<Individual>) => {
    if (!person) return
    setDoc((d) => ({ ...d, individuals: d.individuals.map((i) => (i.id === person.id ? { ...i, ...patch } : i)) }))
  }
  const setParent = (role: 'mother' | 'father', parentId: string) => {
    if (!person) return
    // The picker edits the biological parent in this role; a legal or foster parent recorded in the file stays.
    const others = (person.parentage?.parents ?? []).filter((p) => p.role !== role || !isBiologicalKind(p.kind))
    const parents = parentId ? [...others, { individual: parentId, role }] : others
    updatePerson({ parentage: parents.length ? { ...(person.parentage ?? {}), parents } : null })
  }
  const setData = (key: string, value: string) => {
    if (!person) return
    const data = { ...(person.data ?? {}) } as Record<string, unknown>
    if (value) data[key] = value
    else delete data[key]
    updatePerson({ data })
  }
  const addField = () => {
    const key = newField.trim()
    if (!person || !key) return
    setExtra(person.id, key, '')
    setNewField('')
  }
  const people = doc?.individuals ?? []
  const nameOf = (i: Individual) => i.label ?? i.id

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', height: '100vh' }}>
      <header className="app-header">
        <strong style={{ marginInlineEnd: 8 }}>OnePedigree</strong>
        <button onClick={startNew}>New</button>
        <button onClick={open}>Open…</button>
        <button onClick={() => save()} disabled={!project}>
          Save{dirty ? ' •' : ''}
        </button>
        {project?.kind === 'json' && <button onClick={() => save(true)}>Save as…</button>}
        <button onClick={() => project && exportAs(project, 'gedcom')} disabled={!project}>
          Export GEDCOM
        </button>
        <button onClick={() => project && exportAs(project, 'json')} disabled={!project}>
          Export JSON
        </button>
        {project && (
          <>
            <label>
              View{' '}
              <select value={view} onChange={(e) => setDisplay({ view: e.target.value })}>
                {views.map((v) => (
                  <option key={v} value={v}>
                    {VIEW_LABELS[v]}
                  </option>
                ))}
              </select>
            </label>
            {view === 'relationship' && (
              <label>
                Compare with{' '}
                <select value={display.related ?? ''} onChange={(e) => setDisplay({ related: e.target.value || undefined })}>
                  <option value="">Choose…</option>
                  {people
                    .filter((i) => i.id !== focal)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {nameOf(i)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              Generations <input type="number" min={1} max={12} value={generations} onChange={(e) => setDisplay({ generations: Number(e.target.value) })} style={{ width: 48 }} />
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
              <select value={display.theme ?? ''} onChange={(e) => setDisplay({ theme: e.target.value || undefined })}>
                <option value="">Match appearance</option>
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
      <div className="app-status">
        {project ? `${projectTitle(project)}${display.species ? ` · ${display.species}` : ''} · ${people.length} individuals${issues.length ? ` · ${issues.length} notices` : ''}` : ''}
        <span role="status">
          {status && (
            <span style={{ marginInlineStart: 12 }}>
              {status.text}
              {status.details?.length ? (
                <details>
                  <summary> {status.details.length} more</summary>
                  <ul className="app-notices">
                    {grouped(status.details).map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </span>
          )}
        </span>
      </div>
      <main className="app-main" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', minHeight: 0 }}>
        <section style={{ minWidth: 0, overflow: 'hidden' }}>
          {!project ? (
            <div style={{ padding: 32, maxWidth: 560 }}>
              <h1>OnePedigree</h1>
              <p>Open a GEDCOM family tree, a OnePedigree JSON file, or a spreadsheet (CSV with ID, mother/dam and father/sire columns), or start a new pedigree for any species.</p>
              <p>A GEDCOM stays exactly as it is: your extra fields and view settings are kept in a companion file beside it.</p>
              <button onClick={open}>Open a file…</button> <button onClick={startNew}>New pedigree</button>
            </div>
          ) : projection && layout ? (
            <PedigreeExplorer
              nodeOrder={nodeOrder}
              onNodeOrderChange={setNodeOrder}
              key={`${display.theme ?? (dark ? 'midnight' : 'classic')}-${view}`}
              projection={projection}
              layout={layout}
              theme={display.theme ?? (dark ? 'midnight' : 'classic')}
              height="calc(100vh - 90px)"
              onSelectIndividual={(id) => setSelected(id)}
              onPrint={() => void invoke('print_window').catch((e) => setStatus({ text: `Could not print: ${String(e)} Try again.` }))}
              parentWords={{ paternal: terms.paternal, maternal: terms.maternal }}
              themeEditor
            />
          ) : (
            <div style={{ padding: 32 }}>
              <p>{editable ? 'Add an individual to begin.' : 'Nothing to show yet.'}</p>
              {editable && <button onClick={addIndividual}>Add individual</button>}
            </div>
          )}
        </section>
        <aside className="app-aside">
          {showSettings ? (
            <div>
              <h3>Settings</h3>
              <label className="app-field">
                Appearance
                <select value={settings.appearance} onChange={(e) => void changeSettings({ appearance: e.target.value as Appearance })}>
                  <option value="auto">Auto (match macOS)</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label style={{ display: 'flex', gap: 8 }}>
                <input type="checkbox" checked={settings.autoUpdate} onChange={(e) => void changeSettings({ autoUpdate: e.target.checked })} />
                Check for updates automatically
              </label>
              <p>
                <button onClick={async () => setStatus({ text: (await checkForUpdates(true)) ?? 'You have the latest version.' })}>Check for updates now</button>
              </p>
              {project && (
                <label className="app-field">
                  Species or subject of this project
                  <input value={display.species ?? ''} onChange={(e) => setDisplay({ species: e.target.value })} placeholder="e.g. Chelonoidis carbonarius" />
                </label>
              )}
            </div>
          ) : !project ? null : (
            <div>
              {editable && <button onClick={addIndividual}>Add individual</button>}
              <label className="app-field" style={{ marginTop: 10 }}>
                Focus on
                <select value={focal ?? ''} onChange={(e) => setDisplay({ focal: e.target.value })}>
                  {people.map((i) => (
                    <option key={i.id} value={i.id}>
                      {nameOf(i)}
                    </option>
                  ))}
                </select>
              </label>
              {person ? (
                <div>
                  <h3>{nameOf(person)}</h3>
                  {editable ? (
                    <>
                      <label className="app-field">
                        Name <input value={person.label ?? ''} onChange={(e) => updatePerson({ label: e.target.value })} />
                      </label>
                      <label className="app-field">
                        Sex <input value={person.sex ?? ''} onChange={(e) => updatePerson({ sex: e.target.value || null })} placeholder="female, male, unknown…" />
                      </label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <label className="app-field">
                          Born <input value={String((person.data as Record<string, unknown> | undefined)?.born ?? '')} onChange={(e) => setData('born', e.target.value)} placeholder="2020 or 2020-05-14" />
                        </label>
                        <label className="app-field">
                          Died <input value={String((person.data as Record<string, unknown> | undefined)?.died ?? '')} onChange={(e) => setData('died', e.target.value)} placeholder="Year or date" />
                        </label>
                      </div>
                      {(['mother', 'father'] as const).map((role) => (
                        <label key={role} className="app-field">
                          {role === 'mother' ? terms.maternal : terms.paternal}
                          <select value={person.parentage?.parents.find((p) => p.role === role && isBiologicalKind(p.kind))?.individual ?? ''} onChange={(e) => setParent(role, e.target.value)}>
                            <option value="">Unknown</option>
                            {people
                              .filter((i) => i.id !== person.id)
                              .map((i) => (
                                <option key={i.id} value={i.id}>
                                  {nameOf(i)}
                                </option>
                              ))}
                          </select>
                        </label>
                      ))}
                    </>
                  ) : (
                    <p className="app-hint">From the GEDCOM (names, dates and parents are edited in your genealogy app). Add your own fields below; they are saved in the companion file.</p>
                  )}
                  <h4>Extra fields</h4>
                  {Object.entries((person.data ?? {}) as Record<string, unknown>)
                    .filter(([k, v]) => !['gedcom', 'born', 'died', 'living'].includes(k) && typeof v !== 'object')
                    .map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        <span style={{ minWidth: 90 }}>{k}</span>
                        <input value={String(v)} onChange={(e) => setExtra(person.id, k, e.target.value)} />
                        <button onClick={() => setExtra(person.id, k, null)} title="Remove">
                          ×
                        </button>
                      </div>
                    ))}
                  <form
                    style={{ display: 'flex', gap: 6 }}
                    onSubmit={(e) => {
                      e.preventDefault()
                      addField()
                    }}
                  >
                    <input value={newField} onChange={(e) => setNewField(e.target.value)} placeholder="New field (e.g. Morph, Microchip)" style={{ flex: 1 }} />
                    <button type="submit" disabled={!newField.trim()}>
                      Add
                    </button>
                  </form>
                </div>
              ) : (
                <p className="app-hint">Select someone in the pedigree to see or edit them.</p>
              )}
              {issues.length > 0 && (
                <>
                  <h4>Notices</h4>
                  <ul className="app-notices">
                    {grouped(issues.map((i) => i.message))
                      .slice(0, 20)
                      .map((m) => (
                        <li key={m}>{m}</li>
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
