export { onePedigree } from './plugin.js'
export { createCohortsCollection, createIndividualsCollection } from './collections.js'
export { createCohortField, createParentageField, createParentsField, createParentTermsPreferenceField, createReproductiveModeField, createRoleSelectorField } from './fields.js'
export { checkParentage, cohortBirthParentBeforeChange, parentageBeforeChange, parentBeforeDelete, SKIP } from './integrity.js'
export { getPedigree, getRelatives, payloadRepository, redact, type PedigreeQuery, type Summary } from './endpoints.js'
export { isPrivateParent, keepHiddenParents, parentageAfterRead, readableIds, withStoredParents, type PrivateParent } from './privacy.js'
export { documentAdapter, readParents, resolveOptions, termsFor, toIndividual } from './mapping.js'
export type { OnePedigreePluginOptions, ParentageMapping, ResolvedOptions } from './types.js'

/** The resolved options of the installed plugin (for host pages calling getPedigree / getRelatives). */
export const pluginOptions = (config: { custom?: Record<string, unknown> }) => config.custom?.onepedigree as import('./types.js').ResolvedOptions
