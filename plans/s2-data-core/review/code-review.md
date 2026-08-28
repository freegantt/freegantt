# Code review — S2 branch

**Fixed point:** `main` (`5761462`) (three-dot: `git diff main...HEAD`)
**Commits:** 49 on `s2-s2` (`ee4638c` S2.1 … `e6d4674` S2.7). This session’s simplify is uncommitted on top.
**Spec sources:** `plans/s2-data-core/README.md` (D-S2-1–26, §3 surface, U1–U9, [S2-A1]–[S2-A4]), `plans/03` §S2, step files s2.1–s2.7, GitHub #33, #15 (hook only in S2).
**Issue tracker:** `docs/agents/issue-tracker.md` is missing (the skill asks for `/setup-matt-pocock-skills`). Slice specs above were used instead of GitHub issue bodies as the primary spec.

This review does **not** merge the two axes.

## Standards

### Hard (documented)

**Public types a caller cannot name — was a breach; this session aligned it.**
README §3 lists `CoreFieldKey` and `changeSetId`. `Duration` names `TimeUnit`. The committed report warned `ae-forgotten-export` for `CoreFieldKey` and `TimeUnit`. `src/api/index.ts` now re-exports all three plus `now`. **AGENTS.md harness-review / I10:** `harness/data.ts` used `instant(Date.now())`; it now calls public `now()`.

**Two meanings of Snapshot — was a breach; this session aligned it.**
CONTEXT.md Snapshot is `entries.all`. `EntryStore.snapshot()` returned `ReadonlyMap<EntryId, Entry>`. **Naming skill check 4 / AGENTS.md one name per concept.** Renamed to `committedById()`. Call: `data.entries.committedById()`.

**`bindTransactions` used Binding’s word.** CONTEXT.md Binding is `layout/viewport/`. Call `this.entries.bindTransactions(this)` failed naming check 2. Renamed to `setTransactionRunner`.

### Judgement (smells; repo rule wins)

**Possible Speculative Generality:** `History.dispose()` — unused. **Removed** this session.

**`EntryStore` / `StoreName` on the public barrel.** CONTEXT.md Store: “not a consumer-facing word; `dataset.entries` is the published call site.” Exporting `EntryStore` fights that. **plans/01 §1** (only `api/`/`model/` types are public) also forces a name for `dataset.entries`. Mysterious Name, not a rename mandate. `StoreName` stays: README §3 lists it.

**`EntityAdded.entity`.** Glossary term is Entry (naming check 1). The S3 `plugin:` arm of `StoreName` may override; otherwise Speculative Generality.

**Duplicated Code:** `get` / `has` / `size` each replay the write-set overlay (`entry-store.ts`).

**`Dataset` class implements model `Dataset`.** api-extractor still emits `Dataset_2`. Two “Dataset” types confuse agents. Layer façade is required (CONTEXT.md DatasetState) — suppress Middle Man; the forgotten-export remains.

Suppressed: Dataset class as Middle Man (CONTEXT.md DatasetState). Shotgun across the slice files is the slice, not a module split. `identityExtender` / `EditRequest` staying in `data/` matches D-S2-6.

Leaves, one change channel, `beforeChange` veto, and `undo()` returning void align with D-S2-23/24/25.

## Spec

Prior S2.5/S2.6 bugs (cursor on `change`, `HistoryOptions` leak, undo `undefined` keys, undo-all order, `fromJSON` `RangeError`, ISO vs Instant warn) look **fixed**. #33: no public `gantt.setEntries`; `GanttShell` pushes `entries.all` from `on('change')`. #15: no public `plugins` / `setExtender` / `declareStore`.

### (a) Missing or partial

**`fromJSON<TMeta>` / generic `Dataset`.** s2.6 §1.3: `static fromJSON<TMeta>(doc: DatasetDocument): Dataset<TMeta>`. `plans/02` §1.6: “`new Dataset<{ team: string }>`”. Landed: non-generic `class Dataset`; `fromJSON(doc: DatasetDocument): Dataset`. `DatasetDocument<TMeta>` exists; the façade does not carry it.

**`[S2-A1]` generators thinner than s2.5 §3.** Spec: “`update` (each editable field)” and “`remove` (including a parent with a subtree)”. Generators cover name/progress/start/end. Seed parent `p` is not in the remove id set.

**Serialization import in `data/` tests.** s2.6 §1.5: “Nothing in `data/`, `layout/` or `view/` may import the directory”. `history.property.test.ts` still imports `serialization/` (cruiser exception). Spec comparison is `dataset.toJSON()`.

**No-history construct still incomplete.** s2.5 §4: “a `DatasetData` constructed with no history records nothing and commits identically”. `DatasetState` always constructs `History`. The test only checks a `'user'` origin.

**`OPEN-QUESTIONS.md` not deleted.** s2.7: “Deleting the file when its last entry closes is the intended end state.” OQ8 is still **OPEN** (S3). File staying matches “last entry”; the S2.7 TODO that demanded deletion in this slice overreaches.

**`DatasetData` leftovers vs OQ5 `DatasetState`.** Code is `DatasetState`. README Q1/D-S2-6/D-S2-24, `plans/03` §S2 (“`DatasetData` owning stores”), s2.5 §4, s2.7 importer `src/data/dataset-data.ts`, and OQ8 still say `DatasetData`.

**s2.7 TODO boxes still `[ ]`** while `.slice` is `S3` and the gate work landed.

**`CoreFieldKey` / `changeSetId` not on the public barrel** — quoted README §3. **Fixed this session.** `TimeUnit` (via public `Duration`) and `now()` (harness `Date.now()`) landed with them.

### (b) Not asked for

**`addMs` / `MS` / `now` on the public surface** (S2.7 + this session). README §3 does not list them. Needed so `harness/data.ts` does not add epoch ms or call `Date.now()` itself.

**`dateOnlyEnd` / `derivedSpanKinds` getters** and public `childrenOf` sit outside the §3 table (`all`/`get`/`has`/`size` + add/update/remove). `childrenOf` is required by D-S2-21.

### (c) Implemented but wrong vs spec

**D-S2-24 consumer History vs `commitChangeSet`.** s2.5 §2.1: undo through `transaction()`. History calls `commitChangeSet` so it does not re-run the hook (D-S2-14 / §2.2 “Neither re-runs the extension hook”). A consumer cannot copy History with public `Dataset` methods only. **Still open.**

**D-S2-5 vs landing:** `DatasetEventMap` lives in `model/`, not `data/`. Intentional S2.2 move so `MutationCancelledError` can carry a changeset; README D-S2-5 was not updated.

## Summary

- **Standards:** 3 hard findings in the committed range (forgotten public names, Snapshot collision, Binding word on the store). All three addressed in this session’s simplify pass. Worst remaining judgement: `commitChangeSet` vs D-S2-24’s “`transaction()` only” story, and the `Dataset` / `Dataset_2` report warning.
- **Spec:** 6 partial boxes (`TMeta`, generators, test import of serialization, no-history construct, DatasetData leftovers, s2.7 TODO ticks). Worst remaining: undo replay is not `runTransaction`, and a consumer cannot copy History using only the published Dataset methods.
