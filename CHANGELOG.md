# Changelog

## Unreleased

- **Parent kinds:** a parent link can carry an optional `kind`: `biological`, `donor` (a gamete donor), `surrogate`, `legal`, `adoptive`, `social` or any other text. No kind means biological, as before, and documents without kinds are unchanged byte for byte. Only genetic links (none, `biological` or `donor`) are used for relatedness and genetics: siblings, relationship paths, common and repeated ancestors, reproductive structure, kinship, F, MK, GD, FGE, founders, the studbook table's sire and dam, PMx and GEDCOM export. All of them go through one helper, `biologicalParents(parentage)`, so a foster dam, a surrogate or a legal father never changes a number. Validation adds a notice for two biological links in one of the single roles (two biological fathers); a biological and a legal link to the same parent is the existing duplicate-parent error, now saying which. Views take a new projection option, `parentLinks: 'both' | 'biological' | 'recorded'` (default `'both'`, which looks exactly as before when no kind is recorded): `'biological'` draws the genetic pedigree, and `'recorded'` draws the parents of record, where a non-biological link replaces the biological one in the same role. React draws non-biological links as large round dots with the kind on the line, and says the kind in the connector's and the parent's spoken name ("Saffron, social mother of Pip"). The explorer can offer the three modes in its toolbar (`onParentLinksChange`). The Payload plugin stores the kind in a new optional `kind` select on each parents row (empty means biological; extend it with the `kinds` option, or map `kindField`), the Mother/Father pickers edit only biological rows, and a hidden parent on a kind-bearing link is redacted as before, keeping its role and kind. Asked for by OneLineage (agreed 2026-11-10).
- **Uncertain parents as alternative branches (opt-in):** a new projection option, `uncertainParents: 'placeholder' | 'branches'`, default `'placeholder'`, so nothing changes unless asked. With `'branches'`, each candidate parent the reader can see is drawn as its own parent node, side by side, on a long-dashed connector labelled with its chance ("70%"), and links like any individual. Private candidates are one placeholder ("1 private, 20%"), and the unrecorded share another ("other, 5%", or "wild" when recorded as wild). A slot with no visible candidates, and a WILD or UNK shared by clutchmates, look as before. Candidates' own parents aren't drawn. Each candidate's spoken name gives its role, chance and basis ("Sire one, possible father, 70%, multi-sire mating"). Display only: kinship and every other calculation are unchanged. Asked for by OneLineage.
- **Where uncertain parents come from:** an uncertain parent slot can carry an optional `basis`, a few words on where its candidates and chances came from ("multi-sire mating", "parentage test 2026-03"). It's kept, shown after the slot's candidates in the pedigree views and their spoken names, and never used in a calculation. Documents without it are unchanged. Asked for by OneLineage (agreed 2026-11-10).
- **Desktop, saving:** a file at `<name>.companion.json` that isn't a OnePedigree companion is never replaced. Opening the GEDCOM says it's there, and saving refuses and offers to keep your extras in another companion file beside the GEDCOM, which opens them back. A failed save also removes its temporary file, or says it couldn't.
- **React, `StudbookTable`, accessibility:** the MK and F sort buttons' accessible names now include the text shown on them ("Sort by MK (Mean kinship)"), so voice control can use what's on screen (WCAG 2.5.3, label in name).

## 0.1.0-alpha.21

Replaces 0.1.0-alpha.20 before the studbook package's first publish, which will be this version. Core, React and the Payload plugin are unchanged apart from tests.

- **Studbook endpoint, privacy fix:** the population summary (GD, FGE, founders) was given to a member when the only animals they couldn't see were private ones. With their own MK and the summary, they could work out a private animal's MK. `geneticsVisibleFor` is now asked about private animals too, and the summary appears only if it says yes for every animal. Private rows stay placeholders either way. Found by the 2026-11-10 test audit.

## 0.1.0-alpha.20

The first release with these changes. The `v0.1.0-alpha.19` tag's Release run failed before staging, so 0.1.0-alpha.19 was never published. The studbook package didn't typecheck before core was built. It now reads core's source for typecheck and tests, and CI runs in the Release workflow's order.

- **Pedigree views draw MULT, WILD and UNK parents:** the projection adds one placeholder per uncertain parent slot (`uncertain: true` on the occurrence). It's labelled "Possible mothers", "Wild father" or "Unknown mother" and lists the visible candidates with their chances. Private candidates are only counted. A WILD1 shared by clutchmates is one placeholder and says so. Placeholders are never followed further, and React never links them. They have a long-dashed border and an italic label, and their candidates are in the spoken name. Documents without uncertain parents project exactly as before.
- **React, `StudbookTable`:** the studbook as an accessible table, with both IDs and old numbers on every row. It searches by any number or ID, has a living-only filter, and sorts by number, birth, MK or F (unknowns last, with `aria-sort`). Private animals are placeholders that never match a search, and MK and F appear only where given, with a note that they're pedigree-based.
- **Studbook package (still unpublished):**
  - numbering: `nextStudbookNumber`, `renumber` and `checkStudbookNumbers`. Numbers are text; permanent ones run 1, 2, 3 and T numbers are temporary. A number is never given twice, and old numbers are kept.
  - `@captiveorigins/onepedigree-studbook/payload`:
    - `studbookEndpoint` serves `GET /studbook/:studbook`, plus `?format=pmx` for those allowed to export. Private animals are counted but never named. Genetics appear only where `geneticsVisibleFor` allows, and the population summary only for readers who may see every animal's numbers. MULT candidates are listed per row.
    - `studbookNumberEndpoints` gives and changes numbers with the reader's own access. Numbers held by hidden animals are never reused, and two people numbering at once can't get the same number. Payload is an optional peer dependency.
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
