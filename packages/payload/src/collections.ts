import type { Access, CollectionConfig, Field } from 'payload'

import { createParentageField } from './fields.js'

type FactoryOptions = { slug: string; labels?: { singular: string; plural: string }; additionalFields?: Field[]; access?: CollectionConfig['access'] }

const signedIn: Access = ({ req }) => Boolean(req.user)

/** A minimal individuals collection: name, optional external ID and sex label, parentage. */
export const createIndividualsCollection = (o: FactoryOptions & { cohorts?: string | null; roles?: readonly string[] }): CollectionConfig => ({
  slug: o.slug,
  labels: o.labels ?? { singular: 'Individual', plural: 'Individuals' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'sex', 'updatedAt'] },
  access: o.access ?? { read: () => true, create: signedIn, update: signedIn, delete: signedIn },
  fields: [
    { name: 'name', type: 'text' },
    { type: 'row', fields: [{ name: 'externalId', type: 'text', index: true }, { name: 'sex', type: 'text' }] },
    createParentageField({ individuals: o.slug, cohorts: o.cohorts, roles: o.roles }),
    ...(o.additionalFields ?? []),
  ],
  timestamps: true,
})

/** A minimal cohorts collection: a label plus host fields. Members are derived from each individual's parentage. */
export const createCohortsCollection = (o: FactoryOptions): CollectionConfig => ({
  slug: o.slug,
  labels: o.labels ?? { singular: 'Cohort', plural: 'Cohorts' },
  admin: { useAsTitle: 'name' },
  access: o.access ?? { read: () => true, create: signedIn, update: signedIn, delete: signedIn },
  fields: [{ name: 'name', type: 'text' }, ...(o.additionalFields ?? [])],
  timestamps: true,
})
