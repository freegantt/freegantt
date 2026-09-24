# #533 — plugin code runs on a finished Dataset (PR 1 of 2)

**Status:** planned 2026-09-23, no code. Issue: #533. PR 2 (Gantt `view()`) is planned separately.

## Problem

`new Dataset()` runs every plugin's `data(ctx)` inside the `DatasetState` constructor. At that moment:
- `ctx.dataset.*` throws, because `Dataset.#state` is not assigned.
- Parents have no Rollup values.
- History does not exist.

A plugin's `setSource` arrives after the entries are checked. So construction checks the rows under a tree that never goes live. The constructor also never throws on a broken batch, but `entries.load()` does. The harness lock plugin works around all this with a lazy seed, which breaks the stop rule.

## Rulings (owner, 2026-09-23)

- **Q1.** A plugin declares on its definition everything that shapes construction: `fields`, `fieldTypes`, `aggregators` and the hierarchy source. The Dataset builds completely before any plugin code runs. Then `data(ctx)` runs. `new Dataset({ entries, plugins })` does not change.
- **Q3.** `new Dataset({ entries })` checks the batch like `load`. It throws on a duplicate id, an unknown parent or a cycle.
- **Q4.** The Gantt follows the same rule, in PR 2.
- **Coordinator correction (ADR 0020 J54 stands).** The batch check reads the raw `parentId` only, exactly like `load`. When a declared source gives a bad answer, core raises a Fault (`unknown-parent`, `hierarchy-cycle`) and never throws.

## Decisions (coordinator)

**D1. The declarative source is `hierarchySource` on the plugin definition.**
- Shape: a method signature on `DataPluginOf`:
  `hierarchySource?(next: HierarchySource<P>): HierarchySource<P>`
  - `P` is the plugin's own `TProps`, derived from `TDataset`.
  - When `TProps` is `unknown`, `P` is `Record<string, unknown>`.
- `ChromePluginOf` gets `hierarchySource?: never`.
- Call site: `definePlugin<PhaseProps>({ id, fields: [{ key: 'phaseId' }], hierarchySource: (next) => (entry) => entry.props.phaseId ?? next(entry) })`. Read aloud: "its hierarchy source is the entry's phase id, or the next source's answer."
- Why this name:
  - CONTEXT.md has "Hierarchy source". The owner said "the hierarchy source".
  - `hierarchy` names the tree, not the function.
  - `parentOf` is a new word for a concept that already has a name.
- Why the wrapper shape stays: it is the same composing idiom as `setExtender` and `setLockRule`, and `HierarchySourceWrapper` is already public.
- The per-call `setSource<TProps>` generic goes away. That generic was a type the caller picks with no check. This supersedes ADR 0020 J52.
- Type check done: a `DataPlugin<PhaseProps>` installs on `Dataset<PhaseProps & Other>` and on an untyped `Dataset`. An untyped author reads `Record<string, unknown>`. The method form gives `next` the same bivariance `data(ctx)` already has.
- ⚠️ The helper type that reads `TProps` off `TDataset` is not exported. `ae-forgotten-export` records it, the same as `EntryEnvelope` today.
- **Composition order:** setup order (`resolveSetupOrder`, D-S5-31), the same order `data()` runs in.
  - The first plugin wraps core's `storedParentSource`.
  - Each later plugin wraps the one before it.
  - The last plugin answers first.
  - Today's "two sources compose" test keeps its expectation.

**D2. Remove `ctx.hierarchy.setSource`.** This is one way to declare, as R2 did for `ctx.fields`.
- Remove `DatasetHierarchy` and `DatasetPluginContextOf.hierarchy`.
- Remove `EntryStore.setHierarchySource` and `DatasetState.setHierarchySource`.
- `EntryStore.#hierarchySource` becomes a plain readonly field set by the constructor. It is no longer a signal, because nothing sets it later.
- If `setSource` stayed, a source set in `data()` would arrive after the Rollup. The Rollup would then be stale.

**D3. History starts before `data()`, and construction ends with an empty History.** ⚠️
- `DatasetState` still builds History last in its own constructor. History is then the first `change` subscriber, ahead of every handler a plugin adds. So D-S2-25 also holds for plugin handlers.
- A write in `data()`:
  - It is an ordinary write on a finished Dataset.
  - It runs in its own transaction, the same as today.
  - It fires `change` to the handlers that exist, and History records it.
- After the last `data()` returns, `Dataset` calls `state.clearHistory()`. So `canUndo` reads `false` after `new Dataset()`. This keeps #137 F17: a seed is not an undo step.
- A setup write sees only the plugins set up before it. Document this.
- Alternative: keep setup writes undoable. Rejected: Ctrl+Z at app start would undo a plugin's seed.

**D4. The construction batch check reuses `assertEntryBatchIsSound`, with the raw `parentId`, like `load`.**
- Operation label: `'new Dataset'`. Pass it to `toEntries` and to the check. The error message then names the door the caller used (c2f640b0).
- Typed errors, unchanged: `DuplicateEntryIdError` (`'duplicate-in-list'`), `EntryNotFoundError`, `ParentCycleError`.
- The raw check also applies under a declared source. ⚠️ Consequence: a consumer whose stored `parentId` values are stale, and whose plugin tree ignores them, now gets a throw.
- Source refusals: `EntryStore` receives the final source in its constructor, so it raises each refusal once. It uses the `console.warn` fallback, because no one can subscribe yet.
- The double warning goes away:
  - Under core's source, a sound raw batch has no refusals.
  - Nothing re-composes the source after construction.
- The construction Rollup's `derived-values-dropped` report gets the `console.warn` fallback.
  - Today it is raised with no fallback (`transaction.ts:161`), so it is silent when no handler exists.
  - `entry-store.ts:283` and `api/hierarchy-source.test.ts:173` already claim the fallback exists.
  - After this PR, no subscriber can exist at construction. So the fallback is the only channel.

**D5. `RegistrationGate` stays on `setExtender` and `setLockRule`.**
- Its reason changes. It is no longer "a Field before the Rollup". It becomes: a Dataset plugin never uninstalls one at a time, so a late wrap could never be undone. Every commit and every drag preview after construction read the same composed occupant.
- Installing both seams after the Rollup changes nothing already computed:
  - Construction runs no extender (#496 step 1).
  - The Rollup reads no lock rule.
  - The lock rule is read at each call.
- `ctx.events.on` and `ctx.store.*` stay ungated.

**D6. `DatasetState` stops taking `installPlugins`.** `Dataset` owns the plugin lifecycle.
- Constructor order: `this.#state = new DatasetState(...)` → `#time` → `datasetState.set` → `#disposePlugins = this.#installPlugins()` → `this.#state.clearHistory()`.
- `destroy()` calls `#disposePlugins`. `DatasetState.destroy()` is deleted.
- **Unwind:** `installDatasetPlugins` still disposes the installed plugins in reverse order, then throws `PluginSetupError`. Nothing else needs a teardown:
  - History and the store hold no outside resource.
  - The `WeakMap` key never escapes the constructor.

**D7. `data` becomes optional on `DataPluginOf`.** ⚠️
- A plugin that only declares (`phaseHierarchy()`) must not write `data() {}`. The harness is documentation.
- `assertChromeOnly` (`api/gantt.ts:283`) also refuses a Gantt plugin that has `fields`, `fieldTypes`, `aggregators` or `hierarchySource`.

**D8. New ADR 0031, "A plugin declares its shape; its code runs on a finished object".** ⚠️ (number and title)
- It records Q1, Q3 and Q4, and states that the Gantt half lands in PR 2.
- ADR 0019 and ADR 0020 get "amended by 0031" in status and in `docs/adr/README.md`. Do not rewrite their bodies.

## Facts found

- `src/data/dataset-state.ts:185-228`: build order is registry → `toEntries` → `EntryStore` → `PluginStores` → `installPlugins` (:220) → `applyConstructionRollUp` (:224) → `new History` (:228).
- `src/api/dataset.ts:159-168`: `#state` is assigned after `DatasetState` returns. `#installPlugins` (:174-215) reads `state`, not `this.#state`. It gates `setSource` (:202-205) with a `TProps` cast.
- `src/data/entry-store.ts:211`: `new Map(entries…)` collapses duplicate ids silently.
  - :135: the source is a signal.
  - :261: the constructor raises refusals.
  - :355-360: `setHierarchySource` raises them again. The de-dupe works on message text per revision (:288-299).
- `src/data/entry-store.ts:633`: `load` checks the raw `parentId` (reverted in 535897ef).
- `src/data/entry-store.ts:702-715`: the `#assertParentValid` comment says "Ingest checks no authored parentId". That is stale after Q3. Keep the `seen` guard: `replay()` (`src/data/replay.ts:17-25`) applies a ChangeSet unchecked, so a raw loop can still happen.
- `src/data/transaction.ts:161`: the construction Rollup report has no fallback.
- `src/data/entry-store.ts:372-378` and `src/api/dataset.ts:390`: the lock rule is read at each call.
- `src/data/history.ts:33`: History subscribes in its constructor. `#clear` (:73) exists for `'load'`.
- `src/api/plugin.ts:62`: `data` is required on `DataPluginOf`.
- Probe: construction check (raw `parentId`) against the full suite. 6 tests fail, and nothing else does:
  - `src/data/cyclic-hierarchy.test.ts`: 2 tests in P2-2 and 2 tests in ADR 0024 (a raw loop and a raw dangling id at construction).
  - `src/api/hierarchy-source.test.ts`: the two F4 tests (`parentId: 'nope'`).
- Probe: every shared fixture passes, under core's source and under the `phaseId` source. Checked: `demo`, `demoTree`, `hierarchy`, `planner`, `sample`, `multiYear`, `milestoneOnRangeEnd`, `seeded(10k)`. The harness-local lists (`e2e/data.ts` ROLLUP_TREE, `e2e/owning-parent.ts`, `hierarchy-and-timeline.ts:268`) are sound by inspection. e2e was not run.
- `scripts/check-doc-examples.mjs:43-49` typechecks `README.md` and `docs/`, ADRs excluded. So `docs/06` must change in the same commit as the API.

## Steps

Every commit is green on `pnpm verify:full`. Regenerate `etc/freegantt.api.md` in every commit that changes a public type. Steps run in order, and none run in parallel.

1. **ADR and specs** (docs only, about 1.5 h).
   - Add `docs/adr/0031-…md`.
   - Add the status note to ADR 0019 and ADR 0020, and update `docs/adr/README.md`.
   - Rewrite the stale reason ("a Field must exist before the first Rollup") and the `setSource` door in:
     - `plans/02-public-api.md` :134, :668, :683-688, :711
     - `plans/01-domain-architecture.md` :564, :799, :875, :886-888
     - `plans/s5-extensibility-and-editing/s5.1-plugin-runtime.md` D-S5-4 (:102-108). The Dataset reason becomes D5.
     - `s5.9-plugin-registrations.md` :24
     - `s5.10-dataset-plugins.md` :257, :265
   - `CONTEXT.md`:
     - Hierarchy source (:55): the door, and "construction throws on a raw parentId".
     - Plugin (:666): "runs after the Dataset is built".
     - Load (:146): "the constructor checks the same way".
   - Add #533 to `plans/issues/open/README.md`.
2. **The construction Rollup report reaches the console** (small, about 30 min). Red test in `rollup.test.ts`: construct with no subscriber, spy on `console.warn`, expect one line. Fix: add the fallback at `transaction.ts:161`. Keep the existing `installPlugins` test until step 7.
3. **Q3: construction throws on a broken batch** (medium, about 2 h).
   - Red tests in `api/dataset.test.ts`. `new Dataset` throws each typed error, and a child listed before its parent does not throw.
   - Code: in `dataset-state.ts`, pass `'new Dataset'` to `toEntries` and call `assertEntryBatchIsSound(read, 'new Dataset')` before `new EntryStore`.
   - Rewrite `cyclic-hierarchy.test.ts` P2-2 and the ADR 0024 tests. Reach the raw loop or the raw dangling id through `state.replay()` of a hand-built `'redo'` ChangeSet.
   - Rewrite the two F4 tests:
     - Construction now throws.
     - Reach `by: 'consumer'` at runtime: `sketch { parentId: 'build', phaseId: 'design' }` → `remove('build')` → `update('sketch', { phaseId: undefined })`.
   - Fix the comment at `entry-store.ts:702-705`.
4. **Declare `hierarchySource` on the plugin** (medium, about 3 h). Both doors exist after this step.
   - `api/plugin.ts`: add the member (D1) and the `never` on the Chrome arm.
   - `DatasetStateOptions.hierarchySourceWrappers`: in setup order, folded onto `storedParentSource`.
   - `EntryStore`: a 7th optional constructor argument, `hierarchySource`.
   - `api/dataset.ts`: build the list with `resolveSetupOrder`, then cast it once at the `TProps` boundary.
   - Red test: `api/hierarchy-source.test.ts` "a declared source nests, and the construction Rollup follows it". It gives `design` a cost of 15.
   - Move every case in that file to the member, except the gate test.
   - `docs/06-plugin-authoring.md`: show the member.
5. **`data` optional (D7)** (small, about 1 h). `api/plugin.ts`, `api/define-plugin.ts`, and `assertChromeOnly` plus its test in `gantt.test.ts`. Add a red type test: `definePlugin({ id, fields })` compiles and is refused on a Gantt.
6. **Harness: `phase-hierarchy.ts` declares its source** (small, about 20 min). Use `definePlugin<PhaseProps>`, drop `data()`, and fix its doc comment. Harness only.
7. **Remove `ctx.hierarchy.setSource`** (medium, about 1.5 h).
   - Delete everything named in D2.
   - Delete the gate test at `hierarchy-source.test.ts:398-414`.
   - Switch these tests to the `hierarchySourceWrappers` option: `rollup.test.ts:739`, `cyclic-hierarchy.test.ts:50`, `entry-store.load.test.ts:182`.
   - Update the docs in `model/hierarchy-source.ts:25,36`, `api/dataset-plugin.ts:27-30,75-94`, and the `docs/06` table (:263, :341).
8. **Lifecycle: `data()` runs on a finished Dataset** (medium-large, about 3 h). Must come after step 7. Otherwise the `phaseRows` Rollup test goes stale.
   - D6 and D3: `History.clear()` becomes public, and `DatasetState.clearHistory()` is new.
   - Red tests in `api/dataset.test.ts`:
     - (a) `ctx.dataset.entries.all` is readable in `data()`.
     - (b) `data()` reads a rolled-up parent value.
     - (c) A setup `store.set` fires `change` to an earlier plugin's handler, and `canUndo` is `false` after construction.
     - (d) A plugin's `change` handler reads `canUndo === true` inside a later user change.
     - (e) A throwing `data()` disposes the earlier plugins and throws `PluginSetupError`.
   - Change these expectations:
     - `plugin-store.test.ts:229-244`: delete it. Case (c) covers it on the public door.
     - `rollup.test.ts:268-296`: move it to the `console.warn` spy from step 2. Why: a `data()` subscriber now exists only after the construction report is raised.
     - `dataset.test.ts:712`: new name; the expectation stays `false`.
   - Rewrite the comments at:
     - `dataset.ts:96-104, 171-173`
     - `dataset-state.ts:80-97, 216-219`
     - `install-dataset-plugins.ts:8-9, 40, 84`
     - `api/plugin.ts:56-62`
     - `define-plugin.ts:14-17, 49-51`
     - `gantt.ts:246-248`
     - `field-registry.ts:5-8`
     - the `errors.ts:919` message
     - `docs/06` :24, :373-383, :427
9. **Harness: `lock-entries.ts` seeds in `data()`** (small, about 20 min).
   - Delete `seedLockedIdsOnce` and `lockedIdsSeeded`.
   - In `data()`, loop over `ctx.dataset.entries.all` and read `locked`.
   - Fix the header text ":31-33, :64-67".
   - `subtree-unlock.ts` needs no change.
10. **Close out** (small). Run `ocr review --from origin/main --to HEAD`. Review `harness/main.ts` (stop rule).

## Risks

- Stale raw `parentId` values under a plugin source now throw at construction (D4 ⚠️). A save file from `toInput()` can hold one. Example: `remove()` of a raw parent that the plugin tree did not nest under.
- A plugin can leak `ctx.dataset` from its factory. If a later `data()` throws, that reference points at a Dataset whose constructor threw. The same is true today. Document it, and do not guard against it.
- Plugin `change` handlers now run after History (D3). A test that expects the old order fails loudly in step 8.
- The `EntryStore` constructor grows to 7 positional arguments. An options object is a separate refactor.

## Out of scope — PR 2 (Gantt `view()`)

PR 1 must leave these in place:
- `Dataset.plugins` is read-only, and each Gantt still runs every Dataset plugin's `view` half.
- `resolveSetupOrder` and `RegistrationGate` (`extensions/`) stay shared.
- `PluginSetupError.wrongInstallSite` keeps its shape. Only the message text changes.

PR 2 owns:
- the `view()` timing in `gantt-shell.ts` (~1189) and the stale comment at ~899;
- `ctx.gantt.*` inside `view()`;
- events dropped before `#constructed`.
## Coordinator review (2026-09-23, approved with amendments)

The coordinator checked the key facts: ADR 0031 is the next free number, `History.#clear` exists
(`history.ts:80`), the construction Rollup report has no fallback (`transaction.ts:161`), and
`resolveSetupOrder` already orders the Dataset plugins (`install-dataset-plugins.ts:61`).

- **A1 — Docs land with the code that makes them true.** Step 1 carries the ADR and the `plans/` specs
  (the spec leads the code). Each `CONTEXT.md` line and each `docs/06` line moves into the code step
  that makes it true: Load and "construction throws" go in step 3, Hierarchy source in step 4 and step 7,
  and Plugin in step 8. No commit states a behaviour that the code does not have yet.
- **A2 — One review per commit.** The implementer commits each step, then stops and reports the sha.
  The commit reviewer checks it before the next step starts.
- **A3 — The ⚠️ calls stand for tonight.** D1 (helper type not exported), D3 (History cleared after
  setup), D4 (raw `parentId` check under a declared source, the same as `load` and ADR 0020 J54), and
  D7 (`data` optional). Each call follows an owner ruling or a locked ADR. The owner confirms them in
  the morning. A reversal of any one is a small follow-up commit.
