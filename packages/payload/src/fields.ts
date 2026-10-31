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
  type: 'array',
  admin: { description: 'Recorded parents. Leave a role empty when it is not known; roles are never inferred from sex.' },
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

/** The standard `parentage` group (parents, reproductive mode, cohort). */
export const createParentageField = (o: { individuals: string; cohorts?: string | null; roles?: readonly string[]; defaultMode?: ReproductiveModeId | null }): Field => ({
  name: 'parentage',
  type: 'group',
  fields: [
    createParentsField({ individuals: o.individuals, roles: o.roles }),
    createReproductiveModeField({ defaultValue: o.defaultMode }),
    ...(o.cohorts ? [createCohortField({ cohorts: o.cohorts })] : []),
  ],
})
