# @captiveorigins/onepedigree-studbook

Studbook-style records and analysis for any managed population, built on OnePedigree. Early alpha: the calculations below are tested against textbook values, and nothing here has been checked against a real studbook or PMx run yet.

- Pedigree-based kinship and inbreeding, mean kinship (MK), gene diversity (GD), founder genome equivalents (FGE), founder representation and pedigree completeness ("Known"). Every number is pedigree-based: it assumes founders are unrelated unless the pedigree says otherwise.
- Parents known only as candidates with probabilities (studbook MULT) count by expectation. Unknown and wild parents (UNK, WILD) are unique unrelated founders, unless clutchmates share one (UNK1, WILD1).
- Studbook numbers kept as text: permanent numbers run 1, 2, 3… with no leading zeros or letters, temporary ones are T1, T2…, and no number is ever given twice. `nextStudbookNumber`, `renumber` (keeps every old number) and `checkStudbookNumbers` (duplicates, reuse, malformed numbers; gaps are a notice).

Not affiliated with any zoo association or software vendor. "PMx" names the free analysis program whose input format this package will write.

## License

PolyForm Noncommercial 1.0.0. See LICENSE.
