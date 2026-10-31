# OnePedigree

A species-neutral pedigree framework for humans and other animals (and plants): a portable
data model, graph validation, bounded ancestry traversal, view projections, automatic
layout, server-renderable React components and a Payload CMS plugin.

> **Status: alpha.** The schema-version-1 contract is stable in intent; package APIs may
> still change before the first prerelease.

| Package | Purpose |
|---|---|
| `@captiveorigins/onepedigree-core` | Data model, normalization, validation, traversal, projections, layout, serialization. No React, Payload or database dependency. |
| `@captiveorigins/onepedigree-react` | Server-renderable SVG views, headless hooks, interaction, styling hooks. *(in progress)* |
| `@captiveorigins/payload-plugin-onepedigree` | Payload plugin: fields, collections, hooks, endpoints, Admin components. *(in progress)* |

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

## Development

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm build
```

## License

MIT
