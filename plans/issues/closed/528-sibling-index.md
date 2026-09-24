# #528 — `siblingIndex`: the order Field

**Status:** planned 2026-09-23. No code yet. Issue: #528. Blocked by #529 and #533 PR 1. Blocks #517.
Rulings: `plans/issues/open/517-sync.md` (S12, O1–O5, Q1–Q5).

## Problem

An entry has no record of its place among its siblings. The store's Map insertion order is the only order.
- A move writes no ChangeSet row, so History cannot undo a move.
- `sync` (#517) must apply the server's order as one undo step. It has nothing to write.
- Undo of a remove puts the entry back through a side table (`#removedAtIndex`), not through the ChangeSet.

## Rulings (owner, 2026-09-23)

- An ordinary core Field, `siblingIndex`, next to `parentId` in `CORE_FIELDS`. It is always present.
- An integer index among siblings. Fractional keys are not allowed.
- `editable: 'anywhere'`. `'api'` stops a drag (needs #529). `'never'` stops every explicit move.
- The constructor and `load` set it from list position. `sync` will do the same. After that, `update()` moves an entry.
- A write that changes a sibling group renumbers that group in the same transaction. One move is one undo step.
- `add()` appends, unless the input gives an index. `remove()` closes the gap.
- In a constructor or `load` list, list position wins. A warning reports a dropped authored value.
- An index out of range throws a typed error.
- `toInput()` does not carry the Field. WBS reads it and does not store it.

## Decisions (coordinator; ⚠️ = the owner confirms)

**D1. Where it lives.** `StoredEntry.siblingIndex: number` is required. It is a core key, not in `props`.
- `EntryInput.siblingIndex?: number | undefined`. `add()` uses it. The constructor and `load` drop it (D9).
- `EntryEdit` gets `siblingIndex?: number` with no `undefined`. This follows from `RemovableEntryKey` (`stored-entry.ts:164`).
- A caller reads it with `entry.read('siblingIndex')`. `Entry` gets no new member. `parentId` has none either.
- `CORE_FIELDS` gets `{ key: 'siblingIndex', type: 'number', equals: byReference, editable: 'anywhere' }`.
- It has no `column` (the same as `parentId`) and no `rollUp`. The `number` type ships no `rollUp`. The registry refuses a consumer `rollUp` override on a core Field that declares none.

**D2. A sibling group is the Hierarchy source's checked tree.** ⚠️
- Under core's source, the group is the same as the siblings under one `parentId`.
- Under a plugin source, the group is the source's children. A drop in the visible tree then maps to one index.
- CONTEXT.md already defines "child" and "sibling" through the source.
- After #533, the source is fixed at construction. So no source changes at runtime, and there is nothing to renumber for that case.
- Rejected: group by the raw `parentId`. Under a plugin tree, two raw groups mix, their indexes collide, and a drop index has no meaning.

**D3. `entries.all` is depth-first tree order, with siblings sorted by `siblingIndex`.** ⚠️
- The Field is the only source of order. The Map insertion order stops mattering.
- `#byParent` sorts each group by the Field, and `#all` walks `#byParent`.
- Flat and group row sources follow automatically, because they read `all`.
- Visible change: a list that is not depth-first loads in tree order (see Risks).
- Tie-break: two equal indexes happen only after a Fault or a hand-built replay. Store order breaks the tie, and nothing throws.

**D4. Renumber once, at commit, after the Rollup.** ⚠️ (reads inside a transaction body)
- The write set records an ordered log, `SiblingChange = { kind: 'place', id, group, at } | { kind: 'leave', id }`.
- The write set also keeps a count per touched group. The count starts from `#byParent` and stays O(1) for each call.
- `buildCommitChangeSet` replays the log over the committed groups. It emits one `siblingIndex` row for each entry whose index changed.
- An added entity carries its final index on the entity. It gets no row.
- The renumber pass owns every `siblingIndex` row. It drops the body's own diff row for that key, because `foldChangeSet` never merges two rows for one key.
- Rules:
  - `add` with no index goes to the end.
  - `add` with an index `at` goes to `at`.
  - `update` with an index goes to that index in the group the edit leaves.
  - `update` that changes the group with no index goes to the end of the new group.
  - `remove` makes the entry leave its group. Its subtree goes with it.
  - Several writes in one transaction apply in call order.
- A group change under a plugin source counts too. `update('gate', { phaseId })` places `gate` at the end of its new group. `stageUpdate` compares the source's answer before and after the edit. Under `storedParentSource`, it skips that check unless the edit names `parentId`.
- Inside the body, the moved entry reads its own requested index. Other siblings read committed values until commit. The Rollup already works this way: a parent's rolled-up value lands at commit.
- Why not renumber at each call:
  - An `EditExtender` would see up to 10k edits that nobody asked for.
  - 100 removes in one transaction would cost O(n²).
  - The Rollup walks the ancestors of each touched id (`rollup.ts:129`).

**D5. The lock applies to an explicit write only.** ⚠️
- `update(id, { siblingIndex })` reads `editable` and the lock rule, the same as any Field.
- A sibling's renumber row ignores its lock, the same as a Rollup row.
- `'never'` stops explicit moves. A reparent still appends at the end. The lock on `parentId` controls the reparent.

**D6. Undo, redo and replay use ordinary rows.**
- The ChangeSet carries the moved entry's row, every shifted sibling's row, and the index on each added or removed entity.
- Undo inverts the rows, and `all` follows from the Field. So `#removedAtIndex`, `#rememberRemovedIndexes` and the sort in `#restoreAdded` go away.
- `replay` applies rows unchecked, as it does today.

**D7. One ingest function, `readEntryBatch`, for the constructor and `load`. `sync` uses it later.** ⚠️ (type change)
- It runs these steps in order:
  1. `toEntries`
  2. `assertEntryBatchIsSound`
  3. `checkHierarchyAnswers`
  4. `siblingIndexesInListOrder(entries, parents)`, which gives each entry's rank in its group
  5. the placed entries
- It replaces `listOrderOf`.
- The source needs an entry before its index exists. So `HierarchySource<P>` reads `Omit<StoredEntry<P>, 'siblingIndex'>`.
- That type states a real rule: the tree never reads order. A source that read the order could loop with the renumber pass.
- The internal type name is `UnplacedEntry`, in `data/` only.
- Rejected: first build every object with a temporary index. That type lies until the second pass runs.

**D8. The typed error is `SiblingIndexOutOfRangeError`, code `'sibling-index-out-of-range'`.**
- It has the fields `entryId`, `siblingIndex`, `lastIndex` and `operation`.
- Call site: `throw new SiblingIndexOutOfRangeError('t7', 9, 3, 'entries.update')`. Read aloud: "sibling index out of range for t7: 9, last is 3, in entries.update." The sentence is true.
- It also covers a negative number, a non-integer and `NaN`. The message says: "a whole number from 0 to 3".
- The range is 0 to the number of other entries in the target group. An `add` counts the whole group.
- Rejected names: `InvalidSiblingIndexError` (names no rule) and `SiblingIndexError` (names no rule).

**D9. The warning uses the report code `'sibling-index-dropped'`, once per operation.** ⚠️
- The report is aggregated, the same way `buildDerivedValuesDroppedReport` is.
- It reports only a value that differs from the list position. A matching value is not a dropped value.
- It has a `console.warn` fallback on both doors. The constructor has no subscriber (#533 D4).
- It gets its own code, because `'derived-values-dropped'` means "the Rollup owns this value". This is a different reason.

**D10. `toInput()` does not carry the Field. The ADR adds an I15 exception for it.** ⚠️ I15 (`plans/01:978`) says `toInput()` agrees with every stored Field. For this Field, list position carries the value.

**D11. New ADR 0032, "Sibling order is a Field".** ⚠️ (number) It records D2–D7 and D10. It amends D-S2-3 (the order of `all`) and D-S4-31 (the Field now exists; the drag does not).

**D12. No row drag-to-reorder exists today.** Only column reorder exists (`view/column-chrome.ts`). The gesture is out of scope. #529 changes only what a future drag may do.

## Facts found (origin/main)

- `entry-store.ts:214-217`: `#all` is the Map insertion order. `:223-235`: `#byParent` groups in `#all` order.
- `entry-store.ts:161-167, 825-874`: `#removedAtIndex` restores an index on undo or redo. `'load'` skips it (`:835`).
- `entry-batch.ts:168-174`: `listOrderOf` is `entries.map((e) => e.id)`.
  - It gives the global list order, not a rank in a group.
  - Its comment says the Field stores "each id's position". That is wrong for an index among siblings, so D7 replaces the function.
  - `load` stages its adds in that order (`entry-store.ts:652`).
- `frame-layout.ts:271-279`: an add or remove invalidates from row 0. A ChangeSet with no field row that maps to a row also invalidates from row 0 (`:278`). Confirmed.
- `frame-layout.ts:274-276` and `:196-198`: each updated row runs `findIndex` + `includes` over the plan. That is O(rows × plan). A 10k-row renumber over a 10k plan is about 10⁸ steps.
- `frame-memory.ts:90-93`: any dataset revision clears produced rows and heights from 0. So a reorder repaints with no new redraw code.
- `layout/rows/entries-source.ts:12-30, 86-88`: the tree and the flat list both take `entries` array order.
- `change-set.ts:87-106`: `foldChangeSet` does not merge two rows for one (id, field).
- `build-commit-change-set.ts:163-217`: body + extender merge → diff → Rollup → fold. The renumber pass goes after the Rollup.
- `entry-reader.ts:76`: `ENTRY_INPUT_KEYS` must list `siblingIndex`. Otherwise ingest warns "undeclared key".
- `entry-reader.ts:197-227`: `toEditReading` reads each core key by name.
- `live-entry.ts:162-175`: `toInput()` lists its keys by name. So it does not carry the new key with no change.
- `field-registry.ts:279-298`: a consumer may override `editable`. It may override `rollUp` only where the core Field declares one.
- `field-types.ts:76-84`: `number` ships no `rollUp`. `view/grid-columns.ts:14`: the default columns are `name`, `start` and `end`.
- `fixtures/hierarchy-dataset.ts:29-110`: this list is not depth-first. `phase-empty` (`:31`) comes before `phase-a`'s children. Every other fixture is depth-first (script check).
- Tests that pin today's order:
  - `entry-store.load.test.ts:118`: a child listed first stays first in `all`. This expectation changes.
  - `history.test.ts:217`: order after remove + re-add. This expectation stays.
- `field-access.test.ts:400-452`: the I15 test. It exempts `compute` Fields only.
- Harness reparent buttons: `hierarchy-and-timeline.ts:232-234`, `main.ts:237-240`.

## Steps

Each commit is green on `pnpm verify:full` (report the verdict line). Write the red test first. Regenerate `etc/freegantt.api.md` in each commit that changes a public type. Do not put spec labels in code, test names, `docs/` or `harness/`. Commit one step, then stop for review (#533 A2).

1. **Spec and ADR** (docs only, about 1.5 h). Do this after the owner rules on the ⚠️ calls.
   - Add ADR 0032, and add it to `docs/adr/README.md`.
   - `plans/01`:
     - §6: the order of `all`.
     - §11 I15: the exception.
     - New I16: every group holds exactly 0..n-1 after each commit.
   - `plans/02`:
     - Mutation: the move example.
     - `load`: the order sentence.
     - The error, and the report code.
   - `130-wbs.md` W3/W4: "authored order" becomes `siblingIndex`.
   - The deferred rows in `s3…/README.md:238` and `s5…/README.md:401`: the Field exists, and the gesture waits.
   - Add #528 to `plans/issues/open/README.md`.
2. **O(1) row lookup for invalidation** (small, about 45 min). This can run in parallel with steps 3 and 4.
   - `#planRows` builds a `Map<EntryId, number>` (the first planned row index).
   - `#indexToInvalidate` reads that map.
   - `rowIndexForEntry` reads it too.
   - Test: the lowest row index is correct over a 10k plan with 10k rows. Existing tests guard the rest. Do not add a timing assertion.
3. **Pure module `data/sibling-order.ts`** (medium, about 2 h). This can run in parallel with steps 2 and 4.
   - `siblingIndexesInListOrder(entries, parents)` gives each entry's rank in its group.
   - `renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf)` gives the final index of each id in each touched group. It checks an `at` that is too large (for extender changes).
   - Red unit tests: two moves in one call order, leave then place, re-add, and removed ids filtered out.
   - A fast-check property: every touched group ends at 0..n-1.
4. **Error and report code** (small, about 45 min). This can run in parallel with steps 2 and 3.
   - `SiblingIndexOutOfRangeError` and `BuiltInThrownCode` in `model/errors.ts`.
   - `'sibling-index-dropped'` in `model/error-report.ts`.
   - `buildSiblingIndexDroppedReport` in `data/error-reporting.ts`.
   - Red tests: `errors.test.ts` (message and fields) and the report builder test.
5. **The Field, ingest and tree order** (large, about 5 h). This needs steps 3 and 4.
   - Model: D1 types, and the `HierarchySource` param from D7. `UnplacedEntry` is internal.
   - `CORE_FIELDS`: add the Field with `editable: 'never'` for this commit only. So `update()` refuses the Field with `FieldNotEditableError` until step 6. This is a true statement, not a silent drop.
   - `entry-reader.ts`: `ENTRY_INPUT_KEYS`, and `toEntry` returns `UnplacedEntry`.
   - `entry-batch.ts`: `readEntryBatch`. Delete `listOrderOf`.
   - Construction (`dataset-state.ts`, after #533) and `load` call it. Both raise D9.
   - `EntryStore`:
     - `#byParent` sorts by the Field, and `#all` walks it depth-first.
     - `add()` without an index gets the end index from the group count.
     - `remove()` may leave a gap. Step 6 closes it. Order stays correct.
   - Red tests:
     - `load` and `new Dataset` set 0..n-1 per group from list position.
     - A differing authored value warns once. A matching one is silent.
     - `all` is depth-first. Change the `load.test.ts:118` expectation.
     - `toInput()` has no `siblingIndex` (I15 exception test in `field-access.test.ts`).
     - A group under the `phaseId` source.
   - Docs in this commit:
     - CONTEXT.md: the new **Sibling index** term (_Avoid_: order, sort, position, rank), **Snapshot**, **Load**, **Hierarchy source** (reads no order), and **WBS**.
     - `docs/architecture/files.md:62`.
6. **Every write renumbers its group** (large, about 5 h).
   - Write set: the `SiblingChange` log and the group counts.
   - Checks at the call site:
     - `add` with an index checks it and places the entry.
     - `update` with an index or a group change checks it and places the entry.
     - `remove` logs one leave for the top id.
   - `toEditReading` reads `siblingIndex`.
   - `buildCommitChangeSet` runs the replay after the Rollup. It drops the body's `siblingIndex` diff row and patches the index on added entities.
   - `CommitChangeSetEntryStore` gets `pendingSiblingChanges()` and `committedSiblingIds(group)`.
   - Set `editable: 'anywhere'`.
   - Red tests in `entry-store.mutation.test.ts`:
     - `update('t7', { parentId: 'p2', siblingIndex: 0 })`: both groups end 0..n-1, and one undo restores both.
     - `remove` closes the gap.
     - `add` at 0 shifts its siblings.
     - An out-of-range, negative or non-integer index throws, and nothing stages.
     - Two moves in one transaction apply in call order.
     - A `phaseId` edit moves the entry to the end of its new group.
     - `'never'` refuses an explicit move, and a reparent still appends.
     - A move to the same place commits nothing.
   - Docs: the move sentence in CONTEXT.md, and a `docs/05-consumer-api.md` example (it compiles in `check-doc-examples`).
7. **Extender moves, retire `#removedAtIndex`, prove exactness** (medium, about 3 h).
   - `buildCommitChangeSet` appends a place change for each extender edit that names `siblingIndex` or changes the group. The operation is `'edit extender'`.
   - Delete `#removedAtIndex`, `#rememberRemovedIndexes` and the sort in `#restoreAdded`.
   - fast-check property: random add, remove, reparent and move on a small tree. After each step:
     - I16 holds.
     - `all` is depth-first.
     - Undo-all restores the first state.
     - Redo-all restores the last state.
     - `load(all.map(toInput))` gives the same indexes.
   - 10k test on `seededEntryInputs`:
     - Move the first root to the end.
     - Expect exactly 10,000 `siblingIndex` rows.
     - Expect source calls to scale with the writes, not the siblings (spy count).
   - Keep `history.test.ts:217` green.
8. **Harness** (small, about 1 h).
   - `hierarchy-and-timeline.ts` gets a "Move Gate review to the top" button: `attemptMutation(() => dataset.entries.update('gate', { siblingIndex: 0 }))`.
   - Add one e2e check: the row moves, and Undo puts it back.
   - Review `harness/main.ts` (stop rule).
9. **Close-out** (small). Run `ocr review --from origin/main --to HEAD`. Run `pnpm verify:full`.

## Risks

- **Visible order change.** A list that is not depth-first shows in tree order in flat and group modes. `hierarchy-dataset.ts` is one such list, so flat-mode e2e and snapshots can change. Run e2e in step 5.
- **Large ChangeSets.** A root move in a flat 10k list writes up to 10k rows. History keeps 100 steps. `applyFieldRow` allocates about 4 objects per row at commit. This is inherent in integer indexes. It stays off the hot path (I5): the preview path (`createEditRequest`) never runs the renumber pass.
- **Stale reads inside a transaction.** A body reads a sibling's old index until commit (D4 ⚠️).
- **A source that reads a Field the Rollup writes** could move a row after the renumber pass. It is out of contract. Document it on `hierarchySource`.
- **Public type change.** The `HierarchySource` param changes right after #533 shipped `hierarchySource`.
- **A hand-built replay with duplicate indexes** keeps a stable order through the tie-break. It does not throw.
- **Branch merges.** `sync` (#517) must use `readEntryBatch` and diff indexes. #533 moves the construction path, so rebase step 5 onto #533.

## Out of scope

- The drag-to-reorder gesture and its drop-target vocabulary.
- `sync` (#517), the WBS plugin (#130), and partial update (#527).
- Fractional keys, a default grid column, and an `Entry.siblingIndex` member.

## Coordinator review (2026-09-23): APPROVED with amendments

- **G1. ADR number at commit time.** #533 PR 2 and #529 also want 0032. Take the next free number when
  step 1 commits. Fix every reference to it in the same commit.
- **G2. No rebase.** Branch off `main` after #529 merges (#533 PR 1 is in `main` by then). Step 5 then
  builds on the finished construction path. If `main` moves under the branch, merge `main` in.
- **G3. ⚠️ calls stand tonight.** The owner is asleep. D2, D3, D4, D5, D7, D9, D10 and D11 go ahead as
  written and stay on the owner's morning list. The two largest: D3 (`entries.all` becomes depth-first
  tree order) and D7 (the `HierarchySource` parameter type changes).
- **G4. I16 needs a CI job.** Every invariant maps to a CI job. Name the job that checks I16 (the step 7
  property test) where `plans/01` §11 maps the others.
- **G5. Spec labels.** Labels such as D4, I16 or D-S2-3 stay in `plans/` and commit messages. Code
  comments, test names, `docs/` and `harness/` state the rule itself.
- **G6. Commit, then stop.** One commit per step. The commit reviewer checks each one. Findings become new
  commits.
- **G7. Cross-check against #517 (sync).**
  - Depends-on A: the function is `readEntryBatch` (D7). Sync calls it.
  - Depends-on B: holds (D3).
  - Depends-on C: holds. The renumber pass runs in `buildCommitChangeSet`, which only `runTransaction`
    calls (`transaction.ts:303`). `load` (`entry-store.ts:646`) and replay (`replay.ts:24`) call
    `commitChangeSet` directly and apply rows as given. So undo of a sync does not renumber twice, and
    #517's hard stop does not fire.
  - Sync writes the `siblingIndex` rows itself, from its diff against `readEntryBatch`'s indexes.
  - #517's risk "`#removedAtIndex` grows on each poll" goes away in step 7.

## Coordinator note (branch start)

- The branch starts at `7b75610e`: #533 PR 1 (b7d71aa4), #534 and #529 are merged. The plan's line
  numbers are for an earlier main. Check each line before you edit it.
- **This PR writes ADR 0034** (G1). #533 PR 2 holds 0032 and #529 wrote 0033. Read "ADR 0032" in D11
  and step 1 as ADR 0034.
- e2e port for this worktree: `FG_E2E_PORT=5192`.
