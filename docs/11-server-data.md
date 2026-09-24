# Server data — polling with `entries.sync()`

**Scope:** `dataset.entries.sync(rows)` for app authors who poll a server and want the user's own
edits to survive the poll. See [`docs/05-consumer-api.md`](05-consumer-api.md) for the rest of the
consumer surface, and [`docs/06-plugin-authoring.md`](06-plugin-authoring.md) for how a plugin
should read a `'sync'`-origin `change`.

Every example below typechecks against the built package types on each CI run
(`scripts/check-doc-examples.mjs`), so none of it can drift from the shipped API.

## Load vs sync

`entries.load(rows)` is a full fresh start. It removes every entry the Dataset holds and adds every
row in `rows`, with no diff. It clears History (`canUndo`/`canRedo` both read `false` right after) —
the same posture a desktop app takes opening a file. Use it once, at startup.

`entries.sync(rows)` is a poll. It matches the live Dataset to `rows` by diffing: an id `rows` omits
is removed, a key a kept entry's input omits is cleared, and a Field whose value did not change
writes no row. Call it every time your poll returns a fresh list.

## A sync records no undo step

Unlike a user edit, `sync` commits its one `ChangeSet` with `origin: 'sync'`, and the undo History
does not record it. It does not clear Redo either. A user's own earlier edits stay undoable across
any number of polls:

<!-- doc-example-setup
declare const dataset: import('freegantt').Dataset;
declare function fetchRowsFromServer(): import('freegantt').FlatEntryInput[];
-->

```ts
dataset.entries.update('t1', { name: 'Renamed by me' }); // origin 'user', canUndo is now true

dataset.entries.sync(fetchRowsFromServer()); // origin 'sync' — records no step

dataset.canUndo; // still true — the poll did not touch it
```

A sync that changes nothing commits nothing at all: no `beforeChange`, no `change`, no undo step.
That is the common case for a poll that finds nothing new.

## The conflict rule: last write wins, undo still remembers

A sync overwrites a local edit the server has not seen — last write wins. But undoing that edit
later writes the value it held **before** the edit, not the server's value, even though a sync
changed the field since. Redoing that same step gives the server's value back:

```ts
dataset.entries.update('t1', { name: 'Renamed locally' }); // the server has not seen this yet

dataset.entries.sync(fetchRowsFromServer()); // the server sends its own name for 't1' — it wins

dataset.undo(); // 't1'.name goes back to what it was before "Renamed locally"
dataset.redo(); // 't1'.name goes back to the server's value
```

Undo and redo both write onto the entry's **current** value, not the one the step recorded — see
[`docs/05-consumer-api.md`](05-consumer-api.md#undo-redo-and-the-change-event) for `Dataset.replay`,
the primitive both are built on.

## A step with nothing left to write is skipped

A sync can remove the very id an undo step would touch, or settle the exact value it would restore.
When that happens, that step has nothing left to write. Undo (or redo) skips it and tries the next
step in the same call, so one click always lands a step when any undoable one remains:

- **The id is gone.** A step that added an entry the sync later removed cannot be undone by
  removing it again — there is nothing left to remove. The step is skipped.
- **The id came back.** A step that removed an entry the sync later re-sent (the server never saw
  the removal) cannot be undone by re-adding it — it is already there, with the server's own
  values. The step is skipped, and the server's entry is kept.
- **The field already reads that value.** A step that changed a Field to the value the sync later
  set independently has nothing left to write for that field.

## No parent loop, no dangling parent, ever

An undo or a redo never leaves a parent cycle or a reference to a removed id, even when a sync moved
entries around since the step was recorded. When a step's recorded parent would create a loop, or
names an id the sync removed, the write lands the entry as a root instead of raising an error.

## Sibling order and rollup after a sync-crossed undo

An undo or a redo renumbers every sibling group it touches, dense from zero, the same rule every
other write follows. A parent's rolled-up cell (a Field with `rollUp` declared) re-rolls from its
current children whenever a write touches that parent, construction shape — so a rolled-up total
stays correct even when a sibling the recorded step never mentioned changed since, through the sync.

## Per-entry state

A kept id keeps its Map slot across a sync: selection, collapse state, and a plugin's store row for
that id all survive. A removed id loses them right away. An undo that brings a removed id back also
brings its plugin store rows back with it.

## A note on locks

A `'never'`-locked Field is written anyway by `load` and `sync` — construction-time and poll writes
both ignore a lock the same way, since neither runs the edit pipeline a locked cell guards. Tracked
further at [#541](https://github.com/freegantt/freegantt/issues/541).

## A poll loop

```ts
declare function startPollTimer(callback: () => void): { stop(): void };

function startPolling(dataset: import('freegantt').Dataset) {
  return startPollTimer(() => {
    dataset.entries.sync(fetchRowsFromServer());
  });
}
```

Stop the timer when the Gantt unmounts. `sync` itself needs no other bookkeeping: call it as often
as your poll interval allows, and the user's own edits stay safe until the server catches up.

## Related

- [Consumer API index](05-consumer-api.md) — undo, redo, and the `change` event.
- [Plugin authoring guide](06-plugin-authoring.md) — reacting to a sync from inside a plugin.
- [API reference](../etc/freegantt.api.md) — generated `EntryStore.sync`, `EntryStore.load`.
