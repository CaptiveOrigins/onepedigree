# Invariants

The rules OnePedigree keeps, from its README and its tests. A rule without a passing test should be marked pending.

| # | Invariant |
| --- | --- |
| I1 | **Parentage lives on the individual.** Children and siblings are derived, never stored. |
| I2 | **Unknown stays unknown.** Roles are never inferred from sex. A missing parent or mode isn't guessed. Incomplete pedigrees are valid and produce notices, not errors. |
| I3 | **Bounded and cycle-safe.** Every traversal has depth and size limits and reports truncation. Cycles are rejected. |
| I4 | **Identity is not occurrence.** One individual may appear several times in a view, and every occurrence maps back to one identity. |
| I5 | **Source files aren't changed.** A GEDCOM stays as it is, and extras live in a companion file. |
| I6 | **Saves are atomic.** A crash leaves the old file or the new one. |

Mapping each rule to its named test is still to do.
