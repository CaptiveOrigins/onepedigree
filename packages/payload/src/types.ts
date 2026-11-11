import type { LineageRoleConfig, ParentTerms, ParentTermsPreset, PedigreeViewId, ReproductiveModeId, ValidationRule } from '@captiveorigins/onepedigree-core'
import type { Access, CollectionConfig, Field } from 'payload'

/** How parentage is stored on the host collection. */
export type ParentageMapping =
  | {
      /** `parents[{ individual, role, kind }]`, `reproductiveMode`, `cohort` in a group (default path `parentage`). */
      kind: 'parent-array'
      path?: string
      /** Names inside each parent row (defaults: `individual`, `role`, `kind`). An empty kind means biological. */
      individualField?: string
      roleField?: string
      kindField?: string
      reproductiveMode?: string
      cohort?: string
    }
  | {
      /** One relationship field per role, e.g. `{ mother: 'dam', father: 'sire' }`. */
      kind: 'role-fields'
      roles: Record<string, string>
      reproductiveMode?: string
      cohort?: string
    }

export type OnePedigreePluginOptions = {
  /** Collection holding individuals (e.g. `animals`). */
  collection: string
  /**
   * `managed`: the plugin creates the collection (and cohorts) with standard fields.
   * `standard-fields`: inject the standard parentage group into your existing collection.
   * `mapped`: use your existing fields as described by `fields.parentage`.
   * Default `standard-fields`.
   */
  mode?: 'managed' | 'standard-fields' | 'mapped'
  fields?: {
    /** Display label field (default `name`, falling back to the ID). */
    label?: string
    /**
     * A host identifier shown beside the label, e.g. "Mead (CO-AQCR6T)": a field path, or a function of the
     * requester returning one (so each user can choose, say, a registry ID or their own studbook number).
     * Never shown for records the requester can't read.
     */
    identifier?: string | ((args: { user: unknown }) => string | null | undefined)
    sex?: string
    parentage?: ParentageMapping
    /** Extra fields copied into projections as display data (explicitly approved; never everything). */
    display?: readonly string[]
  }
  /**
   * Cohort collection: birthing events (a clutch, a litter, twins). `managed: true` creates it.
   * `birthParentField`: the cohort's field naming the birthing parent; members whose recorded
   * mother (maternal role) differs are refused. Fathers may differ per member. False: no cohorts.
   */
  cohorts?: { collection: string; label?: string; managed?: boolean; birthParentField?: string } | false
  reproductiveModes?: { default?: ReproductiveModeId | null }
  /** Mother/Father pickers above the parents list (standard fields; labels from `terminology.parents`). False hides them. */
  selectors?: boolean
  /** Role options in the parent editor (extend the built-ins). */
  roles?: readonly string[]
  /** Kind options in the parent editor, beyond biological, legal, adoptive, social and donor. Empty means biological. */
  kinds?: readonly string[]
  lineageRoles?: LineageRoleConfig
  navigation?: { individualUrl?: string; cohortUrl?: string }
  views?: { enabled?: readonly PedigreeViewId[]; default?: PedigreeViewId }
  /** Bounds for public traversal (requests are clamped to them). */
  limits?: { maxDepth?: number; maxNodes?: number }
  /**
   * A related record the requester cannot read: `omit` (default) leaves it out;
   * `placeholder` shows an anonymous "private record" without its ID or name.
   */
  hiddenRecords?: 'omit' | 'placeholder'
  /** Deleting an individual that is someone's parent: refuse (default) or remove the references. */
  onReferencedIndividualDelete?: 'restrict' | 'detach'
  /** Host biological rules (e.g. taxonomy). Errors block the write. */
  rules?: readonly ValidationRule[]
  /** Labels only; stored keys never change. */
  terminology?: {
    individual?: string
    individuals?: string
    cohort?: string
    cohorts?: string
    /** Default words for the parent roles: a preset ('mother-father', 'dam-sire', 'female-male-parent') or custom. Default Mother/Father. */
    parents?: ParentTermsPreset | ParentTerms
    /** Path on the signed-in user's document holding their own choice (see `createParentTermsPreferenceField`). */
    userPreference?: string
  }
  admin?: {
    /** Pedigree preview, relatives and notices on the individual's edit view (default true). */
    panel?: boolean
    /** A "Pedigree settings" global with the color theme editor (default true). */
    settings?: boolean
    /** Who may change the settings (default: any signed-in user; restrict this in apps with member accounts). */
    settingsAccess?: Access
  }
  /** Access, fields or hooks to add to collections the plugin creates (managed mode). */
  overrides?: {
    individuals?: (c: CollectionConfig) => CollectionConfig
    cohorts?: (c: CollectionConfig) => CollectionConfig
    parentageField?: (f: Field) => Field
  }
  /** Turn off everything but the fields (e.g. for migrations). */
  disabled?: boolean
}

export type ResolvedOptions = Required<Pick<OnePedigreePluginOptions, 'collection' | 'mode' | 'hiddenRecords' | 'onReferencedIndividualDelete'>> &
  Omit<OnePedigreePluginOptions, 'fields' | 'cohorts' | 'limits'> & {
    fields: { label: string; identifier: NonNullable<OnePedigreePluginOptions['fields']>['identifier'] | null; sex: string | null; parentage: Required<Extract<ParentageMapping, { kind: 'parent-array' }>> | Extract<ParentageMapping, { kind: 'role-fields' }>; display: readonly string[] }
    cohorts: { collection: string; label: string; managed: boolean; birthParentField: string | null } | null
    limits: { maxDepth: number; maxNodes: number }
    graphGlobal: string
    settingsGlobal: string
  }
