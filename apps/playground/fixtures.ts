import { cloning, deepLine, halfSiblings, humanFamily, incomplete, lineBreeding, privateAncestor, multiplePaternityClutch, parthenogenesis, reptileBreeding, selfing, sharedAncestors, synthetic } from '../../fixtures'

/** Datasets with a sensible focal and second individual each, and a founder for descendant views. */
export const DATASETS = {
  'Human family': { doc: humanFamily, focal: 'gwen', related: 'iris', founder: 'carlos' },
  'Reptile breeding (red-footed tortoises)': { doc: reptileBreeding, focal: 'ember', related: 'luna', founder: 'rf-dam' },
  'Shared ancestors (pedigree collapse)': { doc: sharedAncestors, focal: 'focal', related: 'cousin', founder: 'founder' },
  'Multiple-paternity clutch': { doc: multiplePaternityClutch, focal: 'egg-1', related: 'egg-2', founder: 'dam' },
  'Parthenogenetic line': { doc: parthenogenesis, focal: 'p2', related: 'p0', founder: 'p0' },
  'Self-fertilizing plant': { doc: selfing, focal: 'plant-b', related: 'plant-a', founder: 'plant-a' },
  'Cloning lineage': { doc: cloning, focal: 'clone-2', related: 'source', founder: 'source' },
  'Incomplete records': { doc: incomplete, focal: 'z', related: 'y', founder: 'm' },
  'Line breeding': { doc: lineBreeding, focal: 'opal', related: 'coral', founder: 'kingston' },
  'Half-siblings both ways': { doc: halfSiblings, focal: 'thistle', related: 'reed', founder: 'juniper' },
  'Six generations': { doc: deepLine, focal: 'dam-5', related: 'dam-2', founder: 'dam-0' },
  'Private ancestor (placeholder)': { doc: privateAncestor, focal: 'pebble', related: 'sage', founder: 'nettle' },
  'Synthetic population (8 × 24)': { doc: synthetic(8, 24), focal: 'g7-0', related: 'g7-3', founder: 'g4-0' },
} as const
export type DatasetName = keyof typeof DATASETS
