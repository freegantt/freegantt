# Brief E: a full data replace keeps the view

Read `common-rules.md` (same folder) first. Slice name for your progress file: `e-replace-keeps-view`.

## Target

- `src/data/entry-store.ts` (`entries.load()`), `src/data/entry-batch.ts` (`entries.syncAll()`)
- `src/view/collapse-state.ts`, `src/view/gantt-shell.ts`, the scroll axis and time scale models
- tests: a DOM test under `test/dom/` or `src/view/`, and one e2e spec on a harness page (`browser-tests` skill)

## Change

See handoff item E. The consumer replaces all entries at once: after an approval, when it switches schedules, when it compares versions.

1. Write tests first (`tdd` skill). Each test mounts a Gantt, sets a scroll position, a zoom, and collapses one group. Then it replaces every entry. Then it checks all three.
2. Cover both replace doors: `entries.load()` and `entries.syncAll()`.
3. Cover one case where the replace removes the collapsed group and one where the group survives. A removed row's collapse state has no meaning. Record what the library does, and say whether that is correct.
4. If a test fails, use the `diagnosing-bugs` skill. Fix it in `src/` if the fix changes no public API. If the fix needs a public API change, `ask` first.
5. Add one e2e spec that proves the same on a harness page.

## Constraints

- Do not add a "preserve view" option. The view must survive by default.

## Ownership

You own new tests and any fix in `src/data/` or `src/view/`. Do not edit `src/layout/decoration*.ts` or `src/render/dom/decorations.ts` (worker A owns them). Do not edit `plans/`, except your progress file.

## Observable acceptance

- Tests pass for both doors and all three view states.
- If you fixed a bug: a `CHANGELOG.md` line in the fix commit.
- `worker_done` states plainly: "already true" or "was broken, fixed in <sha>".
