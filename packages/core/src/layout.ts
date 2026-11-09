import { lifeLabel, lifeSpan, type LifeSpan } from './life'
import type { IndividualOccurrence, PedigreeViewId, PedigreeViewProjection } from './projection'
import type { Individual } from './types'

export type LayoutOptions = {
  orientation?: 'vertical' | 'horizontal'
  /** How a name and identifier are shown together, for sizing nodes (default `IDENTIFIER_FORMAT`). */
  identifierFormat?: string
  nodeWidth?: number
  nodeHeight?: number
  /** Space between neighbors in a generation. */
  gap?: number
  /** Space between generations. */
  rankGap?: number
  fan?: { sweepDegrees?: number; innerRadius?: number; ringWidth?: number }
  /** Width of each node (e.g. measured text). Default: estimated from the name and life years, so names fit. */
  nodeWidthFor?: (occurrence: IndividualOccurrence, individual: Individual | undefined) => number
  /** Birth/death for the timeline (default `lifeSpan`). */
  lifeSpanOf?: (individual: Individual | undefined) => LifeSpan
  /** Timeline scale (default: fits about 1400 px). */
  timeline?: { pxPerYear?: number }
  /**
   * A chosen display order of occurrences (e.g. from dragging in the explorer). Applies
   * where order is a choice, not a convention: children in descendant branches and
   * rows of layered views (REORDERABLE_VIEWS). Listed occurrences swap among their own
   * positions; everything else keeps the computed order. Never changes the data.
   */
  nodeOrder?: readonly string[]
}

/** Views where the explorer lets people drag nodes to reorder them. Ancestor branches keep the parent-role convention. */
export const REORDERABLE_VIEWS: ReadonlySet<PedigreeViewId> = new Set(['descendants', 'hourglass', 'cohort', 'population', 'relationship'])

/** Puts the listed ids into the chosen order within the slots they already occupy. */
function applyOrder(ids: string[], rankOf: ReadonlyMap<string, number> | undefined): string[] {
  if (!rankOf) return ids
  const listed = ids.filter((id) => rankOf.has(id))
  if (listed.length < 2) return ids
  const chosen = [...listed].sort((a, b) => rankOf.get(a)! - rankOf.get(b)!)
  let i = 0
  return ids.map((id) => (rankOf.has(id) ? chosen[i++]! : id))
}

/** Rough text width (13 px labels, 11 px sublabels) for sizing nodes without a DOM. */
/** The default way a name and a host identifier are shown together. */
export const IDENTIFIER_FORMAT = '{label} ({id})'

/**
 * A name with the host's identifier, e.g. "Mead (CO-AQCR6T)". With no name, the identifier alone; with no
 * identifier, the name alone. `format` uses `{label}` and `{id}`.
 */
export function nameWithIdentifier(label: string | null | undefined, identifier: string | null | undefined, format = IDENTIFIER_FORMAT): string {
  if (!identifier) return label ?? ''
  if (!label) return identifier
  return format.replaceAll('{label}', label).replaceAll('{id}', identifier)
}

export function estimateNodeWidth(label: string, sublabel = ''): number {
  const w = (s: string, px: number) =>
    [...s].reduce((n, ch) => n + (/[\u1100-\u9fff\uac00-\ud7af]/.test(ch) ? 2 : /[A-Z@MW]/.test(ch) ? 1.25 : /[ilj.,'’ ]/.test(ch) ? 0.55 : 1) * px, 0)
  return Math.round(Math.min(420, Math.max(120, Math.max(w(label, 7.4), w(sublabel, 6.2)) + 28)))
}

const SEX_MARK: Record<string, string> = { female: '♀', f: '♀', male: '♂', m: '♂' }
/** The default node sublabel: sex mark and life years ("♂ 1950 – 2010"). */
export function nodeSublabel(individual: Individual | undefined, span = lifeSpan(individual)): string {
  return [SEX_MARK[(individual?.sex ?? '').toLowerCase()] ?? '', lifeLabel(span)].filter(Boolean).join(' ')
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
  /** Timeline: the box is the lifespan bar; `open` when the end isn't recorded; `undated` when nothing is. */
  life?: { open: boolean; undated: boolean }
}

export type PositionedEdge = { id: string; source: string; target: string; role: string | null; points: readonly Point[] }

export type LayoutResult = {
  kind: 'tree' | 'layered' | 'radial' | 'timeline'
  orientation: 'vertical' | 'horizontal'
  nodes: readonly PositionedNode[]
  edges: readonly PositionedEdge[]
  bounds: { width: number; height: number }
  /** Timeline: the year scale (x = (year - from) * pxPerYear) and where undated individuals start. */
  axis?: { from: number; to: number; pxPerYear: number; undatedY: number | null }
}

/** Replaceable layout (e.g. an ELK adapter); the built-in engine is `defaultLayoutEngine`. */
export interface PedigreeLayoutEngine {
  layout(projection: PedigreeViewProjection, options?: LayoutOptions): Promise<LayoutResult>
}

const TREE_VIEWS = new Set<PedigreeViewId>(['pedigree', 'compact', 'ahnentafel', 'maternal', 'paternal', 'hourglass', 'descendants'])
/** Views whose `generation` is a top-down layer (founders first) rather than distance from the focal individual. */
const TOP_DOWN = new Set<PedigreeViewId>(['relationship', 'population'])

type Slot = { id: string; rank: number; order: number }

/** Tidy tree: leaves take consecutive slots, inner nodes center over their branch (no overlaps within a generation). */
function treeSlots(rootId: string, branches: (id: string) => string[], rankOf: (id: string) => number): Map<string, Slot> {
  const slots = new Map<string, Slot>()
  let next = 0
  let lastParent: string | null | undefined
  const stack: { id: string; done: boolean; parent: string | null }[] = [{ id: rootId, done: false, parent: null }]
  while (stack.length) {
    const top = stack.pop()!
    const kids = branches(top.id).filter((k) => !slots.has(k))
    if (!top.done && kids.length) {
      stack.push({ ...top, done: true })
      for (const k of [...kids].reverse()) stack.push({ id: k, done: false, parent: top.id })
      continue
    }
    const placed = branches(top.id)
      .map((k) => slots.get(k))
      .filter((s): s is Slot => Boolean(s))
    // A little more room between families than between siblings (reads more naturally).
    if (!placed.length && lastParent !== undefined && top.parent !== lastParent) next += 0.35
    const order = placed.length ? (Math.min(...placed.map((s) => s.order)) + Math.max(...placed.map((s) => s.order))) / 2 : next++
    if (!placed.length) lastParent = top.parent
    slots.set(top.id, { id: top.id, rank: rankOf(top.id), order })
  }
  return slots
}

/** Layered layout: generations as rows, order refined by barycenter sweeps to reduce crossings. */
function layeredSlots(occurrences: readonly IndividualOccurrence[], edges: PedigreeViewProjection['edges'], rankOf: (o: IndividualOccurrence) => number, chosen?: ReadonlyMap<string, number>) {
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
  if (chosen) for (const r of ranks) rows.set(r, applyOrder(rows.get(r)!, chosen))
  const widest = Math.max(...ranks.map((r) => rows.get(r)!.length))
  const slots = new Map<string, Slot>()
  for (const r of ranks) {
    const row = rows.get(r)!
    const offset = (widest - row.length) / 2
    row.forEach((id, i) => slots.set(id, { id, rank: r, order: i + offset }))
  }
  return slots
}

type Resolved = Required<Omit<LayoutOptions, 'fan' | 'nodeWidthFor' | 'lifeSpanOf' | 'timeline' | 'nodeOrder' | 'identifierFormat'>> & { widths: Map<string, number> }

/** Spreads one row's centers so nodes of different widths never overlap (average of a left and a right sweep: stays centered). */
function spread(row: { id: string; c: number; w: number }[], gap: number) {
  const left = row.map((r) => r.c)
  for (let i = 1; i < row.length; i++) left[i] = Math.max(left[i]!, left[i - 1]! + (row[i - 1]!.w + row[i]!.w) / 2 + gap)
  const right = row.map((r) => r.c)
  for (let i = row.length - 2; i >= 0; i--) right[i] = Math.min(right[i]!, right[i + 1]! - (row[i]!.w + row[i + 1]!.w) / 2 - gap)
  row.forEach((r, i) => (r.c = (left[i]! + right[i]!) / 2))
}

function place(projection: PedigreeViewProjection, slots: Map<string, Slot>, kind: LayoutResult['kind'], o: Resolved): LayoutResult {
  const vertical = o.orientation === 'vertical'
  const widthOf = (id: string) => o.widths.get(id) ?? o.nodeWidth
  const all = [...slots.values()]
  const minOrder = Math.min(...all.map((s) => s.order))
  const ranks = [...new Set(all.map((s) => s.rank))].sort((a, b) => a - b)
  const sorted = [...o.widths.values()].sort((a, b) => a - b)
  const typical = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : o.nodeWidth
  const maxWidth = sorted.length ? sorted.at(-1)! : o.nodeWidth
  const shown = projection.occurrences.filter((occ) => slots.has(occ.occurrenceId))
  const pos = new Map<string, { x: number; y: number; w: number }>()
  if (vertical) {
    // Rows: centers from the slot order, then spread so differently sized nodes keep their gap.
    for (const r of ranks) {
      const row = shown
        .filter((occ) => slots.get(occ.occurrenceId)!.rank === r)
        .map((occ) => ({ id: occ.occurrenceId, c: (slots.get(occ.occurrenceId)!.order - minOrder) * (typical + o.gap), w: widthOf(occ.occurrenceId) }))
        .sort((a, b) => a.c - b.c)
      spread(row, o.gap)
      for (const n of row) pos.set(n.id, { x: n.c - n.w / 2, y: ranks.indexOf(r) * (o.nodeHeight + o.rankGap), w: n.w })
    }
  } else {
    for (const occ of shown) {
      const s = slots.get(occ.occurrenceId)!
      pos.set(occ.occurrenceId, { x: ranks.indexOf(s.rank) * (maxWidth + o.rankGap), y: (s.order - minOrder) * (o.nodeHeight + o.gap), w: widthOf(occ.occurrenceId) })
    }
  }
  const minX = Math.min(...[...pos.values()].map((p) => p.x))
  const nodes: PositionedNode[] = shown.map((occ) => {
    const p = pos.get(occ.occurrenceId)!
    return { occurrenceId: occ.occurrenceId, x: p.x - minX, y: p.y, width: p.w, height: o.nodeHeight }
  })
  const at = new Map(nodes.map((n) => [n.occurrenceId, n]))
  // One connector line per parent group: children with the same shown parents (full siblings)
  // share a line; half-siblings get their own line at a different height in the same gap.
  const lower = (e: { source: string; target: string }): [PositionedNode, PositionedNode] => {
    const s = at.get(e.source)!
    const t = at.get(e.target)!
    return vertical ? (s.y <= t.y ? [s, t] : [t, s]) : s.x <= t.x ? [s, t] : [t, s]
  }
  const drawable = projection.edges.filter((e) => at.has(e.source) && at.has(e.target))
  const upperOf = new Map<string, string[]>()
  for (const e of drawable) {
    const [p, c] = lower(e)
    upperOf.set(c.occurrenceId, [...(upperOf.get(c.occurrenceId) ?? []), p.occurrenceId])
  }
  const gapKey = (p: PositionedNode) => (vertical ? p.y + p.height : p.x + p.width)
  const familyOf = (child: string, p: PositionedNode) => `${gapKey(p)}|${[...(upperOf.get(child) ?? [])].sort().join('+')}`
  const lanes = new Map<string, Map<string, number>>()
  for (const e of drawable) {
    const [p, c] = lower(e)
    const gap = String(gapKey(p))
    const fams = lanes.get(gap) ?? new Map<string, number>()
    const fam = familyOf(c.occurrenceId, p)
    if (!fams.has(fam)) fams.set(fam, vertical ? c.x : c.y)
    lanes.set(gap, fams)
  }
  const laneIndex = new Map<string, { index: number; count: number }>()
  for (const fams of lanes.values()) {
    const ordered = [...fams].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    ordered.forEach(([fam], i) => laneIndex.set(fam, { index: i, count: ordered.length }))
  }
  const edges: PositionedEdge[] = drawable.map((e) => {
    const [p, c] = lower(e)
    const lane = laneIndex.get(familyOf(c.occurrenceId, p)) ?? { index: 0, count: 1 }
    const share = (lane.index + 1) / (lane.count + 1)
    let points: Point[]
    if (vertical) {
      const start = { x: p.x + p.width / 2, y: p.y + p.height }
      const end = { x: c.x + c.width / 2, y: c.y }
      const mid = start.y + (end.y - start.y) * share
      points = [start, { x: start.x, y: mid }, { x: end.x, y: mid }, end]
    } else {
      const start = { x: p.x + p.width, y: p.y + p.height / 2 }
      const end = { x: c.x, y: c.y + c.height / 2 }
      const mid = start.x + (end.x - start.x) * share
      points = [start, { x: mid, y: start.y }, { x: mid, y: end.y }, end]
    }
    return { id: e.id, source: e.source, target: e.target, role: e.role, points }
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

/**
 * Timeline: one bar per individual from birth to death (open-ended when the
 * end isn't recorded), on a shared year axis; bars share rows when they don't
 * overlap. A thin line drops from each parent to the child at its birth.
 * Individuals without any dates are listed below the axis.
 */
function timeline(projection: PedigreeViewProjection, o: Resolved, lifeOf: (i: Individual | undefined) => LifeSpan, pxPerYear?: number): LayoutResult {
  const now = new Date().getFullYear() + new Date().getMonth() / 12
  const spans = new Map(projection.occurrences.map((occ) => [occ.occurrenceId, lifeOf(projection.individuals[occ.individualId])]))
  const dated = projection.occurrences.filter((occ) => {
    const s = spans.get(occ.occurrenceId)!
    return s.born !== null || s.died !== null
  })
  const lengths = [...spans.values()]
    .filter((s) => s.born !== null && s.died !== null)
    .map((s) => s.died! - s.born!)
    .sort((a, b) => a - b)
  const knownYears = [...spans.values()].flatMap((s) => [s.born, s.died]).filter((y): y is number => y !== null)
  const range = knownYears.length ? Math.max(...knownYears) - Math.min(...knownYears) : 0
  const typical = lengths.length ? lengths[Math.floor(lengths.length / 2)]! : Math.max(1, range * 0.25)
  const ends = new Map(
    dated.map((occ) => {
      const s = spans.get(occ.occurrenceId)!
      const start = s.born ?? s.died! - typical
      const end = s.died ?? (s.living ? now : Math.min(now, start + typical))
      return [occ.occurrenceId, { start, end: Math.max(end, start + 0.1), open: s.died === null }]
    }),
  )
  const from = Math.floor(Math.min(...[...ends.values()].map((e) => e.start), now) - 1)
  const to = Math.ceil(Math.max(...[...ends.values()].map((e) => e.end), from + 1) + 1)
  const ppy = pxPerYear ?? Math.min(200, Math.max(3, 1400 / Math.max(1, to - from)))
  const bar = 26
  const top = 36
  const lanes: number[] = []
  const nodes: PositionedNode[] = []
  const labelWidth = (id: string) => o.widths.get(id) ?? o.nodeWidth
  for (const occ of [...dated].sort((a, b) => ends.get(a.occurrenceId)!.start - ends.get(b.occurrenceId)!.start)) {
    const e = ends.get(occ.occurrenceId)!
    const x = (e.start - from) * ppy
    const width = Math.max(8, (e.end - e.start) * ppy)
    // A row is free again once the previous bar, and its label when it sits after the bar, have ended.
    const extent = x + (width >= labelWidth(occ.occurrenceId) ? width : width + labelWidth(occ.occurrenceId)) + 12
    let lane = lanes.findIndex((free) => free <= x)
    if (lane < 0) lane = lanes.push(0) - 1
    lanes[lane] = extent
    nodes.push({ occurrenceId: occ.occurrenceId, x, y: top + lane * (bar + 10), width, height: bar, life: { open: e.open, undated: false } })
  }
  const undatedY = projection.occurrences.length > dated.length ? top + lanes.length * (bar + 10) + 40 : null
  const rowWidth = Math.max(800, (to - from) * ppy)
  let cx = 0
  let cy = undatedY ?? 0
  for (const occ of projection.occurrences.filter((x) => !ends.has(x.occurrenceId))) {
    const w = labelWidth(occ.occurrenceId)
    if (cx && cx + w > rowWidth) {
      cx = 0
      cy += bar + 10
    }
    nodes.push({ occurrenceId: occ.occurrenceId, x: cx, y: cy, width: w, height: bar, life: { open: false, undated: true } })
    cx += w + 10
  }
  const at = new Map(nodes.map((n) => [n.occurrenceId, n]))
  const edges: PositionedEdge[] = projection.edges.flatMap((e) => {
    const parent = at.get(e.source)
    const child = at.get(e.target)
    if (!parent || !child || parent.life?.undated || child.life?.undated) return []
    const x = child.x
    const py = parent.y + parent.height / 2
    const points: Point[] = parent.x <= x && x <= parent.x + parent.width ? [{ x, y: py }] : [{ x: parent.x + parent.width, y: py }, { x, y: py }]
    return [{ id: e.id, source: e.source, target: e.target, role: e.role, points: [...points, { x, y: child.y + child.height / 2 }] }]
  })
  const width = Math.max(rowWidth, ...nodes.map((n) => n.x + (n.life?.undated || n.width >= labelWidth(n.occurrenceId) ? n.width : n.width + labelWidth(n.occurrenceId))))
  const height = Math.max(top, ...nodes.map((n) => n.y + n.height))
  return { kind: 'timeline', orientation: 'horizontal', nodes, edges, bounds: { width, height }, axis: { from, to, pxPerYear: ppy, undatedY } }
}

/** Renderer-neutral geometry for a projection (no React, no host records). */
export async function layoutPedigree(projection: PedigreeViewProjection, options: LayoutOptions = {}): Promise<LayoutResult> {
  return layoutSync(projection, options)
}

/** Same as `layoutPedigree`, synchronously (the built-in engine needs no I/O). */
export function layoutSync(projection: PedigreeViewProjection, options: LayoutOptions = {}): LayoutResult {
  const lifeOf = options.lifeSpanOf ?? lifeSpan
  const widthFor =
    options.nodeWidthFor ??
    // An anonymous placeholder is drawn as "Private record" (the React default), never its ID: size it for that.
    ((occ: IndividualOccurrence, ind: Individual | undefined) =>
      estimateNodeWidth(
        ind?.data?.private ? 'Private record' : ind?.label || ind?.identifier ? nameWithIdentifier(ind?.label, ind?.identifier, options.identifierFormat) : occ.individualId,
        nodeSublabel(ind, lifeOf(ind)),
      ))
  const o: Resolved = {
    orientation: options.orientation ?? 'vertical',
    nodeWidth: options.nodeWidth ?? 160,
    nodeHeight: options.nodeHeight ?? 56,
    gap: options.gap ?? 24,
    rankGap: options.rankGap ?? 56,
    widths: new Map(projection.occurrences.map((occ) => [occ.occurrenceId, options.nodeWidth ?? widthFor(occ, projection.individuals[occ.individualId])])),
  }
  if (!projection.occurrences.length) return { kind: 'tree', orientation: o.orientation, nodes: [], edges: [], bounds: { width: 0, height: 0 } }
  if (projection.view === 'fan') return radial(projection, options)
  if (projection.view === 'timeline') return timeline(projection, o, lifeOf, options.timeline?.pxPerYear)

  const chosen = options.nodeOrder?.length && REORDERABLE_VIEWS.has(projection.view) ? new Map(options.nodeOrder.map((id, i) => [id, i])) : undefined
  const topDown = TOP_DOWN.has(projection.view)
  const rankOfGen = (g: number) => (topDown ? g : -g)
  const isTree = TREE_VIEWS.has(projection.view) && projection.occurrenceMode !== 'merge'
  if (!isTree) {
    return place(projection, layeredSlots(projection.occurrences, projection.edges, (occ) => rankOfGen(occ.generation), chosen), 'layered', o)
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
  const lower = treeSlots(focal.occurrenceId, (id) => applyOrder(down.get(id) ?? [], chosen), rank)
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
