# @captiveorigins/onepedigree-react

Server-renderable SVG pedigree views for React, built on
[`@captiveorigins/onepedigree-core`](../core).

```tsx
import { layoutPedigree, projectPedigree } from '@captiveorigins/onepedigree-core'
import { PedigreeExplorer, PedigreeView } from '@captiveorigins/onepedigree-react'
import '@captiveorigins/onepedigree-react/styles.css'

// Static (server component, no client JavaScript; nodes are ordinary links):
export async function AnimalPedigree({ document, focalId }) {
  const projection = projectPedigree(document, { focalId, view: 'pedigree', ancestorDepth: 4, maxNodes: 500 })
  const layout = await layoutPedigree(projection, { orientation: 'vertical' })
  return <PedigreeView projection={projection} layout={layout} getIndividualHref={(a) => `/animals/${a.id}`} />
}

// Interactive (client): pan, zoom, fit, selection, highlighting, keyboard, quick view, SVG/print export.
<PedigreeExplorer projection={projection} layout={layout} height="32rem" />
```

## Views

All 13 views of the core: `pedigree`, `fan`, `ahnentafel`, `descendants`, `hourglass`,
`cohort`, `relationship`, `timeline`, `inbreeding`, `population`, `compact`, `maternal`,
`paternal`. Repeated individuals follow the projection's `merge`, `separate` or `hybrid` mode;
selecting one occurrence highlights every occurrence of that individual.

## Rearranging by drag

In views where order is a choice (descendants, hourglass, cohort, population, relationship), people can drag a node sideways to reorder it among its siblings. Ancestor charts keep the father/mother convention. A node only moves within its own drawn groups (a clutch or litter frame) and among individuals with the same parents, so frames and family lines stay truthful. The data never changes: the order is a layout option you keep (and may save).

```tsx
const [nodeOrder, setNodeOrder] = useState<string[]>([])
const layout = useMemo(() => layoutSync(projection, { nodeOrder }), [projection, nodeOrder])

<PedigreeExplorer projection={projection} layout={layout} nodeOrder={nodeOrder} onNodeOrderChange={setNodeOrder} />
```

`dropNodeOrder(layout, occurrenceId, delta, current, groupOf)` is exported for custom UIs.

## Studbook table

`StudbookTable` lists a studbook: studbook number (with any old numbers), Captive Origins ID and the keeper's Animal ID on every row, then sex, birth, origin, parents, status and holder. People can search by any of those numbers or IDs, show only living animals, and sort by studbook number, birth, mean kinship or inbreeding. Animals with no value for the sorted column go last.

The table shows what it's given, so visibility is decided before it: pass a private animal with `private: true` and it appears as a placeholder that never matches a search, pass holder names already resolved, and pass `genetics` only where the reader may see it. MK and F columns appear only when some row has them, with a note that they're pedigree-based. Labels can be replaced through `labels`.

```tsx
<StudbookTable rows={rows} caption="Redfoot tortoise assurance studbook" currentness="Current to 1 Nov 2026" onSelect={open} />
```

## Themes and colors

Seven presets, each with its own per-view accents (e.g. warm maternal and cool paternal
lines, distinct highlights for the relationship and inbreeding views, fan ring shading):
`classic`, `midnight`, `forest`, `ocean`, `terracotta`, `high-contrast`, `print`.

```tsx
<PedigreeView projection={projection} layout={layout} theme="forest" />
<PedigreeExplorer projection={projection} layout={layout} theme="ocean" themeEditor onThemeChange={save} />
```

`themeEditor` adds a Colors button: choose a preset and adjust any color with a color picker
or hex code, for all views or only the current one, with a warning when text contrast drops
below WCAG AA. `onThemeChange` receives the edited theme (a plain object) to store; pass it
back as `theme`. `ThemeEditor` is also exported for use in your own settings pages. Themes are
rendered as inline custom properties, so they work in server rendering.

## Brand family

OnePedigree and OneTaxonomy share a backbone (`brand/README.md`): the same line icons (`Icon`, `ICON_PATHS`), 32 px controls, a floating canvas toolbar and a Captive Origins orange focus ring, while each keeps its own views and character.

## Styling

- Default stylesheet `styles.css` (optional; leave it out for unstyled mode).
- CSS custom properties: `--op-node-background`, `--op-node-border`, `--op-connector`,
  `--op-selected-ring`, `--op-highlight`, `--op-focal-border`, `--op-label`, …
- Stable classes (`.op-root`, `.op-node`, `.op-individual`, `.op-connector`, `.op-junction`,
  `.op-cohort`, `.op-fan-segment`) and data attributes (`data-individual`, `data-occurrence`,
  `data-repeated`, `data-generation`, `data-cohort`, `data-reproductive-mode`, `data-sex`,
  `data-focal`, `data-selected`, `data-highlighted`).
- `classNames` overrides, and render slots `renderIndividual`, `renderCohortMarker`,
  `renderQuickView`.
- Headless: `@captiveorigins/onepedigree-react/headless` (hooks `usePedigreeProjection`,
  `usePedigreeLayout`, `usePedigreeSelection`, `usePedigreeNavigation`,
  `useOccurrenceHighlighting`, and `describeProjection`) for your own renderer.

## Accessibility

Semantic SVG with `<title>`/`<desc>` summaries, accessible names per node, keyboard
navigation (arrows between nodes, Enter to select, Escape to clear, +/−/0 to zoom, Shift+arrows
to pan), visible focus, reduced-motion support, and non-color cues: junction shapes (circle =
two-parent mode, diamond = single-parent mode, square = variable; hollow = incomplete), line
patterns per reproductive mode, and a ↻ marker plus dashed border on repeated individuals.
Parents known only as candidates, wild or unknown (studbook MULT, WILD, UNK) are drawn as
placeholders with long-dashed borders and italic labels that say which ("Possible mothers", "Wild
father"), list the candidates with their chances in the node and its spoken name, and never link anywhere.

## License

[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0). Free for noncommercial use, with attribution; commercial use needs a separate license from Captive Origins. Versions published before this change remain under MIT.
