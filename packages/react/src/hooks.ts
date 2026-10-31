import {
  layoutSync,
  projectPedigree,
  type LayoutOptions,
  type LayoutResult,
  type PedigreeDocument,
  type PedigreeIndex,
  type PedigreeLayoutEngine,
  type PedigreeViewProjection,
  type ProjectionOptions,
} from '@captiveorigins/onepedigree-core'
import { useCallback, useEffect, useMemo, useState } from 'react'

/** Memoized projection of a document (or index) for one view. */
export function usePedigreeProjection(source: PedigreeDocument | PedigreeIndex, options: ProjectionOptions): PedigreeViewProjection {
  const key = JSON.stringify(options)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => projectPedigree(source, options), [source, key])
}

/**
 * Geometry for a projection. The built-in engine runs synchronously (same
 * result on server and client, so hydration matches); a custom engine (e.g.
 * ELK) resolves asynchronously and returns null until ready.
 */
export function usePedigreeLayout(projection: PedigreeViewProjection, options: LayoutOptions = {}, engine?: PedigreeLayoutEngine): LayoutResult | null {
  const key = JSON.stringify(options)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sync = useMemo(() => (engine ? null : layoutSync(projection, options)), [projection, key, engine])
  const [custom, setCustom] = useState<LayoutResult | null>(null)
  useEffect(() => {
    if (!engine) return
    let live = true
    engine.layout(projection, options).then((r) => live && setCustom(r))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection, key, engine])
  return sync ?? custom
}

/** Selected individual (an identity, not an occurrence). */
export function usePedigreeSelection(initial: string | null = null) {
  const [selectedId, setSelectedId] = useState<string | null>(initial)
  const select = useCallback((id: string | null) => setSelectedId(id), [])
  const clear = useCallback(() => setSelectedId(null), [])
  return { selectedId, select, clear }
}

/** Every visible occurrence of the selected individual (repeated ancestors light up together). */
export function useOccurrenceHighlighting(projection: PedigreeViewProjection, individualId: string | null): ReadonlySet<string> {
  return useMemo(
    () => new Set(individualId ? projection.occurrences.filter((o) => o.individualId === individualId).map((o) => o.occurrenceId) : []),
    [projection, individualId],
  )
}

export type Direction = 'up' | 'down' | 'left' | 'right'

/** Spatial keyboard navigation: the nearest node in a direction from the current one. */
export function nearestNode(layout: LayoutResult, from: string, direction: Direction): string | null {
  const center = (n: LayoutResult['nodes'][number]) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 })
  const start = layout.nodes.find((n) => n.occurrenceId === from)
  if (!start) return layout.nodes[0]?.occurrenceId ?? null
  const a = center(start)
  let best: { id: string; score: number } | null = null
  for (const n of layout.nodes) {
    if (n === start) continue
    const b = center(n)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const along = direction === 'up' ? -dy : direction === 'down' ? dy : direction === 'left' ? -dx : dx
    const across = direction === 'up' || direction === 'down' ? Math.abs(dx) : Math.abs(dy)
    if (along <= 1) continue
    const score = along + across * 2
    if (!best || score < best.score) best = { id: n.occurrenceId, score }
  }
  return best?.id ?? null
}

export function usePedigreeNavigation(layout: LayoutResult | null) {
  return useCallback((from: string, direction: Direction) => (layout ? nearestNode(layout, from, direction) : null), [layout])
}
