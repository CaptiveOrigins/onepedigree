import { PEDIGREE_VIEWS } from '@captiveorigins/onepedigree-core'
import type { CollectionConfig, Config, Field, GlobalConfig, Plugin } from 'payload'

import { createCohortsCollection, createIndividualsCollection } from './collections.js'
import { cohortMembersEndpoint, pedigreeEndpoint, relativesEndpoint, validateEndpoint } from './endpoints.js'
import { createParentageField } from './fields.js'
import { parentageBeforeChange, parentBeforeDelete, rememberAccessMode } from './integrity.js'
import { resolveOptions } from './mapping.js'
import type { OnePedigreePluginOptions, ResolvedOptions } from './types.js'

const CLIENT = '@captiveorigins/payload-plugin-onepedigree/client'

const panelField = (opts: ResolvedOptions): Field => ({
  name: 'pedigreePanel',
  type: 'ui',
  admin: {
    components: {
      Field: {
        path: `${CLIENT}#PedigreePanel`,
        clientProps: {
          views: opts.views?.enabled ?? PEDIGREE_VIEWS,
          defaultView: opts.views?.default ?? 'pedigree',
          settingsGlobal: opts.admin?.settings === false ? null : opts.settingsGlobal,
          terminology: opts.terminology ?? {},
        },
      },
    },
  },
})

const graphGlobal = (opts: ResolvedOptions): GlobalConfig => ({
  slug: opts.graphGlobal,
  admin: { hidden: true },
  // Internal: written in the same transaction as each parentage change (serialization and cache revision).
  access: { read: () => false, update: () => false },
  fields: [{ name: 'revision', type: 'number', defaultValue: 0 }],
})

const settingsGlobal = (opts: ResolvedOptions): GlobalConfig => ({
  slug: opts.settingsGlobal,
  label: 'Pedigree settings',
  access: { read: () => true, update: ({ req }) => Boolean(req.user) },
  fields: [
    {
      name: 'theme',
      type: 'json',
      admin: {
        description: 'Colors of pedigree views: choose a preset and adjust any color with a hex code.',
        components: { Field: `${CLIENT}#ThemeField` },
      },
    },
    {
      name: 'defaultView',
      type: 'select',
      defaultValue: opts.views?.default ?? 'pedigree',
      options: (opts.views?.enabled ?? PEDIGREE_VIEWS).map((v) => ({ label: v[0]!.toUpperCase() + v.slice(1), value: v })),
    },
  ],
})

/**
 * OnePedigree for Payload. Maps (or creates) an individuals collection,
 * validates parentage on every write, serializes parentage changes, applies
 * the deletion policy, and adds permission-aware pedigree endpoints and Admin
 * components. Never creates collections for parents, roles, modes, edges or
 * occurrences.
 */
export const onePedigree =
  (options: OnePedigreePluginOptions): Plugin =>
  (config: Config): Config => {
    const opts = resolveOptions(options)
    let collections = [...(config.collections ?? [])]

    if (opts.mode === 'managed') {
      if (opts.cohorts?.managed && !collections.some((c) => c.slug === opts.cohorts!.collection))
        collections.push((options.overrides?.cohorts ?? ((c) => c))(createCohortsCollection({ slug: opts.cohorts.collection })))
      if (!collections.some((c) => c.slug === opts.collection))
        collections.push(
          (options.overrides?.individuals ?? ((c) => c))(
            createIndividualsCollection({ slug: opts.collection, cohorts: opts.cohorts?.collection ?? null, roles: opts.roles }),
          ),
        )
    }
    if (!collections.some((c) => c.slug === opts.collection)) throw new Error(`OnePedigree: collection "${opts.collection}" not found`)

    collections = collections.map((c): CollectionConfig => {
      if (c.slug === opts.collection) {
        const inject =
          opts.mode === 'standard-fields' && !c.fields.some((f) => 'name' in f && f.name === 'parentage')
            ? [(options.overrides?.parentageField ?? ((f) => f))(createParentageField({ individuals: opts.collection, cohorts: opts.cohorts?.collection, roles: opts.roles, defaultMode: opts.reproductiveModes?.default }))]
            : []
        if (opts.disabled) return { ...c, fields: [...c.fields, ...inject] }
        return {
          ...c,
          fields: [...c.fields, ...inject, ...(opts.admin?.panel === false ? [] : [panelField(opts)])],
          hooks: {
            ...c.hooks,
            beforeOperation: [...(c.hooks?.beforeOperation ?? []), rememberAccessMode],
            beforeChange: [...(c.hooks?.beforeChange ?? []), parentageBeforeChange(opts)],
            beforeDelete: [...(c.hooks?.beforeDelete ?? []), parentBeforeDelete(opts)],
          },
          endpoints: [...(Array.isArray(c.endpoints) ? c.endpoints : []), pedigreeEndpoint(opts), relativesEndpoint(opts), validateEndpoint(opts)],
        }
      }
      if (opts.cohorts && c.slug === opts.cohorts.collection && !opts.disabled)
        return { ...c, endpoints: [...(Array.isArray(c.endpoints) ? c.endpoints : []), cohortMembersEndpoint(opts)] }
      return c
    })

    const globals = [...(config.globals ?? [])]
    if (!opts.disabled) {
      globals.push(graphGlobal(opts))
      if (opts.admin?.settings !== false && !globals.some((g) => g.slug === opts.settingsGlobal)) globals.push(settingsGlobal(opts))
    }
    // The graph revision document must exist before the first parentage write: two transactions
    // that each create it would not conflict, so concurrent writes could both commit.
    const onInit: Config['onInit'] = async (payload) => {
      await config.onInit?.(payload)
      if (opts.disabled) return
      const current = (await payload.findGlobal({ slug: opts.graphGlobal as never, depth: 0, overrideAccess: true })) as { revision?: number; createdAt?: string }
      if (!current?.createdAt)
        await payload.updateGlobal({ slug: opts.graphGlobal as never, data: { revision: current?.revision ?? 0 } as never, overrideAccess: true, context: { onepedigreeInternal: true } })
    }
    return { ...config, collections, globals, onInit, custom: { ...config.custom, onepedigree: opts } }
  }
