# Test audit

Each audit lists what this repo promises, the tests that prove it, and the gaps: those closed in the same pass and those left, with why. Audits run after each feature or fix, and at least every 14 days while the repo has commits. Newest first.

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
