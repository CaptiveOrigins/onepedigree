import { estimateNodeWidth, lifeLabel, lifeSpan, nodeSublabel } from '@captiveorigins/onepedigree-core'
import type {
  Individual,
  IndividualOccurrence,
  LayoutResult,
  PedigreeViewProjection,
  PositionedNode,
  ProjectionGroup,
  ReproductiveStructure,
} from '@captiveorigins/onepedigree-core'
import type { KeyboardEvent, MouseEvent, ReactNode, SVGProps } from 'react'

import { arcPath, DEFAULT_TERMS, describeProjection, describeStructure, labelOf, sexWord, VIEW_LABELS, type Terminology } from './describe.js'
import { themeStyle, type PedigreeTheme } from './themes.js'
import { GenotypeGlyph, GenotypeStrip, genotypeText, genotypeWord, type GenotypeDisplay, type GenotypeMark, type GeneOverlay } from './genetics.js'

export type IndividualSlotProps = {
  individual: Individual | undefined
  occurrence: IndividualOccurrence
  node: PositionedNode
  structure: ReproductiveStructure | undefined
  selected: boolean
  highlighted: boolean
  terms: Terminology
  /** The shown gene's mark for this individual, when a gene overlay is on (null = unknown). */
  gene?: GenotypeMark | null
  /** Allele dots for several genes, when `genotypes` is on. */
  genotypes?: GenotypeDisplay
}

export type CohortMarkerSlotProps = { group: ProjectionGroup; box: { x: number; y: number; width: number; height: number } }

export type PedigreeClassNames = Partial<Record<'root' | 'node' | 'nodeBox' | 'label' | 'connector' | 'cohort' | 'fanSegment', string>>

export type PedigreeViewProps = {
  projection: PedigreeViewProjection
  layout: LayoutResult
  /** Accessible title (default: the view name and focal individual). */
  title?: string
  className?: string
  classNames?: PedigreeClassNames
  terminology?: Partial<Terminology>
  /** Profile URL for an individual (server-resolved). Nodes become ordinary links. */
  getIndividualHref?: (individual: Individual) => string | null | undefined
  /** Replace the default node content (SVG, drawn in the node's box at 0,0). */
  renderIndividual?: (props: IndividualSlotProps) => ReactNode
  renderCohortMarker?: (props: CohortMarkerSlotProps) => ReactNode
  selectedIndividualId?: string | null
  highlightedOccurrenceIds?: ReadonlySet<string>
  /** Interactive explorer: nodes are focusable buttons. */
  interactive?: boolean
  onNodeClick?: (occurrence: IndividualOccurrence, event: MouseEvent) => void
  onNodeKeyDown?: (occurrence: IndividualOccurrence, event: KeyboardEvent) => void
  /** Visible region (pan/zoom); default: the whole layout. */
  viewBox?: { x: number; y: number; width: number; height: number }
  padding?: number
  /** Unique prefix for element IDs when several views share a page. */
  idPrefix?: string
  svgProps?: Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'children'>
  /** Show several genes on every node as allele dots (two per gene, one per copy). */
  genotypes?: GenotypeDisplay
  /** Show one heritable gene on every node (genetic pedigree symbols; see GeneLegend). */
  geneOverlay?: GeneOverlay
  /** A preset id ('classic', 'midnight', 'forest', 'ocean', 'terracotta', 'high-contrast', 'print') or a custom theme. */
  theme?: PedigreeTheme | string
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Junction glyph: circle = two-parent mode, diamond = single-parent mode, square = variable/other; hollow = incomplete. */
function Junction({ s, x, y }: { s: ReproductiveStructure; x: number; y: number }) {
  const shape = s.typicalStructure === 'pair' ? 'pair' : s.typicalStructure === 'single' ? 'single' : 'variable'
  const common = {
    className: 'op-junction',
    'data-structure': shape,
    'data-completeness': s.completeness,
    'data-atypical': s.atypical || undefined,
  }
  const r = 5
  const glyph =
    shape === 'pair' ? (
      <circle cx={x} cy={y} r={r} {...common} />
    ) : shape === 'single' ? (
      <path d={`M ${x} ${y - r - 1} L ${x + r + 1} ${y} L ${x} ${y + r + 1} L ${x - r - 1} ${y} Z`} {...common} />
    ) : (
      <rect x={x - r} y={y - r} width={2 * r} height={2 * r} {...common} />
    )
  return (
    <g aria-hidden="true">
      {glyph}
      <title>{describeStructure(s)}</title>
    </g>
  )
}

function DefaultIndividual({ individual, occurrence, node, structure, terms, gene, genotypes }: IndividualSlotProps) {
  const label = labelOf(individual, terms)
  // Sex mark and life years ("♂ 1950 – 2010"), plus the Ahnentafel number where it applies.
  const sub = [nodeSublabel(individual), occurrence.ahnentafel !== undefined ? `#${occurrence.ahnentafel}` : null].filter(Boolean).join(' · ')
  // Nodes are sized to their names; names are only shortened when a host made the node narrower (or past the widest node).
  const fits = node.width >= estimateNodeWidth(label, sub) - 1
  const chars = fits ? Infinity : Math.max(6, Math.floor((node.width - 20) / 7.4))
  if (node.life)
    return (
      <>
        <rect className="op-node-box op-life-bar" width={node.width} height={node.height} rx={6} ry={6} data-open={node.life.open || undefined} />
        <text className="op-label" x={node.life.undated || node.width >= label.length * 7.4 + 16 ? 8 : node.width + 6} y={node.height / 2 + 4}>
          {label}
        </text>
      </>
    )
  return (
    <>
      <rect className="op-node-box" width={node.width} height={node.height} rx={8} ry={8} />
      <text className="op-label" x={10} y={genotypes ? (sub ? node.height / 2 - 9 : node.height / 2 - 3) : sub ? node.height / 2 - 3 : node.height / 2 + 4}>
        {short(label, chars)}
      </text>
      {sub && (
        <text className="op-sublabel" x={10} y={genotypes ? node.height / 2 + 6 : node.height / 2 + 13}>
          {short(sub, chars)}
        </text>
      )}
      {occurrence.repeated && (
        <text className="op-repeat-marker" x={node.width - 8} y={14} textAnchor="end">
          ↻
        </text>
      )}
      {structure && <Junction s={structure} x={node.width / 2} y={0} />}
      {genotypes && (
        <g transform={`translate(10 ${node.height - 8})`}>
          <GenotypeStrip display={genotypes} individualId={occurrence.individualId} r={4} />
        </g>
      )}
      {gene !== undefined && (
        <g transform={`translate(${node.width - 12} ${node.height - 12})`}>
          <GenotypeGlyph mark={gene ?? undefined} />
        </g>
      )}
    </>
  )
}

const RAD = 180 / Math.PI

/**
 * Fan labels follow the fan: along the arc in the wide inner rings (with life
 * years when there is room), along the radius in the narrow outer ones; always
 * upright, never upside down.
 */
function FanLabel({ arc, label, years, id }: { arc: NonNullable<PositionedNode['arc']>; label: string; years: string; id: string }) {
  const { cx: x0, cy: y0, innerRadius: r0, outerRadius: r1, startAngle: a0, endAngle: a1 } = arc
  if (r0 <= 0)
    return (
      <text className="op-label op-fan-label" x={x0} y={y0 + (years ? -2 : 4)} textAnchor="middle">
        {short(label, Math.floor((2 * r1) / 7))}
        {years && (
          <tspan className="op-sublabel" x={x0} dy={15}>
            {years}
          </tspan>
        )}
      </text>
    )
  const mid = (a0 + a1) / 2
  const r = (r0 + r1) / 2
  const ring = r1 - r0
  const arcLength = r * (a1 - a0)
  const pt = (radius: number, t: number) => `${(x0 + radius * Math.sin(t)).toFixed(2)} ${(y0 - radius * Math.cos(t)).toFixed(2)}`
  if (arcLength >= ring * 1.2) {
    // Along the arc; on the lower half the path runs the other way so the text stays upright.
    const lower = Math.cos(mid) < 0
    const path = (radius: number) =>
      lower ? `M ${pt(radius, a1)} A ${radius} ${radius} 0 0 0 ${pt(radius, a0)}` : `M ${pt(radius, a0)} A ${radius} ${radius} 0 0 1 ${pt(radius, a1)}`
    const yearsR = r + (Math.cos(mid) < 0 ? 9 : -9)
    // Years only where they fit in the segment (never spilling into the next one).
    const showYears = Boolean(years) && ring >= 46 && years.length * 6.4 + 8 <= yearsR * (a1 - a0)
    const nameR = showYears ? r + (lower ? -7 : 7) : r + (lower ? -4 : 4)
    return (
      <>
        <defs>
          <path id={`${id}-n`} d={path(nameR)} />
          {showYears && <path id={`${id}-y`} d={path(yearsR)} />}
        </defs>
        <text className="op-label op-fan-label">
          <textPath href={`#${id}-n`} startOffset="50%" textAnchor="middle">
            {short(label, Math.floor((nameR * (a1 - a0)) / 7.2))}
          </textPath>
        </text>
        {showYears && (
          <text className="op-sublabel op-fan-label">
            <textPath href={`#${id}-y`} startOffset="50%" textAnchor="middle">
              {years}
            </textPath>
          </text>
        )}
      </>
    )
  }
  // Along the radius, reading outward on the right half and inward on the left.
  const left = Math.sin(mid) < 0
  const [px, py] = pt(r, mid).split(' ').map(Number) as [number, number]
  const rotate = mid * RAD - 90 + (left ? 180 : 0)
  const size = Math.min(13, Math.max(8, arcLength * 0.6))
  return (
    <text
      className="op-label op-fan-label"
      x={px}
      y={py}
      textAnchor="middle"
      dominantBaseline="central"
      transform={`rotate(${rotate.toFixed(2)} ${px} ${py})`}
      style={{ fontSize: size }}
    >
      {short(label, Math.floor((ring - 8) / (size * 0.56)))}
    </text>
  )
}

/** The timeline's year axis: ticks every 1, 2, 5, 10, 25, 50 or 100 years, whichever keeps them readable. */
function TimelineAxis({ axis, width }: { axis: NonNullable<LayoutResult['axis']>; width: number }) {
  const step = [1, 2, 5, 10, 25, 50, 100, 250].find((s) => s * axis.pxPerYear >= 60) ?? 500
  const ticks: number[] = []
  for (let y = Math.ceil(axis.from / step) * step; y <= axis.to; y += step) ticks.push(y)
  return (
    <g className="op-timeline-axis" aria-hidden="true">
      <line className="op-axis-line" x1={0} x2={width} y1={22} y2={22} />
      {ticks.map((y) => {
        const x = (y - axis.from) * axis.pxPerYear
        return (
          <g key={y}>
            <line className="op-axis-tick" x1={x} x2={x} y1={18} y2={axis.undatedY ?? 100000} />
            <text className="op-sublabel" x={x} y={12} textAnchor="middle">
              {y}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function groupBox(group: ProjectionGroup, nodes: Map<string, PositionedNode>, pad = 10) {
  const ns = group.occurrenceIds.map((id) => nodes.get(id)).filter((n): n is PositionedNode => Boolean(n))
  if (!ns.length) return null
  const x = Math.min(...ns.map((n) => n.x)) - pad
  const y = Math.min(...ns.map((n) => n.y)) - pad
  return { x, y, width: Math.max(...ns.map((n) => n.x + n.width)) - x + pad, height: Math.max(...ns.map((n) => n.y + n.height)) - y + pad }
}

/**
 * A pedigree view as SVG. Renders on the server with no client JavaScript;
 * links stay ordinary links. Every node carries stable `.op-*` classes and
 * `data-*` attributes for styling; color is never the only signal.
 */
export function PedigreeView(props: PedigreeViewProps) {
  const { projection: p, layout, interactive } = props
  const terms = { ...DEFAULT_TERMS, ...props.terminology }
  const pad = props.padding ?? 24
  const id = props.idPrefix ?? `op-${p.view}-${p.focalId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  const box = props.viewBox ?? { x: -pad, y: -pad, width: layout.bounds.width + 2 * pad, height: layout.bounds.height + 2 * pad }
  const nodes = new Map(layout.nodes.map((n) => [n.occurrenceId, n]))
  const occById = new Map(p.occurrences.map((o) => [o.occurrenceId, o]))
  const title = props.title ?? `${VIEW_LABELS[p.view]}: ${labelOf(p.individuals[p.focalId], terms)}`
  const summary = describeProjection(p, terms)
  const c = props.classNames ?? {}

  return (
    <svg
      {...props.svgProps}
      className={cx('op-root', `op-view-${p.view}`, props.className, c.root)}
      style={{ ...themeStyle(props.theme, p.view), ...props.svgProps?.style }}
      data-theme={typeof props.theme === 'string' ? props.theme : props.theme?.id}
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      role="group"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
      data-view={p.view}
      data-orientation={layout.orientation}
      data-occurrence-mode={p.occurrenceMode}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id={`${id}-title`}>{title}</title>
      <desc id={`${id}-desc`}>{summary}</desc>

      {p.groups
        .filter((g) => g.kind === 'cohort')
        .map((g) => {
          const b = groupBox(g, nodes)
          if (!b) return null
          return (
            <g key={g.id} className={cx('op-cohort', c.cohort)} data-cohort={g.id.replace(/^cohort:/, '').replace(/#.*$/, '')}>
              {props.renderCohortMarker ? (
                props.renderCohortMarker({ group: g, box: b })
              ) : (
                <>
                  <rect className="op-cohort-box" x={b.x} y={b.y} width={b.width} height={b.height} rx={12} ry={12} />
                  {/* Below the box: connectors enter from above. */}
                  <text className="op-cohort-label" x={b.x + 10} y={b.y + b.height + 14}>
                    {g.label ?? terms.cohort}
                  </text>
                </>
              )}
            </g>
          )
        })}

      {layout.axis && <TimelineAxis axis={layout.axis} width={layout.bounds.width} />}

      <g className="op-connectors">
        {layout.edges.map((e) => {
          const child = occById.get(e.target)
          const s = child ? p.structures[child.individualId] : undefined
          const highlighted = props.highlightedOccurrenceIds?.has(e.source) && props.highlightedOccurrenceIds?.has(e.target)
          return (
            <path
              key={e.id}
              className={cx('op-connector', c.connector)}
              d={e.points.map((pt, i) => `${i ? 'L' : 'M'} ${pt.x} ${pt.y}`).join(' ')}
              data-role={e.role ?? undefined}
              data-reproductive-mode={s?.reproductiveMode ?? undefined}
              data-completeness={s?.completeness}
              data-highlighted={highlighted || undefined}
            />
          )
        })}
      </g>

      <g className="op-nodes">
        {layout.nodes.map((node) => {
          const occurrence = occById.get(node.occurrenceId)
          if (!occurrence) return null
          const individual = p.individuals[occurrence.individualId]
          const structure = p.structures[occurrence.individualId]
          const selected = props.selectedIndividualId === occurrence.individualId
          const highlighted = Boolean(props.highlightedOccurrenceIds?.has(node.occurrenceId) || occurrence.highlighted)
          const href = individual ? props.getIndividualHref?.(individual) : null
          const label = labelOf(individual, terms)
          const aria = [
            label,
            sexWord(individual?.sex, terms),
            lifeLabel(lifeSpan(individual)) || null,
            occurrence.ahnentafel !== undefined ? `Ahnentafel ${occurrence.ahnentafel}` : null,
            occurrence.repeated ? terms.repeated : null,
            describeStructure(structure),
            props.geneOverlay ? `${props.geneOverlay.label}: ${genotypeWord(props.geneOverlay.marks.get(occurrence.individualId))}` : null,
            props.genotypes ? genotypeText(props.genotypes, occurrence.individualId) : null,
          ]
            .filter(Boolean)
            .join(', ')
          const slot: IndividualSlotProps = { individual, occurrence, node, structure, selected, highlighted, terms, ...(props.geneOverlay ? { gene: props.geneOverlay.marks.get(occurrence.individualId) ?? null } : {}), ...(props.genotypes ? { genotypes: props.genotypes } : {}) }
          const content = node.arc ? (
            <>
              <path className={cx('op-fan-segment', c.fanSegment)} d={arcPath(node.arc)} />
              <FanLabel arc={node.arc} label={label} years={nodeSublabel(individual)} id={`${id}-arc-${node.occurrenceId.replace(/[^a-zA-Z0-9_-]/g, '_')}`} />
            </>
          ) : (
            <g transform={`translate(${node.x} ${node.y})`}>{props.renderIndividual ? props.renderIndividual(slot) : <DefaultIndividual {...slot} />}</g>
          )
          const attrs = {
            className: cx('op-node', 'op-individual', c.node),
            'data-individual': occurrence.individualId,
            'data-occurrence': occurrence.occurrenceId,
            'data-generation': occurrence.generation,
            'data-repeated': occurrence.repeated || undefined,
            'data-private': individual?.data?.private ? true : undefined,
            'data-collapsed': occurrence.collapsedInto ? true : undefined,
            'data-cohort': individual?.parentage?.cohort ?? undefined,
            'data-reproductive-mode': structure?.reproductiveMode ?? undefined,
            'data-sex': individual?.sex ?? undefined,
            'data-focal': occurrence.individualId === p.focalId || undefined,
            'data-selected': selected || undefined,
            'data-highlighted': highlighted || undefined,
          }
          if (interactive)
            return (
              <g
                key={node.occurrenceId}
                {...attrs}
                role="button"
                tabIndex={0}
                aria-label={aria}
                aria-pressed={selected}
                onClick={(e) => props.onNodeClick?.(occurrence, e)}
                onKeyDown={(e) => props.onNodeKeyDown?.(occurrence, e)}
              >
                {content}
              </g>
            )
          return (
            <g key={node.occurrenceId} {...attrs}>
              {href ? (
                <a href={href} aria-label={aria}>
                  {content}
                </a>
              ) : (
                <>
                  <title>{aria}</title>
                  {content}
                </>
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )
}
