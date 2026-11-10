# Studbook: package and platform contract

`@captiveorigins/onepedigree-studbook` is the species-neutral studbook layer (owner, 2026-11-10; [decisions](decisions.md)). The platform turns it on inside Assurance Projects, where each project is one studbook. This page is the contract agreed with the platform (ops ledger crossing 79dd5597511c), from the professional requirements in the studbook research (ops `research/studbook-requirements.md`).

## Parent codes

| Studbook code | OnePedigree |
| --- | --- |
| A studbook ID | `parentage.parents[]` |
| MULT, MULTn | `uncertainParents[]` with `candidates` and probabilities |
| WILD | an uncertain slot with `kind: 'wild'` and no candidates |
| WILDn | the same, with a `shared` key across clutchmates |
| UNK | an uncertain slot with no candidates (`kind` `unknown` or absent) |
| UNKn | the same, with a `shared` key |

## Shapes the platform supplies

- **`StudbookAnimal`:**
  - `id` and `studbookNumber` (permanent, or `T…`), with `oldNumbers`;
  - both IDs, `coId` and `animalId`;
  - `sex`: female, male, unknown, abnormal or hermaphrodite;
  - `birthType`: wild, captive or unknown;
  - `birth` as a `StudbookDate`;
  - OnePedigree `parentage`;
  - `status`: alive, dead or lost-to-follow-up;
  - `selected`, and `private`. A private animal is counted in every analysis but drawn only as a placeholder.
- **`StudbookDate`:** a `yyyy-mm-dd` midpoint plus `precision` (exact, day, month, year, range, unknown). Analysis treats estimates as exact and says so.
- **`StudbookEvent`:**
  - the eight types: birth, capture, transfer, release, recapture, death, lost-to-follow-up, return-from-ltf;
  - the date;
  - `location` and `owner` as **opaque holder codes**, never names;
  - `localId`, `cause`, `notes`, and `sourceId` for traceability.
- **`CensusYear`:** yearly counts by sex and origin.

## Plugin options

- `source({ studbook, req })`: the platform's data for one studbook, read with the request's user (`overrideAccess: false`).
- `geneticsVisibleFor({ studbook, animal, req })`: the coordinator sees every animal's numbers, members their own (owner, 2026-11-10).
- `canExport({ studbook, req })`: the coordinator and the studbook keeper may export PMx and the full CSV.
- `holderLabel(code, req)`: a holder's name, or "Private holder". Names never appear in the analysis payload, and appear in PMx only for those who may export.
- `numbers: { collection, studbookField, animalField, numberField, oldNumbersField? }`: numbers are kept per (studbook, animal), never reused, with renumbering logged.

## Analysis

`kinshipAnalysis` (built) gives F, kinship, MK, GD, FGE, founder representation and Known, all labelled **pedigree-based**. The rules are in its source comment. `toPed` (built) writes PMx's primary input as a `.ped` file, following the PMx User Manual v1.0, pages 138–141:

- the analysis date and animal-count header lines;
- one record per animal (`ID; SireID; DamID; Sex; Selected; Dead; Birth Date; Death Date; Location; Local ID; Other ID`), with the keeper's Animal ID as a UDF so both IDs travel;
- MULT with `*SIRE`/`*DAM` probability lines; WILD, UNK, and shared `WLDn`/`UNKn` codes, which PMx inserts as one founder per clutch;
- `*MOVE` lines built from the event ledger, with PMx's estimate codes;
- sex codes 0–7, all fertile until reproductive status arrives (Tier B).

Not built: the census file. The manual names `exchcens.txt` but doesn't give its columns, so it waits until its layout can be confirmed. Numbering is built: `nextStudbookNumber`, `renumber` (old numbers kept, never reused) and `checkStudbookNumbers`. The studbook table is built in the React package (`StudbookTable`). The pedigree views draw MULT, WILD and UNK parents: the projection adds one placeholder per uncertain slot (`uncertain: true` on the occurrence, `data.uncertain` on a made-up individual), labelled "Possible mothers", "Wild father" or "Unknown mother", with visible candidates and their chances on the node, private candidates only counted, the unrecorded remainder, and "shared by clutchmates" for WILDn/UNKn. Placeholders are never followed further and never link anywhere. Candidates' own ancestry isn't drawn, and the Ahnentafel and fan numbering skip placeholders. The Payload endpoint is built: `studbookEndpoint` from `@captiveorigins/onepedigree-studbook/payload`, with the options above (`numbers` aside). Rows give parents as codes (a number, Private, MULT, WILD or UNK), and a MULT parent's candidates in `mult` with their probabilities: a private or unrecorded candidate is `{ private: true, probability }`, the same rule as for parents (agreed with the platform, 2026-11-10). The population summary appears only when the reader may see every animal's numbers, because GD is 1 − mean MK. The numbering endpoints are built: `studbookNumberEndpoints` with the `numbers` option gives `POST …/numbers` (first number: next permanent or T, or a given unused one) and `POST …/numbers/renumber` (only with `oldNumbersField`, so old numbers are kept and never given again). Writes run with the reader's access, and the animal must be in what `source` gives them. Taken numbers are read with full access, so a hidden animal's number is never reused. If two people take the same number at once, the later write steps back. Next, wherever the main payload plugin serves `uncertainParents` to the pedigree views, dropping candidates the reader can't see, as it does for known parents.
