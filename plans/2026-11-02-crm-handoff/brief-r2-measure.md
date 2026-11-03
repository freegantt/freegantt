# Brief R2: measure hover and bulk edit on the 10k fixture

Read `common-rules.md` (same folder) first. Slice name for your progress file: `r2-measure`.

## Target

- `pnpm measure:scale` and the script it runs (find it from `package.json`)
- `harness/large-dataset.ts`, `harness/large-dataset.html` (read; change only if a measurement needs a hook, and the Stop rule applies)
- `plans/s6-scale-and-sync/README.md` § R2 only
- Read: issue #95 (`gh issue view 95`), S6 README § R1 and § R2

## Change

S6 row R2 needs three measurements on the 10,000-entry fixture: scroll, hover, bulk edit in one transaction. Scroll is done. Add the other two.

1. **Hover:** time from a pointer move onto a bar to the frame that paints the hover state. Report p50, p95, max over at least 50 hovers. Run unthrottled and at 4x CPU slowdown.
2. **Bulk edit:** one `transaction()` that changes at least 1,000 entries (shift dates). Report the transaction time and the longest frame after it. Run unthrottled and at 4x CPU slowdown.
3. Add both to `measure:scale`. It stays a measurement, never a gate: it asserts nothing, and `verify` does not call it.
4. Wait on locators or `expect.poll`. Never use `page.waitForTimeout()`.
5. Record the readings in S6 README § R2 in the same table shape as the scroll reading: date, commit, machine note, run id.
6. If a reading shows clear jank (frames over 32 ms unthrottled), find the cause with a trace. Report it in `worker_done`. Do not fix it in this brief.

## Constraints

- Do not tick R2. Do not set a budget (S6 Q1 is still open).
- Do not edit S6 README §5.4 or `plans/03-slices.md` (worker G owns them).

## Ownership

You own the measure script, the S6 README § R2 text, and any harness hook you add.

## Observable acceptance

- `pnpm measure:scale` prints hover and bulk-edit numbers.
- S6 README § R2 holds the readings.
- `worker_done` quotes the numbers.
