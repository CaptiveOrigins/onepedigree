import type { LayoutResult } from '@extantape/onepedigree-core'

/**
 * Where a dragged node lands in its row (click-and-drag rearranging, shared idea with
 * OneTaxonomy). Rows are generations: same y in vertical charts, same x in horizontal
 * ones. Returns the new `nodeOrder` for `layoutSync` (the row's order replaces any
 * earlier choice for those nodes), or null when nothing changes. The layout applies
 * it only where order is a choice (REORDERABLE_VIEWS), e.g. among siblings.
 */
export function dropNodeOrder(
  layout: LayoutResult,
  occurrenceId: string,
  delta: { dx: number; dy: number },
  current: readonly string[] = [],
  /** Nodes only move among others of the same group (e.g. the same clutch), so grouped frames stay truthful. */
  groupOf?: (occurrenceId: string) => string | null | undefined,
): string[] | null {
  const vertical = layout.orientation === 'vertical'
  const self = layout.nodes.find((n) => n.occurrenceId === occurrenceId)
  if (!self) return null
  const rowOf = (n: { x: number; y: number }) => (vertical ? n.y : n.x)
  const along = (n: { x: number; y: number; width: number; height: number }) => (vertical ? n.x + n.width / 2 : n.y + n.height / 2)
  const group = groupOf?.(occurrenceId)
  const row = layout.nodes.filter((n) => Math.abs(rowOf(n) - rowOf(self)) < 0.5 && (!groupOf || groupOf(n.occurrenceId) === group))
  if (row.length < 2) return null
  const before = [...row].sort((a, b) => along(a) - along(b)).map((n) => n.occurrenceId)
  const moved = along(self) + (vertical ? delta.dx : delta.dy)
  const after = [...row].sort((a, b) => (a === self ? moved : along(a)) - (b === self ? moved : along(b))).map((n) => n.occurrenceId)
  if (after.every((id, i) => id === before[i])) return null
  const inRow = new Set(after)
  return [...current.filter((id) => !inRow.has(id)), ...after]
}
