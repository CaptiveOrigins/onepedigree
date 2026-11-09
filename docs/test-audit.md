# Test audit

Each audit lists what this repo promises, the tests that prove it, and the gaps: those closed in the same pass and those left, with why. Audits run after each feature or fix, and at least every 14 days while the repo has commits. Newest first.

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
