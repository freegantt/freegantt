# Simplify — S2 branch (`main...HEAD`)

Three read-only reviewers (quality, performance, reuse) ran in parallel. Fixes below reduce complexity or reuse existing patterns without a larger redesign.

## Fixed

1. **Public names a caller can type.** `api/index.ts` now re-exports `CoreFieldKey`, `changeSetId`, `TimeUnit`, and `now`. README §3 already listed `CoreFieldKey` and `changeSetId`. `Duration.unit` and `FieldKey` needed those names. The Add-entry button used `instant(Date.now())`; it now calls `now()`. Call sites: `new Dataset({ … })`, `changeSetId(1)`, `now()`, `addMs(start, MS.DAY)`.

2. **`snapshot()` renamed to `committedById()`.** CONTEXT.md Snapshot is `entries.all`. The method returns the committed by-id Map the commit path diffs against. `data.entries.committedById()` reads true. Locals in `transaction.ts` are `byId`.

3. **`bindTransactions` renamed to `setTransactionRunner`.** Binding is `layout/viewport/`'s word. `this.entries.setTransactionRunner(this)` reads "set the transaction runner on the entries".

4. **`History.dispose()` removed.** Nothing called it. A Dataset still has no `dispose()`.

5. **`invertChangeSet` lives next to `foldChangeSet`.** Undo invert is changeset algebra, not History policy. History calls `invertChangeSet(id, changeSet)`.

6. **Dead type re-exports dropped** from `data/change-set.ts` (nothing imported them from that file).

7. **Removal-index lookup is one Map**, not `indexOf` per removed id.

8. **API report updated** (`etc/freegantt.api.md`) for the new exports.

## Skipped (recommend)

| Finding | Why skipped |
|---|---|
| Extract `isDevMode` | Two copies in `data/`. A shared helper needs a home both files may import; `view/` is illegal. Small. |
| `readers` map of size one | Spec wants a map addition for schema 2. |
| Drop public `EntryStoreView` / `StoreName` | README §3 and D-S2-2 publish them. |
| Drop `batch` from the reactivity façade | The test documents the third primitive. |
| Collapse `setTransactionRunner` / constructor cycle | Needs a construction-order redesign. |
| Fold `TxToken` into the lint rule alone | Larger; the token is the type-level gate. |
| `fromJSON<TMeta>` / generic `Dataset` | Touches the whole façade. |
| Span rollup walks the whole snapshot each commit | Larger; walk from the changeset. |
| Skip `setEntries` unless start/end/segments moved | Changes fitDataset invalidation; needs its own test. |
| Rebuild `#byParent` only on structural change | Same class as D-S2-16, different index. |
| One Entry copy per id in `endTransaction` | Local, low payoff next to the rollup cost. |
| `#restoreAdded` without per-row splice | Correctness of multi-index restore is the splice order. |
| `#subtreeOf` worklist | Deep remove is not the hot path. |
| Harness `MutationCancelledError` helper | Five copies teach the public catch; hide that and the example is worse. |
| Named public replay so a consumer History skips `commitChangeSet` | Architecture, not a local cleanup. |
| Delete `OPEN-QUESTIONS.md` | OQ8 is still open (S3). |
| Tick s2.7 TODO boxes / DatasetData leftovers in plans | Docs ledger, not this cleanup. |

## Checks

`vitest run` on change-set, history (example + property), transaction, entry-store, `api/dataset`, instant: **100 tests passed**. `tsc --noEmit` green. ESLint on touched files green. Lib build + `api-extractor run --local` updated the report. `pnpm verify` was not run (full gate).
