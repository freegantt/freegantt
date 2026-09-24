# #517 — `entries.sync()`: make a live Dataset match a full list, and record one undo step

**Reported:** 2026-09-23. **Status:** grill closed 2026-09-23, no code. Labels: `needs grill`, `api change`.
Split out of [#496](https://github.com/freegantt/freegantt/issues/496) (`load`). Plan for `load`:
[496-order-tolerant-bulk-write.md](../closed/496-order-tolerant-bulk-write.md).

## Why this is planned now

`load` and `sync` do the same write — "make the entries match this list" — with different history
and state rules. The owner ran this grill before `load` is built, so `load`'s shared functions fit
sync with no rework.

| | `load` (#496) | `sync` (#517) |
|---|---|---|
| History | clears | records one undo step |
| Per-entry state (selection, collapse, plugin store rows) | reset | kept for a kept id |
| Diff | none: remove all, add all | by id: add, remove, field edits |
| Commit when nothing changed | yes, History must clear | no, nothing fires |
| Origin | `'load'` | `'sync'` |
| List order | applied, not undoable (History clears) | applied, undoable (S2, S12) |

**Shared functions, built with `load`:** read the list, check the batch (no duplicate id, known
parents, no loop), put `entries.all` in list order, and refuse an open transaction.
**Sync adds:** the diff. It writes the order Field (S12).

## Owner rulings (grill, 2026-09-23)

- **Undo: record.** A server refresh records one undo step, and it covers only the rows that
  changed. A consumer who wants no undo calls `load`. This reverses the #517 comment that said sync
  skips undo.
- **S1 — Match the list. Closed.** An entry not in the list is removed. A key a kept entry omits is
  cleared. Contract: after `sync(list)`, the data equals `load(list)`. Only undo and per-entry
  state differ.
- **S2 — Sync applies the list's order, and the reorder is undoable. Closed.** It needs an order
  record (S12: the order Field).
- **S3 — Ingest rules, the same as `load`. Closed.** A broken tree throws. A `'never'` lock does
  not refuse it. A derived parent cell re-rolls. No `EditExtender` cascade runs. `beforeChange` can
  refuse it.
- **S4 — Origin `'sync'`. Closed.** History records it like `'user'`. Plugins read it on
  `ctx.events.on('change')`, the same as `'load'`. No separate event name.
- **S5 — A local edit the server has not seen. Closed: last write wins.** Undo of the sync brings
  the local edit back. Conflict detection is the withdrawn `apply` door (D-S2-11), out of scope.
- **S6 — A kept entry keeps its selection, collapse state and plugin store rows. Closed.** A
  removed entry loses them. An undo restores its store rows.
- **S7 — The name is `sync`. Closed.** Call site: `dataset.entries.sync(serverRows)`.
- **S8 — Stays separate from #419. Closed.** Sync records undo, so it does not need #419's skip
  rule.
- **S9 — Refuse inside `dataset.transaction()`. Closed.** The same typed error as `load`.
- **S10 — A sync with no changes commits nothing. Closed.** No `change` fires, no undo step. This
  is the common poll, so it costs nothing.
- **S11 — A sync with changes erases Redo, like a user edit. Closed.**
- **S13 — Frequent syncs fill the undo history. Closed: accept and document.** History keeps 100
  steps. The consumer raises the capacity, or uses `load`. #419 may add a skip rule later.
- **Undo notification (owner question):** already works. An undo fires `change` with
  `origin: 'undo'` and the exact rows it reverted.
- **Partial update: filed for later as [#527](https://github.com/freegantt/freegantt/issues/527)**
  (owner ruling, after the gaps below). See "Out of scope".

- **S12 — What records the list order. Closed: (b), an order Field** (owner, 2026-09-23). The
  authored order Field from D-S4-31, an ordinary Field on each entry. A reorder is ordinary field
  edits, so undo, `change`, plugins and the sync diff need no new code. WBS reads it and never holds
  it: WBS also encodes the parent (a second source for `parentId`), a custom `code` such as `ENG-01`
  holds no position, and WBS is an optional plugin. The server's intended order arrives as the
  list's own order. A consumer whose server stores WBS codes sorts by them before `sync` (W8 ships
  the comparator). Rejected: (a), a snapshot row of all ids in the ChangeSet.

## Round 3 — the order Field. Closed (owner, 2026-09-23, all on the recommendation)

- **O1 — The library writes it, from list position.** The list order stays the one way to author
  order (W3, the constructor). A consumer with a sort column sorts the list before the call. A
  future move verb, such as drag-to-reorder, writes the Field too.
- **O2 — An integer index among siblings.** A move rewrites at most one sibling group, and one undo
  step reverts it. No fractional keys.
- **O3 — The name is `siblingIndex`.** `order` and `sort` collide with the Gantt's view sort
  (D-S4-28). `position` is used 13 times in `CONTEXT.md` for pixels and WBS.
- **O4 — `toInput()` does not carry it.** The exported list is already in order. A carried number
  would suggest that editing it moves the entry.
- **O5 — Its own issue: [#528](https://github.com/freegantt/freegantt/issues/528).** Build order: `load` (#496),
  then the order Field (#528), then `sync` (#517).
  `load`'s list-ordering function is written so the order Field can store its result.

## #528 grill — the order Field in detail. Closed (owner, 2026-09-23)

O1 changes a little: list position sets `siblingIndex` at ingest, and `update()` moves an entry
after that. The Field is the one source of truth.

- **Q1 — `editable: 'anywhere'`.** Drag can reorder. `'api'` stops drag and keeps code writes.
  `'never'` stops all reorders. This needs [#529](https://github.com/freegantt/freegantt/issues/529):
  `'api'` allows no gesture, for any Field.
- **Q2 — A core Field**, next to `parentId` in `CORE_FIELDS`.
- **Q3 — Every write that changes a sibling group renumbers it** in the same transaction.
- **Q4 — In a `load` or `sync` list, list position wins.** A warning reports the dropped value.
- **Q5 — An index out of range throws** a typed error.

Full rulings: [#528](https://github.com/freegantt/freegantt/issues/528).

## Facts found

- The Gantt redraws from row 0 on any ChangeSet with no field rows
  (`src/layout/frame-layout.ts:276`). An order row needs no new redraw code.
- Undo of a removed entry restores its old index today (`#removedAtIndex`,
  `src/data/entry-store.ts:160`). A kept entry has no order record.

## Out of scope

- **Partial update** ([#527](https://github.com/freegantt/freegantt/issues/527)). The consumer can already write a delta with
  `add`/`update`/`remove` inside one `transaction()`. Two gaps: `add()` still needs a new parent
  before its new child, and `update()` refuses a locked field and runs cascades, which a server
  write should not do.
- **Skip undo.** That is #419.
- **Conflict detection.** That is `apply` (D-S2-11).

## Plan (2026-09-23)

**Base:** `origin/main` (d9073e67), plus #533 PR 1 and #528, which land first. Step 0 rebases onto
them and confirms the #528 facts that are listed under "Depends on".

### Decisions

**D1. Sync builds its ChangeSet the way `load` does, and hands it to `commitChangeSet`.** (Rewritten
after #528, see Amendments R1 — #528 already folds `toEntries`, `assertEntryBatchIsSound`,
`checkHierarchyAnswers` and the list-position `siblingIndex` write into one `readEntryBatch` call.)
- Sync reads the list into a *target batch*, through the same shared path `load` uses (step 3's
  `#readBatch`): one `readEntryBatch` call, then `rollUpFreshBatch`.
- It then writes the Rollup rows onto the target.
- The target is the state `load(list)` leaves. So the S1 contract holds by construction.
- `changesToMatchBatch` (D12) diffs the committed rows against the target. The result is added, removed and
  updated rows. `pluginStores.pendingRows(removedIds)` adds the store rows. `commitChangeSet(runner, cs)`
  commits them with `origin: 'sync'`.
- Why: `commitChangeSet` runs no extension hook, no lock rule and no Rollup (`transaction.ts:200-207`).
  That behaviour is S3 already. Undo, redo and `replay` already apply and invert its rows. Nothing
  widens `update()`, and `buildCommitChangeSet` does not change.
- Rejected: stage through `runTransaction`. `buildCommitChangeSet` always calls the hook
  (`build-commit-change-set.ts:142`). Skipping the hook needs an origin branch in the commit path. Also, its
  Rollup reads pending edits, so the result could differ from `load`'s Rollup over the full batch.
- Rejected: remove and re-add each changed id. That loses selection, collapse and store rows (S6).

**D2. "A Field changed" means `registry.valuesEqual(key, from, to)` is false.** This is the D-S2-7 rule
that every commit uses (`change-set.ts:32`).
- Dates: `Instant` is a number (`model/time.ts:4`), and `start`/`end` compare by reference
  (`core-fields.ts:8`). Ingest turns an input into epoch ms in the Dataset's zone. So the same input
  gives the same number, and a zone never makes a false row.
- `compute` Fields (`duration`, `hierarchyParentId`, a consumer's own) are skipped. They hold no
  stored value.
- A rolled-up parent cell compares the *target* value, after the Rollup. So a server value on a
  parent never makes a row by itself.
- ⚠️ A Field whose value is an object or an array needs its own `equals`. `Object.is` sees a fresh
  server object as changed on every poll. Document this. Rejected: a deep-equal rule for sync only,
  because one Field would then have two equality rules.
- ⚠️ Passenger keys (undeclared keys in a nested `props`, `entry-reader.ts:98-104`) have no Field, so
  they get no row (ADR 0011). Sync does not rewrite them, and `update()` does not either. The contract
  covers declared Fields and the tree.

**D3. A cleared key** gives the row `{ from, to: undefined }`. `applyFieldRow` → `writeOntoEntry` →
`entryAfterEdit` deletes the key (`field-access.ts:473-475`, `entry-store.ts:81-93`). Undo writes the old
value back. This needs no new code. A cleared `parentId` makes the entry a root.

**D4. ⚠️ What the contract compares.** "After `sync(list)`, the data equals `load(list)`" means these
things are the same: the ids, every declared Field value (`siblingIndex` included), the tree, and the
sibling order. The flat `entries.all` index is not data. A kept entry keeps its Map slot. Only a
`siblingIndex` row records order in a way undo can revert (S12). If #528 makes `entries.all` a tree walk
by `siblingIndex`, the flat order matches as well.

**D5. Plugin store rows.** A kept id gets no row, so its store rows stay. For a removed id,
`pendingRows` (`plugin-store.ts:177-201`) gives `{ from, to: undefined }`. Undo's invert
(`change-set.ts:123-131`) puts it back. This is the same path `remove()` uses, and it needs no new code.

**D6. Refusals.** Sync refuses these calls:
- a call inside an open transaction (`entry-batch.ts:95-97`)
- a call from the extension hook (`:107-109`)
- a call while `beforeChange`/`change` handlers run. This check is new: `assertNotNotifying`.

Why the new check: `load` reaches only `commitChangeSet`'s own check (`transaction.ts:209`), and that
check names `'commitChangeSet'`. A sync with no changes never gets that far. So a sync from a `change`
handler would throw only when the server changed something. `load` gets the same check, and every
error names the door the caller used.

**D7. History.** A `'sync'` commit is recorded like a `'user'` one (`history.ts:72`). `#record`
truncates at the cursor, so Redo is erased (S11). The capacity stays at 100. Document
`history: { capacity }` (`api/dataset.ts:93`) under S13.

**D8 (dropped, see Amendments after #528).** ~~Where added entries go in the flat order: at the end,
in list order.~~
- ~~`#restoreAdded` (`entry-store.ts:851-874`) takes its "restore a remembered index" branch for every
  origin except `'user'`.~~
- ~~Narrow that branch to `'undo'` and `'redo'`.~~
- ~~`#rememberRemovedIndexes` keeps recording for `'sync'`. So an undo puts a removed entry back in its
  old slot.~~

**D9. Gantt: no new code, only tests.**
- The shell's change handler (`gantt-shell.ts:944-953`) drops selection only for ids in `removed`
  (`entry-selection.ts:102-113`).
- It resets collapse only on `'load'` (`:950`). So a kept id keeps both. Scroll and zoom stay.
- Redraw: an add or a remove replans from row 0. A change with only Field rows replans from the lowest
  changed row (`frame-layout.ts:271-278`).
- ⚠️ A removed row's id stays in `gantt.collapsed`, the same as after `remove()` today. It has no
  effect, and an undo brings the row back collapsed. If S6's "loses" must cover collapse, fix
  `remove()` and sync together in a follow-up.

**D10. ⚠️ Reports raise on every call, as with `load`.** This covers the undeclared-key warning,
`derived-values-dropped` and #528's dropped-`siblingIndex` warning. A server that keeps sending a bad
cell gets one report per poll.

**D11. Performance.**
- Sync is not a hot path. I5 covers frames and pointer moves (`plans/01:968`).
- One call costs O(n × Fields): read, check, tree, Rollup and diff.
- The no-change path allocates no row, mints no `ChangeSetId` and commits nothing. It bumps no
  revision, so `entries.all` keeps its identity and the Gantt does no work (S10).
- Step 6 measures `seeded(10k)`.

**D12. The diff function.** It is `changesToMatchBatch(committed, target, fields, access)` in the new
file `src/data/entry-batch-changes.ts`. It is pure, and it returns `{ added, removed, updated }`. Read
the call aloud: `changesToMatchBatch(this.#byId, target, …)` reads as "the changes to match the batch".

**D13. The harness demo.**
- Add a "Sync from server" button beside Import on the Editing & data page. Its handler is
  `attemptMutation(() => dataset.entries.sync(server.fetchRows()))`.
- `harness/fake-server.ts` stands in for `fetch`. Each call returns the next scripted revision:
  1. a rename and a date shift
  2. an added row
  3. a reorder and a remove
  4. no change
- The fake server only returns rows. It does no diff and no ordering. If the page needs more than
  that, stop and report an API gap.
- ⚠️ `lock-entries.ts:130` lets `'sync'` through the same as `'load'`. The list carries `locked`, so
  the server owns the lock. Alternative: keep the veto. Then any server change to a locked row blocks
  the whole sync.

**D14. One word, one meaning.** `CONTEXT.md` uses "sync" for two other meanings:
- "Sync-only" (synchronous) at `:159`
- "the sync adapter's own job" at `:152`

Rewrite both in step 4. The `render/dom` method `sync()` is in another scope, and `api.md` allows it.

### Facts found (origin/main)

- `load` builds its ChangeSet itself and calls `commitChangeSet` (`entry-store.ts:622-667`). The rows
  it adds are the raw input. The Rollup corrections go in `updated`.
- `commitChangeSet` fires `beforeChange`, applies the rows and emits `change`. It runs no hook and no
  Rollup (`transaction.ts:208-261`).
- `replayChangeSet` allows only `'undo'`/`'redo'` (`replay.ts:18`). Sync does not use it.
- `pendingRows` works with no open write set (`plugin-store.ts:180`, `?? []`).
- `#rememberRemovedIndexes` skips only `'load'` (`entry-store.ts:835`).
- `valuesEqual` falls back to `Object.is` (`field-registry.ts:345-349`).
- `readField` runs `compute` Fields (`field-access.ts:395-403`), so the diff must skip them.
- The harness Import calls `load` (`harness/editing-and-data.ts:437-444`). The lock veto skips
  `'load'` (`harness/plugins/lock-entries.ts:130`).
- `api/dataset.ts:291` says `'user'` is the only public origin. That is stale, and step 4 fixes it.

### Depends on (not true on main yet: confirm in step 0)

- **#528-A:** the name of the function that writes `siblingIndex` from list position in `load`. Sync
  calls the same function.
- **#528-B:** tree reads (`children`, the row plan) follow `siblingIndex`.
- **#528-C:** `commitChangeSet` applies `siblingIndex` rows exactly as given. Renumbering runs only on
  the `add`/`update`/`remove` staging path. If it also runs in `commitChangeSet`, undo of a sync
  renumbers twice. Then stop and report to the owner.
- **#533:** `EntryStore.#hierarchySource` is a plain field, and construction checks the batch.

### Steps

Each step is one commit and is green on `pnpm verify:full`. Each step writes its failing test first.
Regenerate `etc/freegantt.api.md` in every commit that changes a public type. Steps 2 and 3 do not touch
the same files, so two implementers can write them in parallel. They still commit in the order below.

0. **Rebase and confirm** (about 15 min). Rebase onto main with #533 and #528. Read #528's code for
   Depends-on A to C. If one differs, update D1 and step 4 first.
1. **Specs (plans only)** (small, about 45 min).
   - `plans/02` §2: add a `sync` subsection after `load` (`:122-131`). Include the call site, the S1
     contract (D4), S3, S6 and S10.
   - `plans/02` "Undo and redo" (`:142`): sync records one step, erases Redo, and 100 is the default capacity.
   - `plans/02` §6 (`:930`): the poll uses `sync`.
   - `plans/01:570`: add `'sync'` to the origin line.
   - ADR 0015 `:73`: add a sync row (it ignores `'never'`, and derived cells re-roll).
2. **The pure diff** (medium, about 2 h).
   - Write the failing tests first, in `src/data/entry-batch-changes.test.ts`:
     - one test each for an add, a remove and a changed Field
     - a cleared key (`to: undefined`)
     - a `compute` Field that makes no row
     - a Field `equals` that suppresses a row
     - equal Instants that make no row
     - a changed `parentId`
     - identical batches, which give three empty lists
   - Add one fast-check property: applying the changes to `committed` gives `target`.
   - Code: `src/data/entry-batch-changes.ts` (D12).
   - Add a row to `docs/architecture/files.md` for the new file.
3. **Share `load`'s batch preparation, and refuse notification** (small, about 1 h).
   - Write the failing test first: `load` inside a `change` handler throws
     `MutationDuringNotificationError` that names `entries.load`.
   - Move `load`'s read, check, tree, `siblingIndex` and Rollup into `#readBatch(inputs, operation)`.
   - Add `assertNotNotifying` to `entry-batch.ts`.
   - Every existing `load` test stays green.
4. **`dataset.entries.sync(list)`** (large, about 4 h).
   - Write the failing tests first, in the new file `src/data/entry-store.sync.test.ts`:
     - A child listed before its parent lands.
     - A duplicate id, an unknown parent or a loop throws, and the store and History do not change.
     - One `change` fires with `origin: 'sync'`, and `canUndo` reads `true`.
     - Undo restores the rows, the removed entries' slots and their plugin store rows.
     - Redo re-applies the sync.
     - A sync erases Redo.
     - A sync with no changes fires no `beforeChange` and no `change`. The `entries.all` identity and
       History stay the same.
     - A `beforeChange` veto throws `MutationCancelledError`.
     - A `'never'` lock does not refuse the sync.
     - A derived parent cell re-rolls.
     - An `EditExtender` is not called.
     - A kept id's store row stays, and a removed id's store row goes.
     - A local edit is overwritten, and undo brings it back (S5).
     - A reorder writes `siblingIndex` rows only.
     - Sync throws inside `transaction()`, in the hook and during `change`.
   - Code:
     - Add `'sync'` to `ChangeOrigin` and update its doc.
     - Add the History arm (D7).
     - ~~Change `#restoreAdded` (D8).~~ (dropped, see Amendments after #528 — `#restoreAdded` needs
       no change; test that undo restores removed entries in their old sibling order instead.)
     - Add `EntryStore.sync`.
     - Add `sync` to the contract in `model/dataset.ts`, beside `load`.
   - Docs in the same commit:
     - `CONTEXT.md`: a new **Sync** entry. Avoid: Refresh, Merge, Reconcile, Apply.
     - `CONTEXT.md`: update ChangeSet `:135`, Origin `:139` and Load `:147`, and make the D14 rewrites.
     - `docs/06` `:289-312`: a plugin sees sync as an ordinary change with exact rows. It must not
       reset caches on it.
     - Fix the comment at `api/dataset.ts:291`.
5. **The contract property** (medium, about 1.5 h). Write `src/data/entry-store.sync.property.test.ts`
   with fast-check:
   - (a) `sync(list)` equals `load(list)` under D4.
   - (b) Undo after sync gives back the state before the sync, store rows included.
   - (c) `sync` of the current `toInput()` list commits nothing.
6. **Gantt pins and measurement** (medium, about 1.5 h).
   - Tests in the happy-dom Gantt suite:
     - A selected kept id stays selected.
     - A selected removed id drops.
     - A collapsed kept parent stays collapsed.
     - `scrollTop` does not change.
     - A sync with no changes requests no frame.
   - Update the comment at `gantt-shell.ts:947-950` to name sync.
   - Measure a scratch script on `seeded(10k)`: a sync with no changes, and a sync with 1% changes.
     Record the numbers in this plan. Add no timing gate.
     - Measured (scratch script, not committed; Node 24.18.0, AMD Ryzen 9 9950X, WSL2 Linux):
       10 runs each, a fresh 10,000-entry `seeded()` Dataset per run, `entries.sync()` alone timed.
       No changes: median 20.12 ms (range 18.27-29.63 ms). 1% changed (100 renamed entries):
       median 20.30 ms (range 18.25-24.24 ms). Both well under the 30 ms follow-up threshold this
       plan's Risks section names.
7. **Harness and e2e** (medium, about 2 h).
   - Build D13.
   - Page brief: sync records one undo step, and Import (`load`) clears undo.
   - Review `harness/main.ts` under the stop rule.
   - Extend `e2e/editing-and-data.spec.ts`: select a row, then click Sync from server. Assert that the
     renamed bar shows, the selection stays and Undo is enabled. Then click Undo and assert the old name.
   - Run the e2e on all three engines.
8. **Close out** (small, about 30 min).
   - Run `ocr review --from origin/main --to HEAD`.
   - Move this file to `plans/issues/closed/` and update the README.
   - The PR body says `Closes #517`.

### Risks

- #528 lands in a different shape than Depends-on A to C. Step 0 catches this before any code.
- An object-valued Field with no `equals` makes a row on every poll. S10 then fails in silence
  (D2 ⚠️). Docs mitigate this, and no code check catches it.
- A common poll that removes rows grows `#removedAtIndex`. A removed object stays pinned after its
  History step drops off. `'user'` already has this leak, and sync makes it common. A follow-up could
  prune it; History must stay removable.
- Frequent syncs push user edits off the stack (S13). This is accepted and documented.
- The no-change cost at 10k is O(n) with the Rollup. If step 6 measures more than about 30 ms in Node,
  open a follow-up. Do not optimise before that measurement.
- A consumer's exhaustive `switch` over `ChangeOrigin` breaks at compile time. This is pre-release,
  and the API report shows the change.

### Out of scope

- A partial update (#527), a skip-undo rule (#419) and conflict detection (`apply`, D-S2-11).
- Writes to passenger `props` keys (D2), and a deep-equal default.
- Dropping a removed id's collapse state, for `remove()` and sync together (D9).
- `toInput()` carrying `siblingIndex` (O4 stands).

### Coordinator review (2026-09-23, approved with amendments)

- **C1 — No rebase.** Step 0 becomes: branch off `main` after #528 merges, then read #528's code for
  Depends-on A to C. The repo never rebases.
- **C2 — No ADR body edit.** Step 1 does not edit ADR 0015 line 73. An accepted record is never
  rewritten (`docs/adr/README.md`). The sync row goes in `plans/02` and `CONTEXT.md`. If an ADR is
  needed, write a new one that amends 0015, after the #529 work (it may also amend 0015).
- **C3 — Spec labels.** Labels such as D2 or S6 stay in this plan. Code comments, test names, docs
  and the harness state the rule itself (`CLAUDE.md`).
- **C4 — The ⚠️ calls stand for tonight:** D2 (an object Field needs its own `equals`; passenger keys are
  not synced), D4 (the contract compares the tree and `siblingIndex`, not the flat index), D9 (a removed
  row's collapse state stays), D10 (ingest reports repeat on every poll), D13 (the lock plugin lets sync
  through). The owner confirms them.
- **C5 — Depends-on C is a hard stop.** If #528 renumbers inside `commitChangeSet` or replay, the
  implementer stops and the coordinator decides before step 1.

### Amendments after #528 (step 0)

Step 0 read the merged #528 code. Findings and coordinator rulings:

- **Depends-on A.** One function, not four: `readEntryBatch` (`src/data/entry-batch.ts:114-150`)
  already runs `toEntries`, `assertEntryBatchIsSound`, `checkHierarchyAnswers`, and the list-order
  `siblingIndex` write, all inside itself. `load` calls it once (`src/data/entry-store.ts:685`).
- **Depends-on B.** Confirmed. `EntryStore#byParent` sorts each sibling group by `siblingIndex`
  (`src/data/entry-store.ts:235`); `#all` walks that map depth-first (`:242-253`).
- **Depends-on C.** Confirmed, no hard stop. `renumberSiblingGroups` runs only inside
  `buildCommitChangeSet` (`src/data/build-commit-change-set.ts:301`), called only from
  `runTransaction` (`src/data/transaction.ts:312`). `commitChangeSet`
  (`src/data/transaction.ts:218-271`) applies exactly the rows it is given, with no renumber pass.
  Committing sync through `commitChangeSet` does not renumber twice. C5 does not fire.
- **#533.** Confirmed. `#hierarchySource` is a plain `readonly` field, set once in the constructor
  (`entry-store.ts:150`, `:191`). Construction checks the batch through `readEntryBatch` before the
  `EntryStore` is built (`src/data/dataset-state.ts:212-218`).

Coordinator rulings:

- **R1 (D1).** Sync calls the same batch path as `load`: `readEntryBatch`, then the Rollup, then the
  report raise. D1's function list is rewritten to name that one call, not four.
- **R2 (D8, dropped).** `#restoreAdded` needs no change. `#restoreAdded` no longer branches on
  origin or restores a remembered index — it is `this.#byId.set(entity.id, entity)` for every added
  entity, unconditionally (`entry-store.ts:918-922`). `#removedAtIndex` and
  `#rememberRemovedIndexes` do not exist in this codebase. Order rides on the `siblingIndex` rows
  the diff (D12) writes onto the changeset. Step 4 must still test that undo of a sync restores
  removed entries in their old sibling order.
- **R3 (step 3, narrowed).** Step 3 adds a private `EntryStore#readBatch(inputs, operation)` that
  wraps `readEntryBatch` + the Rollup + the report raise. `load` calls it; sync will too. The rest of
  step 3 stands: the red test that `load` inside a `change` handler throws
  `MutationDuringNotificationError` naming `entries.load`, and `assertNotNotifying`.
- **R4 (ADR).** C2 stands: ADR 0015's body is never edited. Step 1 also writes a new ADR 0035,
  "Sync writes like load, and records one undo step", amending ADR 0015. Status: accepted — verdict
  pending (this build).

## Amendments: local undo (owner, 2026-09-24)

- **U1.** A sync records no undo step, clears nothing, and erases no Redo. This strikes D7, S11 and S13
  (history no longer fills), the "Undo: record" ruling and S8's reason. S5 changes: a local edit the server
  has not seen is still overwritten. Undo of that edit now writes the value before the edit, and redo gives
  the server's value back.
- **U2.** Replay writes each row onto the current values, the same for undo, redo and `dataset.replay`
  (decisions a, b, g).
- **U3.** Replay never stores a raw loop or a dangling `parentId` (decision c).
- **U4.** Replay renumbers the sibling groups it touches (decision d). This amends ADR 0034.
- **U5.** Replay re-rolls parents, construction shape (decision e). This amends D-S2-14's "no Rollup". The
  extension hook still never runs.
- **U6.** History keeps what each undo and redo wrote (neutrality). It forgets a step that has nothing left
  to write (f2).
- **U7.** #419 reuses History's `'sync'` arm (decision i).

### Decisions a–i (local undo, owner 2026-09-24)

#### a. Where the undo-time capture lives

**Decision: in replay. `replayChangeSet` writes each row onto the current values. History keeps what each
undo and redo actually wrote.**

- New file `src/data/replay-changes.ts` exports `changesToReplay(data, changeSet): ChangeSet | undefined`.
  - Call site in `replay.ts`: `const replayed = changesToReplay(data, changeSet); if (replayed) commitChangeSet(data, replayed);`
  - Read aloud: "the changes to replay". This is the same shape as `changesToMatchBatch` ("the changes to
    match the batch").
  - Do not use "fit": `CONTEXT.md` Fit is the TimeScale density mode. Do not use "rebase": it is a git word,
    and "rebase" is also a different undo pattern.
  - Run the `naming` skill on this name before step 2.
- It returns the ChangeSet that replay commits. Its `from` values are the values the store holds now. It
  returns `undefined` when nothing is left to write.
- History (`history.ts`), in the `change` arms it already has:
  - `'undo'`: `this.#cursor -= 1; this.#stack[this.#cursor] = invertChangeSet(changeSet);`
    Redo re-applies the inverse of what undo wrote.
  - `'redo'`: `this.#stack[this.#cursor] = changeSet; this.#cursor += 1;`
    The next undo inverts what redo wrote.
  - Why this gives neutrality: undo commits `{ from: server, to: old }`. The stored entry becomes
    `{ from: old, to: server }`. Redo then writes `server` back. The same holds in the other direction.
- Why replay and not History:
  - History stays "a consumer can write this file from the public surface". `dataset.replay` gets the same
    rules, so a consumer History gets them too.
  - History would otherwise need store reads and the Rollup, which breaks its removability story.
  - The commit path (`transaction.ts`, `build-commit-change-set.ts`) does not change.
- Why not EntryStore: the fit needs the plugin stores, the hierarchy source and the Rollup together. The
  `TransactionData` seam already carries all three. EntryStore sees only entries.
- Seam change: `TransactionalPluginStores` gains `committedRow(store: PluginStoreName, id: EntryId): object | undefined`.
  It reads `#committed`. `PluginStores` already has the private `#read`, so this is one line.
- Public `dataset.replay(changeSet)` stays `void`. Its doc changes (step 2).
  - How History knows a replay wrote nothing: the cursor did not move. `#onChange` moves the cursor, and it
    runs only when `change` fires. See decision f2.
  - Alternative rejected: make `replay` return the ChangeSet it wrote. That breaks the rule
    "what an undo did arrives on `change`" (`plans/02` "Undo and redo").

#### b. Skip rules

**Decision: skip silently. Raise no new report.** The `change` event carries exactly what the undo wrote.
That is the whole report.

| Row in the step being replayed | Store now | Replay writes |
|---|---|---|
| `added` entity | id absent | the entity (parent and index per c, d) |
| `added` entity | **id present** (the server re-sent it) | nothing. The server's copy stays. |
| `removed` entity | id present | removes the **current** entity object (captured) |
| `removed` entity | id absent | nothing |
| `removed` entity | id present, and the current store holds children that the step does not remove | removes those descendants too, the same as `entries.remove()`, plus their store rows (`pluginStores.pendingRows(extraIds)`). |
| Field row | id absent after the replay | nothing |
| Field row | value already equals `to` (`registry.valuesEqual`) | nothing |
| Field row | otherwise | `{ from: current value, to: row.to }`. **Overwrite** |
| store row | its entry is absent after the replay | nothing (no orphan rows) |
| store row | `Object.is(current, to)` | nothing |
| store row | otherwise | `{ from: current, to }` |

- Keep the recorded row order. Put the extra rows (the cascade, the sibling rows, the Rollup rows) after the
  recorded ones. Then a no-sync undo commits rows in the same order as today.
- Read the current value with the same read the diff uses: `readField` for a declared Field, and the raw key
  for an undeclared one, the same way `applyFieldRow` reads it (`entry-store.ts:89`). Move `applyFieldRow`
  into `fields/field-access.ts`, or export it, so both files share one copy.
- Owner-confirmed: `added` with a present id **skips**. The alternative was to write the snapshot's Fields
  over the server's copy. Skip is the safer choice: the entry already exists, so "undo my remove" is already
  true.
- Owner-confirmed: undo of an add **cascades** to the children the server put under it since. The
  alternative was to re-root those children. Cascade matches `remove()` and never leaves a dangling
  `parentId`.
- Owner-confirmed: skips raise **no report**. A later issue (#419 or a new one) can add one.

#### c. Parent loops and missing parents

**Decision: replay never stores a raw `parentId` loop or a dangling `parentId`. It drops a bad `parentId`
row, and it lands a re-added entity with a missing parent as a root. It never throws.**

- Today: the undo lands, and a Fault re-raises on every later commit. `toInput()` exports the bad
  `parentId`, so a later `load` throws.
- The rule, applied on the working batch (the current store with this replay's rows applied):
  1. An `added` entity whose `parentId` names an id absent after the replay lands as a root: `parentId`
     is cleared on the entity.
  2. `parentId` rows, in ChangeSet order: keep a row only if its target is absent (`undefined`), or the target
     exists after the replay and the target's raw chain does not reach the row's own id. Otherwise drop the
     row, and the entry stays under its current parent. Use a walk with a `seen` guard, the same way
     `#assertParentValid` walks.
  3. An existing entry whose parent this replay removes is handled by the cascade in b.
- Why not let the ADR 0020 Fault rule read it as a root:
  - The stored data then breaks the batch rule every other door enforces.
  - It re-raises on every commit.
  - `toInput()` → `load` throws.
  - ADR 0020 still covers a plugin source's own loops. That rule does not change.
- Why "drop the row" and not "make it a root": the entry keeps the place the server gave it. That is the
  nearest sound place. A re-added entity has no current place, so a root is its nearest sound place.
- With a plugin hierarchy source, check the **raw** `parentId` only. That is the same rule the construction
  batch check uses. The source's own answers still go through `checkHierarchyAnswers`.
- The user never gets stuck. A step whose only row gets dropped becomes empty, and f2 then forgets it.
- Test impact: `cyclic-hierarchy.test.ts`'s `replayRawEntries` stops producing a raw loop.
  - Rewrite those five tests to build an `EntryStore` directly from raw entries (its constructor runs no
    batch check). Or use a looping `phaseId` hierarchy source where the test is about a source loop.
  - Update the comments that name replay as "the door a raw loop reaches the store through":
    - `entry-store.ts` `#assertParentValid` doc (`:824-831`)
    - `cyclic-hierarchy.test.ts:59-61`, `:109-110`, `:145-146`, `:161`

#### d. Sibling order

**Decision: replay renumbers every sibling group it touches, in the same commit. It reuses
`renumberSiblingGroups`, with no new sibling function.** One move stays one undo step, because the renumber
rows go in the same undo commit.

- Build the change log for `renumberSiblingGroups`:
  1. Departures first, one per id: every removed id, and every id the replay places.
  2. Then placements, sorted by `at` ascending (a stable sort in ChangeSet order).
- An id is **placed** when either is true:
  - It is an `added` entity. `at` is its snapshot `siblingIndex`.
  - It has a kept `siblingIndex` row, or its **checked** group changes. `at` is its post-replay
    `siblingIndex` value.
- `group` is the post-replay checked parent: `checkHierarchyAnswers(working, source).parents`.
- `committedSiblingsOf` is `data.entries.committedSiblingIds`. `committedGroupOf` is
  `data.entries.committedParents().get`.
- Do not log a departure for an `added` id. It has no committed group, and a departure would seed the root
  group for nothing.
- Emit results onto the ChangeSet the same way `buildCommitChangeSet` does:
  - An added entity takes its rank on the entity itself.
  - A kept id gets a `siblingIndex` row only when its rank differs from its current value. Merge that row
    with a replayed row for the same key: `from` is the current value, and `to` is the rank.
- Why the no-sync result is identical: the placed ids are exactly the ids whose index changed, and they
  insert in ascending target order. The unplaced ids keep their relative order. So the ranks equal the
  recorded `to` values, and the replay emits no extra row.
- After a sync inserts or reorders: the user's entries claim their old indexes. The server's entries fill
  the rest in their current order. The group ends dense, 0..n-1.
- Rejected: rely on the store-order tie-break. The tie-break is `#byId` insertion order, which is an
  accident. Equal indexes would become routine, but ADR 0034 limits them to "a fault or a hand-built
  replay". The next `update(id, { siblingIndex })` would also range-check against a group with gaps.
- This amends ADR 0034. Its decision says undo, redo and replay write `siblingIndex` rows "exactly as
  given, with no renumbering of their own". The amendment: they now renumber the groups they touch, and with
  no foreign write in between that emits no row. So the guarantee "an undo never renumbers a second time on
  top of the rows it restores" still holds. Add an "amended by 0035" note to ADR 0034's status line. Leave
  its body as it is.

#### e. Rollup

**Decision: replay re-runs the Rollup once, over the working batch, before it commits. The Rollup's rows
merge into the replayed ChangeSet.** Use the construction shape, `rollUpFreshBatch(data, working,
checkedParents, source)`: it visits every current parent, and it never demotes.

- How to merge:
  - A Rollup row whose `(id, field)` the replay already writes sets that row's `to`.
  - Any other Rollup row is appended as `{ from: current value, to }`.
  - A Rollup value on an added id goes onto the entity itself.
  - A row whose `from` equals its `to` is dropped.
- Why the construction shape and not the commit shape (`pending`):
  - The commit shape demotes a parent that lost its last child. Demotion clears its rolled-up cells.
  - Plain undo of "add a first child to leaf p" must give p its old authored `start` back. The commit shape
    would clear it, and that would change plain undo.
  - The construction shape never visits a leaf. So p keeps the value the replay restored.
- Why the no-sync result is identical: after an exact inverse, the store holds a state that was committed
  before, and every commit leaves every parent rolled up. The pass therefore finds nothing to change.
- Rejected: stop recording derived rows. `change` must carry them (a redraw, a server save), and History
  records what `change` carries.
- Rejected: "recompute derived rows at capture time only". That is this decision; the Rollup runs inside
  `changesToReplay`, which is capture time.
- Cost: O(n) per undo, for the hierarchy check and the Rollup. Undo is a click, not a frame, so the frame
  performance invariant does not apply. Step 9 measures `seeded(10k)`.
  - Threshold: 30 ms, the same number the #517 plan used for `sync`. Above it, open a follow-up that limits
    the pass to the ancestors of the touched ids.
  - Measured (scratch script, not committed; Node 24.18.0, AMD Ryzen 9 9950X, WSL2 Linux): 10 runs, a
    fresh 10,000-entry `seeded()` Dataset per run, one `entries.update()` (a rename) followed by one
    `dataset.undo()`, only the `undo()` call timed. Median 6.20 ms (range 2.59-9.26 ms), well under the
    30 ms threshold above.
  - Allowed shortcut, following `committedTreeStillAnswers` in `rollup.ts`: when the replay has no
    `parentId` row, no add and no remove, and the source is `storedParentSource`, reuse
    `data.entries.committedParents()`.
- This amends the rule that replay never re-runs the Rollup. The part that matters stays true: the
  extension hook never runs, so an engine that changed between versions cannot rewrite History. The Rollup
  writes nothing on a plain undo. ADR 0035 records this.
- Edge case accepted: a user step recorded a rolled-up cell on p. The server then removes all of p's
  children, so p is now a leaf. Undo writes the old rolled-up value onto the leaf p, because the overwrite
  rule applies. It is rare, and it follows the conflict rule.

#### f. Plain undo and redo stay identical

- **f1.** When no sync ran, every row of the step still applies, and its `from` already equals the current
  value. The parent rule drops nothing, the sibling pass adds nothing, and the Rollup adds nothing. So the
  ChangeSet has the same rows. Order can differ, because the renumber pass walks each sibling group in
  index order, cross-key order carries no meaning. The replaced stack entry has the same content as the
  recorded one.
- **f2. A step with nothing left to write.** `undo()` loops. It replays the step at the cursor. If the
  cursor did not move, `change` did not fire, so History drops that step (`#forgetStep(index)`: splice it,
  and move the cursor down when the index is below the cursor) and tries the next step. `redo()` loops the
  same way.
  - This never triggers without a sync. A recorded step always has at least one row that still applies.
  - Owner-confirmed: the alternative was "consume the empty step, and the click does nothing". Rejected:
    the user would click Undo and see nothing happen.
- How the tests prove f:
  1. `history.test.ts`, `history.property.test.ts`, `api/dataset.test.ts` (consumer History) and
     `entry-store.mutation.test.ts:565` pass unchanged. Run them before and after each step.
  2. A new property (step 8, test "undo and redo with no sync write exactly the inverted and the recorded
     rows"): random user op sequences, reusing `history.property.test.ts`'s op arbitraries. It records each
     `'user'` ChangeSet. Then undo-all, then redo-all. Each committed `'undo'` ChangeSet must equal
     `invertChangeSet(recorded)` row for row (id, field, `valuesEqual` on from/to, order free, one row per
     key). Each
     `'redo'` must equal the recorded step.
  3. The same property with a rolling-up `cost` Field and a two-level tree, so that the Rollup and sibling
     paths run.

#### g. The event contract

- The origin stays `'undo'` / `'redo'`. It does not change. Plugins and apps that fold on every origin
  except `'load'` keep working (`docs/06` example).
- `change` fires once, with exactly the rows the replay wrote:
  - `from` is the value just before this undo or redo. After a sync, that can be the server's value.
  - `to` is the value written.
  - `removed` carries the entity as it stands now.
  - The rows can include `siblingIndex` and rolled-up parent rows that the recorded step did not have.
  - The rows can leave out recorded rows that were skipped.
- `beforeChange` sees this same ChangeSet. A veto throws `MutationCancelledError`, and the stack does not
  change. That is today's behaviour.
- When nothing is left to write, neither `beforeChange` nor `change` fires, and History moves to the next
  step (f2).
- There is no new report code and no new event.
- Fix the `docs/05` comment "on undo, from/to is inverted: `from` is the edit being reverted" to: "`from`
  is the value the undo replaced, `to` the value it wrote back".

#### h. Tests

Existing tests to change (all in step 6 unless noted):

| File:line | Today | Becomes |
|---|---|---|
| `entry-store.sync.test.ts:68` "commits one change … canUndo reads true" | canUndo true | "commits one change with origin sync, and records no undo step": canUndo false on a fresh Dataset |
| `:79` "undo restores the rows, a removed entry's slot and its plugin store rows" | undo of sync | Delete. Merge its store-row half into `:198`, and assert `canUndo` stays false |
| `:92` "redo re-applies the sync" | | Delete (there is no sync step) |
| `:103` "a sync erases Redo, the same as a user edit" | canRedo false | "a sync keeps Redo, and redo re-applies the user's edit" |
| `:209` "a local edit … undo brings it back" | undo = local edit | "a local edit the server has not seen is overwritten; undo writes the value before the edit, and redo gives the server's value back" |
| `:235` "undo of a sync restores removed entries in their old sibling order" | | Replace with the order case below |
| `entry-store.sync.property.test.ts:153` property (b) "undo after a sync gives back the state before the sync" | | "a sync records no undo step and leaves canUndo and canRedo as they were". Keep its store-row "removed right away" check |
| `e2e/editing-and-data.spec.ts:189-213` | Undo enabled after sync, then Undo gives the old name | step 6: Undo stays disabled after a sync. Step 7: the full scenario below |
| `harness/editing-and-data.ts:452-454` comment "records one undo step" | | "records no undo step; your own edits stay undoable" |
| `harness/editing-and-data.html:143-144`, `harness/docs/page-brief.ts:71` | "records one undo step" | the same wording as the harness comment |
| `cyclic-hierarchy.test.ts` (5 uses of `replayRawEntries`) | raw loop through replay | step 3: build `EntryStore` directly |

New tests. Write each one first and see it fail. Test names state the rule, with no labels.

- Step 2, `src/data/replay-changes.test.ts`, through `state.replay(...)` with a stale ChangeSet:
  - "replay writes each row onto the current value, and the change carries the value it replaced"
  - "replay of a row for an id that is gone writes nothing for it"
  - "replay re-adds a missing id, and skips an id that already exists"
  - "replay removes the entry as it stands now, and its children the step did not name"
  - "replay drops a store row whose entry is gone"
  - "replay that has nothing left to write fires no beforeChange and no change"
- Step 3:
  - "replay drops a parentId row that would close a loop, and raises no hierarchy fault"
  - "replay lands a re-added entry whose parent is gone as a root, and toInput() loads again"
- Step 4: "replay puts the entries it moves back at their old indexes, and the group stays dense"
- Step 5: "replay re-rolls a parent whose other child changed since the step"
- Step 6, the History × sync describe block in `entry-store.sync.test.ts`:
  - "undo of a user edit after a sync changed the same Field writes the user's old value"
  - "undo then redo after a sync gives the server's value back"
  - "a sync keeps Redo"
  - "undo of an add whose id the server removed skips that step and undoes the step before it"
  - "undo of a remove whose id the server re-sent keeps the server's entry and restores its store rows"
  - Loop case: a under b. The user moves a to root. The server puts b under a. Undo leaves a as a root,
    throws nothing, and raises no `hierarchy-cycle`.
  - Order case: a, b, c. The user moves c to the front. The server list is a, d, b, c. Undo gives a, b, c, d
    with indexes 0..3. Redo gives the server's c-first order back.
  - Rollup case: p with children c1 and c2, `start` is `min`. The user moves c1 earlier. The server moves c2
    even earlier. After undo, `p.start` equals c2's server start.
- Step 8, `src/data/history.sync.property.test.ts` (fast-check):
  - (P1) no-sync identity (f).
  - (P2) interleave random user ops with random syncs. The sync targets come from the current `toInput()`
    with renames, removes, adds, reparents and reorders. Then undo k times and redo k times, with no sync
    between. The state (ids, Fields, tree, store rows) must equal the state before the undos.
  - (P3) after any sequence, the Dataset stays loadable and consistent: a fresh Dataset built from
    `toInput()` in `entries.all` order does not throw, and it has the same ids, tree, declared Field values
    and `siblingIndex`. This covers loops, dangling parents, dense groups and a stale Rollup in one check.
  - (P4a) a sync never changes `canUndo` or `canRedo` — read both right before and right after the sync.
  - (P4b) a sync that writes only a Field no user op in this run touches, and moves or adds or removes no
    entry, leaves every user step undoable and redoable: the count of `undo()` calls that land a `change`
    equals the count of recorded user steps, and the same holds for `redo()`. This is narrower than P4a on
    purpose — a sync that reparents an entry can make an unrelated `start`/`end` step moot (the rollup a
    reparent creates overrides it), and `undo()` then silently skips that step (`f2`) within the same call,
    so counting `undo()` calls no longer counts stack entries once that happens.

#### i. Coordination with #419 (a write door that records no undo)

- History's `#onChange` becomes an exhaustive `switch` over `ChangeOrigin`, with a `never` check in its
  default. The arms:
  - `'user'` records a step.
  - `'undo'` / `'redo'` move the cursor and keep what they wrote.
  - `'load'` clears.
  - `'sync'` does nothing. The comment says: "a write the user did not make records no step and erases no
    Redo".
- #419's door, whatever it is named, joins the `'sync'` arm. The compiler forces the choice when it adds an
  origin.
- The replay rules in this plan answer #419's Q5 (Redo survives) and Q7 ("does undo across it make
  sense?").
- Close-out: post one comment on #419 that names the arm and links ADR 0035. Strike S8
  ("stays separate from #419") and replace it with "sync uses the History rule #419 reuses".

### Owner rulings on the open questions (2026-09-24, "agree")

All open questions go as recommended:

1. An `added` row whose id exists: skip it. The server's copy stays.
2. Undo of an add whose entry now has server children: cascade, the same as `remove()`.
3. Skips raise no report. `change` carries exactly what the undo wrote.
4. A step with nothing left to write: History forgets it and undoes the next step in the same click.
5. The ADR 0034 amendment (undo and redo renumber the groups they touch) and the Rollup amendment
   (undo and redo re-roll parents) are accepted. ADR 0035 records both.
6. A new consumer guide, `docs/11-server-data.md`, "Server data: `load` and `sync`".
7. A lock the server sets can make a consumer veto refuse an undo step every time. Document it, and
   open a follow-up issue.

**Owner instruction:** every quirk and decision above goes in `docs/11-server-data.md`, in plain words
for a consumer. The guide covers at least:

- `load` versus `sync`: when to use each; `load` clears undo, `sync` keeps it.
- A sync records no undo step and does not erase Redo. The user's own earlier steps stay undoable.
- Undo overwrites: undoing an edit writes the old value even if a sync changed that Field since.
  Undo then redo gives the server's value back.
- A sync overwrites a local edit the server has not seen (last write wins).
- The skip rules (re-added id, removed id, rows for missing entries) and the cascade on undo of an add.
- A step with nothing left to write is skipped within the same click.
- An undo never stores a parent loop or a missing parent: it drops that parent change, and a
  re-added entry whose parent is gone lands at the root.
- Undo and redo renumber the sibling groups they touch and re-roll parents, so an undo can carry
  `siblingIndex` and parent rows the recorded step did not have.
- What `change` carries on an undo after a sync (`from` can be the server's value), and that the app
  saves `'undo'`/`'redo'` commits back to the server like `'user'` ones.
- Per-entry state: a kept id keeps its selection, collapse state and plugin store rows.
- The lock veto quirk, with a link to the follow-up issue (https://github.com/freegantt/freegantt/issues/541).
- A sync with no changes fires nothing; the poll pattern in a short, typechecked example.

`docs/11` is the one place for these rules. The `sync` API doc, `docs/05`, `docs/06` and `CONTEXT.md`
state their own part in short and link to `docs/11`. Step 6 writes `docs/11` (the doc lands with the
behaviour). Step 7 adds the harness page brief link to it. `check-doc-examples` must cover it (add the
file to that script's list if it does not pick up `docs/*.md` by itself).
