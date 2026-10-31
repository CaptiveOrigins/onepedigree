import { REPRODUCTIVE_MODES, type ReproductiveModeId } from '@captiveorigins/onepedigree-core'
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

/** The canonical parents array: any number of contributors, each with an optional role. */
export const createParentsField = (o: { individuals: string; roles?: readonly string[] }): Field => ({
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
        { name: 'individual', type: 'relationship', relationTo: o.individuals as CollectionSlug, required: true, index: true, admin: { width: '60%' } },
        {
          name: 'role',
          type: 'select',
          options: [...new Set([...BUILT_IN_ROLES, ...(o.roles ?? [])])].map((value) => ({ label: label(value), value })),
          admin: { width: '40%' },
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
  admin: { description: 'Clutch, litter or other group born from the same occurrence.' },
})

export type RoleSelector = { role: string; label: string }
export type ParentSelectors = { maternal: RoleSelector; paternal: RoleSelector }
export const DEFAULT_SELECTORS: ParentSelectors = { maternal: { role: 'mother', label: 'Mother' }, paternal: { role: 'father', label: 'Father' } }

const rowId = (v: unknown) => (v && typeof v === 'object' && 'id' in v ? String((v as { id: unknown }).id) : v ? String(v) : null)
type Row = { individual?: unknown; role?: string | null }

/**
 * A Mother/Father (or Dam/Sire) picker backed by the canonical parents array:
 * shows the first parent with the role, and on save replaces the rows with
 * that role when the picker changed. Not stored itself (virtual).
 */
export const createRoleSelectorField = (o: { individuals: string; selector: RoleSelector }): Field => ({
  name: o.selector.role,
  label: o.selector.label,
  type: 'relationship',
  relationTo: o.individuals as CollectionSlug,
  virtual: true,
  // Payload makes virtual fields read-only unless told otherwise.
  admin: { width: '50%', readOnly: false },
  hooks: {
    afterRead: [({ siblingData }) => rowId(((siblingData?.parents ?? []) as Row[]).find((r) => r.role === o.selector.role)?.individual)],
    beforeChange: [
      ({ value, siblingData, previousSiblingDoc }) => {
        if (value === undefined) return undefined
        const before = rowId(((previousSiblingDoc?.parents ?? []) as Row[]).find((r) => r.role === o.selector.role)?.individual)
        const next = rowId(value)
        if (next === before) return undefined
        const rows = ((siblingData.parents ?? []) as Row[]).filter((r) => r.role !== o.selector.role)
        siblingData.parents = next ? [{ individual: next, role: o.selector.role }, ...rows] : rows
        return undefined
      },
    ],
  },
})

/** The standard `parentage` group (parents, reproductive mode, cohort), with Mother/Father pickers unless `selectors` is false. */
export const createParentageField = (o: {
  individuals: string
  cohorts?: string | null
  roles?: readonly string[]
  defaultMode?: ReproductiveModeId | null
  selectors?: ParentSelectors | false
}): Field => ({
  name: 'parentage',
  type: 'group',
  fields: [
    ...(o.selectors === false
      ? []
      : [
          {
            type: 'row' as const,
            fields: [
              createRoleSelectorField({ individuals: o.individuals, selector: (o.selectors ?? DEFAULT_SELECTORS).maternal }),
              createRoleSelectorField({ individuals: o.individuals, selector: (o.selectors ?? DEFAULT_SELECTORS).paternal }),
            ],
          },
        ]),
    createParentsField({ individuals: o.individuals, roles: o.roles }),
    createReproductiveModeField({ defaultValue: o.defaultMode }),
    ...(o.cohorts ? [createCohortField({ cohorts: o.cohorts })] : []),
  ],
})
