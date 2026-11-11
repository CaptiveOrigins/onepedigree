/** JSON Schema (draft 2020-12) for the schema-version-1 pedigree document. */
const nullableString = { type: ['string', 'null'] } as const

export const parentReferenceSchema = {
  type: 'object',
  required: ['individual'],
  additionalProperties: false,
  properties: {
    individual: { type: 'string', minLength: 1 },
    role: nullableString,
    // No kind means biological. Built-in kinds: biological, legal, adoptive, social, donor; any other text is allowed.
    kind: { type: ['string', 'null'], examples: ['biological', 'donor', 'surrogate', 'legal', 'adoptive', 'social'] },
  },
} as const

export const parentageSchema = {
  type: 'object',
  required: ['parents'],
  additionalProperties: false,
  properties: {
    parents: { type: 'array', items: parentReferenceSchema },
    uncertainParents: {
      type: 'array',
      items: {
        type: 'object',
        required: ['candidates'],
        additionalProperties: false,
        properties: {
          role: nullableString,
          kind: { enum: ['wild', 'unknown', null] },
          shared: nullableString,
          basis: nullableString,
          candidates: {
            type: 'array',
            items: { type: 'object', required: ['individual', 'probability'], additionalProperties: false, properties: { individual: { type: 'string', minLength: 1 }, probability: { type: 'number', exclusiveMinimum: 0, maximum: 1 } } },
          },
        },
      },
    },
    reproductiveMode: { enum: ['sexual', 'parthenogenesis', 'self', 'asexual', 'cloning', 'other', null] },
    cohort: nullableString,
  },
} as const

export const individualSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    label: nullableString,
    identifier: nullableString,
    sex: nullableString,
    parentage: { oneOf: [parentageSchema, { type: 'null' }] },
    data: { type: 'object' },
  },
} as const

export const cohortSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', minLength: 1 }, label: nullableString, data: { type: 'object' } },
} as const

export const pedigreeDocumentSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/mgilardi/onepedigree/schema/pedigree-document-1.json',
  title: 'OnePedigree document (schema version 1)',
  type: 'object',
  required: ['schemaVersion', 'individuals'],
  additionalProperties: false,
  properties: {
    schemaVersion: { const: 1 },
    individuals: { type: 'array', items: individualSchema },
    cohorts: { type: 'array', items: cohortSchema },
  },
} as const
