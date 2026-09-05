# Handoff — S5.10, the mechanism half

**Slice:** S5 · **Step:** 10 of 12 · **Spec:** [`s5.10-dataset-plugins.md`](./s5.10-dataset-plugins.md)
**Branch:** `s5-start` · **Landed:** `e4bc4cb` · **Gate:** `pnpm verify` green (92 guard / 519 node / 671 dom, 274 modules, no dependency violations)
**Written:** 2026-09-04

The mechanism is in and the API report is updated. The demo, the new tests and the
spec edits are not. Read §3 before you write code — two decisions already changed.

## 1. What landed

| File | What it now does |
|---|---|
| `src/model/plugin.ts` | `PluginId`, `Disposer`, `ExtenderWrapper`, `PluginStore`, `PluginStoreView` |
| `src/model/change-set.ts` | `StoreName` widened; `StoreRowUpdated`; `ChangeSet.updated` is `UpdatedRow[]` |
| `src/model/entry.ts` | `EditRequest`/`EditExtender` moved here from `data/`, so `ExtenderWrapper` can name them |
| `src/model/errors.ts` | `MissingPluginError`, `PluginRequirementCycleError` |
| `src/model/document.ts` | `PluginDocument`; `schema: 1 \| 2 \| 3`; the `plugins` key |
| `src/data/plugin-store.ts` | `PluginStores`: reserve, read, stage, fold, apply, serialize |
| `src/data/build-commit-change-set.ts` | folds plugin rows into the changeset (#156) |
| `src/data/transaction.ts` | `TransactionalPluginStores`; `beginStores`/`endStores` pair every store |
| `src/data/change-set.ts` | `fieldRowsOf(changeSet)` — the Field-row half of `updated` |
| `src/data/fields/field-registry.ts` | `register`/`registerType`/`registerAggregator` |
| `src/data/dataset-state.ts` | `pluginStores`, the composed `editExtender`, `installPlugins`, `destroy` |
| `src/extensions/install-dataset-plugins.ts` | topological sort by `requires`, install, dispose |
| `src/api/dataset-plugin.ts` | `DatasetPluginOf`/`DatasetPluginContextOf` and their member types |
| `src/api/dataset.ts` | `DatasetOptions.plugins`, `Dataset.plugins`, `Dataset.destroy`, the bound aliases |
| `src/data/serialization/` | `schema: 3` written, `1` and `2` still read |

## 2. TODO — what is left

- [ ] `harness/plugins/lock-entries.ts`, against `'freegantt'` only. **The harness already
      hand-rolls this three times** — `harness/data.ts:139`, `harness/main.ts:331` and
      `harness/main.ts:485`. `main.ts:485`'s `lockedEntryIds` is a module-level `Set`, which is
      exactly the plugin store's job. Delete all three and install the plugin.
- [ ] `e2e/plugins.spec.ts` — the lock demo: a second bar ghosts, and the drop is refused.
      **Poll, do not read once.** A store-only commit repaints on the next frame, the same
      race #161 just fixed in `e2e/column-reorder.spec.ts`; use `expect.poll` for any
      post-commit DOM read.
- [ ] Tests, per the step file §3: `plugin-store.test.ts`, `install-dataset-plugins.test.ts`,
      the `edit-extension.test.ts` composition cases, `schema: 3` round-trips, and the
      `api/dataset.test.ts` cases (`plugins` installs, a late `fields.register` throws
      `RegistrationClosedError`, two Datasets keep independent stores — I2).
- [ ] Spec edits D-S5-23 carries: `plans/00` D4, `CLAUDE.md`'s Scheduling block, `plans/01` §7,
      `plans/03` §S3's extender note, and a superseding note on ADR 0002. The sentence becomes:
      *the hook has one occupant at a time; a scheduling plugin is one candidate occupant, with
      no special claim on it.*
- [ ] `plans/02` §2: state why `Dataset.plugins` is read-only where `Gantt.plugins` is not.
- [ ] `plans/03` §S2's "`StoreName` is `'entries'` only until the first plugin store exists" is
      now satisfied — say so.
- [ ] Close #15, #156 and OQ8 with a pointer to the step file.

## 3. Decisions that changed, and why

**The installer is `extensions/install-dataset-plugins.ts`, not `dataset-plugin-host.ts`.**
"Host" is a retired word (D-S1.11-6, #64) and `test/guards/retired-words.test.ts` blocks it —
the step file's own file table would not have compiled the gate. The name follows the call
site: `installDatasetPlugins(plugins, buildContext)`.

**`DatasetPlugin`/`DatasetPluginContext` live in `api/`, not `model/`.** The context names
`DisposableStore` (an `extensions/` type) and the api-level `Dataset`, neither of which
`model/` may import. This is the generic `*Of` pairing `api/plugin.ts` and `api/command.ts`
already use: `api/dataset-plugin.ts` declares `DatasetPluginOf<TDataset>`, `api/dataset.ts`
binds it once. `model/plugin.ts` keeps only what names nothing outside `model/`.

**`ChangeSet.updated` is now a union, not a widened `FieldUpdated`.** A store row carries a
whole value, so it has no `field`. Both rows carry `store`, and that is the discriminant.
Every consumer that wants Field rows calls `fieldRowsOf(changeSet)` — eight sites already do.

**`PluginRequirementCycleError` is new and is not in the step file.** D-S5-31 abolishes
`PluginOrderError`, because installation computes the order and a caller can no longer write a
wrong one. A cycle is the different fault: no right order exists to compute.

## 4. Two things to know before you touch this code

**Where a plugin sets up is load-bearing.** `DatasetState`'s constructor calls
`installPlugins` after the entry store exists — so a `setup`-time store write can wrap itself
in a transaction — and before `applyConstructionRollUp`, so a Field a plugin declares is in the
registry before the Rollup first walks (D-S5-4). History subscribes after, so installing a
plugin is not itself an undoable step. Moving that call breaks one of those three.

**`data/` may not import `extensions/`.** Installation lives in `extensions/` and the state
lives in `data/`, so `api/dataset.ts` is the composition root: it builds each plugin's context
and passes `installPlugins` down as a callback. `DatasetStateOptions.installPlugins` is a
function type for that reason, not a plugin array.

## 5. Recorded, not fixed

| Finding | Why it stays |
|---|---|
| **#162** — a plugin's declared Field and grid column persist as if the consumer authored them | Filed 2026-09-04 and ruled out of S5.10 deliberately, so the step ships to its spec. `ctx.fields.register` is the first runtime Field registration, and `encodeFieldDocument` records no declarer, so a save round-trip persists a plugin's Field as a consumer declaration. The column half is the branch review's S1 (`ColumnChrome.commit` writes all of `effectiveInput()`). One rule, both paths, after S5.10. |
| `PluginContextOf` is an unchecked hand-copy of `PluginContextPorts` | Real duplication, and independent of S5.10: `DatasetPluginContext` is a separate type tree and adds no member to `PluginContextOf`. The branch review's ordering argument ("four more seams doubles it") does not apply here. |
