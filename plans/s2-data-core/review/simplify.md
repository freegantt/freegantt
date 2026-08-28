# Simplify — S2.5 / S2.6

**Scope:** `git diff d7f7a34...HEAD` (plus targeted follow-up edits in this session). Uncommitted `src/render/dom/sync-keyed.ts` was left alone.

Three read-only reviewers (quality, performance, reuse) ran in parallel. Fixes below are the ones that reduce complexity without a larger redesign.

## Fixed

1. **History cursor on `change` (D-S2-25).** `undo()`/`redo()` no longer move the cursor then catch. `#onChange` records `'user'` and steps the cursor on `'undo'`/`'redo'`. History is the first subscriber, so harness `canUndo`/`canRedo` readers still see the post-move flags. A veto throws and never emits `change`. New test: undo’s own `change` handler reads `canUndo === false`.

2. **Public History options stay on `DatasetOptions`.** `api/dataset.ts` no longer imports `HistoryOptions` from `data/`. Consumers write `new Dataset({ …, history: { capacity: 200 } })` — the call S2.5 §1 already published.

3. **`runTransaction` closes the body write set before `commitChangeSet`.** The shared tail used to call `beginTransaction` on an already-open overlay and wipe it. The body now ends with `undefined` (store still committed-only), then replay opens its own transaction.

4. **Insertion-order restore is one rebuild, not one Map rebuild per restored Entry.** Field-only commits skip the id-index copy. `'user'` adds append and drop tombstones. Undo/redo adds splice once, then one `Map`.

5. **Stale `notifying` comment** on `DatasetState` now names `commitChangeSet` as a writer.

## Skipped (recommend)

| Finding | Why skipped |
|---|---|
| `History.dispose()` unused | Needs a Dataset dispose path. Comment already says so. |
| Extract `isDevMode` | Two copies in `data/`. A shared helper needs a home both files may import; `view/` is illegal. Small. |
| `readers` map of size one | Spec wants a map addition for schema 2. |
| `writeSegments` one-off | Inlining saves little. |
| `Dataset`/`DatasetState` undo passthrough | Layer façade. |
| Ring buffer instead of `stack.shift()` | Cap is 100. |
| Named replay on the Dataset interface so a consumer History does not import `commitChangeSet` | Architecture candidate 1 — not a local cleanup. |
| `[S2-A1]` through `Dataset.toJSON` only | Architecture candidate 4. |
| Carry restore index on the ChangeSet row | Architecture candidate 3. |
| Generic `Dataset<TMeta>` | Touches the whole façade. |

## Checks

`vitest run` on history (example + property), serialization, `api/dataset`, entry-store, transaction: **91 tests passed**. `pnpm verify` was not run (full gate).
