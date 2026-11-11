import { isBiologicalKind, PARENT_KINDS, PARENT_TERM_PRESETS, REPRODUCTIVE_MODES, resolveParentTerms, type ParentTerms, type ParentTermsPreset, type ReproductiveModeId } from '@captiveorigins/onepedigree-core'
import type { CollectionSlug, Field } from 'payload'

const BUILT_IN_ROLES = ['mother', 'father', 'dam', 'sire', 'egg', 'sperm', 'donor', 'parent', 'contributor']
const MODE_LABELS: Record<ReproductiveModeId, string> = {
  sexual: 'Sexual',
  parthenogenesis: 'Parthenogenesis',
  self: 'Self',
  asexual: 'Asexual',
  cloning: 'Cloning',
  other: 'Other',
}
const label = (s: string) => s[0]!.toUpperCase() + s.slice(1)

/** The canonical parents array: any number of contributors, each with an optional role and kind of link. */
export const createParentsField = (o: { individuals: string; roles?: readonly string[]; kinds?: readonly string[] }): Field => ({
  name: 'parents',
  label: 'All parents',
  type: 'array',
  admin: {
    initCollapsed: true,
    description:
      'Every recorded parent (the pickers above edit the rows with their roles). Add other contributors or unknown-role parents here; roles are never inferred from sex.',
  },
  fields: [
    {
      type: 'row',
      fields: [
        // Indexed: descendant queries look parents up by this path.
        { name: 'individual', type: 'relationship', relationTo: o.individuals as CollectionSlug, required: true, index: true, admin: { width: '50%' } },
        {
          name: 'role',
          type: 'select',
          options: [...new Set([...BUILT_IN_ROLES, ...(o.roles ?? [])])].map((value) => ({ label: label(value), value })),
          admin: { width: '25%' },
        },
        {
          // Empty means biological, as for records saved before kinds existed. Only biological links count for
          // relatedness and genetics; the others (a foster dam, a legal father) are kept and drawn dotted.
          name: 'kind',
          type: 'select',
          options: [...new Set([...PARENT_KINDS, ...(o.kinds ?? [])])].map((value) => ({ label: label(value), value })),
          admin: { width: '25%', description: 'Empty means biological.' },
        },
      ],
    },
  ],
})

export const createReproductiveModeField = (o: { defaultValue?: ReproductiveModeId | null } = {}): Field => ({
  name: 'reproductiveMode',
  type: 'select',
  options: REPRODUCTIVE_MODES.map((value) => ({ label: MODE_LABELS[value], value })),
  ...(o.defaultValue ? { defaultValue: o.defaultValue } : {}),
  admin: { description: 'How this individual originated. Empty means unknown. Changing it never adds or removes parents.' },
})

export const createCohortField = (o: { cohorts: string }): Field => ({
  name: 'cohort',
  type: 'relationship',
  relationTo: o.cohorts as CollectionSlug,
  index: true,
  admin: { description: 'The birthing event: a clutch, litter or other group born to the same mother at the same time. Fathers may differ.' },
})

const CLIENT = '@captiveorigins/payload-plugin-onepedigree/client'

const rowId = (v: unknown) => (v && typeof v === 'object' ? ('id' in v && (v as { id: unknown }).id != null ? String((v as { id: unknown }).id) : null) : v ? String(v) : null)
type Row = { individual?: unknown; role?: string | null; kind?: string | null }
/** A row the Mother/Father picker edits: that role, on a biological link. A legal father or foster dam row is left alone. */
const pickerRow = (r: Row, role: string) => r.role === role && isBiologicalKind(r.kind)

/**
 * A Mother/Father (or Dam/Sire) picker backed by the canonical parents array:
 * shows the first biological parent with the role, and on save replaces the
 * biological rows with that role when the picker changed. Rows with another
 * kind (legal, adoptive, social, donor) are kept. Not stored itself (virtual).
 */
export const createRoleSelectorField = (o: {
  individuals: string
  side: 'maternal' | 'paternal'
  terms?: ParentTermsPreset | ParentTerms
  userPreference?: string
}): Field => {
  const role = o.side === 'maternal' ? 'mother' : 'father'
  const terms = resolveParentTerms(o.terms)
  return {
  name: role,
  label: terms[o.side],
  type: 'relationship',
  relationTo: o.individuals as CollectionSlug,
  virtual: true,
  admin: {
    width: '50%',
    // Payload makes virtual fields read-only unless told otherwise.
    readOnly: false,
    // The label follows the signed-in user's preferred terms (e.g. Dam/Sire).
    components: { Label: { path: `${CLIENT}#ParentRoleLabel`, clientProps: { side: o.side, defaultTerms: terms, userPreference: o.userPreference ?? null } } },
  },
  hooks: {
    afterRead: [({ siblingData }) => rowId(((siblingData?.parents ?? []) as Row[]).find((r) => pickerRow(r, role))?.individual)],
    beforeChange: [
      ({ value, siblingData, previousSiblingDoc }) => {
        if (value === undefined) return undefined
        const before = rowId(((previousSiblingDoc?.parents ?? []) as Row[]).find((r) => pickerRow(r, role))?.individual)
        const next = rowId(value)
        if (next === before) return undefined
        const rows = ((siblingData.parents ?? []) as Row[]).filter((r) => !pickerRow(r, role))
        siblingData.parents = next ? [{ individual: next, role }, ...rows] : rows
        return undefined
      },
    ],
  },
  }
}

/**
 * A user's own words for the parent roles (add to your users collection and
 * pass its path as `terminology.userPreference`). Display only.
 */
export const createParentTermsPreferenceField = (o: { name?: string } = {}): Field => ({
  name: o.name ?? 'parentTerms',
  label: 'Parent labels',
  type: 'group',
  admin: { description: 'How pedigrees name the two parents for you. Stored data is the same either way.' },
  fields: [
    {
      name: 'preset',
      type: 'select',
      options: [...Object.entries(PARENT_TERM_PRESETS).map(([value, p]) => ({ label: p.label, value })), { label: 'Custom', value: 'custom' }],
      admin: { description: 'Empty: the site default.' },
    },
    {
      type: 'row',
      admin: { condition: (_, sibling) => sibling?.preset === 'custom' },
      fields: [
        { name: 'maternal', type: 'text', maxLength: 40, admin: { width: '50%', placeholder: 'Mother' } },
        { name: 'paternal', type: 'text', maxLength: 40, admin: { width: '50%', placeholder: 'Father' } },
      ],
    },
  ],
})

/** The standard `parentage` group (parents, reproductive mode, cohort), with Mother/Father pickers unless `selectors` is false. */
export const createParentageField = (o: {
  individuals: string
  cohorts?: string | null
  roles?: readonly string[]
  kinds?: readonly string[]
  defaultMode?: ReproductiveModeId | null
  selectors?: boolean
  terms?: ParentTermsPreset | ParentTerms
  userPreference?: string
}): Field => ({
  name: 'parentage',
  type: 'group',
  fields: [
    ...(o.selectors === false
      ? []
      : [
          {
            type: 'row' as const,
            fields: (['maternal', 'paternal'] as const).map((side) =>
              createRoleSelectorField({ individuals: o.individuals, side, terms: o.terms, userPreference: o.userPreference }),
            ),
          },
        ]),
    createParentsField({ individuals: o.individuals, roles: o.roles, kinds: o.kinds }),
    createReproductiveModeField({ defaultValue: o.defaultMode }),
    ...(o.cohorts ? [createCohortField({ cohorts: o.cohorts })] : []),
  ],
})
