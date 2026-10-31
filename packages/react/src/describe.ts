import type { Individual, PedigreeViewId, PedigreeViewProjection, ReproductiveStructure } from '@captiveorigins/onepedigree-core'

export const VIEW_LABELS: Record<PedigreeViewId, string> = {
  pedigree: 'Pedigree',
  fan: 'Fan chart',
  ahnentafel: 'Ahnentafel',
  descendants: 'Descendants',
  hourglass: 'Hourglass',
  cohort: 'Cohort',
  relationship: 'Relationship',
  timeline: 'Timeline',
  inbreeding: 'Inbreeding',
  population: 'Population',
  compact: 'Compact pedigree',
  maternal: 'Maternal line',
  paternal: 'Paternal line',
}

export type Terminology = { individual: string; individuals: string; parent: string; cohort: string; repeated: string; unknown: string; privateRecord: string }
export const DEFAULT_TERMS: Terminology = {
  individual: 'individual',
  individuals: 'individuals',
  parent: 'parent',
  cohort: 'cohort',
  repeated: 'appears more than once',
  unknown: 'Unknown',
  privateRecord: 'Private record',
}

/** Display name: the label, else the ID; anonymous placeholders (`data.private`) never show their ID. */
export const labelOf = (individual: Individual | undefined, terms: Terminology = DEFAULT_TERMS) =>
  individual?.data?.private ? terms.privateRecord : individual?.label || individual?.id || terms.unknown

const MODE_TEXT: Record<string, string> = {
  sexual: 'sexual reproduction',
  parthenogenesis: 'parthenogenesis',
  self: 'self-fertilization',
  asexual: 'asexual origin',
  cloning: 'cloning',
  other: 'other origin',
}

/** Words for an individual's origin, so color or shape is never the only signal. */
export function describeStructure(s: ReproductiveStructure | undefined): string {
  if (!s) return 'parentage not recorded'
  const mode = s.reproductiveMode ? MODE_TEXT[s.reproductiveMode] : 'mode unknown'
  const parents = `${s.recordedParentCount} recorded parent${s.recordedParentCount === 1 ? '' : 's'}`
  return [mode, parents, s.completeness === 'incomplete' ? 'incomplete' : null, s.atypical ? 'atypical' : null].filter(Boolean).join(', ')
}

/** A text summary of the current projection (screen readers, `<desc>`, print). */
export function describeProjection(p: PedigreeViewProjection, terms: Terminology = DEFAULT_TERMS): string {
  const focal = labelOf(p.individuals[p.focalId], terms)
  const identities = new Set(p.occurrences.map((o) => o.individualId)).size
  const gens = p.occurrences.map((o) => o.generation)
  const span = gens.length ? Math.max(...gens) - Math.min(...gens) : 0
  const repeated = new Set(p.occurrences.filter((o) => o.repeated).map((o) => o.individualId)).size
  return [
    `${VIEW_LABELS[p.view]} of ${focal}: ${identities} ${identities === 1 ? terms.individual : terms.individuals} across ${span + 1} generation${span ? 's' : ''}.`,
    repeated ? `${repeated} ${repeated === 1 ? terms.individual : terms.individuals} ${terms.repeated}.` : null,
    p.truncated ? 'The view is limited; more records exist.' : null,
    ...p.issues.map((i) => i.message),
  ]
    .filter(Boolean)
    .join(' ')
}

/** SVG path of a ring segment (fan chart); angles in radians, 0 = up, clockwise. */
export function arcPath(a: { cx: number; cy: number; innerRadius: number; outerRadius: number; startAngle: number; endAngle: number }): string {
  const pt = (r: number, t: number) => `${(a.cx + r * Math.sin(t)).toFixed(2)} ${(a.cy - r * Math.cos(t)).toFixed(2)}`
  const large = a.endAngle - a.startAngle > Math.PI ? 1 : 0
  // The focal individual: a full disc at the center.
  if (a.innerRadius <= 0) {
    const r = a.outerRadius
    return `M ${a.cx - r} ${a.cy} A ${r} ${r} 0 1 0 ${a.cx + r} ${a.cy} A ${r} ${r} 0 1 0 ${a.cx - r} ${a.cy} Z`
  }
  return [
    `M ${pt(a.outerRadius, a.startAngle)}`,
    `A ${a.outerRadius} ${a.outerRadius} 0 ${large} 1 ${pt(a.outerRadius, a.endAngle)}`,
    `L ${pt(a.innerRadius, a.endAngle)}`,
    `A ${a.innerRadius} ${a.innerRadius} 0 ${large} 0 ${pt(a.innerRadius, a.startAngle)}`,
    'Z',
  ].join(' ')
}
