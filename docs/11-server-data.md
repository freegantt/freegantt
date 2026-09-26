# Server data — polling with `entries.syncAll()` and `entries.syncChanges()`

**Scope:** `dataset.entries.syncAll(rows)` and `dataset.entries.syncChanges(delta)` for app authors
who poll a server and want the user's own edits to survive the poll. See
[`docs/05-consumer-api.md`](05-consumer-api.md) for the rest of the consumer surface, and
[`docs/06-plugin-authoring.md`](06-plugin-authoring.md) for how a plugin should read a
`'sync'`-origin `change`.

Every example below typechecks against the built package types on each CI run
(`scripts/check-doc-examples.mjs`), so none of it can drift from the shipped API.

## Load vs sync

`entries.load(rows)` is a full fresh start. It removes every entry the Dataset holds and adds every
row in `rows`, with no diff. It clears History (`canUndo`/`canRedo` both read `false` right after) —
the same posture a desktop app takes opening a file. Use it once, at startup.

`entries.syncAll(rows)` is a poll. It matches the live Dataset to `rows` by diffing: an id `rows` omits
is removed, a key a kept entry's input omits is cleared, and a Field whose value did not change
writes no row. Call it every time your poll returns a fresh list.

A sync compares declared Fields only. An undeclared `props` key on a kept entry is not written, even
when the server changed it. A new entry still gets it, because a sync adds a new entry the same way
`load` does. Declare a Field for every server value that a poll must keep up to date.

## Sync only what changed

`entries.syncChanges(delta)` takes only the rows a server changed, not the whole list. Use it when
your server already tells you what changed — a webhook payload, a diff endpoint, a change feed.

<!-- doc-example-setup
declare const dataset: import('freegantt').Dataset;
-->

```ts
dataset.entries.syncChanges({
  upsert: [{ id: 't1', name: 'Renamed on the server' }],
  remove: ['t9'],
});
```

An `EntryDelta` has two parts, both optional: `upsert`, rows to add or change, keyed by `id`; and
`remove`, ids to drop, each with its subtree.

**Upsert adds or edits.** An id the Dataset does not hold adds an entry, the same rule `add()`
follows. An id it holds takes the row as a partial edit: a key the row leaves out keeps its stored
value, and a key set to `undefined` clears it, the same rule `update()` follows.

<!-- doc-example-setup
declare const datasetWithCost: import('freegantt').Dataset<{ cost: number }>;
-->

```ts
datasetWithCost.entries.update('t2', { name: 'Kept locally', cost: 500 });

datasetWithCost.entries.syncChanges({ upsert: [{ id: 't2', cost: 600 }] }); // name stays 'Kept locally'
```

**Remove drops a subtree.** Each removed id takes its whole subtree with it, the same rule
`entries.remove()` follows. An id the Dataset does not hold is ignored, so a retried delta is safe
to send again. An id named in both `upsert` and `remove` throws `DuplicateEntryIdError` — a server
that sends both has a bug, and picking a winner would hide it.

**The tree check reads the store and the delta together.** A row's `parentId` can name an id already
in the store, or an id the same delta adds. An `upsert` row whose parent is missing — removed by the
same delta, or absent from both the store and the delta — throws `EntryNotFoundError`, and nothing
in the call applies. This catches a direct parent and a grandparent alike: removing a grandparent
and upserting one of its children in the same call still throws.

**Order.** A kept entry keeps its position. A new entry, or an entry whose `parentId` moved, takes
the `siblingIndex` its row names, or goes to the end of its group when it names none. Several new
entries in one `upsert` list land in the order they appear in that list.

**The rest is the door `syncAll` uses.** `syncChanges` ignores a `'never'` Field lock, re-rolls a
derived parent cell instead of taking an authored value, and runs no `EditExtender` cascade.
`beforeChange` can veto the whole call, and it refuses the same way `syncAll` does:
`TransactionAlreadyOpenError` inside `dataset.transaction()`, `MutationDuringExtensionHookError`
from the extension hook, and `MutationDuringNotificationError` from inside a `beforeChange` or
`change` handler. It commits its `ChangeSet` with `origin: 'sync'`: it records no undo step and
erases no Redo, and a delta that changes nothing commits nothing — no `beforeChange`, no `change`,
no undo step.

### `syncAll` or `syncChanges`?

| | `syncAll(rows)` | `syncChanges(delta)` |
| --- | --- | --- |
| Input | Every entry | Only the rows that changed |
| An id the input does not name | Removed | Kept |
| A key a row leaves out | Cleared | Kept |
| Order | From the list order | An existing entry keeps its position |

Use `syncAll` when your poll returns the whole list. Use `syncChanges` when your server already
tells you what changed.

## A sync records no undo step

Unlike a user edit, `syncAll` commits its one `ChangeSet` with `origin: 'sync'`, and the undo History
does not record it. It does not clear Redo either. A user's own earlier edits stay undoable across
any number of polls:

<!-- doc-example-setup
declare const dataset: import('freegantt').Dataset;
declare function fetchRowsFromServer(): import('freegantt').FlatEntryInput[];
-->

```ts
dataset.entries.update('t1', { name: 'Renamed by me' }); // origin 'user', canUndo is now true

dataset.entries.syncAll(fetchRowsFromServer()); // origin 'sync' — records no step

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

dataset.entries.syncAll(fetchRowsFromServer()); // the server sends its own name for 't1' — it wins

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

- A `'never'`-locked Field is written anyway by `load`, `syncAll` and `syncChanges` —
  construction-time and poll writes all ignore a lock the same way, since none of them runs the edit
  pipeline a locked cell guards.
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
    dataset.entries.syncAll(fetchRowsFromServer());
  });
}
```

Stop the timer when the Gantt unmounts. Call `syncAll` as often as your poll interval allows. The user's
own edits stay undoable across every poll.

A sync does not know which local edits the server has not saved yet. A poll that returns before the
server saves an edit writes the server's older value over it, under the conflict rule above. To keep
an unsaved edit on screen, do one of these:

- Skip the poll while a save is in flight.
- Copy the unsaved value into that entry's row in `rows` before you call `syncAll`.

## Related

- [Consumer API index](05-consumer-api.md) — undo, redo, and the `change` event.
- [Plugin authoring guide](06-plugin-authoring.md) — reacting to a sync from inside a plugin.
- [API reference](../etc/freegantt.api.md) — generated `EntryStore.syncAll`, `EntryStore.syncChanges`,
  `EntryStore.load`, and `EntryDelta`.
