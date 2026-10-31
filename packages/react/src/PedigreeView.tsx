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

import { arcPath, DEFAULT_TERMS, describeProjection, describeStructure, labelOf, VIEW_LABELS, type Terminology } from './describe.js'

export type IndividualSlotProps = {
  individual: Individual | undefined
  occurrence: IndividualOccurrence
  node: PositionedNode
  structure: ReproductiveStructure | undefined
  selected: boolean
  highlighted: boolean
  terms: Terminology
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

function DefaultIndividual({ individual, occurrence, node, structure, terms }: IndividualSlotProps) {
  const label = labelOf(individual, terms)
  const sub = [individual?.sex, occurrence.ahnentafel !== undefined ? `#${occurrence.ahnentafel}` : null].filter(Boolean).join(' · ')
  const chars = Math.max(6, Math.floor(node.width / 7.5))
  return (
    <>
      <rect className="op-node-box" width={node.width} height={node.height} rx={8} ry={8} />
      <text className="op-label" x={10} y={sub ? node.height / 2 - 3 : node.height / 2 + 4}>
        {short(label, chars)}
      </text>
      {sub && (
        <text className="op-sublabel" x={10} y={node.height / 2 + 13}>
          {short(sub, chars)}
        </text>
      )}
      {occurrence.repeated && (
        <text className="op-repeat-marker" x={node.width - 8} y={14} textAnchor="end">
          ↻
        </text>
      )}
      {structure && <Junction s={structure} x={node.width / 2} y={0} />}
    </>
  )
}

function groupBox(group: ProjectionGroup, nodes: Map<string, PositionedNode>, pad = 10) {
  const ns = group.occurrenceIds.map((id) => nodes.get(id)).filter((n): n is PositionedNode => Boolean(n))
  if (!ns.length) return null
  const x = Math.min(...ns.map((n) => n.x)) - pad
  const y = Math.min(...ns.map((n) => n.y)) - pad - 14
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
            <g key={g.id} className={cx('op-cohort', c.cohort)} data-cohort={g.id.replace(/^cohort:/, '')}>
              {props.renderCohortMarker ? (
                props.renderCohortMarker({ group: g, box: b })
              ) : (
                <>
                  <rect className="op-cohort-box" x={b.x} y={b.y} width={b.width} height={b.height} rx={12} ry={12} />
                  <text className="op-cohort-label" x={b.x + 10} y={b.y + 12}>
                    {g.label ?? terms.cohort}
                  </text>
                </>
              )}
            </g>
          )
        })}

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
            individual?.sex,
            occurrence.ahnentafel !== undefined ? `Ahnentafel ${occurrence.ahnentafel}` : null,
            occurrence.repeated ? terms.repeated : null,
            describeStructure(structure),
          ]
            .filter(Boolean)
            .join(', ')
          const slot: IndividualSlotProps = { individual, occurrence, node, structure, selected, highlighted, terms }
          const content = node.arc ? (
            <>
              <path className={cx('op-fan-segment', c.fanSegment)} d={arcPath(node.arc)} />
              <text className="op-label" x={node.x + node.width / 2} y={node.y + node.height / 2 + 4} textAnchor="middle">
                {short(label, Math.max(4, Math.floor((node.arc.outerRadius - node.arc.innerRadius) / 7)))}
              </text>
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
