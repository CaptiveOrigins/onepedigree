import type { IndividualOccurrence, PedigreeViewId, PedigreeViewProjection } from './projection'

export type LayoutOptions = {
  orientation?: 'vertical' | 'horizontal'
  nodeWidth?: number
  nodeHeight?: number
  /** Space between neighbors in a generation. */
  gap?: number
  /** Space between generations. */
  rankGap?: number
  fan?: { sweepDegrees?: number; innerRadius?: number; ringWidth?: number }
}

export type Point = { x: number; y: number }

export type PositionedNode = {
  occurrenceId: string
  /** Top-left corner. */
  x: number
  y: number
  width: number
  height: number
  /** Fan view: the ring segment (radians, 0 = up, clockwise), centered on (0, 0) before translation into `bounds`. */
  arc?: { cx: number; cy: number; innerRadius: number; outerRadius: number; startAngle: number; endAngle: number }
}

export type PositionedEdge = { id: string; source: string; target: string; role: string | null; points: readonly Point[] }

export type LayoutResult = {
  kind: 'tree' | 'layered' | 'radial'
  orientation: 'vertical' | 'horizontal'
  nodes: readonly PositionedNode[]
  edges: readonly PositionedEdge[]
  bounds: { width: number; height: number }
}

/** Replaceable layout (e.g. an ELK adapter); the built-in engine is `defaultLayoutEngine`. */
export interface PedigreeLayoutEngine {
  layout(projection: PedigreeViewProjection, options?: LayoutOptions): Promise<LayoutResult>
}

const TREE_VIEWS = new Set<PedigreeViewId>(['pedigree', 'compact', 'ahnentafel', 'maternal', 'paternal', 'hourglass', 'descendants'])
/** Views whose `generation` is a top-down layer (founders first) rather than distance from the focal individual. */
const TOP_DOWN = new Set<PedigreeViewId>(['relationship', 'timeline', 'population'])

type Slot = { id: string; rank: number; order: number }

/** Tidy tree: leaves take consecutive slots, inner nodes center over their branch (no overlaps within a generation). */
function treeSlots(rootId: string, branches: (id: string) => string[], rankOf: (id: string) => number): Map<string, Slot> {
  const slots = new Map<string, Slot>()
  let next = 0
  const stack: { id: string; done: boolean }[] = [{ id: rootId, done: false }]
  while (stack.length) {
    const top = stack.pop()!
    const kids = branches(top.id).filter((k) => !slots.has(k))
    if (!top.done && kids.length) {
      stack.push({ id: top.id, done: true })
      for (const k of [...kids].reverse()) stack.push({ id: k, done: false })
      continue
    }
    const placed = branches(top.id)
      .map((k) => slots.get(k))
      .filter((s): s is Slot => Boolean(s))
    const order = placed.length ? (Math.min(...placed.map((s) => s.order)) + Math.max(...placed.map((s) => s.order))) / 2 : next++
    slots.set(top.id, { id: top.id, rank: rankOf(top.id), order })
  }
  return slots
}

/** Layered layout: generations as rows, order refined by barycenter sweeps to reduce crossings. */
function layeredSlots(occurrences: readonly IndividualOccurrence[], edges: PedigreeViewProjection['edges'], rankOf: (o: IndividualOccurrence) => number) {
  const rows = new Map<number, string[]>()
  for (const o of occurrences) rows.set(rankOf(o), [...(rows.get(rankOf(o)) ?? []), o.occurrenceId])
  const ranks = [...rows.keys()].sort((a, b) => a - b)
  const neighbors = new Map<string, string[]>()
  for (const e of edges) {
    neighbors.set(e.source, [...(neighbors.get(e.source) ?? []), e.target])
    neighbors.set(e.target, [...(neighbors.get(e.target) ?? []), e.source])
  }
  const pos = new Map<string, number>()
  const place = () => ranks.forEach((r) => rows.get(r)!.forEach((id, i) => pos.set(id, i)))
  place()
  for (let sweep = 0; sweep < 8; sweep++) {
    const order = sweep % 2 ? [...ranks].reverse() : ranks
    for (const r of order) {
      const row = rows.get(r)!
      const bary = new Map(
        row.map((id, i) => {
          const ns = (neighbors.get(id) ?? []).map((n) => pos.get(n)!).filter((p) => p !== undefined)
          return [id, ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : i]
        }),
      )
      row.sort((a, b) => bary.get(a)! - bary.get(b)! || a.localeCompare(b))
      row.forEach((id, i) => pos.set(id, i))
    }
  }
  const widest = Math.max(...ranks.map((r) => rows.get(r)!.length))
  const slots = new Map<string, Slot>()
  for (const r of ranks) {
    const row = rows.get(r)!
    const offset = (widest - row.length) / 2
    row.forEach((id, i) => slots.set(id, { id, rank: r, order: i + offset }))
  }
  return slots
}

function place(projection: PedigreeViewProjection, slots: Map<string, Slot>, kind: LayoutResult['kind'], o: Required<Omit<LayoutOptions, 'fan'>>): LayoutResult {
  const vertical = o.orientation === 'vertical'
  const orderStep = vertical ? o.nodeWidth + o.gap : o.nodeHeight + o.gap
  const rankStep = vertical ? o.nodeHeight + o.rankGap : o.nodeWidth + o.rankGap
  const all = [...slots.values()]
  const minOrder = Math.min(...all.map((s) => s.order))
  const minRank = Math.min(...all.map((s) => s.rank))
  const nodes: PositionedNode[] = projection.occurrences
    .filter((occ) => slots.has(occ.occurrenceId))
    .map((occ) => {
      const s = slots.get(occ.occurrenceId)!
      const a = (s.order - minOrder) * orderStep
      const b = (s.rank - minRank) * rankStep
      return { occurrenceId: occ.occurrenceId, x: vertical ? a : b, y: vertical ? b : a, width: o.nodeWidth, height: o.nodeHeight }
    })
  const at = new Map(nodes.map((n) => [n.occurrenceId, n]))
  const edges: PositionedEdge[] = projection.edges.flatMap((e) => {
    const s = at.get(e.source)
    const t = at.get(e.target)
    if (!s || !t) return []
    const [p, c] = vertical ? (s.y <= t.y ? [s, t] : [t, s]) : s.x <= t.x ? [s, t] : [t, s]
    let points: Point[]
    if (vertical) {
      const start = { x: p.x + p.width / 2, y: p.y + p.height }
      const end = { x: c.x + c.width / 2, y: c.y }
      const mid = start.y + (end.y - start.y) / 2
      points = [start, { x: start.x, y: mid }, { x: end.x, y: mid }, end]
    } else {
      const start = { x: p.x + p.width, y: p.y + p.height / 2 }
      const end = { x: c.x, y: c.y + c.height / 2 }
      const mid = start.x + (end.x - start.x) / 2
      points = [start, { x: mid, y: start.y }, { x: mid, y: end.y }, end]
    }
    return [{ id: e.id, source: e.source, target: e.target, role: e.role, points }]
  })
  const width = Math.max(0, ...nodes.map((n) => n.x + n.width))
  const height = Math.max(0, ...nodes.map((n) => n.y + n.height))
  return { kind, orientation: o.orientation, nodes, edges, bounds: { width, height } }
}

const ROLE_ORDER = (role: string | null) => (role === 'father' || role === 'sire' || role === 'sperm' ? 0 : role === 'mother' || role === 'dam' || role === 'egg' ? 1 : 2)

function radial(projection: PedigreeViewProjection, options: LayoutOptions): LayoutResult {
  const sweep = ((options.fan?.sweepDegrees ?? 270) * Math.PI) / 180
  const inner = options.fan?.innerRadius ?? 60
  const ring = options.fan?.ringWidth ?? 70
  const parentsOf = new Map<string, { id: string; role: string | null }[]>()
  for (const e of projection.edges) parentsOf.set(e.target, [...(parentsOf.get(e.target) ?? []), { id: e.source, role: e.role }])
  const focal = projection.occurrences.find((o) => o.generation === 0)
  const arcs = new Map<string, NonNullable<PositionedNode['arc']>>()
  const maxGen = Math.max(0, ...projection.occurrences.map((o) => o.generation))
  const R = inner + maxGen * ring
  if (focal) {
    arcs.set(focal.occurrenceId, { cx: R, cy: R, innerRadius: 0, outerRadius: inner, startAngle: -sweep / 2, endAngle: sweep / 2 })
    const stack = [focal.occurrenceId]
    while (stack.length) {
      const child = stack.pop()!
      const a = arcs.get(child)!
      const parents = [...(parentsOf.get(child) ?? [])].sort((x, y) => ROLE_ORDER(x.role) - ROLE_ORDER(y.role))
      const span = (a.endAngle - a.startAngle) / Math.max(1, parents.length)
      const g = projection.occurrences.find((o) => o.occurrenceId === child)!.generation + 1
      parents.forEach((p, i) => {
        arcs.set(p.id, {
          cx: R,
          cy: R,
          innerRadius: inner + (g - 1) * ring,
          outerRadius: inner + g * ring,
          startAngle: a.startAngle + i * span,
          endAngle: a.startAngle + (i + 1) * span,
        })
        stack.push(p.id)
      })
    }
  }
  const nodes: PositionedNode[] = projection.occurrences.flatMap((occ) => {
    const arc = arcs.get(occ.occurrenceId)
    if (!arc) return []
    const mid = (arc.startAngle + arc.endAngle) / 2
    const r = arc.innerRadius ? (arc.innerRadius + arc.outerRadius) / 2 : 0
    const w = Math.max(24, arc.innerRadius ? arc.outerRadius - arc.innerRadius : 2 * arc.outerRadius)
    // The box is the label anchor: the segment's middle, or the center for the focal disc.
    return [{ occurrenceId: occ.occurrenceId, x: R + (arc.innerRadius ? r * Math.sin(mid) : 0) - w / 2, y: R - (arc.innerRadius ? r * Math.cos(mid) : 0) - 12, width: w, height: 24, arc }]
  })
  return { kind: 'radial', orientation: 'vertical', nodes, edges: [], bounds: { width: 2 * R, height: 2 * R } }
}

/** Renderer-neutral geometry for a projection (no React, no host records). */
export async function layoutPedigree(projection: PedigreeViewProjection, options: LayoutOptions = {}): Promise<LayoutResult> {
  return layoutSync(projection, options)
}

/** Same as `layoutPedigree`, synchronously (the built-in engine needs no I/O). */
export function layoutSync(projection: PedigreeViewProjection, options: LayoutOptions = {}): LayoutResult {
  const o = {
    orientation: options.orientation ?? 'vertical',
    nodeWidth: options.nodeWidth ?? 160,
    nodeHeight: options.nodeHeight ?? 56,
    gap: options.gap ?? 24,
    rankGap: options.rankGap ?? 48,
  } as const
  if (!projection.occurrences.length) return { kind: 'tree', orientation: o.orientation, nodes: [], edges: [], bounds: { width: 0, height: 0 } }
  if (projection.view === 'fan') return radial(projection, options)

  const topDown = TOP_DOWN.has(projection.view)
  const rankOfGen = (g: number) => (topDown ? g : -g)
  const isTree = TREE_VIEWS.has(projection.view) && projection.occurrenceMode !== 'merge'
  if (!isTree) {
    return place(projection, layeredSlots(projection.occurrences, projection.edges, (occ) => rankOfGen(occ.generation)), 'layered', o)
  }
  const gen = new Map(projection.occurrences.map((x) => [x.occurrenceId, x.generation]))
  const up = new Map<string, string[]>()
  const down = new Map<string, string[]>()
  for (const e of projection.edges) {
    // In ancestor branches the layout "children" are parents; in descendant branches, children.
    if ((gen.get(e.source) ?? 0) > 0) up.set(e.target, [...(up.get(e.target) ?? []), e.source])
    if ((gen.get(e.target) ?? 0) < 0) down.set(e.source, [...(down.get(e.source) ?? []), e.target])
  }
  const sortByRole = (ids: string[], target: string) =>
    [...ids].sort((a, b) => {
      const ra = projection.edges.find((e) => e.source === a && e.target === target)?.role ?? null
      const rb = projection.edges.find((e) => e.source === b && e.target === target)?.role ?? null
      return ROLE_ORDER(ra) - ROLE_ORDER(rb) || a.localeCompare(b)
    })
  const focal = projection.occurrences.find((x) => x.generation === 0 && x.individualId === projection.focalId) ?? projection.occurrences[0]!
  const rank = (id: string) => rankOfGen(gen.get(id) ?? 0)
  const upper = treeSlots(focal.occurrenceId, (id) => sortByRole(up.get(id) ?? [], id), rank)
  const lower = treeSlots(focal.occurrenceId, (id) => down.get(id) ?? [], rank)
  const slots = new Map(upper)
  const shift = (upper.get(focal.occurrenceId)?.order ?? 0) - (lower.get(focal.occurrenceId)?.order ?? 0)
  for (const [id, s] of lower) if (id !== focal.occurrenceId) slots.set(id, { ...s, order: s.order + shift })
  // Siblings sit right beside the focal individual (nothing else shares its row); anything else goes to the side.
  const focalOrder = slots.get(focal.occurrenceId)!.order
  let beside = focalOrder + 1
  let side = Math.max(...[...slots.values()].map((s) => s.order)) + 1
  for (const occ of projection.occurrences)
    if (!slots.has(occ.occurrenceId)) {
      const sameRow = rank(occ.occurrenceId) === rank(focal.occurrenceId)
      slots.set(occ.occurrenceId, { id: occ.occurrenceId, rank: rank(occ.occurrenceId), order: sameRow ? beside++ : side++ })
    }
  return place(projection, slots, 'tree', o)
}

export const defaultLayoutEngine: PedigreeLayoutEngine = { layout: layoutPedigree }
