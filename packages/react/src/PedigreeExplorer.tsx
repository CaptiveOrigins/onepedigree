'use client'

import type { Individual, IndividualOccurrence } from '@captiveorigins/onepedigree-core'
import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent } from 'react'

import { DEFAULT_TERMS, describeStructure, labelOf } from './describe.js'
import { nearestNode, useOccurrenceHighlighting, usePedigreeSelection, type Direction } from './hooks.js'
import { PedigreeView, type PedigreeViewProps } from './PedigreeView.js'

export type QuickViewProps = {
  individual: Individual | undefined
  occurrence: IndividualOccurrence
  href: string | null
  close: () => void
}

export type PedigreeExplorerProps = Omit<PedigreeViewProps, 'interactive' | 'viewBox' | 'selectedIndividualId' | 'highlightedOccurrenceIds' | 'onNodeClick' | 'onNodeKeyDown'> & {
  /** Height of the viewport (CSS length). Default 32rem. */
  height?: string
  /** Replace the default quick-view card. */
  renderQuickView?: (props: QuickViewProps) => ReactNode
  onSelectIndividual?: (individualId: string | null) => void
  /** Extra toolbar content (e.g. a view switcher). */
  toolbar?: ReactNode
  /** Accessible labels for the controls. */
  labels?: Partial<Record<'zoomIn' | 'zoomOut' | 'fit' | 'download' | 'print' | 'close' | 'open' | 'controls', string>>
}

const LABELS = { zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit to view', download: 'Download SVG', print: 'Print', close: 'Close', open: 'Open profile', controls: 'Pedigree controls' }
const KEY_DIRECTION: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

/**
 * Interactive pedigree: pan (drag, Shift+arrows), zoom (wheel, +/-, buttons),
 * fit, selection with highlighting of every occurrence of the selected
 * individual, arrow-key navigation between nodes, a quick-view card, SVG
 * download and print. Starts from the same markup as the server render.
 */
export function PedigreeExplorer(props: PedigreeExplorerProps) {
  const { projection, layout } = props
  const labels = { ...LABELS, ...props.labels }
  const terms = { ...DEFAULT_TERMS, ...props.terminology }
  const pad = props.padding ?? 24
  const full = useMemo(() => ({ x: -pad, y: -pad, width: layout.bounds.width + 2 * pad, height: layout.bounds.height + 2 * pad }), [layout, pad])
  const [box, setBox] = useState(full)
  const [fitted, setFitted] = useState(full)
  if (fitted !== full) {
    setFitted(full)
    setBox(full)
  }
  const { selectedId, select } = usePedigreeSelection()
  const [selectedOccurrence, setSelectedOccurrence] = useState<string | null>(null)
  const highlighted = useOccurrenceHighlighting(projection, selectedId)
  const root = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; box: typeof box } | null>(null)

  const choose = useCallback(
    (occ: IndividualOccurrence | null) => {
      select(occ?.individualId ?? null)
      setSelectedOccurrence(occ?.occurrenceId ?? null)
      props.onSelectIndividual?.(occ?.individualId ?? null)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [select, props.onSelectIndividual],
  )

  const zoom = useCallback((factor: number, at?: { x: number; y: number }) => {
    setBox((b) => {
      const width = Math.min(Math.max(b.width * factor, 80), full.width * 8)
      const height = (b.height * width) / b.width
      const fx = at ? (at.x - b.x) / b.width : 0.5
      const fy = at ? (at.y - b.y) / b.height : 0.5
      return { x: b.x + (b.width - width) * fx, y: b.y + (b.height - height) * fy, width, height }
    })
  }, [full])
  const pan = (dx: number, dy: number) => setBox((b) => ({ ...b, x: b.x + dx * b.width, y: b.y + dy * b.height }))

  const svgPoint = (e: { clientX: number; clientY: number }) => {
    const svg = root.current?.querySelector('svg')
    const r = svg?.getBoundingClientRect()
    if (!r || !r.width || !r.height) return undefined
    return { x: box.x + ((e.clientX - r.left) / r.width) * box.width, y: box.y + ((e.clientY - r.top) / r.height) * box.height }
  }

  const focusOccurrence = (occurrenceId: string) => {
    const el = root.current?.querySelector<SVGGElement>(`[data-occurrence="${CSS.escape(occurrenceId)}"]`)
    el?.focus()
  }

  const onNodeKeyDown = (occ: IndividualOccurrence, e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(selectedId === occ.individualId && selectedOccurrence === occ.occurrenceId ? null : occ)
      return
    }
    const direction = KEY_DIRECTION[e.key]
    if (direction && !e.shiftKey) {
      e.preventDefault()
      const next = nearestNode(layout, occ.occurrenceId, direction)
      if (next) focusOccurrence(next)
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') choose(null)
    else if (e.key === '+' || e.key === '=') zoom(0.8)
    else if (e.key === '-') zoom(1.25)
    else if (e.key === '0') setBox(full)
    else if (e.shiftKey && KEY_DIRECTION[e.key]) {
      e.preventDefault()
      const d = KEY_DIRECTION[e.key]!
      pan(d === 'left' ? -0.1 : d === 'right' ? 0.1 : 0, d === 'up' ? -0.1 : d === 'down' ? 0.1 : 0)
    }
  }

  const onWheel = (e: WheelEvent) => {
    // Zoom only with Ctrl/⌘ (and trackpad pinch, which sets ctrlKey); plain scrolling scrolls the page.
    if (!e.ctrlKey && !e.metaKey) return
    zoom(e.deltaY > 0 ? 1.1 : 0.9, svgPoint(e))
  }
  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as Element).closest('.op-node, button, a')) return
    drag.current = { x: e.clientX, y: e.clientY, box }
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current
    const r = root.current?.querySelector('svg')?.getBoundingClientRect()
    if (!d || !r?.width) return
    setBox({ ...d.box, x: d.box.x - ((e.clientX - d.x) / r.width) * d.box.width, y: d.box.y - ((e.clientY - d.y) / r.height) * d.box.height })
  }
  const onPointerUp = () => {
    drag.current = null
  }

  const download = () => {
    const svg = root.current?.querySelector('svg')
    if (!svg) return
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('viewBox', `${full.x} ${full.y} ${full.width} ${full.height}`)
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${projection.view}-${projection.focalId}.svg`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const occurrence = projection.occurrences.find((o) => o.occurrenceId === selectedOccurrence)
  const individual = occurrence ? projection.individuals[occurrence.individualId] : undefined
  const href = individual ? (props.getIndividualHref?.(individual) ?? null) : null
  const close = () => choose(null)

  return (
    <div
      ref={root}
      className="op-explorer"
      style={{ height: props.height ?? '32rem' }}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="op-toolbar" role="toolbar" aria-label={labels.controls}>
        <button type="button" onClick={() => zoom(0.8)} aria-label={labels.zoomIn} title={labels.zoomIn}>
          +
        </button>
        <button type="button" onClick={() => zoom(1.25)} aria-label={labels.zoomOut} title={labels.zoomOut}>
          −
        </button>
        <button type="button" onClick={() => setBox(full)} aria-label={labels.fit} title={labels.fit}>
          ⤢
        </button>
        <button type="button" onClick={download} aria-label={labels.download} title={labels.download}>
          ⤓
        </button>
        <button type="button" onClick={() => window.print()} aria-label={labels.print} title={labels.print}>
          ⎙
        </button>
        {props.toolbar}
      </div>
      <PedigreeView
        {...props}
        interactive
        viewBox={box}
        selectedIndividualId={selectedId}
        highlightedOccurrenceIds={highlighted}
        onNodeClick={(occ) => choose(selectedOccurrence === occ.occurrenceId ? null : occ)}
        onNodeKeyDown={onNodeKeyDown}
        svgProps={{ ...props.svgProps, width: '100%', height: '100%', preserveAspectRatio: 'xMidYMid meet' }}
      />
      {occurrence && (
        <div className="op-quick-view" role="dialog" aria-label={labelOf(individual, terms)}>
          {props.renderQuickView ? (
            props.renderQuickView({ individual, occurrence, href, close })
          ) : (
            <>
              <p className="op-quick-view-title">{labelOf(individual, terms)}</p>
              {individual?.sex && <p>{individual.sex}</p>}
              <p>{describeStructure(projection.structures[occurrence.individualId])}</p>
              {occurrence.repeated && <p>{terms.repeated}</p>}
              <div className="op-quick-view-actions">
                {href && <a href={href}>{labels.open}</a>}
                <button type="button" onClick={close}>
                  {labels.close}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
