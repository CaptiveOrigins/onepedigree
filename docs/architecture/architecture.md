# OnePedigree architecture

A species-neutral pedigree framework: a portable data model, validation, bounded traversal, view projections, layout, React views, a Payload plugin and a Mac app. It knows nothing about any species or application.

## Layers

```text
apps        desktop (Mac, Tauri)    playground
adapters    react                   payload
domain      core (model, validation, traversal, projections, layout, formats)
```

Dependencies only point downward. `core` has no runtime dependencies and no React, Payload or database dependency.

| Package | Purpose |
| --- | --- |
| `@captiveorigins/onepedigree-core` | Data model, normalization, validation, traversal, projections, layout, serialization |
| `@captiveorigins/onepedigree-react` | Server-renderable SVG views, explorer, headless hooks, CSS-variable styling |
| `@captiveorigins/payload-plugin-onepedigree` | Managed, standard or mapped collections, cycle-safe writes, deletion policies, permission-aware endpoints |
| `apps/desktop` | Opens GEDCOM, CSV and OnePedigree JSON. A GEDCOM is never changed; extras live in a companion file |

## Data flow

Parentage lives on the individual. Children and siblings are derived, never stored. Each parent link may say what kind it is (`biological`, `donor`, `surrogate`, `legal`, `adoptive`, `social`, or other text; none means biological; `biological` and `donor`, a gamete donor, are the genetic kinds). Views draw every kind, and can be limited with the projection's `parentLinks` option, but every calculation (relatedness, siblings, kinship and the studbook numbers, PMx and GEDCOM export) reads `biologicalParents(parentage)` and so follows biological links only (agreed with OneLineage, 2026-11-10). Each view is a projection, then a layout, then a renderer, and custom layout engines plug in through `PedigreeLayoutEngine`. Large datasets implement `PedigreeRepository`, which loads a bounded neighborhood one query per generation.

## In the suite

OnePedigree stands alone. Other [OneOrigin](https://github.com/CaptiveOrigins/onephylogeny/blob/main/docs/oneorigin/README.md) tools connect through optional packages and plain files, and OnePedigree never depends on them.
