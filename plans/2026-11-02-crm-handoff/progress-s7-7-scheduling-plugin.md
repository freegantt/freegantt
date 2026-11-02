f0e34c50 | C6 seam: `ctx.edits.writeRowsWithEdit` (widened from removal-only cleaner) | done | none
0349c9a6 | scheduling() plugin, tests, CHANGELOG, API report | done | none
(next) | Scheduling harness page, e2e, bundle rows | done | verify:full, draft PR
TODO (item 4, pending owner ruling on I4): the default "link wins over the user date" (floor path). Core's I4 assert in `build-commit-change-set.ts` blocks an extender from rewriting a body-proposed Field. Today `editedDate` has one value, `userDateWins`: the proposal stays and a `blocked-move` diagnostic marks the link. The start floor row is stored already. When the owner rules, add `dependencyWins`: drop the Entry from `proposed`, keep its floor, let the engine place it, and make it the default.
