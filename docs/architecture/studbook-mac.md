# Studbook in the Mac app: plan

The owner decided on 2026-11-10 that the studbook gets a Mac app counterpart ([decisions](decisions.md)). OnePedigree for Mac gets the studbook's two views, data model and exports, working on local files with no Captive Origins server. It's planned with Tier A/B and built after tour v3, alongside the platform's studbook work.

## What it reuses

The science is already in `@captiveorigins/onepedigree-studbook` and runs anywhere: numbering, kinship (MK, F, GD, FGE, founders, Known), the PMx writer and the shared types. The React package has `StudbookTable` and the pedigree views, with MULT, WILD and UNK placeholders. The Mac app needs no server code: the Payload endpoint's work moves into a pure function both use.

## The file

A studbook is one plain JSON file, `<name>.studbook.json`, holding the agreed `Studbook` shape:

- animals, with both IDs (Captive Origins ID and Animal ID);
- events and census;
- a holder list (code → name), because a local file's owner already knows the holders;
- the file's own settings.

It gets a JSON Schema and a page in the docs, so it's readable without the app ("their files stay theirs"). Saves are atomic, as for pedigree projects. The site's full export (for those who may export) writes the same file, so a studbook can move between the site and the app either way.

## Views

- **Project view:** the pedigree explorer with MULT, WILD and UNK placeholders, plus a genetics panel (GD, FGE, mean MK, founder representation, Known), each labelled pedigree-based.
- **Formal studbook view:** `StudbookTable`, with an animal's detail beside it (parents, events, old numbers) and editing: add an animal, set parents (a known parent, MULT candidates with probabilities, WILD or UNK, shared clutch keys), add events, and give or change numbers. Each change runs the same checks as the site.

On a local file the owner sees everything, so there are no private placeholders. A `private` flag in the file is kept and honoured in exports.

## Exports

- **JSON:** the file itself.
- **CSV:** one row per animal, with both IDs.
- **PMx `.ped`:** the existing writer.
- **PDF studbook report:** the cover with the currentness date, then the animal list. Shared with the site's report, which is Tier B Must 16.

Nothing leaves the Mac without a yes. Holder names and private animals go into an export only when the person ticks them in for that export, and both are off by default.

## Steps and rough days

| Step | Days |
| --- | --- |
| Pure `studbookView` and CSV writer shared by the Payload endpoint and the app; the file format with JSON Schema, parse and validate | 1 |
| App: new, open and save studbook files beside pedigree projects (atomic, recent files) | 0.5 |
| Formal view: table, detail and editing (animals, parents including MULT/WILD/UNK, events, numbering) with checks | 2 |
| Project view: explorer and genetics panel | 0.5 |
| Exports: JSON, CSV, PMx with the include-names choice; PDF report | 1.5 |
| Tests, test audit, docs, Gatekeeper notes, desktop release | 0.5–1 |
| **Tier A counterpart** | **about 6 to 6.5** |
| Tier B in the app: UI for date precision, all event types, death cause, reproductive status, PMx/SPARKS import, the validation list and the assumptions overlay. This is on top of Tier B's own science work | **about 3** |

## Order

After tour v3, with the platform's studbook build:
1. The shared pure layer, so the site and the app can't drift.
2. The app's file, views and exports.
3. A desktop release, which goes to the owner as a T item.
4. Tier B features land in the package, the site and the app together.
