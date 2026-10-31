import type { PedigreeViewProjection } from './projection'
import type { IndividualId } from './types'

/** How a generation relates to the focal individual: parents (1), grandparents (2), … siblings (0), offspring (-1), … */
export type GenerationKind = 'parents' | 'grandparents' | 'great-grandparents' | 'siblings' | 'offspring' | 'grand-offspring' | 'great-grand-offspring'

export type RelativesGeneration = {
  /** Positive: ancestors; 0: same generation (siblings); negative: descendants. */
  generation: number
  kind: GenerationKind
  /** How many "great"s (for great-grandparents and beyond): 1 = great-grandparents, 2 = 2× great-grandparents. */
  greats: number
  individualIds: IndividualId[]
}

/** Kind and number of "great"s for a generation offset. */
export function generationKind(generation: number): { kind: GenerationKind; greats: number } {
  if (generation === 0) return { kind: 'siblings', greats: 0 }
  const up = generation > 0
  const n = Math.abs(generation)
  if (n === 1) return { kind: up ? 'parents' : 'offspring', greats: 0 }
  if (n === 2) return { kind: up ? 'grandparents' : 'grand-offspring', greats: 0 }
  return { kind: up ? 'great-grandparents' : 'great-grand-offspring', greats: n - 2 }
}

const ENGLISH: Record<GenerationKind, string> = {
  parents: 'Parents',
  grandparents: 'Grandparents',
  'great-grandparents': 'Great-grandparents',
  siblings: 'Siblings',
  offspring: 'Offspring',
  'grand-offspring': 'Grand-offspring',
  'great-grand-offspring': 'Great-grand-offspring',
}

/** English label ("Parents", "3× great-grandparents"); hosts translate from `generationKind` instead. */
export function generationLabel(generation: number): string {
  const { kind, greats } = generationKind(generation)
  const word = ENGLISH[kind]
  return greats > 1 ? `${greats}× ${word[0]!.toLowerCase()}${word.slice(1)}` : word
}

/**
 * Every relative in a projection (typically an hourglass view with siblings)
 * grouped by generation, ancestors first, nearest first within each side; each
 * individual once, at the generation it first appears; the focal individual
 * left out. A list counterpart to the chart views ("show all relatives").
 */
export function relativesByGeneration(projection: Pick<PedigreeViewProjection, 'focalId' | 'occurrences'>): RelativesGeneration[] {
  const byGen = new Map<number, IndividualId[]>()
  const seen = new Set<IndividualId>([projection.focalId])
  for (const o of projection.occurrences) {
    if (seen.has(o.individualId)) continue
    seen.add(o.individualId)
    byGen.set(o.generation, [...(byGen.get(o.generation) ?? []), o.individualId])
  }
  return [...byGen.entries()]
    .sort(([a], [b]) => b - a)
    .map(([generation, individualIds]) => ({ generation, ...generationKind(generation), individualIds }))
}
