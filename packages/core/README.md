# OnePedigree

A species-neutral pedigree framework for humans and other animals (and plants): a portable
data model, graph validation, bounded ancestry traversal, view projections, automatic
layout, server-renderable React components and a Payload CMS plugin.

> **Status: alpha.** The schema-version-1 contract is stable in intent; package APIs may
> still change before the first prerelease.

| Package | Purpose |
|---|---|
| `@captiveorigins/onepedigree-core` | Data model, normalization, validation, traversal, projections, layout, serialization. No React, Payload or database dependency. |
| `@captiveorigins/onepedigree-react` | Server-renderable SVG views (all 13), interactive explorer, headless hooks, CSS-variable styling. |
| `@captiveorigins/payload-plugin-onepedigree` | Payload plugin: managed, standard or mapped collections, cycle-safe serialized writes, deletion policies, permission-aware endpoints, Admin preview and color settings. |

## Principles

- **Parentage lives on the individual**: `parentage.parents[{ individual, role }]`,
  `reproductiveMode` (`sexual`, `parthenogenesis`, `self`, `asexual`, `cloning`, `other`)
  and `cohort`. Children and siblings are derived, never stored.
- **Unknown stays unknown.** Roles are never inferred from sex; a missing parent or mode is
  not guessed; incomplete pedigrees are valid (they produce notices, not errors).
- **Bounded and cycle-safe.** Every traversal has depth and size limits and reports
  truncation; cycles are rejected.
- **Identity vs occurrence.** One stored individual may appear several times in a view;
  occurrences always map back to the one identity.

## Quick start

```ts
import { getAncestors, indexPedigree, validatePedigree, type PedigreeDocument } from '@captiveorigins/onepedigree-core'

const pedigree: PedigreeDocument = {
  schemaVersion: 1,
  individuals: [
    { id: 'atlas', label: 'Atlas', sex: 'male' },
    { id: 'nova', label: 'Nova', sex: 'female' },
    {
      id: 'ember',
      label: 'Ember',
      parentage: {
        parents: [
          { individual: 'nova', role: 'mother' },
          { individual: 'atlas', role: 'father' },
        ],
        reproductiveMode: 'sexual',
      },
    },
  ],
}

const { valid, issues } = validatePedigree(pedigree)
const ancestors = getAncestors(indexPedigree(pedigree), 'ember', { maxGenerations: 4 })
```

Large datasets: implement `PedigreeRepository` (`getByIds`, `findChildrenOf`) and call
`loadNeighborhood()`; it loads a bounded neighborhood one query per generation.

## Views

`pedigree`, `fan`, `ahnentafel`, `descendants`, `hourglass`, `cohort`, `relationship`,
`timeline`, `inbreeding`, `population`, `compact`, `maternal`, `paternal`: each with a
projection (`projectPedigree`), a built-in deterministic layout (`layoutPedigree`; tree,
layered or radial, vertical or horizontal) and a React renderer. Custom layout engines (e.g.
ELK) plug in through `PedigreeLayoutEngine`.

For a list instead of a chart ("show all relatives"), `relativesByGeneration(projection)`
groups an hourglass projection's relatives by generation (parents, grandparents, …, siblings,
offspring, …); `generationKind()` gives hosts the kind and number of "great"s to translate, and
`generationLabel()` an English label.

## Heritable traits

Optional and separate from the pedigree document (schema 1 is unchanged): the host
supplies a trait catalog (`TraitDefinition`: recessive, incomplete dominant,
dominant, codominant, polygenic or unknown; allelic complexes via a shared `locus`;
Z- or X-linked) and per-individual `TraitRecord`s (visual, single, super, het,
possible het with a chance, non-carrier, unknown; with how it is known).

- `pairingOdds` — expected offspring per locus (super forms, complexes, sex-linked
  splits by offspring sex); unrecorded genes are assumed absent and reported as assumptions.
- `expectedNormalLookingRecord` — e.g. 66% possible het from two hets.
- `checkOffspring` — flags offspring the recorded parents can't produce (check parentage).
- `carrierFromOffspring` — carriers proven by a visual recessive offspring; suggestions
  only (`basis: 'inferred'`).
- `morphName` — "Super Pastel 66% possible het Pied" from the records.

Nothing is guessed: polygenic and unproven traits have no odds, and a sex-linked trait needs the sex.
In `@captiveorigins/onepedigree-react`, `traitOverlay` draws the usual genetic pedigree symbols
on every view, with `TraitLegend`.

## Development

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm build   # build also writes apps/playground/dist (gallery.html, index.html)
```

`apps/playground` shows every view for every fixture: `dist/gallery.html` (static, server-
rendered) and `dist/index.html` (interactive; serve the folder, e.g. `python3 -m http.server`).

## License

MIT
