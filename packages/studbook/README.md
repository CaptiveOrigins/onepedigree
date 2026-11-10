# @captiveorigins/onepedigree-studbook

Studbook-style records and analysis for any managed population, built on OnePedigree. Early alpha: the calculations below are tested against textbook values, and nothing here has been checked against a real studbook or PMx run yet.

- Pedigree-based kinship and inbreeding, mean kinship (MK), gene diversity (GD), founder genome equivalents (FGE), founder representation and pedigree completeness ("Known"). Every number is pedigree-based: it assumes founders are unrelated unless the pedigree says otherwise.
- Parents known only as candidates with probabilities (studbook MULT) count by expectation. Unknown and wild parents (UNK, WILD) are unique unrelated founders, unless clutchmates share one (UNK1, WILD1).
- Studbook numbers kept as text: permanent numbers run 1, 2, 3… with no leading zeros or letters, temporary ones are T1, T2…, and no number is ever given twice. `nextStudbookNumber`, `renumber` (keeps every old number) and `checkStudbookNumbers` (duplicates, reuse, malformed numbers; gaps are a notice).

## Payload

`@captiveorigins/onepedigree-studbook/payload` adds `GET /<collection>/studbook/:studbook` to a Payload collection. Your app supplies the data and every access decision; the endpoint computes and redacts:

```ts
import { studbookEndpoint } from '@captiveorigins/onepedigree-studbook/payload'

endpoints: [studbookEndpoint({
  source: ({ studbook, req }) => loadStudbook(studbook, req),          // read as the request's user; null is a 404
  geneticsVisibleFor: ({ animal, req }) => isCoordinator(req) || ownsAnimal(req, animal),
  canExport: ({ req }) => isCoordinatorOrKeeper(req),
  holderLabel: (code, req) => holderNameFor(code, req),            // or "Private holder"
})]
```

- Private animals are counted in every number but come back as `{ private: true }`, and are never named as a parent, founder or holder.
- Parents come back as codes (a studbook number, Private, MULT, WILD or UNK), with a MULT parent's candidates and their probabilities in `mult`.
- MK, F and Known come back only where `geneticsVisibleFor` says yes. Population GD, FGE and founders come back only when the reader may see every animal's numbers, private animals included, since GD would otherwise give the hidden ones away.
- `?format=pmx` returns the PMx `.ped` file to those `canExport` allows, and 403 to everyone else.
- A callback that throws, or answers anything but `true`, counts as no.

`studbookNumberEndpoints({ source, numbers })` keeps studbook numbers in a collection of yours, one document per studbook and animal. `POST …/studbook/:studbook/numbers { animal, temporary?, number? }` gives a first number. `POST …/numbers/renumber { animal, to? }` moves an animal to a new number and keeps the old one; it's only offered when you name an `oldNumbersField`. Writes use the reader's own access, numbers held by animals they can't see are never reused, and if two people take the same number at once, the later write steps back.

Payload is an optional peer dependency; the main entry point doesn't use it.

Not affiliated with any zoo association or software vendor. "PMx" names the free analysis program whose input format this package will write.

## License

PolyForm Noncommercial 1.0.0. See LICENSE.
