# Code review — S2.5 undo/redo and S2.6 serialization

**Fixed point:** `d7f7a34` (three-dot: `git diff d7f7a34...HEAD`)
**Commits:** `f5f2691` S2.5 · `29553cc` undo button lag · `ba1db86`…`344ffe0` S2.6
**Spec sources:** `plans/s2-data-core/s2.5-undo-redo.md`, `s2.6-serialization.md`, D-S2-11/12/13/14/23/24/25
**Issue tracker:** `docs/agents/issue-tracker.md` is missing (the skill asks for `/setup-matt-pocock-skills`). Slice specs above were used instead of GitHub issues.

This review does **not** merge the two axes.

## Standards

### Hard (documented)

**`src/data/history.ts` cursor (was a breach; this session aligned it).**
S2.5 §2.2 / D-S2-25: the cursor moves on the `change` the undo commit emits, never on the `undo()` call. The range as committed (`29553cc`) moved the cursor in `undo()`/`redo()` then rolled it back in `catch`. That is the pattern the spec rejects. After this review’s simplify pass, History’s `#onChange` moves the cursor (History is the first subscriber), so a later handler — including the harness buttons — already reads the post-move flags. A veto never emits `change`, so the stack does not move.

**`src/api/dataset.ts` — `plans/01` §1: only `api/` and `model/` types are public.**
The range typed `DatasetOptions.history` as `HistoryOptions` imported from `data/`, and `api/index.ts` did not re-export that name. S2.5 §1 already publishes `history?: { capacity?: number }`. This session inlined that shape on `DatasetOptions`.

### Judgement (smells; repo rule wins)

**D-S2-24 vs `commitChangeSet`.** S2.5 §2.1 says a consumer History uses `on('change')` and `transaction()` only, and undo goes through `runTransaction(..., 'undo')`. This History calls `commitChangeSet`. **`plans/01` §6 wins:** undo must not re-run the extension hook or the Rollup, so `runTransaction` is the wrong path. Not a ChangeSet rename (ADR 0006). Recorded as an architecture candidate, not a rename.

**Possible Speculative Generality:** `History.dispose()` — unused; the file says Dataset has no `dispose()` yet.

**Possible Duplicated Code:** `isDevMode` in `transaction.ts` and `serialization/index.ts`. Do not import from `view/`.

**D-S2-23 leaf:** production importers match (`history` ← `dataset-state`; serialization ← `api/dataset.ts`). `history.property.test.ts` importing `serialization/` is a cruiser exception for `[S2-A1]`.

**Façade `Dataset` → `DatasetState` → `History`:** Middle Man on the baseline; **layers require it** — suppress.

Leaves, one change channel for recording, `beforeChange` veto, and `undo()` returning void align with D-S2-23/24 and `plans/02`.

## Spec

### (a) Missing or partial

**`fromJSON<TMeta>` vs non-generic `Dataset`.** Spec: `static fromJSON<TMeta>(doc: DatasetDocument): Dataset<TMeta>;` (`s2.6` §1.3). Landed: `static fromJSON(doc: DatasetDocument): Dataset`. `DatasetDocument` takes `TMeta`; the façade class does not.

**Removability test does not construct without History.** Spec: “a `DatasetData` constructed with no history records nothing and commits identically” (`s2.5` §4). `DatasetState` always constructs History. The test only checks a user `change` origin. Cruiser owns the import graph; the behavioural half of the box is incomplete.

**`[S2-A1]` generators are thinner than §3.** Spec: “`update` (each editable field)” and “`remove` (including a parent with a subtree)”. Generators cover name/progress/start/end. Seed parent `p` is not in the id set the generator removes, so a parent+subtree remove is not generated.

**`data/` imports serialization in tests.** Spec: “Nothing in `data/`, `layout/` or `view/` may import the directory” (`s2.6` §1.5). `history.property.test.ts` imports `serialization/` (allowlisted). `[S2-A1]` needs `toJSON()`; it can go through the Dataset façade.

### (b) Not asked for

**`commitChangeSet` as a second apply path** used by History. Spec’s consumer story is `on('change')` and `transaction()` only (`s2.5` §2.1). Needed so undo does not re-run the extender (D-S2-14). Scope the spec did not name; behaviour the spec also requires.

### (c) Present but wrong vs spec (as committed)

**Cursor on `undo()`.** Quoted: “**The cursor moves on the `change` the undo commit emits, never on the `undo()` call** (D-S2-25).” Same paragraph: “Moving the cursor first and rolling it back on failure is two places that have to agree — hanging it off the event is one.” The committed `29553cc` pattern matched the rejected design. **Fixed in this review** by hanging the move on `#onChange`.

**Undo does not go through `runTransaction`.** Quoted: “Undo itself runs back through the ordinary path — `runTransaction(data, …, 'undo')`”. Undo/redo call `commitChangeSet` to skip extender/rollup. That matches D-S2-14 / §2.2 “Neither re-runs the extension hook” and fights the `runTransaction` sentence. A consumer cannot write `history.ts` with only `transaction()`. **Still open** — see architecture candidate 1.

## Summary

- **Standards:** 2 hard findings in the committed range (cursor, `HistoryOptions` leak). Both addressed in this session’s simplify pass. Worst remaining judgement: `commitChangeSet` vs D-S2-24’s “`transaction()` only” story.
- **Spec:** 4 partial boxes (`TMeta`, no-history construct, `[S2-A1]` generators, test import of serialization). Worst remaining: undo replay is not `runTransaction`, and a consumer cannot copy History using only the published Dataset methods.
