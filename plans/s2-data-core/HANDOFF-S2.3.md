# S2.3 done, S2.4 handoff

**Branch:** `s2-s2`. S2.3 is committed and pushed. Working tree clean at handoff time.

**Verified green:** `pnpm verify` (format:check, typecheck, lint, boundaries, guards, test:node,
test:dom, vendor-names, disables, build) and `pnpm test:e2e` (15/15) — both run to completion via the
`pre-push` hook on the push itself.

---

## What S2.3 shipped, beyond the WIP commit this branch already had

The WIP commit (`cb7736b`) had `entries.add/update/remove`, validation, and the span rollup itself
already working. This session's work closed everything the step file's own §2/§3 still listed open:

- **`src/data/entry-store.mutation.test.ts`** (§2, 23 tests) — every case the step file lists: add/
  update/remove validation and their changeset shapes, loose-date resolution parity with construction,
  cascading remove, parentId cycle rejection (chain and self-parenting), auto-wrap (standalone vs. one
  transaction), derived-span init and its non-deriving-kind rejection, read-your-own-writes validation,
  the five rollup cases (single move, two-level tree, same-transaction-proposed, childless, `[]`
  opt-out), no-partial-commit on a mid-transaction validation failure, and removability with
  `identityExtender` injected explicitly.
- **Closed the construction-time-rollup gap** the previous handoff flagged as open: `new Dataset({
  entries })` now rolls up a deriving-kind entry's span once, at construction, so `{ id: 'p1', kind:
  'group' }` with children declared in the same initial array gets a real span immediately — `01` §2.6
  / D-S2-22's own words ("`fromJSON` … the span rollup runs on read") assume this is already true of
  plain construction, which is what made this belong here rather than S2.6. The fix is
  `data/transaction.ts`'s new `applyConstructionRollUp(data)`: computes `rollUpDerivedSpans` against
  the fresh snapshot with no proposed edits, and writes any correction straight into the store via
  `beginTransaction`/`endTransaction` — no `beforeChange`/`change` event, no history record, because
  construction emits nothing (`01` §2.6). It's the second call site inside `transaction.ts` itself, so
  `span-rollup-is-removable` (one importer, D-S2-23) still holds — no dependency-cruiser change needed.
  `DatasetState`'s constructor calls it once, right after `entries.bindTransactions(this)`.
- **Docs**: `plans/02` §2/§7 (the three new typed errors, `derivedSpanKinds`, `EntryInput.start`/`end`
  optional), `plans/01` §2.5 (`derivedSpanKinds` + the rollup's non-displaceability, closing OQ7),
  `plans/03` §S3 (deleted the engine's "parent/group rollup as a second pass" line — the engine moves
  children, `data/` rolls up parents on every commit, no second pass), `CONTEXT.md` (**Entry** gains
  "an id is identity, never editable"; **Kind** gains a `derivedSpanKinds` mention — **Rollup**/**Span
  rollup** entries themselves already existed, added in S2.2's own docs closure).
- `plans/s2-data-core/s2.3-mutation-api.md` §3's TODO list is now fully checked off.

## Next: S2.4 — live binding

Read `plans/s2-data-core/s2.4-live-binding.md` in full before starting. Short version: a
`subscribeToDatasetChanges(dataset, onChange)` file in `view/` (one importer,
`dataset-change-subscription-is-removable`), wired into `GanttShell`'s constructor so a committed
changeset pushes `dataset.entries.all` into the viewport and requests a frame — plus the frame
scheduler that coalesces N mutations in one tick into one render. This is the step the whole slice is
ordered around: everything before it is invisible, and from here on the harness shows the data core
working rather than just describing it. `plans/00` §4's slice gate (`[S2-A1]`) most likely lives here
or in S2.5 — check the gate condition against what `s2.4`/`s2.5`'s own step files claim before assuming
either.
