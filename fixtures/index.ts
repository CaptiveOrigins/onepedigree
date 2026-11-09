import type { Individual, PedigreeDocument } from '../packages/core/src/types'

/** Shared fixtures (architecture spec §32), reused by every package's tests and the playground. */
const doc = (individuals: Individual[], cohorts?: PedigreeDocument['cohorts']): PedigreeDocument => ({
  schemaVersion: 1,
  individuals,
  ...(cohorts ? { cohorts } : {}),
})
const sexual = (mother: string, father: string, cohort?: string) => ({
  parents: [
    { individual: mother, role: 'mother' },
    { individual: father, role: 'father' },
  ],
  reproductiveMode: 'sexual' as const,
  ...(cohort ? { cohort } : {}),
})

/** Three human generations, with a half-sibling from a second partnership. */
export const humanFamily = doc([
  { id: 'arthur', label: 'Arthur', sex: 'male' },
  { id: 'beatrice', label: 'Beatrice', sex: 'female' },
  { id: 'carlos', label: 'Carlos', sex: 'male' },
  { id: 'dana', label: 'Dana', sex: 'female' },
  { id: 'ellen', label: 'Ellen', sex: 'female', parentage: sexual('beatrice', 'arthur') },
  { id: 'frank', label: 'Frank', sex: 'male', parentage: sexual('dana', 'carlos') },
  { id: 'gwen', label: 'Gwen', sex: 'female', parentage: sexual('ellen', 'frank') },
  { id: 'hugo', label: 'Hugo', sex: 'male', parentage: sexual('ellen', 'frank') },
  { id: 'iris', label: 'Iris', sex: 'female', parentage: sexual('ellen', 'carlos') },
])

/**
 * Red-footed tortoises: two clutches of the same pair, a backcross (Tinta is
 * bred to her father), and a hatchling with only its mother recorded.
 */
export const reptileBreeding = doc(
  [
    { id: 'rf-sire', label: 'Atlas', sex: 'male' },
    { id: 'rf-dam', label: 'Nova', sex: 'female' },
    { id: 'tinta', label: 'Tinta', sex: 'female', parentage: sexual('rf-dam', 'rf-sire', 'clutch-2022') },
    { id: 'pico', label: 'Pico', sex: 'male', parentage: sexual('rf-dam', 'rf-sire', 'clutch-2022') },
    { id: 'luna', label: 'Luna', sex: 'female', parentage: sexual('rf-dam', 'rf-sire', 'clutch-2024') },
    { id: 'ember', label: 'Ember', sex: 'unknown', parentage: sexual('tinta', 'rf-sire', 'clutch-2026') },
    { id: 'sol', label: 'Sol', parentage: { parents: [{ individual: 'tinta', role: 'mother' }], reproductiveMode: 'sexual', cohort: 'clutch-2026' } },
  ],
  [
    { id: 'clutch-2022', label: '2022 clutch' },
    { id: 'clutch-2024', label: '2024 clutch' },
    { id: 'clutch-2026', label: '2026 clutch' },
  ],
)

/** A parthenogenetic line (e.g. a whiptail lizard). */
export const parthenogenesis = doc([
  { id: 'p0', label: 'Founder', sex: 'female' },
  { id: 'p1', label: 'Daughter', sex: 'female', parentage: { parents: [{ individual: 'p0', role: 'mother' }], reproductiveMode: 'parthenogenesis' } },
  { id: 'p2', label: 'Granddaughter', sex: 'female', parentage: { parents: [{ individual: 'p1', role: 'mother' }], reproductiveMode: 'parthenogenesis' } },
])

/** A self-fertilizing plant. */
export const selfing = doc([
  { id: 'plant-a', label: 'Plant A', sex: 'hermaphrodite' },
  { id: 'plant-b', label: 'Plant B', parentage: { parents: [{ individual: 'plant-a', role: 'parent' }], reproductiveMode: 'self' } },
])

/** A cloning lineage. */
export const cloning = doc([
  { id: 'source', label: 'Source' },
  { id: 'clone-1', label: 'Clone 1', parentage: { parents: [{ individual: 'source', role: 'donor' }], reproductiveMode: 'cloning' } },
  { id: 'clone-2', label: 'Clone 2', parentage: { parents: [{ individual: 'clone-1', role: 'donor' }], reproductiveMode: 'cloning' } },
])

/** Incomplete records: unknown mode, one known parent, roles unknown. */
export const incomplete = doc([
  { id: 'm', label: 'Mother', sex: 'female' },
  { id: 'x', label: 'X', parentage: { parents: [{ individual: 'm', role: 'mother' }] } },
  { id: 'y', label: 'Y', parentage: { parents: [{ individual: 'm', role: 'mother' }] } },
  { id: 'z', label: 'Z', parentage: { parents: [{ individual: 'm' }, { individual: 'x' }] } },
])

/** Pedigree collapse: the focal individual's parents are half-siblings through `founder`. */
export const sharedAncestors = doc([
  { id: 'founder', label: 'Founder', sex: 'male' },
  { id: 'f1', label: 'F1 dam', sex: 'female' },
  { id: 'f2', label: 'F2 dam', sex: 'female' },
  { id: 'outside', label: 'Outcross', sex: 'male' },
  { id: 'half-a', label: 'Half A', sex: 'female', parentage: sexual('f1', 'founder') },
  { id: 'half-b', label: 'Half B', sex: 'male', parentage: sexual('f2', 'founder') },
  { id: 'focal', label: 'Focal', parentage: sexual('half-a', 'half-b') },
  { id: 'cousin', label: 'Cousin', parentage: sexual('half-a', 'outside') },
])

/** Invalid on purpose: a three-generation cycle, a self-parent and a duplicated parent. */
export const invalidCycle = doc([
  { id: 'c1', parentage: { parents: [{ individual: 'c3', role: 'mother' }] } },
  { id: 'c2', parentage: { parents: [{ individual: 'c1', role: 'mother' }] } },
  { id: 'c3', parentage: { parents: [{ individual: 'c2', role: 'mother' }] } },
  { id: 'selfish', parentage: { parents: [{ individual: 'selfish' }] } },
  { id: 'twice', parentage: { parents: [{ individual: 'c1' }, { individual: 'c1' }] } },
])

/** One clutch with multiple paternity and separately recorded hatch data. */
export const multiplePaternityClutch = doc(
  [
    { id: 'dam', label: 'Dam', sex: 'female' },
    { id: 'sire-1', label: 'Sire 1', sex: 'male' },
    { id: 'sire-2', label: 'Sire 2', sex: 'male' },
    { id: 'egg-1', parentage: sexual('dam', 'sire-1', 'clutch') },
    { id: 'egg-2', parentage: sexual('dam', 'sire-2', 'clutch') },
    { id: 'egg-3', parentage: sexual('dam', 'sire-1', 'clutch') },
  ],
  [{ id: 'clutch', label: 'Clutch 2026-001' }],
)

/**
 * A deterministic synthetic population: `generations` layers of `width`
 * individuals; each child draws a mother and father from the previous layer.
 */
export function synthetic(generations: number, width: number): PedigreeDocument {
  let seed = 42
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % n
  }
  const individuals: Individual[] = []
  for (let g = 0; g < generations; g++)
    for (let i = 0; i < width; i++) {
      const id = `g${g}-${i}`
      if (g === 0) individuals.push({ id, sex: i % 2 ? 'male' : 'female' })
      else {
        const mother = `g${g - 1}-${rand(width / 2) * 2}`
        const father = `g${g - 1}-${rand(width / 2) * 2 + 1}`
        individuals.push({ id, sex: i % 2 ? 'male' : 'female', parentage: sexual(mother, father) })
      }
    }
  return doc(individuals)
}

/**
 * Line breeding: Kingston is the focal animal's paternal grandsire and maternal great-grandsire, so he appears
 * twice, at two depths (a demo shape for the platform's tour).
 */
export const lineBreeding = doc([
  { id: 'kingston', label: 'Kingston', sex: 'male' },
  { id: 'saffron', label: 'Saffron', sex: 'female' },
  { id: 'willow', label: 'Willow', sex: 'female' },
  { id: 'harbor', label: 'Harbor', sex: 'male' },
  { id: 'rio', label: 'Rio', sex: 'male', parentage: sexual('saffron', 'kingston') },
  { id: 'maya', label: 'Maya', sex: 'female', parentage: sexual('willow', 'kingston') },
  { id: 'coral', label: 'Coral', sex: 'female', parentage: sexual('maya', 'harbor') },
  { id: 'opal', label: 'Opal', sex: 'female', parentage: sexual('coral', 'rio') },
])

/** Half-siblings both ways: one dam with two sires, and one sire with two dams. */
export const halfSiblings = doc([
  { id: 'juniper', label: 'Juniper', sex: 'female' },
  { id: 'ash', label: 'Ash', sex: 'male' },
  { id: 'bramble', label: 'Bramble', sex: 'male' },
  { id: 'clover', label: 'Clover', sex: 'female' },
  { id: 'fern', label: 'Fern', sex: 'female', parentage: sexual('juniper', 'ash') },
  { id: 'moss', label: 'Moss', sex: 'male', parentage: sexual('juniper', 'ash') },
  { id: 'thistle', label: 'Thistle', sex: 'female', parentage: sexual('juniper', 'bramble') },
  { id: 'reed', label: 'Reed', sex: 'male', parentage: sexual('clover', 'bramble') },
])

/** Six generations: each generation's daughter is bred to an unrelated male. */
export const deepLine = doc(
  Array.from({ length: 6 }, (_, g): Individual[] => {
    const dam = { id: `dam-${g}`, label: `Generation ${g + 1} dam`, sex: 'female' as const }
    const sire = { id: `sire-${g}`, label: `Generation ${g + 1} sire`, sex: 'male' as const }
    if (g > 0) Object.assign(dam, { parentage: sexual(`dam-${g - 1}`, `sire-${g - 1}`) })
    return [dam, sire]
  }).flat(),
)

/**
 * A private ancestor, as the Payload plugin's pedigree endpoint hands it to a reader who can't see it: an anonymous
 * placeholder with no name, in place of the focal animal's maternal grandsire.
 */
export const privateAncestor = doc([
  { id: 'private-1', label: null, sex: null, parentage: null, data: { private: true } },
  { id: 'nettle', label: 'Nettle', sex: 'female' },
  { id: 'sage', label: 'Sage', sex: 'female', parentage: sexual('nettle', 'private-1') },
  { id: 'flint', label: 'Flint', sex: 'male' },
  { id: 'pebble', label: 'Pebble', sex: 'female', parentage: sexual('sage', 'flint') },
])
