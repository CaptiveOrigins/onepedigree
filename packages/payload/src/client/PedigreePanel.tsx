'use client'

import '@captiveorigins/onepedigree-react/styles.css'

import type { LayoutResult, PedigreeViewId, PedigreeViewProjection } from '@captiveorigins/onepedigree-core'
import { PedigreeExplorer, VIEW_LABELS, type PedigreeTheme } from '@captiveorigins/onepedigree-react'
import { useConfig, useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type Summary = { id: string; label: string | null; href: string | null } | { private: true }
type Relatives = {
  parents: { role: string | null; individual: Summary }[]
  children: Summary[]
  siblings: { full: Summary[]; partial: Summary[]; unresolved: Summary[] }
  cohort: { id: string; mates: Summary[] } | null
}

export type PedigreePanelProps = {
  views: PedigreeViewId[]
  defaultView: PedigreeViewId
  settingsGlobal: string | null
  terminology?: { individual?: string; individuals?: string }
}

const name = (s: Summary) => ('private' in s ? 'Private record' : (s.label ?? s.id))
const list = (items: Summary[]) => (items.length ? items.map(name).join(', ') : '—')

/** Admin: pedigree preview of the saved record (any view), derived relatives and structural notices. */
export function PedigreePanel(props: PedigreePanelProps) {
  const { id, collectionSlug } = useDocumentInfo()
  const { config } = useConfig()
  const [view, setView] = useState<PedigreeViewId>(props.defaultView)
  const [data, setData] = useState<{ projection: PedigreeViewProjection; layout: LayoutResult } | null>(null)
  const [relatives, setRelatives] = useState<Relatives | null>(null)
  const [theme, setTheme] = useState<PedigreeTheme | undefined>(undefined)
  const api = `${config.serverURL ?? ''}${config.routes.api}`

  useEffect(() => {
    if (!id || !collectionSlug) return
    let live = true
    fetch(`${api}/${collectionSlug}/${id}/pedigree?view=${view}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && setData(j))
    return () => {
      live = false
    }
  }, [api, collectionSlug, id, view])
  useEffect(() => {
    if (!id || !collectionSlug) return
    fetch(`${api}/${collectionSlug}/${id}/relatives`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setRelatives)
    if (props.settingsGlobal)
      fetch(`${api}/globals/${props.settingsGlobal}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((g) => g?.theme && setTheme(g.theme))
  }, [api, collectionSlug, id, props.settingsGlobal])

  if (!id) return <p className="field-description">Save this record to see its pedigree.</p>
  return (
    <div className="onepedigree-panel" style={{ marginBottom: 'var(--base, 20px)' }}>
      <label className="field-label" htmlFor="onepedigree-view">
        Pedigree
      </label>
      <select id="onepedigree-view" value={view} onChange={(e) => setView(e.target.value as PedigreeViewId)}>
        {props.views.map((v) => (
          <option key={v} value={v}>
            {VIEW_LABELS[v]}
          </option>
        ))}
      </select>
      <p className="field-description">Shows the saved record; save to update.</p>
      {data ? <PedigreeExplorer projection={data.projection} layout={data.layout} height="26rem" theme={theme} terminology={props.terminology} /> : <p>Loading…</p>}
      {data?.projection.issues.length ? (
        <ul className="onepedigree-notices">
          {data.projection.issues.map((i, n) => (
            <li key={n}>{i.message}</li>
          ))}
        </ul>
      ) : null}
      {relatives && (
        <dl className="onepedigree-relatives">
          <dt>Parents</dt>
          <dd>{relatives.parents.length ? relatives.parents.map((p) => `${name(p.individual)}${p.role ? ` (${p.role})` : ''}`).join(', ') : '—'}</dd>
          <dt>Offspring</dt>
          <dd>{list(relatives.children)}</dd>
          <dt>Full siblings</dt>
          <dd>{list(relatives.siblings.full)}</dd>
          <dt>Partial siblings</dt>
          <dd>{list(relatives.siblings.partial)}</dd>
          {relatives.siblings.unresolved.length > 0 && (
            <>
              <dt>Same recorded parents, incomplete</dt>
              <dd>{list(relatives.siblings.unresolved)}</dd>
            </>
          )}
          {relatives.cohort && (
            <>
              <dt>Cohort mates</dt>
              <dd>{list(relatives.cohort.mates)}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  )
}
