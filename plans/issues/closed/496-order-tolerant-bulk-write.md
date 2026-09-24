# #496 — `entries.load()`: put a list of entries, in any order, into a live Dataset

**Reported:** 2026-09-22. **Status:** plan, not started. Grill closed 2026-09-23. Labels: `needs grill`, `api change`.
**Direction ruled by the owner, 2026-09-23:** the door is `load`. It is a full fresh start: it
replaces all data and all per-entry state, and it clears the undo history. The owner ruled `load`
is the right name here; #419 needs its own origin word.

`load` does **not** diff (L1, below). The diff belongs to sync
([#517](https://github.com/freegantt/freegantt/issues/517), plan [517-sync.md](./517-sync.md)).
`load` and sync share the list reading, the batch check, the list ordering and the open-transaction
refusal. Build those as separate functions that sync plugs into.

## What the issue is

A consumer cannot write a saved list of entries back in one call if the list is in any order.

- `new Dataset({ entries })` accepts entries in any order. Ingest checks no authored `parentId`
  (`src/data/entry-store.ts:628`).
- `dataset.entries.add()` refuses a child whose parent is not in the store yet
  (`#assertParentValid`, `src/data/entry-store.ts:632`).
- `dataset.entries.all` promises no parent-first order. So an export made with `entry.toInput()`
  can list a child before its parent.

The Editing & data page compensates. Its Import button removes every root, then sorts the pasted
rows parent-first (`parentFirst`, `harness/editing-and-data.ts:438`) and adds them one by one
(`:454`). Every consumer who writes a "load" button writes the same sort. That is an API gap
under the harness stop rule.

The gap is wider than a restore button. `gantt.dataset` is read-only (`src/api/gantt.ts:469`). So
an app that mounts its Gantt before its fetch returns cannot swap in a new Dataset. It must write
into the live one, and today that costs a sort and an undo step the user did not make.

## Research: did the library have this door, and remove it?

1. **No Dataset bulk write ever existed.** `git log -S` finds no `replaceAll`, no `entries.reset`,
   no `addMany` and no `bulkAdd` in `src/`, `plans/` or `docs/`. `setEntries` exists, but only on
   the internal viewport and time-scale handles (`src/layout/viewport/viewport.ts:49`, S2.4). It
   pushes a snapshot into the view. It never writes the Dataset.
2. **`Dataset.fromJSON` existed, and ADR 0016 deleted it.** ADR 0016 deleted it for one reason: a
   versioned public save format, with `schema` integers, migration promises, and a hook that
   coupled plugins to our format.
3. **That reason does not apply here.** `load` takes `FlatEntryInput[]`, the shape the constructor
   takes. It adds no document type, no schema, no version, and no plugin rows. ADR 0016 says the
   consumer "already writes the mapping in the inbound direction". This door lets that mapping
   land on a live Dataset.
4. **The door ADR 0016 names costs too much here.** `new Dataset(...)` gives a new identity, every
   subscriber rebinds (`plans/02:124`), and a mounted Gantt cannot take it (point above).
5. **#33 warned against a public `setEntries()`** on the view (`src/view/gantt-shell.ts:956`). That
   warning is about a second reactivity path. `load` commits through the transaction runner and
   `on('change')`, so it is not that path.
6. **The word `'load'` is already reserved, with another meaning.** `ChangeOrigin` names it as a
   future arm (`src/model/change-set.ts:18`, `plans/01:570`). D-S2-11 reserved it for the withdrawn
   `apply` sync door: a remote write that History *skips* and keeps the stack
   (`plans/s2-data-core/README.md:300`, `:684`; `src/data/history.ts:68`). No code produces it.
   This plan takes the word for a different job: a new baseline that History *clears on*. One word,
   one meaning — so step 2 rewrites every place that states the old meaning. If `apply` ever
   returns, its origin needs its own word.
7. **Closed issues and PRs** for "replace", "import", "bulk add", "parent-first" and "restore"
   name no earlier bulk write and no ruling against one.

**Result:** the reason for the old removal does not hold for this design. The issue stays open.

## Comparable libraries

A comparable data grid clears its undo stack on any data update except a cell edit. Its reason: undo
is a recovery for the user's own editing mistakes. A comparable Gantt does not record a code write
as an undo step, and ships a call to clear the stack after a load. A desktop app resets undo when it
opens a file. `load` follows the same rule.

## The decision

```ts
dataset.entries.load(rows);   // rows in any order: a child may come before its parent
```

- `load` replaces every entry. It does not merge.
- It commits one ChangeSet with `origin: 'load'`. `on('change')` fires once, so a Gantt redraws.
- History clears on it: `canUndo` and `canRedo` read `false` after it.
- It returns `void`, like `remove()`.

## Options weighed

| Option | Verdict |
|---|---|
| **`entries.load(inputs)`, clears history** | **Accepted**, owner ruling 2026-09-23 |
| `entries.replaceAll(inputs)`, one undo step | Rejected. On an app's first load, Ctrl+Z empties the chart |
| `load(inputs, { keepHistory })` | Rejected. A flag gives one function two jobs. The undoable job is [#517](https://github.com/freegantt/freegantt/issues/517) |
| Make `add()` order-tolerant: check `parentId` at commit | Rejected. It breaks `plans/02:120`: a stack trace must point at the bad call, not at the transaction's closing brace |
| Promise parent-first order on `entries.all` | Rejected. Sibling order is "the order the rows are in" (`entry-store.ts:218`). It does not help a list from the consumer's database |
| Tell consumers to build a new `Dataset` | Rejected. See research point 4 |

## Rulings (owner, 2026-09-23)

Q1–Q5 and Q7 close on the recommendation. Q6, Q8 and Q9 close with the owner's own guidance.

- **Q1 — The oracle. Closed.** For valid input, `load(inputs)` leaves the same rows, in the same
  `entries.all` order, that `new Dataset({ entries: inputs })` with the same Fields and plugins
  builds. The property test in step 4 checks it. The options this rules out: kept entries keep
  their old place, or entries the list omits stay (a merge).
- **Q2 — A dangling parent or a cycle. Closed: throw.** `load` throws before anything stages:
  `EntryNotFoundError(parentId, 'entries.load')`, `ParentCycleError` or `DuplicateEntryIdError`.
  This is the one place Q1 does not hold, and only for invalid input.
- **Q3 — Edit rules. Closed: ignore, as construction does.**
  - A `'never'` Field lock does not refuse it. Add one row to ADR 0015 for the new door.
  - The Rollup overwrites a derived parent cell and reports `derived-values-dropped`, as at
    construction (ADR 0013, decision 5).
  - No `EditExtender` cascade runs, if the constructor runs none. Step 1 checks this.
- **Q4 — Inside an open transaction. Closed: refuse.** A new typed error, with its code in
  `BuiltInThrownCode`.
- **Q5 — `beforeChange`. Closed: it fires.** A veto throws `MutationCancelledError`. The store and
  History stay as they were.
- **Q6 — Plugin data. Two kinds, two answers. Closed.**
  - **A plugin's Field loads. Closed.** A plugin that declares a Field (`ctx.fields.register`, for
    example `phaseId` in `harness/plugins/phase-hierarchy.ts`) keeps its value on the entry.
    `toInput()` carries it, so `load` writes it like any other key. This needs no new code. Step 4
    adds a test.
  - **A plugin's store rows are not load data.** See Q8. `load` removes every old entry (L1), so
    every store row goes, by the D-S5-24 rule (`src/data/plugin-store.ts:189`).
- **Q7 — The Gantt's own state. Superseded by L2.**

### Q8 — Plugin store rows. Closed: `load` never reads or writes them

**Owner ruling, 2026-09-23.** A plugin store is not export data. `load` does not write it, and
`toInput()` does not read it. ADR 0016 already says only the plugin writes its store, so this
changes no rule. It states the rule for plugin authors.

**The guidance for plugin authors:** per-entry data that a consumer must export and load goes in a
Field, not in a plugin store. A Field that no grid column names is not drawn. Declare it with
`editable: 'api'`, so the grid never opens it and the plugin still writes it. The lock flags are
the model case: a `locked` Field, not a store row.

- **Where a Field does not fit:** data that is not about one entry, for example a link between two
  entries. That data stays in the plugin, and the plugin publishes its own reader and writer
  (ADR 0016).
- **What a plugin store is for:** state the plugin needs while it runs, which no consumer saves.

### Q9 — How does a plugin know a load happened? Closed: the `change` pair, with `origin: 'load'`

**Owner requirement, 2026-09-23:** a plugin must be able to react to a load, and later to a sync.

A data plugin already subscribes through `ctx.events` to `beforeChange` and `change`
(`src/api/dataset-plugin.ts:52`). A load commits one ChangeSet with `origin: 'load'`, so a plugin
reads it there:

```ts
ctx.events.on('change', ({ changeSet }) => {
  if (changeSet.origin === 'load') resetMyCache();
});
```

- **No new event name.** A `load` event would fire beside `change` for the same commit: two names
  for one fact (`docs/agents/api.md`, "one name per concept"). A sync reaches plugins the same
  way, with `origin: 'sync'`.
- **`beforeChange` sees it too**, so a plugin can refuse a load (Q5).
- **A load always commits, even when nothing changed.** A load of an empty list into an empty
  Dataset has nothing to write, but it still moves the baseline. So `load` commits one ChangeSet
  with `origin: 'load'` even when its three lists are empty. This is the one ChangeSet that may be
  empty, and its doc comment says why.

## History rules — and #419

`load` and sync ([#517](https://github.com/freegantt/freegantt/issues/517)) make the same write:
"make the entries match this list". Their history rule differs.

| History rule | What Undo sees | Door |
|---|---|---|
| Record | one undo step | every write today, and sync (origin `'sync'`) |
| Clear | an empty stack — a new baseline | `load` (origin `'load'`) |
| Skip | nothing; the stack stays as it was | [#419](https://github.com/freegantt/freegantt/issues/419) |

**#419 stays out of this work.** Clear leaves no stack, so `load` meets none of #419's questions.
#419 proposed `'load'` for its skip rule; this plan takes `'load'` for clear, so #419 needs its own
word.

## Owner grill, round 1 and 2 — the `load` half (2026-09-23)

- **Parent order (owner question).** A child may come before its parent in the list. `load` checks
  the whole batch first, so order never throws. It throws only for an unknown parent id, a loop, or
  a duplicate id (Q2). An initial load into an empty Dataset works the same way.
- **L1 — `load` is a full fresh start. Closed, no option.** It removes every entry and adds every
  input. It keeps no per-entry state for an id that is in both lists: opening a different file
  must not keep the old `t1`'s lock or selection. So `load` needs **no diff**. The ChangeSet holds
  every old entry in `removed` and every input in `added`. Sync is the door that keeps state.
  Comparable libraries ship the same split: a replace door, and a delta door keyed by row id.
- **L2 — What the Gantt resets on `origin: 'load'`. Closed.**
  - Reset: the selection clears. Collapse state returns to the Gantt's starting state.
  - Keep: scroll position and zoom. They are view settings, not data. An app that wants to jump
    calls `reveal` itself.
  - Plugin store rows: all go, because every old entry is removed (D-S5-24).
- **Q7 is superseded by L1/L2.** Selection and collapse no longer survive a load.
- **Shared with sync — build these as separate functions:** read the list (`toEntry` per input),
  check the batch (no duplicate id, known parents, no loop), put `entries.all` in list order, and
  refuse an open transaction with one typed error.
- **"Tell the consumer what was undone" (owner question):** it already works. An undo fires
  `change` with `origin: 'undo'` and the exact rows it reverted.

## Steps

Each step ends green (`pnpm verify:full`). Each step is one commit.

1. **Pin the facts.** Add characterization tests in `src/data/entry-store.mutation.test.ts` and
   `src/data/dataset-state.test.ts`:
   - Does the constructor run an `EditExtender` cascade over its input (Q3)?
   - Does a remove and re-add of the same id in one transaction fold away (`foldChangeSet`)? `load`
     must not let that fold keep old per-entry state (L1).
2. **Contract and specs.**
   - Add `'load'` to `ChangeOrigin` (`src/model/change-set.ts:18`). Leave `'sync'` to #517.
   - Add `load` to `EntryStore` (`src/model/dataset.ts:38`). Its doc comment states the Q1 oracle,
     the clear rule, and parent order (a child may come before its parent).
   - `plans/02` §2 "Programmatic mutation" (`:92`) and "Undo and redo" (`:128`): state that `load`
     clears History. §6 "Persistence" (`:899`): the inbound half of the mapping is one call.
   - Rewrite the old `'load'` meaning (research point 6): `plans/01:570`,
     `plans/s2-data-core/README.md:300` and `:684`, `plans/s2-data-core/s2.5-undo-redo.md:55`, and
     the comment in `src/data/history.ts:65`.
   - Add a row to ADR 0015 (Q3). Add a `CONTEXT.md` entry **Load**.
3. **Build it.**
   1. `src/data/history.ts`: on `origin: 'load'`, empty the stack and set the cursor to 0. Name the
      case in `#onChange` beside the other three.
   2. `src/data/entry-store.ts`: add `load(inputs)`. It runs through the transaction runner with
      origin `'load'`. It refuses an open transaction with a new typed error (Q4). Add its code to
      `BuiltInThrownCode`. Sync reuses this error (#517 S9).
   3. Read every input with `toEntry(input, …, 'entries.load')`. A Field error throws before
      anything stages.
   4. Check the batch in one pure function in `src/data/`: no duplicate id, every `parentId` names
      an id in the batch, no cycle (Q2). Sync reuses it.
   5. Stage a remove for every committed id. Then stage an add for every input. `entries.all`
      takes list order. Write that ordering as its own function; sync and the future order Field
      reuse it.
   6. Commit even when the lists are empty (Q9).
4. **Gantt reset (L2).** On `origin: 'load'` the selection clears and collapse state returns to the
   start state. Scroll and zoom stay.
5. **Tests** in `src/data/entry-store.mutation.test.ts`, `src/data/history.test.ts` and the view
   tests:
   - A child before its parent lands.
   - A dangling parent, a cycle and a duplicate id throw, and leave the store and History as they
     were.
   - One `change` event with `origin: 'load'`. After it, `canUndo` and `canRedo` are `false`.
   - After a load, a user edit is the only undo step.
   - A `beforeChange` veto throws `MutationCancelledError`, and History keeps its stack.
   - `load` inside `dataset.transaction()` throws the Q4 error.
   - An id in both lists keeps no old state: no plugin store row, no selection, no collapse.
   - A plugin's Field value loads (Q6). A derived parent cell re-rolls (Q3).
   - An empty load still commits and clears History (Q9).
   - One fast-check property beside `src/data/history.property.test.ts`: shuffle
     `entries.all.map(toInput)`, call `load`, compare with the Q1 oracle.
6. **Plugin guidance (Q8).**
   - Add a section to `docs/06-plugin-authoring.md`: "Data a consumer must keep". Per-entry data
     that must export goes in a Field with `editable: 'api'` and no grid column. `load` and
     `toInput()` never carry plugin store rows.
   - Change `harness/plugins/lock-entries.ts` to a `locked` Field with `editable: 'api'`. Update
     the doc sample at `docs/06-plugin-authoring.md:362`. Check `harness/plugins/subtree-unlock.ts`.
7. **Harness.** In `harness/editing-and-data.ts`, delete `parentFirst` and the root-removal loop.
   Import becomes `attemptMutation(() => dataset.entries.load(parsed))`. Rewrite its comment:
   Import is a load, and it clears undo. Review `harness/main.ts` under the stop rule. Extend
   `e2e/editing-and-data.spec.ts:118`: paste a document with a child before its parent. Assert the
   import lands, Undo is disabled, and a lock holds. Run it on all three engines.
8. **Close out.** Move this file to `plans/issues/closed/`. Update `plans/issues/open/README.md`.
   The PR body says `Closes #496`.

## Owner grill, round 3 — a plugin Field at construction (2026-09-23)

The `ocr` review found a gap that step 6 opened. The constructor reads the entries
(`src/data/dataset-state.ts:156`) before plugins install (`:169`). So `new Dataset` drops a flat
`locked: true` with an "undeclared key" warning, and `load` keeps it. That breaks the Q1 oracle.
Step 6 removed `lockEntries({ initiallyLocked })`, so this branch caused the gap.

- **Rejected: install plugins before the entries are read.** During `data()`, `entries.all` would
  be empty, with no error. The owner called it "a foot bazooka".
- **Rejected: read the entries twice.** Setup would see entries with the plugin keys missing.
- **Rejected: a separate `declare()` step.** It does what a list does, with more code per plugin.
- **R1 — A plugin declares with `fields`, `fieldTypes` and `aggregators`. Closed.** The same names
  and shapes as `DatasetOptions` (`src/api/dataset.ts:79-83`). Construction order: register the
  Dataset's and every plugin's declarations (a duplicate throws here), read the entries, run each
  `data()`, run the Rollup. `data()` sees every entry, as before.
- **R2 — Remove `ctx.fields.register`, `registerType` and `registerAggregator`. Closed.** One way to
  declare, so the gap cannot come back. A plugin whose Fields depend on its options builds the list
  in its factory.
- **R3 — It lands on this branch, as its own commits, before the PR leaves draft. Closed.**

Build steps, one commit each, each green on `verify:full`:

1. A test that fails today: `new Dataset` keeps a plugin Field value (`locked`, `phaseId`).
2. Add the three plugin settings. Register them before the entries are read.
3. Remove `ctx.fields.register*`. Move the plugins and the tests to the new settings.
4. Fix the lock doc sample and `docs/06-plugin-authoring.md`. State the change in the PR body.

## Out of scope

- The undoable, diffing door. That is [#517](https://github.com/freegantt/freegantt/issues/517). It
  reuses this plan's shared functions.
- The order Field (#517 S12, round 3). It is built after `load`.
- Writing plugin store rows (Q8).
- A write that skips History. That is #419.
- A save format of any kind. ADR 0016 stands.
- `dataset.apply(changeSet)` (D-S2-11). It stays withdrawn.
