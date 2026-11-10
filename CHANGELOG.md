# Changelog

## Unreleased

- **Studbook PMx export:** `toPed(studbook)` writes PMx's primary input `.ped` file to the manual's format (v1.0, pp. 138–141): MULT probability lines, WILD, UNK and shared clutch codes, `*MOVE` lines from events, both IDs, and holder codes unless `holderLabel` names them. IDs PMx can't read are refused. The census file isn't written yet, because its layout couldn't be confirmed. The contract's studbook types are in the package too.
- **New package, `@captiveorigins/onepedigree-studbook` (unreleased; its first publish is by hand):** `kinshipAnalysis` gives pedigree-based kinship, inbreeding, mean kinship, gene diversity, founder genome equivalents, founder representation and pedigree completeness, following PMx's definitions. MULT parents count by expectation, unknown and wild parents are unique founders unless shared by clutchmates, and every result is labelled pedigree-based. It's tested against textbook values. The platform contract is in `docs/architecture/studbook.md`.
- **Uncertain parents (studbook MULT and UNK):** `Parentage.uncertainParents` holds parent slots known only as candidates with probabilities, or explicitly unknown (no candidates). The rest of a probability up to 1 is an unrecorded individual. Candidates are never parents (invariant I7). Validation refuses probabilities outside (0, 1] or summing above 1, duplicate candidates, the child itself, a recorded parent, a missing individual, a descendant, and a role recorded both as known and as uncertain. The JSON Schema includes the field, and documents without it are unchanged. Each slot also says what its unknown part is: `kind: 'wild'` (WILD, a wild-caught founder) or `'unknown'` (UNK). A `shared` key marks one unknown parent shared by clutchmates (WILD1, UNK1). WILD mixed with UNK on one animal is a notice. This matches the studbook research's parent codes, which map onto it one to one: a studbook ID is a parent, MULTn is candidates, WILD/WILDn and UNK/UNKn are kinds with optional shared keys. CSV and GEDCOM can't carry candidates yet: they're left out on export. First step of the studbook package (owner, 2026-11-10; `docs/architecture/decisions.md`).

## 0.1.0-alpha.18

- **Identifiers beside names:** a host identifier, such as a registry ID, can show after each name: "Mead (CO-AQCR6T)". Core has `Individual.identifier`, `PedigreeAdapter.getIdentifier` and `nameWithIdentifier`, and the default layout sizes nodes for the longer name. React shows it in every view, list, quick view and spoken name, with the format set by `Terminology.identifierFormat`. In Payload, `fields.identifier` is a path or a function of the requester (so each person can choose, say, a studbook number), and relatives and cohort members carry `identifier`. A private placeholder never has one.
- **Core, fixes a cut-off label:** a private placeholder was sized for its internal ID, so its "Private record" text was cut to "Private reco…" in the pedigree, Ahnentafel, compact, inbreeding and population views, including in the layouts the Payload endpoint returns. The default layout now sizes it for that text. A host that translates it can pass `nodeWidthFor`.
- **React:** a private placeholder has `data-private` and its own look (a dotted border and an italic, muted label) in both themes, so it never reads as a real individual.
- **Fixtures** for the tree shapes a demo needs: line breeding (an ancestor at two depths), half-siblings both ways, six generations and a private ancestor. They're in the layout tests (no overlaps in any view or orientation) and the playground gallery, and were checked by eye in the light and dark themes.
- **Payload, test:** the plugin never writes parent terms or the pedigree settings; it only reads them.

## 0.1.0-alpha.17

- **Payload, lets keepers save past a private parent:** where a parent field has `filterOptions` (the multi-tenant plugin adds them to every relationship to a tenant collection), Payload's own validation looks each parent up with the editor's access. So an editor whose record has a parent private to them couldn't save it at all, not even a rename, even though alpha.16 kept that parent. The plugin now wraps its parent fields' validation (rows, Mother/Father pickers, or mapped role fields): a stored parent it kept for that record passes; every other value goes through the field's own validation, `filterOptions` included. Found on a hosted site. The new tests reproduce it with `filterOptions` on the parent fields, and 4 failed before the fix.

## 0.1.0-alpha.16

**Hosts on 0.1.0-alpha.15 or earlier should upgrade.** Both bugs below let a site reveal or attach private records: plain reads exposed a private parent's ID, and writes through REST, GraphQL or the Admin skipped the checks on parents the editor can't read.

- **Payload, fixes a leak:** plain collection reads returned the ID of a parent the reader can't read. A public animal read anonymously over REST, at depth 0 or 1, listed its private mother's ID, although reading the mother gave "not found". The pedigree endpoints already hid it. Now, on every read through access control (REST, GraphQL, the Admin, the Local API with `overrideAccess: false`; single or list; any depth), such a parent comes back as `{ "private": true }` (`hiddenRecords: 'placeholder'`) or is left out (`'omit'`). GraphQL returns `null` for it, as it already did. This includes the Mother/Father pickers.
- **Payload, keeps hidden parents on save:** an editor who sees a placeholder can save the record without erasing the private parent. A placeholder, an empty picker or a missing row counts as "unchanged". Replacing the private parent with another one is refused, with a message saying it is private to them.
- **Payload, fixes a check that never ran over REST:** REST, GraphQL and the Admin leave `overrideAccess` unset, and the plugin counted that as trusted. So writes through them skipped the "does not exist or you cannot access it" check, and the private-safe loop check fixed in alpha.14, which only ever took effect through the Local API. Only an explicit `overrideAccess: true` is trusted now.
- Tests: plain reads and writes for anonymous readers, an unrelated member, the keeper, the owner and an admin, over real REST requests (with sign-in), GraphQL and the Local API, in standard-fields, mapped and `omit` setups. 11 of them failed before the fix. Not tested on a hosted site.

## 0.1.0-alpha.15

The same changes as 0.1.0-alpha.14, which was tagged but never staged: its release run failed because a new desktop test needed core built first.

## 0.1.0-alpha.14 (not published)

- **Payload, fixes a leak:** the loop check ran with full access over every proposed parent, including ones the editor can't read. Proposing a private animal as a parent could reveal that it exists and descends from the animal being edited. Loops are now checked only among parents the editor can read; others are already refused as "does not exist or you cannot access it", so a loop still can't be saved. Tested with made-up animals.
- Tests: a related animal the reader can't see is ignored in the relationship view; the desktop app saves only a GEDCOM's companion file and saves atomically. First test audit in `docs/test-audit.md`, and each invariant now names its tests.

## 0.1.0-alpha.13

- React: each node's spoken name says its sex in words ("male", "female" or "sex unknown") instead of the host's raw value, which a screen reader read as a letter or skipped. Other host labels are spoken as written. The visible ♂/♀ is unchanged. New `Terminology` keys `male`, `female` and `sexUnknown` translate the words, and `sexWord` is exported. The Explorer quick view uses the same words.

## Mac app 0.3.0

- Mac app: saves are now atomic, so a crash can't leave a half-written project file.
- Mac app: uses the OneOrigin suite accent color.
- Mac app: error messages now say what to do next.
- Core: compiles without Node types, so it can't pick up Node-only code by accident.
- Documentation: architecture, invariants and this changelog. Names the OneOrigin suite.

## 0.1.0-alpha.12

- License: PolyForm Noncommercial 1.0.0. Earlier versions remain under MIT.
