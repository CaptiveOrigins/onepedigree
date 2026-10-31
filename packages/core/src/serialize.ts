import { normalizePedigree, PedigreeFormatError } from './normalize'
import type { PedigreeDocument } from './types'

export const SCHEMA_VERSION = 1 as const

/** A versioned JSON document (canonical form, so equal pedigrees serialize identically). */
export function serializePedigree(document: PedigreeDocument, space?: number): string {
  return JSON.stringify(normalizePedigree(document), null, space)
}

/**
 * Parses a serialized document. Future schema versions are rejected rather
 * than guessed; version 1 is the only supported version so far.
 */
export function parsePedigree(json: string): PedigreeDocument {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new PedigreeFormatError('Not valid JSON', 'document')
  }
  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion
  if (typeof version === 'number' && version > SCHEMA_VERSION)
    throw new PedigreeFormatError(`Schema version ${version} is newer than this package supports (${SCHEMA_VERSION}); upgrade OnePedigree`, 'schemaVersion')
  return normalizePedigree(raw)
}
