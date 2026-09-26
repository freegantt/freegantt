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

A sync compares declared Fields only. An undeclared `props` key on a kept entry is not written, even
when the server changed it. A new entry still gets it, because a sync adds a new entry the same way
`load` does. Declare a Field for every server value that a poll must keep up to date.

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

## The conflict rule: last write wins, and undo keeps the server's value

A sync overwrites a local edit the server has not seen — last write wins. An undo never writes
over a colleague's value. When a sync changed a Field that an undo step wrote, the undo keeps the
server's value for that whole entry:

```ts
dataset.entries.update('t1', { name: 'Renamed locally' }); // the server has not seen this yet

dataset.entries.sync(fetchRowsFromServer()); // the server sends its own name for 't1' — it wins

dataset.undo(); // 't1' keeps the server's name; the step has nothing left to write
```

The rule reads values, not origins. A Field is a **foreign write** when its current value is
neither the value the step recorded nor the value the undo would restore. When one Field of an
entry is a foreign write, the undo writes no Field of that entry. So a step that moved `start` and
`end` together never lands half of that move. Other entries in the same step still land. A
sync that changed only a Field the step never wrote blocks nothing.

Redo follows the same rule. See
[`docs/05-consumer-api.md`](05-consumer-api.md#advanced-your-own-history-with-datasetreplay) for
`Dataset.replay`, the primitive both are built on.

To write the step over a foreign write instead, own undo in the app: construct with
`history: false`, and call `dataset.replay(step, { overwriteForeignWrites: true })`.

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
- **The sync changed the entry.** Every Field row of an entry with a foreign write is kept, under
  the conflict rule above. When that leaves the step empty, the step is skipped.
- **The children a sync added since.** Undoing an `add` step removes the whole entry, the same way
  `entries.remove()` does. Any child the sync placed under it since goes with it.

When every remaining step is skipped this way, the `undo()` or `redo()` call writes nothing and
fires no `change`. `historyChange` still fires when `canUndo` or `canRedo` changes, so a toolbar
that listens to it stays correct (see
[`docs/05-consumer-api.md`](05-consumer-api.md#undo-redo-and-the-change-event)).

## No parent loop, no dangling parent, ever

An undo or a redo never leaves a parent cycle or a reference to a removed id. This holds even when a
sync moved entries around since the step was recorded. What happens next depends on the kind of step:

- **An entry already there.** A step can change an *existing* entry's parent to one that loops back
  on itself, or to an id the sync removed. That one change is dropped, and the entry stays under
  its current parent — the nearest sound place it already has.
- **An entry the step re-adds.** A step that re-adds a removed entry, and recorded a parent the sync
  has since removed, lands that entry as a root instead. A fresh add has no current parent to fall
  back to, unlike an entry that was already there.

Either way, the write never raises an error and never leaves a loop or a dangling reference.

## Sibling order and rollup after a sync-crossed undo

An undo or a redo renumbers every sibling group it touches, dense from zero, the same rule every
other write follows. A parent's rolled-up cell (a Field with `rollUp` declared) re-rolls from its
current children whenever a write touches that parent. A parent that loses its last child keeps its
own value. This keeps a rolled-up total correct even when a sibling the recorded step never
mentioned changed since, through the sync.

## What an undo or redo change carries after a sync

`change` on an `'undo'`/`'redo'`-origin write can carry more, and less, than the step first recorded:

- **`from` can be the server's value.** A row's `from` reads the value the field held right before
  this write. Under `overwriteForeignWrites: true`, that can be the server's value, not the value
  the original step recorded.
- **Rows the step never recorded can appear.** A sibling group's renumber rows, and a rolled-up
  parent's own row, land whenever the write touches that group or that parent. The original step
  can have never mentioned either one.
- **Rows the step recorded can be missing.** A row can be skipped under the rules above: a gone id,
  a settled field, a re-added entry, a dropped parent, a foreign write. A skipped row is left out
  of the changeset.

An app that saves its own changes to a server should treat an `'undo'`/`'redo'`-origin commit the
same way it treats a `'user'`-origin one. Either one can carry a real, novel write.

## Per-entry state

A kept id keeps its Map slot across a sync: selection, collapse state, and a plugin's store row for
that id all survive. A removed id loses them right away. An undo that brings a removed id back also
brings its plugin store rows back with it.

## A note on locks

- A `'never'`-locked Field is written anyway by `load` and `sync` — construction-time and poll
  writes both ignore a lock the same way, since neither runs the edit pipeline a locked cell guards.
- A sync can set a `locked` Field itself. A consumer's own `beforeChange` handler can veto an edit
  to a locked entry, and that veto can catch an `'undo'` or a `'redo'` changeset too — a lock set
  after the edit it undoes still guards it, and the veto fires on every click, not just the first
  one. An undo reverses the user's own step, not a new edit, so a consumer's lock should let
  `'undo'` and `'redo'` through the same way the harness lock (`harness/plugins/lock-entries.ts`)
  does.

## A poll loop

```ts
declare function startPollTimer(callback: () => void): { stop(): void };

function startPolling(dataset: import('freegantt').Dataset) {
  return startPollTimer(() => {
    dataset.entries.sync(fetchRowsFromServer());
  });
}
```

Stop the timer when the Gantt unmounts. Call `sync` as often as your poll interval allows. The user's
own edits stay undoable across every poll.

A sync does not know which local edits the server has not saved yet. A poll that returns before the
server saves an edit writes the server's older value over it, under the conflict rule above. To keep
an unsaved edit on screen, do one of these:

- Skip the poll while a save is in flight.
- Copy the unsaved value into that entry's row in `rows` before you call `sync`.

## Related

- [Consumer API index](05-consumer-api.md) — undo, redo, and the `change` event.
- [Plugin authoring guide](06-plugin-authoring.md) — reacting to a sync from inside a plugin.
- [API reference](../etc/freegantt.api.md) — generated `EntryStore.sync`, `EntryStore.load`.
