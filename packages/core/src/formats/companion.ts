import type { Individual, PedigreeDocument } from '../types'

/**
 * A companion file: extra information kept beside a source file (e.g. a GEDCOM)
 * without changing it. The source stays the record; the companion adds what the
 * source can't hold (extra fields per individual, view and colour settings) and
 * tracks which version of the source it was made for.
 */
export type Companion = {
  onepedigree: 'companion'
  schemaVersion: 1
  source: { format: 'gedcom' | 'csv' | 'onepedigree'; file: string; sha256?: string }
  /** Extra fields per individual ID (merged into `data`), and optional label overrides. */
  individuals?: Record<string, { label?: string; data?: Record<string, unknown> }>
  /** Display settings: view, theme, colours… (opaque to the core). */
  display?: Record<string, unknown>
}

export const isCompanion = (v: unknown): v is Companion => Boolean(v) && (v as Companion).onepedigree === 'companion'

export function emptyCompanion(source: Companion['source']): Companion {
  return { onepedigree: 'companion', schemaVersion: 1, source, individuals: {}, display: {} }
}

/** The source document with the companion's extras applied (the source itself is not changed). */
export function applyCompanion(doc: PedigreeDocument, companion: Companion): PedigreeDocument {
  const extras = companion.individuals ?? {}
  return {
    ...doc,
    individuals: doc.individuals.map((ind): Individual => {
      const x = extras[ind.id]
      if (!x) return ind
      return { ...ind, ...(x.label ? { label: x.label } : {}), data: { ...(ind.data ?? {}), ...(x.data ?? {}) } }
    }),
  }
}

/** Whether the companion was made for this exact source (by hash). */
export const companionMatches = (companion: Companion, sha256: string) => !companion.source.sha256 || companion.source.sha256 === sha256
