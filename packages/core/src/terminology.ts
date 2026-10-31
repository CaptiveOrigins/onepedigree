import type { LineageRoleConfig } from './projection'

/** Words for the two lineage sides. Display only: stored roles stay `mother` / `father`. */
export type ParentTerms = { maternal: string; paternal: string }

export const PARENT_TERM_PRESETS = {
  'mother-father': { label: 'Mother / Father', terms: { maternal: 'Mother', paternal: 'Father' } },
  'dam-sire': { label: 'Dam / Sire', terms: { maternal: 'Dam', paternal: 'Sire' } },
  'female-male-parent': { label: 'Female parent / Male parent', terms: { maternal: 'Female parent', paternal: 'Male parent' } },
} as const satisfies Record<string, { label: string; terms: ParentTerms }>
export type ParentTermsPreset = keyof typeof PARENT_TERM_PRESETS
export const DEFAULT_PARENT_TERMS: ParentTermsPreset = 'mother-father'

const clean = (s: unknown) => (typeof s === 'string' ? s.trim().slice(0, 40) : '')

/**
 * The terms to show: a preset id, or custom `{ maternal, paternal }` (blank
 * parts fall back to the default). Unknown values give the default preset.
 */
export function resolveParentTerms(preference: unknown, fallback: ParentTermsPreset | ParentTerms = DEFAULT_PARENT_TERMS): ParentTerms {
  const base = typeof fallback === 'string' ? PARENT_TERM_PRESETS[fallback].terms : fallback
  if (typeof preference === 'string' && preference in PARENT_TERM_PRESETS) return { ...PARENT_TERM_PRESETS[preference as ParentTermsPreset].terms }
  if (preference && typeof preference === 'object') {
    const p = preference as { preset?: unknown; maternal?: unknown; paternal?: unknown }
    if (typeof p.preset === 'string' && p.preset in PARENT_TERM_PRESETS) return { ...PARENT_TERM_PRESETS[p.preset as ParentTermsPreset].terms }
    return { maternal: clean(p.maternal) || base.maternal, paternal: clean(p.paternal) || base.paternal }
  }
  return { ...base }
}

/** Label for a stored role: maternal/paternal roles use the terms; others are capitalized as stored; none is "Parent". */
export function roleLabel(role: string | null | undefined, terms: ParentTerms, roles: LineageRoleConfig = { maternal: ['mother', 'dam', 'egg'], paternal: ['father', 'sire', 'sperm'] }): string {
  if (!role) return 'Parent'
  if (roles.maternal.includes(role)) return terms.maternal
  if (roles.paternal.includes(role)) return terms.paternal
  return role[0]!.toUpperCase() + role.slice(1)
}
