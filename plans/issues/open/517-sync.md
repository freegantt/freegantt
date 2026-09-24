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
