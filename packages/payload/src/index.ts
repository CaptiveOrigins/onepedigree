export { onePedigree } from './plugin.js'
export { createCohortsCollection, createIndividualsCollection } from './collections.js'
export { createCohortField, createParentageField, createParentsField, createReproductiveModeField, createRoleSelectorField, DEFAULT_SELECTORS, type ParentSelectors } from './fields.js'
export { checkParentage, parentageBeforeChange, parentBeforeDelete, SKIP } from './integrity.js'
export { getPedigree, getRelatives, payloadRepository, redact, type PedigreeQuery, type Summary } from './endpoints.js'
export { documentAdapter, readParents, resolveOptions, toIndividual } from './mapping.js'
export type { OnePedigreePluginOptions, ParentageMapping, ResolvedOptions } from './types.js'

/** The resolved options of the installed plugin (for host pages calling getPedigree / getRelatives). */
export const pluginOptions = (config: { custom?: Record<string, unknown> }) => config.custom?.onepedigree as import('./types.js').ResolvedOptions
