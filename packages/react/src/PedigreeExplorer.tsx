'use client'

import { REORDERABLE_VIEWS, type Individual, type IndividualOccurrence } from '@captiveorigins/onepedigree-core'
import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent } from 'react'

import { AhnentafelList } from './AhnentafelList.js'
import { DEFAULT_TERMS, describeStructure, labelOf, sexWord } from './describe.js'
import { nearestNode, useOccurrenceHighlighting, usePedigreeSelection, type Direction } from './hooks.js'
import { PedigreeView, type PedigreeViewProps } from './PedigreeView.js'
import { GeneLegend, GenotypeKey } from './genetics.js'
import { Icon } from './icons.js'
import { dropNodeOrder } from './reorder.js'
import { ThemeEditor } from './ThemeEditor.js'
import { presetTheme, THEME_PRESETS, themeStyle, type PedigreeTheme } from './themes.js'

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
  /** Show the Colors button: pick a preset and adjust colors with hex codes. */
  themeEditor?: boolean
  /** Called with the edited theme (e.g. to save it). */
  onThemeChange?: (theme: PedigreeTheme) => void
  /** Print the chart (default: the browser's print, showing only the chart). Desktop shells can supply their own. */
  onPrint?: () => void
  /** Ahnentafel words for the two parents (default Father/Mother). */
  parentWords?: { paternal: string; maternal: string }
  /**
   * Turns on click-and-drag rearranging in views where order is a choice
   * (REORDERABLE_VIEWS: descendants, hourglass, cohort, population, relationship).
   * Called with the new order; pass it back as `layoutSync(projection, { nodeOrder })`.
   */
  onNodeOrderChange?: (nodeOrder: string[]) => void
  /** The current chosen order (what you passed to the layout), so a drag extends it. */
  nodeOrder?: readonly string[]
  /** Accessible labels for the controls. */
  labels?: Partial<Record<'zoomIn' | 'zoomOut' | 'fit' | 'download' | 'print' | 'close' | 'open' | 'controls' | 'colors', string>>
}

const LABELS = {
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit to view',
  download: 'Download SVG',
  print: 'Print',
  close: 'Close',
  open: 'Open profile',
  controls: 'Pedigree controls',
  colors: 'Colors',
}
/** Properties copied into downloaded SVGs (they have no stylesheet). */
const INLINE = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'visibility', 'display']

/** Prints only this chart: everything else on the page is hidden while printing. */
function printChart(el: HTMLElement | null) {
  if (!el) return window.print()
  el.setAttribute('data-op-printing', '')
  document.documentElement.setAttribute('data-op-printing', '')
  const done = () => {
    el.removeAttribute('data-op-printing')
    document.documentElement.removeAttribute('data-op-printing')
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
}
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
  const initialTheme = typeof props.theme === 'string' ? presetTheme(props.theme) : props.theme
  const [theme, setTheme] = useState<PedigreeTheme | undefined>(initialTheme)
  const [editing, setEditing] = useState(false)
  const changeTheme = (t: PedigreeTheme) => {
    setTheme(t)
    props.onThemeChange?.(t)
  }
  const drag = useRef<{ x: number; y: number; box: typeof box } | null>(null)
  // Dragging a node (rearranging) moves the element directly while the pointer is down: no re-render per frame.
  const nodeDrag = useRef<{ x: number; y: number; id: string; el: SVGGElement; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const reorderable = Boolean(props.onNodeOrderChange) && REORDERABLE_VIEWS.has(projection.view)

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
    const svg = root.current?.querySelector('svg.op-root')
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
  const svgScale = () => {
    const r = root.current?.querySelector('svg.op-root')?.getBoundingClientRect()
    return r?.width ? Math.max(box.width / r.width, box.height / r.height) : 1
  }
  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as Element
    if (target.closest('button, a, .op-toolbar, .op-quick-view, .op-theme-panel')) return
    const nodeEl = target.closest<SVGGElement>('.op-node')
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-occurrence')
      if (reorderable && id) nodeDrag.current = { x: e.clientX, y: e.clientY, id, el: nodeEl, moved: false }
      return
    }
    drag.current = { x: e.clientX, y: e.clientY, box }
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent) => {
    const n = nodeDrag.current
    if (n) {
      if (!n.moved && Math.hypot(e.clientX - n.x, e.clientY - n.y) < 4) return
      if (!n.moved) (e.currentTarget as Element).setPointerCapture?.(e.pointerId)
      n.moved = true
      const k = svgScale()
      n.el.style.translate = `${(e.clientX - n.x) * k}px ${(e.clientY - n.y) * k}px`
      n.el.setAttribute('data-dragging', '')
      return
    }
    const d = drag.current
    const r = root.current?.querySelector('svg.op-root')?.getBoundingClientRect()
    if (!d || !r?.width) return
    setBox({ ...d.box, x: d.box.x - ((e.clientX - d.x) / r.width) * d.box.width, y: d.box.y - ((e.clientY - d.y) / r.height) * d.box.height })
  }
  const onPointerUp = (e: PointerEvent) => {
    drag.current = null
    const n = nodeDrag.current
    nodeDrag.current = null
    if (!n?.moved) return
    n.el.style.translate = ''
    n.el.removeAttribute('data-dragging')
    suppressClick.current = true
    const k = svgScale()
    // Only among nodes in the same drawn groups (clutch/litter frames, other-parent groups) and with the same
    // parents, so frames and family lines stay truthful.
    const groupOf = (id: string) =>
      [
        ...(projection.groups ?? []).filter((g) => g.occurrenceIds.includes(id)).map((g) => g.id),
        projection.edges.filter((ed) => ed.target === id).map((ed) => ed.source).sort().join('+'),
      ].join('|')
    const order = dropNodeOrder(layout, n.id, { dx: (e.clientX - n.x) * k, dy: (e.clientY - n.y) * k }, props.nodeOrder, groupOf)
    if (order) props.onNodeOrderChange!(order)
  }
  const onPointerCancel = () => {
    drag.current = null
    if (nodeDrag.current) {
      nodeDrag.current.el.style.translate = ''
      nodeDrag.current.el.removeAttribute('data-dragging')
    }
    nodeDrag.current = null
  }

  const download = () => {
    const svg = root.current?.querySelector('svg.op-root')
    if (!svg) return
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('viewBox', `${full.x} ${full.y} ${full.width} ${full.height}`)
    clone.setAttribute('width', String(full.width))
    clone.setAttribute('height', String(full.height))
    // A downloaded file has no stylesheet: copy each element's computed colors and fonts into it.
    const source = [svg, ...svg.querySelectorAll('*')]
    const target = [clone, ...clone.querySelectorAll('*')]
    source.forEach((el, i) => {
      const cs = getComputedStyle(el)
      target[i]?.setAttribute('style', INLINE.map((prop) => `${prop}:${cs.getPropertyValue(prop)}`).join(';'))
    })
    const bg = getComputedStyle(root.current!).backgroundColor
    if (bg && bg !== 'rgba(0, 0, 0, 0)') {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      for (const [k, v] of Object.entries({ x: full.x, y: full.y, width: full.width, height: full.height, fill: bg })) rect.setAttribute(k, String(v))
      clone.insertBefore(rect, clone.firstChild)
    }
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
      data-legend={props.geneOverlay || props.genotypes ? '' : undefined}
      style={{ height: props.height ?? '32rem', ...(theme ? { ...themeStyle(theme, projection.view), background: 'var(--op-background)' } : {}) }}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={(e) => {
        // A drag ends with a click on the node: don't let it select.
        if (suppressClick.current) {
          suppressClick.current = false
          e.stopPropagation()
        }
      }}
      data-reorderable={reorderable ? '' : undefined}
    >
      <div className="op-toolbar" role="toolbar" aria-label={labels.controls}>
        <button type="button" onClick={() => zoom(0.8)} aria-label={labels.zoomIn} data-tip={labels.zoomIn}>
          <Icon name="zoomIn" />
        </button>
        <button type="button" onClick={() => zoom(1.25)} aria-label={labels.zoomOut} data-tip={labels.zoomOut}>
          <Icon name="zoomOut" />
        </button>
        <button type="button" onClick={() => setBox(full)} aria-label={labels.fit} data-tip={labels.fit}>
          <Icon name="fit" />
        </button>
        <button type="button" onClick={download} aria-label={labels.download} data-tip={labels.download}>
          <Icon name="download" />
        </button>
        <button type="button" onClick={() => (props.onPrint ? props.onPrint() : printChart(root.current))} aria-label={labels.print} data-tip={labels.print}>
          <Icon name="print" />
        </button>
        {props.themeEditor && (
          <button type="button" onClick={() => setEditing((v) => !v)} aria-label={labels.colors} data-tip={labels.colors} aria-expanded={editing}>
            <Icon name="palette" />
          </button>
        )}
        {props.toolbar}
      </div>
      {props.themeEditor && editing && (
        <div className="op-theme-panel">
          <ThemeEditor value={theme ?? structuredClone(THEME_PRESETS[0]!)} view={projection.view} onChange={changeTheme} />
        </div>
      )}
      {projection.view === 'ahnentafel' ? (
        <AhnentafelList
          projection={projection}
          terminology={props.terminology}
          parentWords={props.parentWords}
          getIndividualHref={props.getIndividualHref}
          selectedIndividualId={selectedId}
          onSelect={(individualId) => choose(projection.occurrences.find((o) => o.individualId === individualId) ?? null)}
        />
      ) : (
        <PedigreeView
          {...props}
          theme={theme}
          interactive
          viewBox={box}
          selectedIndividualId={selectedId}
          highlightedOccurrenceIds={highlighted}
          onNodeClick={(occ) => choose(selectedOccurrence === occ.occurrenceId ? null : occ)}
          onNodeKeyDown={onNodeKeyDown}
          svgProps={{ ...props.svgProps, width: '100%', height: '100%', preserveAspectRatio: 'xMidYMid meet' }}
        />
      )}
      {occurrence && (
        <div className="op-quick-view" role="dialog" aria-label={labelOf(individual, terms)}>
          {props.renderQuickView ? (
            props.renderQuickView({ individual, occurrence, href, close })
          ) : (
            <>
              <p className="op-quick-view-title">{labelOf(individual, terms)}</p>
              {individual?.sex && <p>{sexWord(individual.sex, terms)}</p>}
              <p>{describeStructure(projection.structures[occurrence.individualId])}</p>
              {occurrence.repeated && <p>{terms.repeated}</p>}
              <div className="op-quick-view-actions">
                {href && (
                  <a href={href}>
                    <Icon name="open" />
                    {labels.open}
                  </a>
                )}
                <button type="button" onClick={close}>
                  <Icon name="close" />
                  {labels.close}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {(props.geneOverlay || props.genotypes) && (
        <div className="op-gene-legends">
          {props.genotypes && <GenotypeKey display={props.genotypes} />}
          {props.geneOverlay && <GeneLegend overlay={props.geneOverlay} />}
        </div>
      )}
    </div>
  )
}
