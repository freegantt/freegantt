---
status: accepted — ruled 2026-11-22 by the owner. Follows [ADR 0035](0035-sync-writes-like-load-and-undo-stays-local.md) and [ADR 0036](0036-an-undo-keeps-a-foreign-write.md).
decided: `history.beforeStep` may hold an undo or a redo until a server answers. `undo()` and `redo()` return `Promise<HistoryOutcome>`. Each step carries `meta` that the consumer sets. One step runs at a time.
open: none.
---

# A history step can wait for a server

## Context

ADR 0035 keeps undo local. A server-backed app must undo on the server too. Its server returns a change token for each write. The app must send that token to undo the write. `dataset.history: false` plus `replay()` lets an app own undo, but it then loses Ctrl+Z, the capacity limit and the foreign-write rule.

A first idea tagged "the last step" with the token. That races: a second change can land before the token returns, and "last" is then the wrong step.

## Decision

```ts
new Dataset({ history: { capacity: 50, beforeStep } });

type HistoryStepHook = (step: HistoryStep) =>
  void | boolean | { meta: unknown } | Promise<void | boolean | { meta: unknown }>;

interface HistoryStep {
  direction: 'undo' | 'redo';
  changeSet: ChangeSet;
  meta: unknown;
  refuse(reason: string): false;
}

dataset.undo(): Promise<HistoryOutcome>;
dataset.redo(): Promise<HistoryOutcome>;
type HistoryOutcome = 'applied' | 'nothing' | 'busy' | { refused: string };
```

- **Token per step**: an async `beforeEntryMove` or `beforeEntryResize` hook, or a commit, resolves `{ meta }`. The library stores `meta` on the step that commit makes. The library never tags "the last step".
- **Token for the inverse step**: `beforeStep` may resolve `{ meta }`. The library stores it on the inverse step, so redo has the token the server returned for the undo.
- **One step at a time**: `undo()` or `redo()` while a step waits resolves `'busy'`.
- **A commit while a step waits**: the commit is queued and applies after the step ends. A refused step drops nothing from the queue.
- **A refusal**: history stays where it was. An Error report carries the reason (ADR 0009).
- **Ctrl+Z** takes the same path.
- **No hook**: behaviour is as today. The step applies in the same tick.

## Options rejected

- **`tagLast(meta)`.** It races, as the Context says.
- **`history: false` and `replay()`.** The app rebuilds capacity, Ctrl+Z and the foreign-write rule.

## Consequences

- **Breaking, type only**: `undo()` and `redo()` return a Promise. A caller that ignores the result works as before. A caller that types the result as `void` drops that annotation. The CHANGELOG says so.
