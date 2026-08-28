# S2B — Undo replay seam

**Slice:** S2 follow-up (gate already green; `.slice` stays `S3`) · **Closes:** D-S2-24’s “a consumer could write History” claim
**Spec:** D-S2-14, D-S2-24, D-S2-25, D-S2-11 · **Ends with:** History written against the public Dataset surface only.

## Problem

s2.5 §2.1 says a consumer History uses `on('change')` and `transaction()` only. D-S2-14 says undo/redo must not re-run the extension hook or the span rollup. `transaction()` always runs both. History therefore calls internal `commitChangeSet`. The two sentences cannot both be true. D-S2-14 stays. The §2.1 sentence is the one that was wrong.

## Decision

Publish the write path History already uses. Do not send undo through `transaction()`.

```ts
dataset.on('change', ({ changeSet }) => {
  if (changeSet.origin === 'user') record(changeSet);
});
dataset.replay(invertChangeSet(recorded));                 // undo
dataset.replay({ ...recorded, origin: 'redo' });           // redo
```

“Replay this changeset on the dataset.” True. D-S2-14 already uses **replay**. `apply` stays the deferred sync adapter (D-S2-11). `commitChangeSet` stays inside `data/`.

| Candidate | Result |
|---|---|
| `dataset.transaction(…, 'undo')` | Fails D-S2-14: the hook and rollup run. |
| `dataset.apply(changeSet)` | Fails D-S2-11: `apply` is the sync adapter, with conflict detection this slice does not ship. |
| `dataset.commitChangeSet(changeSet)` | Names the pipeline, not the job. |
| **`dataset.replay(changeSet)`** | Passes. Same `beforeChange`/`change` channel; no hook, no rollup. |

`invertChangeSet` is a pure function on a ChangeSet. It is not a Dataset method. It swaps `added`↔`removed` and each `updated` row’s `from`/`to`, and sets `origin: 'undo'`. Replay mints a fresh `ChangeSetId` and ignores the incoming `id`.

## Behaviour

- `replay` writes the rows as given. No extender. No rollup. `beforeChange` then `change` still fire (D-S2-25).
- `changeSet.origin` must be `'undo'` or `'redo'`. `'user'` throws — that door is `apply`, later.
- An empty changeset is a no-op: no event, no throw.
- A veto throws `MutationCancelledError` and writes nothing. History still moves its cursor only on `change`.
- Built-in `undo()`/`redo()` keep the same public shape. They call `replay`. A consumer never has to.

## Tests

- Existing History tests stay green (cascade undo, refused undo, origin filter).
- One new test writes a tiny History using only `Dataset` public members: `on`, `off`, `replay`, `invertChangeSet`. No `data/` import. Undo of a rollup cascade restores both rows.
- `replay` with `origin: 'user'` throws. An injected extender is not called.
- `api-report` records `replay` and `invertChangeSet`.

## Spec edits (land with the code)

- s2.5 §2.1: drop “and `transaction()`”. The consumer surface is `on('change')`, `invertChangeSet`, `replay`.
- CONTEXT.md **History**: same sentence. Add **Replay**: applying a recorded ChangeSet exactly, skipping the hook and the rollup. _Avoid:_ apply (sync adapter), commit (the transaction’s moment).
- `plans/02` §2 and README §3: `Dataset.replay`, `invertChangeSet`.

## TODO

- [x] `invertChangeSet(changeSet)` public; no `id` argument — replay mints the id
- [x] `Dataset.replay(changeSet)` → `commitChangeSet`; origin `'undo' | 'redo'` only
- [x] `History.undo`/`redo` call `replay`; they import nothing from `transaction.ts`
- [x] Consumer-History test on the public surface only
- [x] Spec edits above; `api-report` updated
