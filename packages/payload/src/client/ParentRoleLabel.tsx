'use client'

import { resolveParentTerms, type ParentTerms } from '@captiveorigins/onepedigree-core'
import { FieldLabel, useAuth } from '@payloadcms/ui'

const getAt = (doc: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), doc)

/** Mother/Father picker label in the signed-in user's own terms (e.g. Dam/Sire), else the site default. */
export function ParentRoleLabel({ side, defaultTerms, userPreference, path }: { side: 'maternal' | 'paternal'; defaultTerms: ParentTerms; userPreference: string | null; path?: string }) {
  const { user } = useAuth()
  const terms = resolveParentTerms(userPreference && user ? getAt(user, userPreference) : undefined, defaultTerms)
  return <FieldLabel label={terms[side]} path={path} />
}
