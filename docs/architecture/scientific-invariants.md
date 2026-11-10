# Invariants

The rules OnePedigree keeps, from its README and its tests. A rule without a passing test should be marked pending.

| # | Invariant | Test |
| --- | --- | --- |
| I1 | **Parentage lives on the individual.** Children and siblings are derived, never stored. | `core.test.ts` (siblings derived: full, partial, unresolved; cohorts separate) |
| I2 | **Unknown stays unknown.** Roles are never inferred from sex. A missing parent or mode isn't guessed. Incomplete pedigrees are valid and produce notices, not errors. | `core.test.ts` (keeps unknown modes and roles unknown; incomplete parentage is a notice); `views.test.ts` (maternal and paternal follow roles, not sex) |
| I3 | **Bounded and cycle-safe.** Every traversal has depth and size limits and reports truncation. Cycles are rejected. | `core.test.ts` (cycles, bounds, large and deep graphs); `mapped.test.ts` (bounds traversal requests, concurrent edits can't form a cycle) |
| I4 | **Identity is not occurrence.** One individual may appear several times in a view, and every occurrence maps back to one identity. | `views.test.ts` (separate, merge and hybrid keep one identity) |
| I5 | **Source files aren't changed.** A GEDCOM stays as it is, and extras live in a companion file. | `csv.test.ts` (extras on top of a GEDCOM without changing it); desktop `files.test.ts` (saves only the companion) |
| I6 | **Saves are atomic.** A crash leaves the old file or the new one. | desktop `files.test.ts` (temporary file then rename; a failed write leaves the old file) |

| I7 | **A candidate is never a parent.** A parent known only as candidates with probabilities (a studbook's MULT), or explicitly unknown (UNK), is kept in `uncertainParents`. It is never counted, traversed or used for siblings or cycles as a parent, and its probabilities sum to at most 1. | `core.test.ts` (uncertain parents: kept, never counted, refused when inconsistent) |

Access rules for the Payload plugin are listed in the [test audit](../test-audit.md).
