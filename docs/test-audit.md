# Test audit

Each audit lists what this repo promises, the tests that prove it, and the gaps: those closed in the same pass and those left, with why. Audits run after each feature or fix, and at least every 14 days while the repo has commits. Newest first.

## 2026-11-11: OneOrigin brand source

Owner decision N105 (2026-11-11): "A: send it, accept guidelines (Recommended)". Tests went from 281 to 282: Mac app 15 to 16 (`apps/desktop/test/theme.test.ts`). The rest are unchanged.

- **Promises:** `brand/oneorigin/` matches `brand/oneorigin.lock` byte for byte, and CI fails on a hand edit; `apps/desktop/src/oneorigin.css` is what `build` writes from the copy's tokens; the app's shell colors are the suite's tokens; nothing that was drawn changes color.
- **Covered:** `node scripts/oneorigin.mjs check` in CI (11 files and the built CSS). `theme.test.ts` (1 new): `--bg`, `--panel`, `--text`, `--muted`, `--border`, `--accent` and `--focus` in `app.css` equal the built `--op-` tokens in light, system dark and a chosen Dark. The script itself is tested in OnePhylogeny, where it comes from (`scripts/oneorigin.test.mjs`, 19 tests: build output, lock and check passing, a hand edit failing, the warning paths); this repo carries the same file.
- **Gaps left:** the built CSS hasn't been looked at in the running app. The check downloads the locked files from OnePhylogeny's main branch to see whether the source differs; that only warns, and until OnePhylogeny's PR lands it warns that the files aren't there yet.
- **Left out as overkill:** repeating the script's tests here; they'd test the same file.

## 2026-11-11: focus ring colour

Owner decision N154 (2026-11-11, option A): "keep the brand orange everywhere else, but use the darker orange #a65f20 for focus rings on light backgrounds (4.6 to 1 or better). Dark mode keeps the lighter orange, which already passes." Tests went from 277 to 281: react 55 to 57 (`themes.test.tsx`), desktop 13 to 15 (`apps/desktop/test/theme.test.ts`, new). Core, studbook and payload are unchanged.

- **Promises:** `brand/README.md`, "Focus ring": light focus rings are `#a65f20` and pass 3:1 on every light background (WCAG 2.2 1.4.11, 2.4.13); dark rings stay `#e7a066`; the brand orange stays for everything else.
- **Before and after (focus colour on the background it sits on):** light, toolbar and quick-view buttons: `#cf8137` 3.07:1 on the white card, now `#a65f20` 4.91:1. Light, a focused person in the chart: the default theme's selection colour `#f0b35a`, 1.86:1 on the white card, now 4.91:1 (4.83:1 on Terracotta's `#fffdfa`; 3.55:1 on Midnight's `#161a22` when the system is light). Light, studbook controls: the `#2563eb` fallback, 5.17:1 on white, now 4.91:1, in the family's colour. Light, Mac app controls: the browser default, now 4.91:1 on the page and fields, 4.62:1 on the panel (`#f7f8fa`). Dark, unchanged: `#e7a066` 7.98:1 on the dark card (`#161a22`), 8.37:1 on the app page, 7.82:1 on the panel, 7.11:1 on fields.
- **Covered:** `themes.test.tsx` (2 new): the stylesheet's light `--op-focus` is `#a65f20` and dark `#e7a066`; the light ring passes 3:1 on every light preset's card, and both rings pass on Midnight; every `:focus-visible` outline or stroke uses `var(--op-focus)`, and no fixed `#cf8137` is left. `apps/desktop/test/theme.test.ts` (2 new): `--focus` is `#a65f20` in light with the accent still `#cf8137`, `#e7a066` in both dark blocks, 3:1 or better on page, panel and fields in each; a chosen appearance sets `--op-focus`; app controls use `var(--focus)`.
- **Gaps left:** not looked at in the built app or a browser; the ratios are computed from the CSS. An explicit light preset on a dark system (a host passing `theme="classic"` while the system is dark) gets the dark ring, `#e7a066`, on a white card: 2.18:1, up from 1.86:1 before. The Mac app avoids it by choosing Midnight in dark and setting `--op-focus` for a chosen appearance; a theme token for focus would fix it for every host, and is a bigger change to the theme format.
- **Left out as overkill:** a rendered test per focusable control. They share the rules the test reads.

## 2026-11-11: a recorded parent who is also a candidate

- **Promise (asked for by OneLineage):** in the `both` view, a man recorded as the legal father who is also a DNA candidate reads as one person, not two.
- **Covered** (`packages/react/test/uncertain.test.tsx`, 2 tests): it already held. Both occurrences carry the same `data-individual`, are marked repeated (the repeat marker and "repeated" in the spoken name), and selecting him selects both. No code change was needed.

## 2026-11-11: parent kinds

The optional `kind` on a parent link and the `parentLinks` projection option. Tests went from 236 to 275: core 86 to 109, react 46 to 53, studbook 45 to 49, payload 46 to 51. Desktop is unchanged (13).

- **Promises:** documents without kinds normalize, validate, project and render exactly as before; no kind means biological; every calculation follows biological links only, through `biologicalParents`; two biological links in a single role are a notice, and a biological plus a non-biological link to one parent is the existing duplicate-parent error; views draw non-biological links dotted, labelled and spoken by kind, in three modes; a hidden parent on a kind-bearing link is redacted as before.
- **Covered** (`packages/core/test/parent-kinds.test.ts`, 23 tests): exact serialized output for a document without kinds, and null or empty kinds giving the same; kinds kept, non-text refused with its path; the JSON Schema entry; the helper (every built-in kind, an unknown one, null, and the same array back when nothing is filtered); siblings, relationship paths, common and repeated ancestors identical with every link marked biological, and identical for the foster-dam fixture and the same document without the foster link; reproductive structure and GEDCOM export ignore the foster link; validation: the foster-dam fixture is clean, the new notice and where it doesn't fire (legal beside biological, generic roles), the duplicate-parent message, a legal father beside or among an uncertain father slot, a cohort with a foster dam, a cycle through a legal link; views: all three modes identical to the default across twelve views without kinds, the `kind` on edges and layout, `biological` and `recorded` membership, the inbreeding and relationship views following biological links in every mode, Ahnentafel numbering and its notice, link wording. (`packages/studbook/test/parent-kinds.test.ts`, 4 tests): F and MK unchanged without kinds (Opal's F = 1/16) and with every link marked biological; the foster link changes no F, kinship, MK, GD, FGE or founder number; PMx writes only biological sire and dam; studbook rows and genetics match the document without the foster link. (`packages/react/test/parent-kinds.test.tsx`, 7 tests): byte-identical markup in every mode without kinds; one dotted connector with its visible kind label and its own dash pattern; the spoken text on the connector and the parent node; the three modes; the explorer's focusable node, quick view and mode chooser, which only shows when asked for. (`packages/payload/test/parent-kinds.test.ts`, 5 tests, real Payload on in-memory MongoDB): the kind is stored; a hidden legal father is `{ private: true }` with role and kind in plain REST reads, an anonymous placeholder on a legal edge in the pedigree endpoint and private in the relatives endpoint, with its ID nowhere; the Father picker shows and replaces the biological father and keeps the legal row.
- **Gaps left:** not looked at in a browser: whether the round dots read well on real layouts and themes, and where the kind label sits on crowded connectors. No VoiceOver run. `hiddenRecords: 'omit'` with a kind-bearing hidden parent isn't tested separately: it drops the row by the same code path the existing omit tests cover. GraphQL reads of the new `kind` field aren't tested. CSV and GEDCOM import don't read kinds (GEDCOM's adopted and foster families are still kept as data), and GEDCOM export writes biological families only. `validateParentageChange` and the payload write checks treat a kind-bearing link like any other for cycles and duplicates, by design; core genetics (`checkOffspring`, `carrierFromOffspring`) take the parents a caller gives it, so a caller must pass biological ones; nothing in this repo calls them with pedigree parents yet.

## 2026-11-11: uncertain parents as alternative branches

The opt-in `uncertainParents: 'branches'` projection option. Tests went from 220 to 236: core 77 to 86, react 40 to 46, studbook 44 to 45. Payload and desktop are unchanged.

- **Promises:** the default draws exactly as before; visible candidates become real, linkable parent occurrences on dashed, labelled connectors; private candidates are only counted, never named, linked or drawn; the remainder is one placeholder; slots without visible candidates and shared WILD/UNK keys look as by default; candidates' ancestry isn't followed; spoken names give role, chance and basis; nothing is calculated from it.
- **Covered** (`packages/core/test/uncertain-views.test.ts`, 9 tests): the default and `'placeholder'` give identical projections across seven views with no new fields; 2 visible + 1 private + remainder gives two candidate occurrences, a private placeholder ("1 private, 25%") and a remainder ("other, 5%"), with uncertain edges whose chances add to 1; the private candidate appears nowhere the view adds; a candidate who is also a known ancestor is still expanded there, in separate and merge modes, and its own parents aren't drawn as a candidate; a slot of only private or missing candidates and a shared WILD1 project identically in both modes; maternal and paternal lines keep their role; layout carries the marks only in branches mode; candidate wording; the document is unchanged after projecting. (`packages/react/test/uncertain.test.tsx`, 6 tests): byte-identical default markup; four dashed connectors marked `data-uncertain` and `data-branch` with "70%", "5%", "20%", "5%" labels; candidates link and placeholders and the private candidate never do; spoken names for candidates and both placeholders; only-private slot unchanged; the explorer's quick view for a candidate. (`packages/studbook/test/kinship.test.ts`, 1 test): kinship, F, MK, GD, FGE and founders are identical after projecting in either mode, and the document is unchanged. Kinship shares no code path with the projection, so this guards against a projection that changes its input.
- **Gaps left:** not looked at in a browser, so how the branches and their labels sit on real layouts, and whether labels overlap in crowded generations, is unchecked. The fan chart gives candidates segments but has no connectors, so its chances are only in spoken names; the Ahnentafel ignores uncertain parents in both modes. No VoiceOver run. No contrast measurement of the label colour beyond reusing the sublabel colour.

## 2026-11-11: basis on uncertain parents

- **Promise:** `basis` is display only, optional, and changes nothing for documents without it.
- **Covered** (`packages/core/test/uncertain-views.test.ts`, 2 tests): kept by the normalizer, carried to the placeholder and its sublabel; absent when not recorded.
- **Gaps left:** the JSON Schema entry is covered by code reading only.

## 2026-11-11: foreign companion files and temporary-file cleanup in the desktop app

Closes the two desktop gaps left by the full audit of 2026-11-10. Desktop tests went from 5 to 13, the repo from 210 to 218. The packages are unchanged.

- **Fixed: a file at `<family>.companion.json` that isn't a companion was replaced on the next save.** Before writing a companion, the app now reads what's there; anything that isn't valid JSON in the companion format, or can't be read, counts as foreign and is never overwritten. Opening the GEDCOM warns about it (a non-JSON file there used to make opening fail). Saving refuses with `ForeignCompanionError`, says why in the status line (now a `role="status"` region), and asks whether to keep the extras in another companion file. That file must sit beside the GEDCOM, because a companion names its GEDCOM by file name only, and opening it brings the extras back. A chosen file that isn't a companion, the GEDCOM itself included, is refused the same way. Tests (`files.test.ts`, 6): non-companion JSON and non-JSON are left byte for byte, a foreign file that appears after opening is still refused, saving elsewhere keeps the foreign file and reopens the extras, a chosen GEDCOM or other folder is refused, and a companion the app wrote is still replaced.
- **Fixed: a failed rename left `<file>.tmp`.** A failed write or rename now removes the temporary file and reports the original error unchanged, as the OnePhylogeny CLI store has done since 2026-11-09. If removing fails too, the error says so and names the file, with the original as its `cause`. The capabilities grant `fs:allow-remove` (`files.test.ts`, 2 tests).
- **Gaps left:** Tauri's file calls and dialogs are mocked. The "Choose a file…" prompt in `App.tsx` isn't tested, since the app has no component tests; it's a thin wrapper over the tested `saveProject`. A real save in a built app, and how VoiceOver reads the status line, need a check by hand.

## 2026-11-10: screen-reader review of the studbook table and uncertain-parent placeholders

A code-level review (K212), not a run with a screen reader.

- **Fixed:** the MK and F sort buttons showed "MK" and "F" but were named "Sort by Mean kinship" and "Sort by Inbreeding", so voice control couldn't use the visible words (WCAG 2.5.3). Names now include both. `studbook.test.tsx` checks that every sort button's name contains its visible text.
- **Checked and fine:** the table has a caption and a labelled, focusable scroll region; the search has a label and a hint; sort state is on the header (`aria-sort`); dashes carry visually hidden words ("Not shown to you", "None recorded"); private rows say what they are; the count is a status. Placeholders carry their candidates and chances in their names; they're never links; in the explorer they can be selected to read them, by design (#21), and offer nothing to open.
- **Gaps left:** no VoiceOver or NVDA run yet, and no automated contrast check of the dashed placeholder border. The count announces on every keystroke, which some may find chatty; left as is until someone uses it.

## 2026-11-10: full audit

Scope: every package and the desktop app, against the README, the invariants (I1 to I7), `studbook.md`, `decisions.md` and the dated audits below. No coverage output exists in the repo, so this maps promises to tests by reading them. Tests went from 206 to 210: studbook 42 to 44, desktop 3 to 5. Core (75), react (40) and payload (46) are unchanged.

### Fixed in this pass

- **The studbook endpoint gave a member the population summary when the only animals they couldn't see were private ones.** `seesAll` was worked out over non-private animals only, so a member whose own animal was the only public one got GD, FGE and the founders. GD is 1 − mean MK, so with their own MK they could work out the private animal's MK. That breaks the owner's rule of 2026-11-10 (a member sees their own animal's numbers only). `geneticsVisibleFor` is now asked about private animals too, and the summary appears only if every answer is yes. Private rows stay `{ private: true }` either way, and the coordinator still gets the summary. Test: `payload.test.ts`, "gives no population summary when the only animals a member can't see are private ones". It failed before the fix (`size: 2, meanKinship: 0.25` came back). The studbook package is unpublished, so no released version has this bug.

### Covered

- **Invariants I1 to I7** each name passing tests in [scientific-invariants.md](architecture/scientific-invariants.md).
- **Private parents and hidden records in the Payload plugin:** plain REST, GraphQL and Local API reads, writes that keep or refuse a private parent, the loop check that can't reveal a private animal, private offspring and cohort members left out of lists and counts, and `hiddenRecords: 'omit'` (`private-parents.test.ts`, `private-parents-omit.test.ts`, `mapped.test.ts`). Uncertain parents are never served by the main plugin (`uncertain-parents.test.ts`).
- **Who sees genetics and exports in the studbook:** private animals counted but never named (as a row, parent, MULT candidate, founder or holder), 404 alike for no access and no studbook, genetics per `geneticsVisibleFor`, the summary only for readers who may see every animal's numbers, PMx only for `canExport`, and any callback that throws or answers anything but `true` counted as no (`studbook/test/payload.test.ts`).
- **Numbering:** hidden animals' numbers never reused or named, 403 and 404 refusals, and the race (`payload-numbers.test.ts`).
- **The studbook table:** a private animal is a placeholder, never matches a search, and stays in the count (`react/test/studbook.test.tsx`).
- **Files that must not be lost or changed:** a GEDCOM is never changed (I5), saves are atomic and a failed write leaves the old file (I6), and a changed GEDCOM is noticed (`apps/desktop/test/files.test.ts`, Tauri mocked).

### Gaps added (with the tests)

- **The population-summary leak above** (`studbook/test/payload.test.ts`, 1 test).
- **A PMx request for a studbook the platform gives nothing for** gets 404 and no file, even from someone allowed to export (`studbook/test/payload.test.ts`, 1 test).
- **Desktop: a JSON project keeps every animal, parent and display setting through a save and reopen.** Nothing tested the round trip before (`files.test.ts`).
- **Desktop: an imported spreadsheet is never saved over.** The project has no path, so saving asks where, and cancelling writes nothing (`files.test.ts`).

### Gaps left

- **A file named `<family>.companion.json` that isn't a companion is replaced on the next save.** The app treats it as missing and starts a fresh companion. The name makes a clash unlikely, but refusing or renaming instead is a behaviour change for the lead, not an audit.
- **A failed rename leaves `<file>.tmp` beside the chosen file** (desktop). The old file is safe and the error is shown. Minor.
- **If `holderLabel` throws, the studbook request fails** with a server error instead of leaving the holder out. Nothing leaks, so this fails closed, but the whole page is lost. Worth deciding with the platform.
- Still open from earlier audits: the Admin pickers with a private parent haven't been seen in a browser; `/versions` reads aren't covered; a simultaneous renumber race isn't tested on its own; the studbook endpoints haven't run inside the platform; the `.ped` file hasn't been loaded into PMx; and there's been no full keyboard and screen-reader audit of the React package.
- The desktop app's dialogs and file calls are mocked. Saving on a real disk is only checked by hand.

### Left out as overkill

- Payload's own internals, such as relationship validation and admin rendering.
- How good a layout looks, which the playground gallery checks by eye.
- The playground app, which is a demo.

## 2026-11-10: uncertain parents stay out of the main plugin

- **Promise:** MULT candidates name other animals, and only the studbook endpoint serves them, with private candidates counted but never named. The main plugin has no step that would drop candidates a reader can't see.
- **Covered now:** `packages/payload/test/uncertain-parents.test.ts` shows the main plugin's mapping leaves stored `uncertainParents` and their candidates out, with parent arrays and with role fields. It passed on the current code: no fix was needed.
- **Gap kept:** if the main plugin ever serves uncertain parents, it needs candidate redaction and real-Payload tests for it. This test has to change in the same PR.

## 2026-11-10: studbook numbering endpoints

`packages/studbook/test/payload-numbers.test.ts` (6 tests) runs on a real Payload with an in-memory MongoDB and made-up animals:

- the next permanent number, a T number, a given unused number, and the next after it;
- **hidden animals:** a number held by an animal the reader can't see is never given, and the response doesn't name that animal;
- **refusals:** a reader without write access to the number collection gets 403; anonymous readers, private animals and unknown animals get 404; a malformed number gets 400; a taken number, or an animal already numbered, gets 409;
- renumbering confirms a T number, keeps old numbers, refuses an old or taken number, notes a changed permanent number, and refuses a reader without update access;
- **race:** two animals numbered at the same moment get different numbers, and no number ends up on two animals;
- no renumber endpoint without `oldNumbersField`.

Gaps left: a simultaneous renumber race isn't tested separately (it uses the same check as numbering). Not run inside the platform yet; its wiring gets its tests there.

## 2026-11-10: studbook endpoint for Payload

`packages/studbook/test/payload.test.ts` (9 tests) calls the endpoint handler with a stand-in request; it reads no database, because the platform's `source` does that:

- **privacy:** a private animal is counted (population size) but appears only as `{ private: true }`. Its number, IDs, its use as a parent ("Private") and as a founder (counted, unnamed), and its holder code are all absent from the response;
- **refusals:** 404 alike for a reader the platform gives nothing, an anonymous reader and a studbook that doesn't exist;
- **genetics:** the coordinator sees every animal's MK, F and Known plus the population summary; a member sees only their own animal and no summary;
- **fails closed:** `geneticsVisibleFor` or `canExport` that throws, or answers a truthy non-`true`, is a no;
- **rows:** both IDs, parent codes (number, MULT, WILD, UNK for a parent with no record), holders only through `holderLabel` (per reader, left out without it), studbook order;
- **MULT candidates:** listed with probabilities; private and unrecorded candidates counted, never numbered (added in a follow-up PR, 1 test);
- **PMx:** the coordinator gets the `.ped` file with holder names and an attachment name; a member and an anonymous reader get 403;
- 400 for an unknown format, 422 for a pedigree the analysis refuses.

Gaps left: not run inside a real Payload app yet. The platform's wiring (`source` reading with `overrideAccess: false`) gets its tests there. The numbering endpoints aren't built.

## 2026-11-10: uncertain parents in the views

`packages/core/test/uncertain-views.test.ts` (6 tests) and `packages/react/test/uncertain.test.tsx` (3 tests):

- one placeholder per uncertain slot, linked to the child by role, never followed further, and candidates are listed on it, not drawn as parents (I7);
- visible candidates with their chances, private candidates only counted (the placeholder names nothing private), and the unrecorded remainder;
- a shared WILD1 is one placeholder identity for clutchmates and says so; maternal and paternal lines keep only their role;
- documents without uncertain parents project exactly as before; placeholders lay out like any node; a placeholder never takes a real individual's ID;
- React: drawn by kind (`data-uncertain`), candidates in the spoken name, and **never linked**, in the static view or the explorer (with a control showing a real animal still links).

Gaps left: the payload plugin doesn't store or serve `uncertainParents` yet. When its studbook module does, it must drop candidates the reader can't see, with a test, as for known parents. Fan and Ahnentafel numbering ignore placeholders by design. Left out as overkill: candidates' own ancestry, which isn't drawn.

## 2026-11-10: studbook table

`packages/react/test/studbook.test.tsx` (6 tests) covers what the table promises:

- both IDs and old numbers on every row (decision 2026-11-09);
- search by studbook number, old number, CO ID or Animal ID;
- **privacy:** a private animal is a placeholder with no number, ID or name in the markup, never matches a search (by its number, CO ID or Animal ID), and stays in the count whether or not "living only" is on, so the filter doesn't reveal its status;
- MK and F shown only where given, "Not shown to you" elsewhere, the pedigree-based note, and no genetics columns at all when nothing is given;
- sorting by number (permanent, then T), mean kinship and birth, unknowns last, with `aria-sort`;
- opening an animal from its number; the labelled scroll region and caption.

Gaps left: no screen-reader pass yet (the same accessibility gap as the rest of the React package). Who may see genetics or private animals is decided by the payload plugin, and gets its tests there.

## 2026-11-10: studbook numbers

`packages/studbook/test/numbers.test.ts` (12 tests) covers each numbering rule in docs/architecture/studbook.md:

- format: permanent numbers are digits with no leading zero; temporary are T and digits (both checked with bad cases);
- the next number continues past every number ever used, old ones included, compares as numbers, and counts permanent and temporary apart;
- renumbering keeps the old number, takes a given unused number (a regional book using the international one), and refuses a used, retired or malformed number without changing the animal;
- changing a permanent number gives a notice, and that number is never given again;
- a whole-book check finds malformed, duplicate and reused numbers, and reports gaps only as a notice.

Gaps left: storing numbers per (studbook, animal) and logging who renumbered belong to the payload plugin, and get their tests there. Left out as overkill: permanent numbers above 2^53, which the gap check skips.

## 2026-11-10: PMx export

`packages/studbook/test/pmx.test.ts` (7 tests) checks the writer against the PMx manual's format:

- the header lines and studbook order;
- known parents, sex codes, flags, dates and both IDs;
- a MULT sire with `*SIRE` lines;
- a shared clutch father;
- `*MOVE` lines through birth, transfer and death, and an open stay closed as alive;
- holder names only through `holderLabel`, and refusal of `;` and `:` and of role-less parents;
- estimate codes.

Gap: not yet loaded into PMx itself, which runs on Windows and isn't available here.

## 2026-11-10: studbook kinship

`packages/studbook/test/kinship.test.ts` (7 tests) checks the maths against textbook values:

- inbreeding from full-sib (0.25), half-sib (0.125), parent-offspring (0.25) and first-cousin (0.0625) matings;
- gene diversity 1 − 1/(2N) and FGE N for N unrelated founders;
- mean kinship including self;
- a MULT parent by expectation, with the unknown remainder;
- a shared unknown parent making clutchmates related;
- founder shares and the unknown share summing to 1;
- refusal of more than two parents, cycles and an unknown population member.

Gap: not yet compared with a real PMx run on the same data, which needs PMx and a real studbook. The kinship matrix is n² in memory, which is fine for thousands of animals and noted for larger ones.

## 2026-11-10: uncertain parents

`core.test.ts` ("uncertain parents", 5 tests) covers what the field promises:

- **Candidates and probabilities are kept**, and documents without them are unchanged.
- **An explicit unknown and an unknown remainder are valid.**
- **Candidates are never counted as parents.**
- **Each inconsistency is refused**, with its own code.
- **Malformed input is refused when reading.**

Gap: CSV and GEDCOM can't carry candidates yet, and no test claims they do.

## 2026-11-09: identifiers beside names

**New tests:** the name and identifier format, and its fallbacks when one is missing, normalization, and node width (`views.test.ts`); the visible and spoken name, and no identifier on a placeholder even when the source data has one (`render.test.tsx`); and in Payload, the identifier per requester (the keeper sees their studbook number, others the registry ID), the private parent's ID absent for readers who can't see it and present for its owner, and relatives carrying identifiers (`private-parents.test.ts`, identifiers beside names).

## 2026-11-09: tree shapes for the demo tour

The demo will show line breeding, a backcross, half-siblings and several generations, and a private ancestor. These were rendered in every view and checked by eye in the light and dark themes (headless Chrome screenshots of the playground gallery).

- **Covered:** each shape is in the layout test (no overlapping nodes, deterministic positions, every view and orientation). The backcross was already there (`reptileBreeding`).
- **Fixed in this pass:** a private placeholder's label was cut off. **New:** a test that it's sized for its text (`views.test.ts`), and that it's marked `data-private` and drawn as "Private record" (`render.test.tsx`). Both failed before.
- **New:** the plugin never writes parent terms or the pedigree settings (`private-parents.test.ts`, parent terms and settings). The brief reported an overwritten maternal label; the cause was the host's seed.
- **Left by eye only:** how good a layout looks can't be tested by a rule. The gallery is the check.

## 2026-11-09: saving past a private parent with filterOptions (alpha.17)

alpha.16's tests saved a record with a kept private parent, but their parent fields had no `filterOptions`. On a host with the multi-tenant plugin they do, and Payload then validates each parent with the editor's access, so the save was refused. The setups in `private-parents.test.ts` and `mapped.test.ts` now put `filterOptions` on every parent field, as that plugin does. 4 tests failed without the fix: saving what you read, an empty picker or missing row, changing another parent, and the dam/sire save.

**New:** `filterOptions` still apply to every parent the plugin didn't keep (still applies the field's own filterOptions …), and a parent the editor can't read is still refused when it's new to the record (REST writes check readability …).

## 2026-11-09: private parents in plain reads (alpha.16)

A hosted site found that a plain REST read of a public animal returned its private mother's ID, to anyone. The audit of 2026-11-08 covered the pedigree endpoints but not the collection's own reads, and its write tests all used the Local API with `overrideAccess: false`. That hid a second bug: REST, GraphQL and the Admin leave `overrideAccess` unset, and the plugin counted that as trusted, so the readability and loop checks never ran there.

### Covered now (`packages/payload/test/private-parents.test.ts` unless named)

| Promise | Test |
| --- | --- |
| **New:** a private parent's ID never appears in a plain read, for anonymous readers or an unrelated member: REST single at depth 0 and 1, REST list at depth 2 through a populated parent, Local API with access control | REST, single …; REST, list …; an unrelated signed-in member …; Local API with access control |
| **New:** the same over GraphQL, where the parent is `null` | GraphQL: the private parent is null … (it passed before the fix too: Payload's resolver already returned null) |
| **New:** the private parent's owner and admins still see it; trusted server reads are unchanged | the private parent's owner and admins see it; trusted server reads … |
| **New:** saving what you read, an empty picker or a missing row keeps the private parent; other parents can still change | keeps the private parent when the keeper saves what they read …; treats an empty Mother picker …; lets the keeper change the parents they can see … |
| **New:** replacing a private parent is refused | refuses replacing the private parent with another |
| **New:** REST updates and creates refuse a parent the editor can't read; the owner may | REST writes check readability … |
| **New:** the same with role fields (dam/sire) | `mapped.test.ts`: plain reads give a placeholder for a private dam or sire … |
| **New:** with `hiddenRecords: 'omit'` the parent is left out, and saving keeps it | `private-parents-omit.test.ts` |

11 of these failed before the fix. The pedigree endpoints' own tests still pass: they read stored IDs internally and draw their own placeholders.

### Gaps left

- **The Admin UI itself** (how the edit form shows a `{ private: true }` value in the Mother/Father pickers) hasn't been seen in a browser. The tests send what the Admin sends: the document as read, back as the update. It needs a look on a test site.
- **Versions and drafts** (`/versions` reads) aren't covered: the plugin's collections don't enable versions, and a host that does should check them.

## 2026-11-08: first audit

Scope: every package and the desktop app, with the Payload plugin's access rules first. Coverage numbers weren't collected; this maps promises to tests by reading them.

### Where the promises are

- Invariants I1 to I6 in [scientific-invariants.md](architecture/scientific-invariants.md). This audit added the test for each.
- The Payload plugin's security rules (spec §42.4), listed below.

### Payload plugin: access and data (always covered)

| Promise | Test (`packages/payload/test/mapped.test.ts`, security) |
| --- | --- |
| A private animal is "not found" to the public, in the pedigree and in relatives | denies a private animal to the public |
| A private parent of a public animal shows as an anonymous placeholder: no ID, name or link | discloses nothing about a private parent |
| Private offspring and cohort members don't show in lists or counts | does not reveal private offspring or cohort members |
| Traversal depth and size are capped, whatever the request asks | bounds excessive traversal requests |
| Users without update access can't edit, or use the validate endpoint | refuses edits by users without update access |
| An unreadable parent is refused with the same message as a missing one | rejects a parent the editor cannot read |
| **New:** that stays true even when the private parent would make a loop | answers the same for a private parent as for one that does not exist |
| **New:** a related animal the reader can't see is ignored in the relationship view | ignores a related animal the reader may not see |
| A recorded parent can't be deleted (restrict policy), or is detached cleanly (detach policy) | refuses to delete a recorded parent; `managed.test.ts` detaches references |
| Two concurrent edits can't together form a loop | commits at most one of two concurrent edits |

### Fixed in this pass

- **The loop check revealed private records.** It ran with full access over every proposed parent, including ones the editor can't read. An editor could propose a private animal as a parent and learn from "this parent already descends from the individual" that the animal exists and descends from theirs. A made-up ID gave only "does not exist or you cannot access it". Loops are now checked only among parents the editor can read. The others are already refused as unresolved, so a loop still can't be saved. The test failed before the fix.
- **The desktop app had no tests.** Tests now show that saving a GEDCOM project writes only its companion file and leaves the GEDCOM unchanged (I5), that saves are atomic (I6), and that the app warns when a GEDCOM changed since its companion was saved. The Tauri file calls are mocked.

### Gaps left

- **Accessibility of the React package.** Rendering, themes, the explorer and spoken names (alpha.13) are tested, but there has been no full keyboard and screen-reader audit. That's a separate job.

### Left out as overkill

- Payload's own internals, such as relationship validation and admin rendering.
- The playground app, which is a demo.
