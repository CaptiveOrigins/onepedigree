import { describe, expect, it } from 'vitest'

import { resolveOptions, toIndividual } from '../src'

/**
 * The main plugin doesn't serve uncertain parents (studbook MULT/UNK slots). Their candidates name other animals, and
 * this plugin has no step that drops the ones a reader can't see, so it must never pass them through, even when a site
 * stores them on the same document. The studbook endpoint is the only place they're served, with private candidates
 * counted but never named. If this plugin ever serves them, it needs that redaction and this test must change with it.
 */
describe('uncertain parents in the main plugin', () => {
  const stored = {
    id: 'child',
    name: 'Clutch 4 hatchling',
    parentage: {
      parents: [{ individual: 'dam-1', role: 'mother' }],
      uncertainParents: [{ role: 'father', kind: 'unknown', candidates: [{ individual: 'hidden-male', probability: 0.6 }] }],
    },
  }

  it('leaves stored uncertain parents and their candidates out of what it serves', () => {
    const ind = toIndividual(stored, resolveOptions({ collection: 'individuals' }))
    expect(ind.parentage?.parents).toEqual([{ individual: 'dam-1', role: 'mother' }])
    expect(ind.parentage).not.toHaveProperty('uncertainParents')
    expect(JSON.stringify(ind)).not.toContain('hidden-male')
  })

  it('leaves them out with role fields too', () => {
    const opts = resolveOptions({ collection: 'animals', fields: { parentage: { kind: 'role-fields', roles: { dam: 'dam', sire: 'sire' } } } })
    const ind = toIndividual({ id: 'child', name: 'x', dam: 'dam-1', sire: null, parentage: stored.parentage }, opts)
    expect(ind.parentage?.parents).toEqual([{ individual: 'dam-1', role: 'dam' }])
    expect(JSON.stringify(ind)).not.toContain('hidden-male')
  })
})
