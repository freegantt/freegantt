# FreeGantt — Public API Design

The API is a product surface, designed once and defended. Everything here is what a consumer sees; everything else in the codebase is internal and free to change.

**Public entry points:** `Dataset`, `Gantt`, the event vocabulary, the plugin contract, and the model types. Nothing else.

---

## 1. Principles

1. **One config object, everything live.** No builder-vs-mount split, no "must be set before mount" options. If an option can't change at runtime, it's a constructor argument or it doesn't exist.
2. **Data and view are separate objects.** A `Dataset` (headless, Node-safe) holds data and scheduling; a `Gantt` binds a dataset to a DOM container. Many views of one dataset is the normal case, not a trick.
3. **Every mutating interaction has a cancelable `before*` event.** Consumers can veto a drop, substitute their own editor, validate a link — before commit, not after.
4. **Honest surface.** Nothing in the published types throws "not implemented" (invariant I11). Declared events fire; declared methods work.
5. **Predictable naming.** One vocabulary, one bus, greppable pairs (`beforeEntryMove` / `entryMove`). No synonyms, no two names for one concept.
6. **Typed extensibility.** One generic flows end-to-end: `new Dataset<{ team: string; cost: number }>` makes `entry.props.team` typed in renderers, events, and queries, and types `update({ cost })`. Declared keys live on `TProps`. Core keys stay on the Entry.

---

## 2. Shape

```ts
import { Dataset, Gantt } from 'freegantt';

// ── Data: headless, works in Node ───────────────────────────────
const dataset = new Dataset<{ team: string; cost: number }>({
  timeZone: 'America/Chicago',            // optional (#129); omit it to author in the viewer's own zone
  dateOnlyEnd: 'inclusive',               // default; see §2.1
  measureDuration: 'span',                // default; 'children' sums direct children's spans and counts no gap (ADR 0017, #421)
  history: { capacity: 100 },             // default; undo/redo stack depth, or `false` — see "Undo and redo" below
  entries: [
    { id: 'p1', name: 'Sitework' },        // dateless parent; derives when it has children (ADR 0013)
    { id: 't1', parentId: 'p1', name: 'Groundwork', start: '2026-09-01', end: '2026-09-11' },
    { id: 't2', parentId: 'p1', name: 'Framing',    start: '2026-09-12', end: '2026-09-30',
      team: 'A' },
  ],
  dependencies: [
    { id: 'd1', fromId: 't1', toId: 't2', type: 'FS', lag: { value: 0, unit: 'd' } },
  ],

  // What the values ARE — declared beside the ones core ships (`01` §2.6).
  fieldTypes: { money: { rollUp: 'sum', formatValue: asCurrency, column: { align: 'end' } } },
  fields: [
    { key: 'cost', type: 'money' },
    { key: 'team' },
  ],

  // Dataset plugins (S5.10, D-S5-24) — an unordered set: installation resolves setup order from each
  // plugin's own `requires`, never from this array's order.
  plugins: [entryDependencies(), scheduling()],
});

// ── View: binds dataset to DOM ──────────────────────────────────
const gantt = new Gantt({
  container: '#gantt',                    // element or selector
  dataset,

  rowSource: { source: 'entries', tree: true },
  preset: 'weekAndMonth',                 // or a full ViewPreset object
  range: 'fitDataset',                    // or { start, end } — InstantInput, not branded Instant
  locale: 'de-DE',                        // presentation; live; not part of the data
  todayLine: true,                        // current-date marker; panToToday() pans to now()
  zoomPresets: ['day', 'weekAndMonth'],   // ordered set zoomIn/zoomOut step through

  // Where THIS view shows them — names fields, in display order.
  gridColumns: [
    'name', 'start', 'duration',                   // a field's own `column` defaults apply
    { field: 'cost', header: 'Budget — site A' },  // per-Gantt override of presentation only
  ],

  capabilities: {
    move: true,
    resize: t => t.kind !== 'group',      // boolean or per-entry predicate — see §4.1
    edit: (t, field) =>                   // #256: the write rule names a cell, not an entry
      t.id === 'fixed' && field === 'end' ? false : undefined,   // `undefined` = no opinion
    linkCreate: true,
  },
  viewportGestures: { wheelZoom: true },  // or `false` to turn wheel/keyboard pan+zoom off

  // Values a consumer imports and lists, never names in a table (S5.1, D-S5-2 — supersedes the
  // `features: { tooltips: true, ... }` sketch this example originally showed; a name-keyed table
  // would force the Gantt to import every built-in it can name, so an unused one still shipped).
  plugins: [
    tooltips(),
    contextMenu({ items: ({ entry, defaults }) => [...defaults, myItem(entry)] }),
  ],
});
```

`gantt.dataset` reads back the Dataset instance the constructor took (#226). It carries the same `TProps`, so `gantt.dataset.on('change', …)` and `gantt.dataset.canUndo` type correctly. A helper that needs both objects takes the Gantt alone and reads `dataset` off it — `mountGanttToolbar({ gantt, container })`. This beats taking the pair and trusting the caller to keep them matched. The getter is read-only: a Gantt binds one Dataset at construction and never rebinds it. A consumer who wants a different Dataset builds a second Gantt.

### Programmatic mutation — always transactional

```ts
dataset.entries.add({ id: 't9', name: 'Roofing', start: '2026-10-01', end: '2026-10-15' });
dataset.entries.update('t2', { name: 'Framing — north wing' });
dataset.entries.remove('t9');           // and every descendant, in the same changeset

dataset.transaction(() => {
  dataset.entries.update('t2', { name: 'Framing — north wing' });
  dataset.dependencies.add({ id: 'd2', fromId: 't2', toId: 't3', type: 'FS', lag: days(2) });
});
// one scheduling pass, one changeset, one undo step, one render

dataset.undo();  dataset.redo();
dataset.canUndo; dataset.canRedo;

dataset.entries.update('t7', { siblingIndex: 0 });               // moves t7 to the top of its group
dataset.entries.update('t7', { parentId: 'p2', siblingIndex: 2 }); // reparents and places it at once
// both writes renumber the touched sibling group in the same transaction, so each move is one undo step
```

- **`siblingIndex` is an ordinary core Field: an integer rank among an entry's siblings (ADR 0034).** A write that names it, or a write that moves an entry to a different sibling group, renumbers every sibling the move displaces in the same transaction — the ChangeSet carries a row for the moved entry and for every shifted sibling, so one call is one undo step. `add()` with no index appends to the end of its group; `add()` with an index places it there. `remove()` closes the gap its group is left with. `editable: 'never'` on the Field refuses an explicit move; a reparent with no requested index still appends, because the lock that governs a reparent is `parentId`'s own, not this Field's. `entries.all` reads each sibling group in this Field's order (`01` §6).
- **The `Segment` type retired with no legacy; the word did not (ADR 0026, #421, Q17).** A Segment is a Bar on a row that draws more than one Bar — a reading of what a reader sees, never a record (`CONTEXT.md`). What this section used to describe —
  `dataset.entries.update(id, { segments })` moving one Segment by position, `removeSegments(ids)`,
  `entryIdOfSegment`/`entryIdsOfSegments`/`segmentIdsOfEntries`, and the errors
  `DuplicateSegmentIdError`/`EmptySegmentsError`/`SegmentsOutOfSyncError` — no longer exists, and
  nothing replaced it under a new name, because there is no second record left to move, remove, or
  look up. Several bars on one row are now several ordinary child Entries: a consumer moves one the
  same way it moves any Entry, `dataset.entries.update(childId, { start, end })`, and removes one
  with the same `dataset.entries.remove(childId)` every other Entry uses. A row source's
  `childrenAsSegments` rule (§4.3) decides only whether those children draw on their parent's own
  row or on rows of their own — it is a display question, and `data/` never reads it.

Single mutations outside an explicit transaction are auto-wrapped in one — convenience without a second code path (D-S2-8). Each mutator validates against its own in-progress write set before staging anything, so a rejected call leaves the store untouched and a stack trace points at the call that made the bad edit, not at a transaction's closing brace.

### `load` — a full fresh start, order-tolerant (#496)

```ts
dataset.entries.load(rows);   // rows in any order: a child may come before its parent
```

`load` replaces every Entry. It does not diff and it does not merge: it removes every entry the store holds and adds every input, in the list's own order — the same rows, in the same `entries.all` order, that `new Dataset({ entries: rows })` with this Dataset's own Fields and plugins would build. A child may come before its parent in `rows`; `load` checks the whole batch first, so order never throws. It throws only for a duplicate id (`DuplicateEntryIdError`), a `parentId` naming no id in the batch (`EntryNotFoundError`), or a loop (`ParentCycleError`) — and nothing stages when it does. It ignores a `'never'` Field lock and a derived parent cell's own value, exactly as construction does, and runs no `EditExtender` cascade. It commits one `ChangeSet` with `origin: 'load'`, even when its `added`/`removed`/`updated` are all empty — an empty load into an empty Dataset still moves the baseline, so `change` fires once and undo history still clears. `beforeChange` can veto it (`MutationCancelledError`); a veto leaves the store and History exactly as they were. Called inside `dataset.transaction()`, it refuses with `TransactionAlreadyOpenError` — `load` is always its own transaction, never a step inside a caller's. **`new Dataset({ entries })` checks its own batch the same way** (ADR 0031, Q3): the raw `parentId`, even under a plugin's declared hierarchy source, and the error message names `'new Dataset'` as the door instead of `'entries.load'`.

**`load` and `new Dataset({ entries })` set `siblingIndex` from list position, the same way (ADR 0034).** Each entry's rank among its siblings is where it falls in the input list, read within the group its Hierarchy source answers. An input `siblingIndex` that disagrees with that position is dropped in favor of it and reported once per call through an aggregated `'sibling-index-dropped'` report, with a `console.warn` fallback where nothing else can hear it — an input value that already agrees with list position is not a dropped value and stays silent.

`load` keeps no per-entry state for an id that appears in both the old data and the new list — a fresh `t1` in `rows` starts with no selection, no collapse state and no plugin-store row, even if the old `t1` had one. A plugin's own declared Field survives, because `toInput()` carries it like any other key; a plugin's store rows do not, because `load` removes every old entry and a store row is not export data (see §6). The undoable, diffing counterpart that keeps per-entry state and records one undo step is `syncAll` (#517), out of scope for S2.

`transaction()` returns the body's own return value, not a `ChangeSet` — `dataset.on('change')` is the only channel a committed changeset travels on (§3). A nested `transaction()` call runs its body against the already-open transaction and returns that body's value without committing a second time; only the outermost call commits. A veto (`beforeChange` returning `false`, §3) makes `transaction()` throw `MutationCancelledError` carrying the refused changeset, rather than returning at all.

`dataset.plugins` is **read-only**, unlike `gantt.plugins`. A Dataset plugin declares everything that shapes construction — `fields`, `fieldTypes`, `aggregators` and `hierarchySource` — on its own definition (ADR 0031), and the Dataset builds completely from those declarations before any plugin's `data(ctx)` runs. Installing a plugin after construction would mean redoing the store, the child index and the Rollup that already ran under the plugins that came first. So a Dataset installs its plugins once, in its constructor, and a consumer who wants a different plugin set builds a Dataset with it (ADR 0016). A Gantt has no such moment — its plugins register paint and gesture seams that are re-resolved on the next frame — so `gantt.plugins = [...]` stays assignable. Uninstalling a Dataset plugin is `dataset.destroy()`, which releases every installed plugin in reverse setup order.

A child arriving is the derivation door (`01` §2.5). An Entry that gains its first child starts deriving in the same transaction. Losing the last child leaves a normal Entry with no dates. There is no `autoGroup` key and no promotion of a stored classification.

### `syncAll` — match a live Dataset to a full list, and keep one undo step (#517)

```ts
dataset.entries.syncAll(serverRows);   // rows in any order — the same shape `load` and the constructor take
```

`syncAll` also makes the Dataset match a list, but it diffs instead of replacing: an id missing from the list is removed, a key a kept entry's input omits is cleared, and a Field whose value did not change writes no row. After `syncAll(list)`, the entry ids, every declared Field value (`siblingIndex` included) and the tree are the same as `load(list)` would leave — only undo and per-entry state differ. A kept id keeps its selection, its collapse state and its plugin store rows; a removed id loses them, and an undo brings a removed id's store rows back with it.

`syncAll` records no undo step, clears nothing, and erases no Redo. The user's own earlier edits stay undoable across a sync. An undo of an edit the server has since overwritten keeps the server's value (see "Undo and redo" below).

`syncAll` writes through the door `load` uses: it ignores a `'never'` Field lock, a derived parent cell re-rolls instead of taking an authored value, and no `EditExtender` cascade runs. `beforeChange` can veto the whole call, the same as `load`. It refuses the same way `load` does: `TransactionAlreadyOpenError` inside `dataset.transaction()`, `MutationDuringExtensionHookError` from the extension hook, and `MutationDuringNotificationError` from inside a `beforeChange` or `change` handler, since a sync reaching the store from there would write or notify in the middle of a notification already running.

Unlike `load`, `syncAll` commits nothing when the list already matches the store: no `ChangeSet`, no `change` event — the common case for a server poll that finds nothing new. When it does commit, the `ChangeSet` carries `origin: 'sync'`. A local edit the server has not seen is overwritten, last write wins; undoing the edit then keeps the server's value.

### `syncChanges` — apply only the rows that changed (#527)

```ts
dataset.entries.syncChanges({
  upsert: [{ id: 't1', name: 'Renamed on the server' }],
  remove: ['t9'],
});
```

`syncChanges` also matches a live Dataset to server data by diffing, but it takes only the rows a
server changed instead of the whole list. `upsert` rows add or edit an entry, keyed by `id`: an
unknown id adds an entry, read the way `add()` reads one; a known id takes the row as a partial
edit — a key the row leaves out keeps its value, and a key set to `undefined` clears it, the same as
`update()`. `remove` lists ids to drop, each with its subtree; an unknown id is ignored, so a
retried delta is safe to apply again. An id named in both `upsert` and `remove` throws
`DuplicateEntryIdError` with `kind: 'upsert-and-remove'`, and nothing in the call applies.

The tree check runs on the committed store and the delta together: an `upsert` row's `parentId` can
name an id already in the store or an id the same delta adds, and a parent removed by the same
delta, or absent from both, throws `EntryNotFoundError` — a direct parent and a grandparent alike.
An existing entry keeps its sibling position unless its row names a `siblingIndex`, the same as
`update()`. A new entry, a moved entry, or a kept entry that names a `siblingIndex` takes that index,
or goes to the end of its group when it names none. Several rows that name a `siblingIndex` in the
same group apply in upsert order.

`syncChanges` writes through the same door `syncAll` and `load` use, and shares every other rule
`syncAll` follows above: the same refusals, the same `beforeChange` veto, the same `origin: 'sync'`
ChangeSet with no undo step and no erased Redo, and the same no-op when nothing changed.

### Undo and redo

`undo()`/`redo()` return nothing — like every other commit, a write arrives on `dataset.on('change')`, tagged `origin: 'undo'`/`'redo'`; a caller that needs to know what an undo did reads the event, not a return value. A click that only forgets steps writes nothing, so it fires `historyChange` and not `change` (below). Undo and Redo buttons listen on `historyChange`. `canUndo`/`canRedo` answer "is there anything to undo/redo" without a caller needing to try and catch. `history: { capacity: 200 }` at construction keeps 200 undoable transactions; the default is 100. An undo replays a cascade exactly as it committed — it never re-runs the extension hook, so an engine whose behaviour changed between library versions cannot rewrite history (`01` §6, `plans/s2-data-core/s2.5-undo-redo.md`).

**`load` (#496) clears History instead of recording it.** After `dataset.entries.load(rows)`, `canUndo` and `canRedo` both read `false` — the stack is emptied and the cursor set to 0, the same posture a desktop app takes opening a file. `load` is a new baseline, not an undoable step: an app's first `load` must not let `Ctrl+Z` empty the chart. **`syncAll` (#517) and `syncChanges` (#527) record no undo step, clear nothing, and erase no Redo.** A write the user did not make leaves the stack exactly as it was; the user's own earlier edits stay undoable across any number of syncs.

Undo and redo write onto the store's current values, not onto a frozen snapshot of what the step recorded. **An undo never writes over a foreign write (#549).** A Field is a foreign write when its current value is neither the value the step recorded nor the value the replay would write — a sync, or any commit the History did not record, changed it. When one Field of an entry is a foreign write, the replay writes no Field row of that entry, so a step never lands half of a `start`/`end` pair; the step's other entries still land. `siblingIndex` is never judged — any sibling's move shifts it, and the renumber pass settles it. Plugin store rows are never judged either — a sync never writes one. Redo follows the same rule. Undo then redo stays neutral, because each replaces its stack entry with what it actually wrote. Undo and redo also keep the tree sound (a replayed `parentId` never lands a loop or a dangling reference), renumber the sibling groups they touch, and re-run the Rollup — so an undo's `change` rows can differ from what the step first recorded. A step left with nothing to write is forgotten, and the same click moves on to the step before it. `dataset.replay(changeSet)` follows the same rules (below); `docs/11-server-data.md` states them for a consumer in full.

**`history: false` hands undo to the app (#549).** The Dataset then builds no History: `canUndo`/`canRedo` always read `false`, `undo()`/`redo()` do nothing, and the core `freegantt.undo`/`freegantt.redo` commands turn off through their own `when`, which frees Mod+Z. `replay`, `load`, `syncAll` and `syncChanges` work unchanged. This is the door for an app with its own undo rule: a stack per user, a stack a server keeps, or a different answer to a foreign write. Core does not grow a policy knob for each such rule.

`dataset.replay(changeSet, options?)` is the write path `undo()`/`redo()` are built on, published so a consumer can write their own History against the public surface alone: `on('change')`, `invertChangeSet`, `fieldRowsOf`, and `replay` — no `data/` import needed. `replay` writes each row onto the store's current value, the same rule undo and redo follow above, through the same `beforeChange`/`change` channel, with no extension hook. A row for a key no Field declares writes nothing, the same as a row for a computed Field; `replay` never throws for one. `{ overwriteForeignWrites: true }` writes the step over a foreign write instead of keeping it — last write wins; the built-in History never passes it. `changeSet.origin` must be `'undo'` or `'redo'`; `'user'` throws `InvalidReplayOriginError` — that door is `apply`, later (§6). A changeset with nothing left to write fires neither `beforeChange` nor `change` (`plans/s2-data-core/s2b-undo-replay-seam.md`). A History panel lists what a step changed with `fieldRowsOf(changeSet).map((row) => row.field)`, dropping the plugin-store rows `updated` also carries.

### Reconfiguration is just assignment

```ts
gantt.preset = 'dayAndWeek';
gantt.rowSource = { source: 'group', groupBy: (entry, fields) => fields?.read<string>(entry, 'team') ?? 'unassigned' };
gantt.gridColumns = [...gantt.gridColumns, 'cost'];
gantt.snap = { unit: 'day', increment: 2 };   // D-S3-24 — this Gantt's own snap; opt-in (#489)
gantt.gridWidth = 220;                  // S1.8 — same cancelable commit sequence a splitter drag runs
gantt.gridWidth = 'fitColumns';         // #157 — as wide as the columns, and stays that way
gantt.minGridWidth = 80;                // #127 — floor the Splitter drag clamps gridWidth to (default 40)
gantt.gridResizable = false;            // #432 — locks the Splitter and every column's own resizer grip
gantt.overscan = { verticalRows: 0, horizontalPx: 0 };  // #435 — the culling buffer; see below
```

Every config key is a live property. Setting one triggers exactly the invalidation it needs (a preset change rebuilds the time axis; a row-source change re-resolves rows) — never a full remount.

### The culling buffer (`overscan`)

The library mounts only rows and bars inside the visible window, plus a buffer around it. `overscan`
sets that buffer. `verticalRows` sets whole rows above and below the window. `horizontalPx` sets px
to the left and right of the timeline pane. The default is `{ verticalRows: 2, horizontalPx: 128 }`.

A row or a bar inside the buffer stays mounted while it sits one scroll step from view. This stops a
small scroll from showing a bare frame before the next paint catches up. A test that checks nothing
renders outside the visible window should not guess the buffer's size. It reads `gantt.overscan`, or
sets it to `{ verticalRows: 0, horizontalPx: 0 }` for the tightest possible bound (#435).

**Two keys are exceptions, and both belong to the `Dataset`: `fields` and `plugins`.** A Field declaration and a Dataset plugin are fixed at construction. `dataset.fields` is a read-only getter, `Dataset.plugins` is read-only, and a plugin's own `fields`/`fieldTypes`/`aggregators` (#496 grill round 3, R1) register before any entry is read — there is no later door to close, because there is no `ctx.fields` seam to call after setup (R2).

**What is fixed is the Field *set*, not every attribute on it (ADR 0015).** `dataset.setFieldEditable(key, editable)` changes one declared Field's `editable` after setup, and it is the only attribute that may change. It adds no key and removes none, so the Rollup reason below does not apply to it: `editable` is a write-door threshold, and no aggregate depends on it. An unknown key is refused.

**The reason is the Rollup, and it reaches undo.** A Field arriving mid-life makes every rolling-up parent owe a new aggregate at once. That is a whole-dataset Rollup pass, outside any user action, writing stored values that enter undo — and a declaration is a **config assignment**, which `ChangeSet` has no row shape for. Undo would then restore values the still-declared Field re-derives on the next commit. `rollUpKinds` is deleted (ADR 0013), so that flip is gone. A live `fields` would still be this problem.

**A late install rebuilds the `Dataset`:** `new Dataset({ entries: dataset.entries.all, fields, fieldTypes, aggregators, plugins })`. **State the price whenever this path is offered** — a new `Dataset` identity, so every subscriber rebinds and the undo History is lost. That price suits a *turn scheduling on* toggle. It does not suit an *add a column the consumer never declared* feature, and that gap is a known hole rather than a solved case.

**The hole is narrower than it was (ADR 0015).** It covers adding or removing a Field key, and nothing else. *Lock a column the consumer already declared* was the case most often mistaken for this hole, and it is now solved outright: `dataset.setFieldEditable('start', 'never')` keeps the Dataset identity, the subscribers and the undo History. Reach for the rebuild only when the Field **set** has to change.

**A Gantt plugin is not affected.** `gantt.installPlugin()` (D-S5-36, below) stays live. A view plugin declares no Field and rolls nothing up: `ctx.view.registerGridColumn` names a Field the `Dataset` already declares, and an undeclared key throws `UnknownFieldError` exactly as `gantt.gridColumns` does. **A live column, over a fixed Field set.**

**A config value is a value, not a mutable object (#187).** Assignment compares against what the property already holds, by identity. So a mutation of the object you already handed over, followed by an assignment of that same object, changes nothing and paints nothing. Assign a copy to ask for the repaint:

```ts
gantt.capabilities = { ...gantt.capabilities, resize: false };   // re-resolves capabilities
gantt.rowSource = { ...gantt.rowSource, groupBy: byTeam };       // re-resolves rows
```

One rule covers every config key, object-valued ones included. A per-key exemption would put the rule back in each setter, which is what `frame-settings.ts`'s one invalidation table exists to prevent. It also keeps a repeated assignment of an unchanged value off the frame path.

**Assignment replaces the whole value. A verb writes one key (#184, #195).** The rule above says what assignment is, and the consequence is that a consumer who changes one key must restate the rest. Anything they forget to carry is dropped, with no error and no event. So where changing one key is the common case, the library ships a verb for that key:

```ts
gantt.setCapabilityRule('resize', false);   // this one gesture; every other rule stands
gantt.clearCapabilityRule('resize');        // the structure table answers that gesture again
gantt.hideGridColumn('cost');               // D-S5-34 — the widths and the order stay as the user set them
gantt.installPlugin(tooltips());            // D-S5-36 — the installed set is not restated
dataset.setFieldEditable('start', 'never'); // ADR 0015 — every other Field keeps the editable it had
```

The last one is the `Dataset`'s verb, not the `Gantt`'s, because a Field belongs to the `Dataset`. It reads the same way: one key changes, the rest stand. There is no matching assignment form to fall back on — `dataset.fields` is read-only — so here the verb is the whole surface rather than a shorthand over one.

**A verb does not merge into the value, and it never mutates it.** It reads the current value, computes the next one, and assigns that copy. So the paragraph above still holds in full: the object a consumer handed over is never written to, and the property still compares by identity. A merging setter was considered for `capabilities` and rejected for the same reason — it would make assignment mean two things, and it would leave no way to *remove* a key.

The setter is the long form: restate a whole config, reorder a whole list. The verb is the shorthand for the common case. That is CLAUDE.md's "common case is a shorthand; the long form is expert", and both write the same stored value.


### 2.1 What a consumer writes, and what the library stores

Ids and dates are loose on the way in and strict everywhere behind the boundary. `Dataset` reads an `EntryInput` into an `Entry` once, at construction: ids are plain strings that gain the `EntryId` brand here, and dates are any `InstantInput` — an ISO string, a `Date`, epoch milliseconds, or an already-branded `Instant`. A consumer never has to call `entryId()` or `instant()`. An `Entry` is itself a valid `EntryInput`, so a consumer holding branded values passes them through unchanged.

**Loose on a scalar, branded on a collection key** (`F19`). "Loose on the way in" covers every id a caller *passes* or *returns* one at a time: `entries.get('a')`, `reveal(id)`, and a `HierarchySource`'s own answer (`EntryId | string | undefined`) all take a plain string. It stops at the key of a map. `EntryEdits` and `ProposedEdits` stay `ReadonlyMap<EntryId, …>`, because `ReadonlyMap<EntryId | string, …>` collapses to `ReadonlyMap<string, …>` in a reader's eye and the branding stops saying anything. A plugin author therefore brands with `entryId(...)` when they build a map, and never when they answer a question. `Q9` in [ADR 0017's questions appendix](../docs/adr/0017-the-entry-answers-questions-about-itself.md#appendix--the-questions-this-redesign-closed-q1q9) records the two arguments this reconciles.

A string with an explicit `Z` or numeric offset is absolute. Every other string is a Plain time and resolves through the dataset's `timeZone`, so one entry list renders identically for every viewer. A value naming no instant — including a date the calendar does not have, such as `'2026-02-31'` — throws `InvalidInstantError`; it never slides to a nearby date.

`timeZone` is optional (#129). Passed explicitly, it is what the paragraph above describes: one zone, so a Plain time in `entries` reads identically for every viewer, in any timezone. Omitted, `Dataset` resolves the current environment's own zone once, at construction (`Intl.DateTimeFormat().resolvedOptions().timeZone`, falling back to `'UTC'` when that reports nothing, e.g. a bare Node process) and stores the resolved IANA string — `dataset.timeZone` is always a concrete zone after construction, never a sentinel. This trades cross-viewer consistency for ergonomics: a dataset built this way authors Plain times in *this* viewer's calendar, so the same entry list can read differently for a viewer in a different zone. Reach for it for single-viewer or demo use; pass `timeZone` explicitly whenever the dataset is shared across viewers, such as a project plan multiple people open.

`dateOnlyEnd` names how a *date-only* `end` is read against half-open `[start, end)` storage. `'inclusive'` (the default) reads `end: '2026-09-08'` as "through the 8th" and stores the start of the 9th; `'exclusive'` reads it literally. It applies to nothing else: an `end` carrying a time of day, a `Date`, epoch milliseconds, or an `Instant` is a boundary already, and `start` is never adjusted.

The reading itself lives in `time/` (`toInstant`, `toEndInstant`) — resolving a Plain time needs the zone and the DST fold/gap policy, and advancing a date-only end by one day is zone-aware arithmetic, which I10 confines to that layer. `api/` maps fields and does no date math of its own.

`start` and `end` are optional on every Entry (ADR 0012). An Entry has dates if and only if it spans (`spansTime`, ADR 0012). `{ id: 'p1', name: 'Sitework' }` above is a dateless parent; the store does not mint a fake span from the dataset's reference date. `{ start: undefined, end: undefined }` un-dates. Omitting one field but not the other is `InvalidInstantError`: one date without the other names no span. The `Segment` type retired (ADR 0026, #421): there is no second, array-shaped date input left to be empty or absent — `start`/`end` alone say whether an Entry dates.

**`*Input` vs `Resolved*` (#253).** Both suffixes answer "what a consumer writes, and what the library stores", and both stay — a reader meets whichever name the pair in front of them uses:

- `*Input` names a pair whose *type* differs: the authored form and the stored form are shaped differently, such as a plain `string` id that gains the `EntryId` brand (`EntryInput` → `Entry`), or a loose date that resolves to an `Instant` (`InstantInput` → `Instant`).
- `Resolved*` names a pair whose *completeness* differs, and whose type does not: the stored form is the authored form with its optional keys filled in, such as an omitted `filterPolicy` gaining its default (`RowSource` → `ResolvedRowSource`).

`*Input` also names a second, unrelated thing: a parameter bag for one function — `LayoutInput`, `RowPassInput`, `CustomRowInput`, and others. That reuse is a known misfit, kept open for the 1.0 API review rather than fixed here (see the misfit list at the end of this section).

**Misfits kept for the 1.0 API review.** These do not cleanly answer to either rule above, but a rename here would move the public API report, so nothing renames as part of this note:

- `ResolvedTheme` (`'light' | 'dark'`) answers a question — "which theme actually painted, now that `'auto'` is settled" — it is not `Theme` (`'auto' | 'light' | 'dark'`) with a key filled in; `'auto'` is a variant removed, not a gap closed.
- `ResolvedBarLabel` (`{ placement, text }`) is the per-bar answer computed from a `BarLabels` policy or spec; it does not extend `BarLabels` and shares none of its shape, so "resolved" here means "computed", not "filled in".
- `*Input`'s second meaning (the parameter-bag family above) stays unresolved by this rule; splitting it off was option 3 on #253 and remains open.

---

## 3. Events — one bus, one vocabulary

| Cancelable (pre-commit) | Notification (post-commit) |
|---|---|
| `beforeEntryMove` | `entryMove` |
| `beforeEntryResize` | `entryResize` |
| `beforeEntryEdit` | `entryEdit` |
| `beforeLinkCreate` | `linkCreate` |
| `beforeSelectionChange` | `selectionChange` |
| `beforeGridWidthChange` | `gridWidthChange` |
| `beforeGridColumnsChange` | `gridColumnsChange` |
| `beforeCollapseChange` | `collapseChange` |
| — | `navigationChange` (one Viewport Batch: Preset, Fit, Range, Pan, Anchored zoom) |
| `beforeChange` | `change` (every committed `ChangeSet`) |
| — | `historyChange` (`canUndo` or `canRedo` changed) |
| — | `error` (every refusal and every recovered fault; **the one name on both buses**) |
| — | `scheduleDiagnostics` (engine findings) |

`navigationChange` (S1.12) fires once per Viewport Batch after Preset, Fit, Range, Pan, or Anchored zoom actually change. There is no `before*` pair: those writes are reconfiguration (S1.9), not a vetoable gesture. Chrome reads `presetId` / `canZoom*` from the payload, or re-reads the live Gantt getters. The payload also carries `visibleSpan` — the getter's own name, because bare `span` already means `DecorationContext.span` (issue #461) — so a fire from plain scrolling, which never moves `presetId`/`fit`/`canZoom*`, still carries new information.

`historyChange` (#544) is a Dataset event with the payload `{ canUndo, canRedo }`. It fires only when one of the two answers changes. That includes an `undo()` or `redo()` that forgot every step it tried: such a click commits nothing, so `change` does not fire. A toolbar's Undo and Redo buttons listen here, not on `change`. There is no `before*` pair: it reports History's new state, and the write that moved it already had its own `beforeChange`. A handler may not write, the same as a `change` handler. Under `history: false` it never fires.

`gantt.range` is the whole scrollable **content** extent (`'fitDataset'` or an authored `TimeSpan`); `gantt.visibleSpan` is what is on screen right now — narrower, and it moves on pan/zoom/resize without `range` changing at all (issue #461).

**A total over `visibleSpan` is consumer code, not a Rollup.** Rollup means parent-from-children (§4.2 below); it has no time window and must not get one. `overlap(a, b)` (`time/`, issue #472) clips one `TimeSpan` to another, `undefined` when they do not touch — the one function a consumer needs to total a Field over the window: clip each Entry's span to `visibleSpan`, prorate by the clipped share of the Entry's own duration.

`beforeGridWidthChange`/`gridWidthChange` (S1.8) carry `{ from, to }` in px. Fired by both a Splitter drag's commit and a direct `gantt.gridWidth = px` assignment — one commit sequence, one place it lives (`GanttShell`). A veto restores the width the drag started from, so a rejected drag leaves nothing behind. The grid pane never sits wider than its own columns (#139): every path that sets a width — the constructor option, a live assignment, a drag — is capped at the columns' total width, because past the last column's right edge there is nothing to draw. So `gantt.gridWidth = 900` against 360px of columns reads back `360` and fires `to: 360`, and hiding a column brings the pane in with it through this same sequence. Narrower is always legal — the columns overflow and the pane scrolls to reach them (#126) — and a column set holding a `flex` column has no cap at all, since a flex column has no fixed edge to stop at.

`gridWidth` also takes `'fitColumns'` (#157): the pane sits exactly on the columns' edge, and keeps sitting there as the columns change — a column resize, a hidden column, a plugin-registered column all move it, in both directions, through this same commit sequence. It is a standing instruction, not a width read once, so a consumer never restates a number the library already computes. The getter still answers in px: "how wide is the pane" is a question about pixels. Two things end the instruction: a later `gantt.gridWidth = px`, and a Splitter drag, which is the consumer changing their mind (a vetoed drag ends nothing). A column set holding a `flex` column names no edge to sit on, so the pane keeps the width it has until the set names one again.

`minGridWidth` (#127) is a live, plain-reconfiguration property — not a gesture, so it carries no `before*`/`*Change` pair of its own. It floors what the Splitter drag can reach, and nothing else: no floor applies to a written width, so `gantt.gridWidth = 0` collapses the grid pane on purpose. (#139's ceiling is the one bound that does reach a written width — a floor guards against a user accident, which an app author is allowed past; a ceiling states a layout fact.) Default `40` — wide enough for one narrow column, so a drag cannot take the pane to nothing by accident; `minGridWidth: 0` restores an unfloored splitter. Raising `minGridWidth` above the current `gridWidth` fires `beforeGridWidthChange`/`gridWidthChange` to lift it — the same commit sequence a drag would use, so a veto leaves the width exactly where it was.

**`gridResizable` (#432) locks the grid pane, and is a lock, not a veto.** `minGridWidth` floors a drag; it names no "off". `false` turns off both of the grid pane's resize affordances at once — the Splitter no longer attaches a pointer or keyboard listener and paints no resize cursor, and every column's resizer grip stops painting, whatever that column's own `resizable` says (a Gantt-wide answer over a per-column one, the same two-level shape `capabilities`/`EntryVariant.can` already use — though `capabilities` itself is the wrong home, since it resolves per Entry and a grid-pane lock names no Entry). Because the gesture can no longer arm, neither `beforeGridWidthChange` nor `beforeGridColumnsChange` fires for it — the library never has to raise an event only to refuse it. Default `true`. Live: flipping it re-attaches or detaches the Splitter and re-binds columns on the next frame. It locks the *gesture*, not the *value* — `gantt.gridWidth = 240` and `gantt.gridColumns = […]` still run their normal commit sequence while locked, the same way `capabilities.move: false` never stops a Dataset write. This is what keeps a `gridWidth: 'fitColumns'` pane (#157) from turning into a fixed px width on a stray drag: with the Splitter unable to arm, nothing ends the standing instruction.


`beforeGridColumnsChange`/`gridColumnsChange` (S4.3, S5.7) carry `{ from, to }` as `GridColumn[]` — the consumer's own authored columns, before the change and after it, never the layout-only `ResolvedColumn`. So a consumer holds `to` and hands it straight back as `gridColumns`, and that round-trip can never save a column a plugin declared (#162, #181). Every column change raises the one pair: a resize drag's commit, a reorder drop, `hideGridColumn`/`showGridColumn` (S5.7), and a direct `gantt.gridColumns = [...]` assignment. Hiding raises no pair of its own, so a handler that guards every other column change refuses a hide too. A veto restores the column list the interaction started from. `registerGridColumn` is the deliberate exception (D-S5-33): a plugin's own registration changes nothing the consumer authored, so it raises nothing and never appears in `gantt.gridColumns`.
`beforeCollapseChange`/`collapseChange` (S4.6, D-S4-22) carry `{ from, to }` as `RowId[]` — Gantt view state, no Dataset transaction. Fired by a twisty click, keyboard collapse/expand, and a direct `gantt.collapsed = ids` assignment. A veto restores the set the interaction started from. Collapse is per Gantt: two Gantts on one Dataset collapse independently, the same way `selectedEntryIds` already does.

`error` (S5.12, D-S5-40/41/42) is the one event name that lives on **both** buses, and it carries the
same `ErrorReport` on each. That is not the "every event name exists exactly once" rule breaking. The
rule keeps one *concept* to one name, and a report is one concept: a Dataset raises what a Dataset
observes, a Gantt raises what a Gantt observes, and neither forwards the other's. Two Gantts on one
Dataset therefore deliver a Dataset report once, not twice, and a report raised inside
`new Dataset(...)` is not lost for want of a Gantt to raise it on. A consumer who wants the two feeds
as one calls `watchAllErrors([dataset, gantt], handler)`, which de-duplicates by emitter identity and
returns one disposer. There is no `before*` pair: a report states what already happened. A report about a commit fires
after that commit's `change`, so an `error` handler that writes starts a commit of its own. A commit
a `beforeChange` handler refuses raises its refusal, and no report about what it would have dropped.

The payload is flat — `at`, `code`, `message`, `severity`, `by`, and the optional `entryId`, `field`
and `cause` — so it renders and serializes with no type test. `severity` is `'info'` for a Refusal
(the library said no on purpose), `'warning'` for something it recovered from, `'error'` for
something it did not. Core raises and retains nothing: there is no `gantt.errors` array, because the
cap, the overflow rule and the dedupe are the consumer's policy.

S3 data-gesture payloads (D-S3-22): `beforeEntryMove`/`entryMove` carry `ProposedSpan` (`entry`, `start`, `end`) plus `entries` (grabbed first; extender extras never included). `beforeEntryResize`/`entryResize` add `edge: 'start' | 'end'`. `beforeSelectionChange`/`selectionChange` carry `{ from, to }` as `EntryId[]` (ADR 0010, ADR 0025, #212, #421 — the Selection holds Entry ids again now that `Segment` has retired) — Gantt state, no Dataset transaction. `beforeEntryMove`/`beforeEntryResize` handlers may return `Promise<void | false>` (D-S3-17); every other Gantt event stays sync-only. One case fires `selectionChange` with no `before*`: a Dataset write that removes a selected Entry has already committed, so the Selection can only drop the dead id after the fact — there is nothing left to veto (#212, finding 19).

`beforeEntryEdit`/`entryEdit` (S5.8, D-S5-19) carry `EntryFieldEdit` — `entry`, `field` (a `FieldKey`), `from`, `to` (both `unknown`: a Field's stored type is open). `beforeEntryEdit` fires **before `inlineEditing()`'s built-in editor opens**, not before the write, so `from`/`to` are both the entry's current stored value at that point — nothing has been typed yet. `entryEdit` fires after the commit, `to` the value actually written. `beforeEntryEdit` joins `beforeEntryMove`/`beforeEntryResize` as the third handler that may return `Promise<void | false>` (D-S3-17) — the async veto is what lets a consumer `await myDialog.open(entry)` before deciding whether to suppress the built-in editor (the sample below).

**A plugin raises this one pair itself, through two verbs that differ.** `ctx.interaction.proposeEntryEdit(payload)` asks: it raises `beforeEntryEdit` and hands back what the handlers answered — `true`/`undefined`, `false`, or an unsettled `Promise`. The caller must read that answer. `ctx.interaction.announceEntryEdit(payload)` tells: it raises `entryEdit` after the commit and returns `void`. One verb per job, so a plugin author sees from the name whether a decision comes back. (`emit*` said neither, and is retired.) Every other `before*` event stays core's own to raise, so no plugin can forge `selectionChange` or any event core owns.

```ts
gantt.on('beforeEntryMove', ({ entry, start, end, refuse }) => {
  if (start < mobilization) { toast('Too early'); return refuse('The drop is before mobilization.'); }
});

gantt.on('beforeEntryEdit', async ({ entry }) => {
  await myDialog.open(entry);   // bring-your-own editor
  return false;                // suppress built-in
});

gantt.on('navigationChange', ({ canZoomIn, canZoomOut, presetId }) => {
  zoomIn.disabled = !canZoomIn;
  zoomOut.disabled = !canZoomOut;
  presetSelect.value = presetId;
});

dataset.on('beforeChange', ({ changeSet, refuse }) => {
  if (changeSet.updated.some(u => locked.has(u.id))) return refuse('One of these entries is locked.');
});

dataset.on('change', ({ changeSet }) => save(changeSet));           // persistence hook (D7)
```

Rules:

- Cancelable handlers may return `false` or `Promise<false>`; an async veto suspends the gesture with a visible pending state — it never commits optimistically. **`beforeChange` is the one exception: it is sync-only.** A data commit has nothing to suspend into — the store would have to hold its write set across an `await`, and every mutator would have to turn `async` to make that safe. The async path stays where gestures already are, one layer up in `interaction/`. `beforeChange`, `beforeEntryMove`, and `beforeEntryResize` carry `refuse(reason)` on their payload (#210): call `return refuse('…')` to veto and state why in one line. It still returns `false`, so a bare `return false` still refuses with no reason. `refuse` puts the handler's own words on the `ErrorReport` core raises for the veto. The other `before*` events raise no report, so they take a plain `false` only.
- Pointer/gesture events fire on the `Gantt` (view concern); data events fire on the `Dataset` (data concern). Every event name exists exactly once.
- Payloads are typed, stable, and carry entities plus context — no "re-read everything" events.
- `change` is the only path out of a commit: the view's live binding and the undo history are both ordinary subscribers to it, not privileged internals with a second, private channel. `beforeChange` may refuse a changeset but never edit one — rewriting a proposed edit is the extension hook's job, and it has exactly one owner. A vetoed programmatic call (e.g. `entries.update()`) throws `MutationCancelledError` carrying the refused changeset, because a function with a return contract cannot quietly not honour it; a vetoed gesture is silent, the way `beforeGridWidthChange` already is. **Silent in the UI, not
unrecorded (S5.12, D-S5-40):** nothing is drawn and nothing throws, and one `ErrorReport` goes out on
`error` at `severity: 'info'`, so a consumer can say what happened without reading a veto they did
not write.

---

## 4. Customization ladder

> **This section describes HEAD.** [ADRs 0017–0020](../docs/adr/) rewrite it — the live `Entry`, the `EntryVariant` rule, `definePlugin`, and the hierarchy source. Until those four builds land, read this as what ships today, and **do not update it halfway through a build**. [`plans/row-redesign/build/`](row-redesign/build/) names the edits each build owes.

Documented in this order; each level solves what the previous can't, and consumers stop at the shallowest level that works.

| Level | Mechanism | Example |
|---|---|---|
| 1 | **CSS custom properties** | `--fg-bar-radius: 3px; --fg-row-height: 32px;` |
| 2 | **State classes / parts** | `.fg-bar[data-flag~="conflict"] { outline: 2px solid var(--warn) }` |
| 3 | **Renderer callbacks** | `barRenderer`, `gridCellRenderer`, `headerRenderer`, `tooltipRenderer` — return plain element-description objects |
| 4 | **Events + feature config** | veto a drop, custom context-menu items, replace the editor |
| 5 | **Plugins** | one `definePlugin({ data, view })` (see `01` §10): fields, decorations, columns, controllers, commands |

**Level 2's worked example works (ADR 0021).** The library's base stylesheet ships inside one cascade layer, `@layer freegantt`, so a consumer's own unlayered rule — `.fg-bar[data-flag~="conflict"] { outline: 2px solid var(--warn) }` above, or any other part the ladder publishes — wins over the library's rule at any specificity, with no `!important` needed.

Every level-1 property the library reads as a length goes through one reader (`render/dom/pixel-property.ts`): computed value → px → validated → library default. What counts as authored is stated per property rather than re-implemented per call site — a property whose zero value would be nonsense (a zero-height row is not a row) rejects it; a property whose zero value is a real, intentional choice (a consumer turning the grid pane off) keeps it. Re-read cadence stays the caller's own choice, and is stated at each call site — some properties read once at construction, others read again on every pane measurement, none per render.

**The complete level-1 `--fg-*` reference — every token, its light/dark defaults, what reads it, and the retired/renamed tokens' migration notes — moved to [`docs/10-styling-and-theming.md`](../docs/10-styling-and-theming.md) (issue #221).** Level 1 stays documented here as a level of the ladder; the token-by-token values are a reference that drifts out of date faster than this design statement does, so they live beside the rest of the consumer-facing surface instead.

**The complete level-2 Parts list — every `.fg-*` class, public or internal — moved to the same file (issue #334).** Level 2 stays documented here as a level of the ladder and as the per-slice notes below; the class-by-class list drifts the same way the token table did, so it lives next to it.

**`data-flag` is real (S1.10, D-S1.10-2).** Generated from `BAR_FLAG_KEYS`, not hand-mapped — `.fg-bar[data-flag~="conflict"]`, `.fg-bar[data-flag~="cycle"]` are live selectors today (nothing sets them true until S7's scheduling plugin, but the mechanism and the vocabulary both ship now, U2). Nothing generates link tokens yet — `layout/frame.ts` always emits `links: []`. A new `BarFlags` key needs no `render/dom` edit to show up as a token (U7). The selector-by-selector list, and what sets each one, is in [`docs/10-styling-and-theming.md`](../docs/10-styling-and-theming.md) (#475), guarded so a new key cannot ship undocumented.

S3 Parts: `.fg-bar-handle` (shared resize-handle pair), `.fg-cursor-line`, `.fg-cursor-line-label`. S3 State attribute: `data-state` on `.fg-bar` (`hovered`, `selected`, `pending`, `dragging`, `ghost`) and `data-movable` (grab cursor).

**D-S3-10 amendment (bug hunt, "grid row highlight and row click" — locked pre-1.0, no compat shim needed).** A click on a `.fg-row` in the grid pane is the same select as a click on that row's own bar: plain replaces, ctrl/⌘ toggles, and shift ranges over the bars in draw order (ADR 0010, ADR 0025, #212, #421). A grid-row click names every Entry its row owns, so a range that ends on one takes that whole row. It never arms move or resize — a grid-row pointerdown never grabs `EntryGestureSession`. A click on `.fg-row-twisty` is not a row hit at all: collapse stays on the twisty, never selection. An empty *timeline* click still clears `gantt.selectedEntryIds` (ADR 0010, ADR 0025, #212, #421 — `gantt.selectedIds` until #212, `gantt.selectedSegmentIds` until #421), with either button — a right-click is a click for this rule (#199/#205 follow-up). A miss on the grid pane (a header row, padding, a twisty) never does — only the timeline's own empty click is "the" clearing gesture. `data-state~="selected"` paints on the matching `.fg-row` the same way it already does on `.fg-bar` — same `--fg-selection-color` Token, a background instead of an outline (`.fg-bar[data-state~="selected"]`, `.fg-row[data-state~="selected"]`). A row click selects **every Entry the row owns** (`FrameRow.entryIds`, #185; ADR 0010 once widened this to a Segment set, and ADR 0025/#421 retired that widening along with `Segment` itself, because the grid pane's unit is the row and an Entry is again the one thing there is to select); the row's cells still describe the first Entry. A grouping header row carries no entry and is never selectable.

Three reasons support this rule. First, D-S3-10 already names the empty timeline click as "the" clearing gesture. The same pixels must not give two different answers for two different buttons. Second, common desktop file managers clear a selection on a background right-click. The background menu that opens acts on the container, and a surviving highlight would misstate the menu's scope. Third, on a bar or a row the pointer path writes nothing; `contextMenu()` decides what the Selection becomes (§4.6, the right-click rule).

The clear rides on `pointerup`. `contextmenu` fires before `pointerup` on macOS and Linux, and after `pointerup` on Windows. So the empty-timeline clear can land before or after the menu opens, depending on the platform. A command's `when` always sees the Selection as of the moment the menu opens, on every platform — it never sees a fixed ordering guarantee against the clear.

A background menu whose commands never read the Selection could keep it. FreeGantt's menu is consumer-registered, so it carries no such guarantee.

**Rejected:** clear the Selection only when the open menu holds no selection-scoped command. We reject this: the same click would clear, or not clear, by which plugins the page installs. A click's outcome must not depend on what else is installed.

S5.5 Parts (D-S5-13/14, both mounted inside S5.3's `.fg-popup`): `.fg-tooltip`, `.fg-tooltip-title`, `.fg-tooltip-dates` (`tooltips()`); `.fg-menu`, `.fg-menu-item`, `.fg-menu-separator` (`contextMenu()`).

S5.8 Parts (D-S5-19, D-S5-47): `.fg-cell-editor`, `.fg-cell-editor-control`, `.fg-cell-editor-discard`, `.fg-cell-notice` (`inlineEditing()`) — mounted through the row layer (`ctx.view.rowLayer`) directly, not inside `.fg-popup` (the cell editor has no flip/clamp; it always sits at the cell's own rect). #158 moved this mount out of the Overlay: the row layer travels with the rows on both axes, so the editor stays on its cell through a scroll with no scroll listener. State attribute `data-state="invalid"` on `.fg-cell-editor` marks a failed `parseValue`, a `beforeChange` veto, or the default `dateInput`'s non-midnight refusal (issue #137 F11/F12). In that state the editor also carries `data-reason` (shipped values: `unreadable-value`, `refused-write`) and shows `.fg-cell-editor-discard`, so Escape is not its only exit (D-S5-47). A cell that offers an editor which cannot open at all mounts a `.fg-cell-notice` instead: words over the cell, no control, `pointer-events: none`, and its own `data-reason` (shipped values: `derived-value`, `no-parse-value`, `no-date-value`, `time-of-day`, `unsaved-value`). The two carry two classes so a stylesheet for one never reaches the other (#231 F1). Each reason key is machine-readable and is also the `code` of the Error report the editor raises, so one refusal has one spelling (#234, D-S5-40); the words the user reads sit beside it on the wrapper's own `title`.

#404 Parts: `.fg-time-shading` (`timeShading()`), on every `rangeBand` the plugin paints, alongside a
rule's own `class` when it names one. `--fg-time-shading-fill` is its Token.

A cell renderer reads its cell two ways. `text` is the string the library painted, through the
Field's own `formatValue`. `value` is the same Field value before formatting — what
`entry.read(column.field)` answers, for a core, `props`, plugin, or `compute` Field
alike. That is `formatValue`'s own vocabulary read back: **value in, text out**. A renderer that paints words reads `text`; one that branches on magnitude reads
`value`, and never parses the library's own output back with a regex. Reaching into
`entry.props` is not the alternative: a `compute` Field has no stored home.

Renderers return **plain serializable element descriptions** (tag/class/style/text/children), applied by the engine's reconciler — never live DOM nodes (nodes are recycled by virtualization) and never framework components in core (D5). Text by default; HTML by explicit opt-in only. `class` is `Readonly<Record<string, boolean>>` everywhere on `ElementDescription`, including its `children` (S5.4, D-S5-10) — this sample used a bare string until issue #137 F15 caught that it did not typecheck against its own referenced type.

```ts
barRenderer: ({ entry, item }) => ({
  class: { 'my-bar': true, 'my-bar--late': isLate(entry) },
  children: [
    { tag: 'span', class: { 'my-bar__label': true }, text: entry.name },
    { tag: 'span', class: { 'my-bar__team': true },  text: entry.props.team },
  ],
})
```

### 4.1 Per-entry looks and actions

Both questions — *how does this entry look?* and *what can you do to it?* — resolve **per entry**, not per Gantt, and every mechanism sees the whole entry (structure, fields, typed `props`):

**Variant.** Every bar element carries `data-variant`, so variant styling is level-2 CSS with zero JS (`.fg-bar[data-variant="summary"] { ... }`). That attribute is the Variant this Gantt resolved for the row — `summary`, `leaf`, or a consumer's or a plugin's own — never a stored Entry classification (ADR 0013, ADR 0018). A bar whose painted span was widened to `--fg-bar-min-width` carries `data-span="minimum"` (#212 follow-up); a Bar that states a fixed painted box (`Bar.box`, ADR 0022) carries `data-span="fixed"` instead — pair either with `data-variant` to style a floored bar differently from a fixed-width diamond (`.fg-bar[data-variant="leaf"][data-span="minimum"] { ... }`). At level 3, `variants` paints one named set of rows and `barRenderer` is the catch-all for every bar no Variant paints:

**The shipped set (ADR 0022).** Core exports three factories, each `(overrides?: Partial<EntryVariant>) => EntryVariant`, and every key on `overrides` wins: `bar()` (the default leaf look), `summary()` (a parent's rollup bar, seeded into `CORE_VARIANTS`), and `diamond()` (a zero-duration marker, `.fg-bar-diamond`, seeded into no row until a `when` rule matches one). `diamond()`'s box is fixed-width through `fixedWidthBar(px, anchor?)`, also published from `layout/`. A Variant may carry its own `css`, injected once per Gantt inside `@layer freegantt`, after the base sheet — this is how `diamond()` ships its own glyph, and how a consumer's `flag()` or `chevron()` can too, with no core edit. `gantt.variantFor(entry)` answers the whole resolved Variant for one row on one Gantt (`ResolvedVariant`, public); a plugin reads the same door as `ctx.view.variantFor`.

```ts
variants: [{ name: 'buffer', when: { buffer: true }, paint: ({ entry }) => hatched(entry) }],
barRenderer: ({ entry }) => defaultBar(entry),   // every bar no variant paints
```

**Label placement (J1).** `gantt.barLabels` and `EntryVariant.barLabels` both take `BarLabels`
(`BarLabelPolicy | BarLabelSpec`), live-reconfigurable (I8). The short form is a `BarLabelPolicy`
string — `'fitBar' | 'inside' | 'outside' | 'insideOrNone' | 'none'`, default `'fitBar'` — and picks
only placement, printing `name`; see `BarLabelPolicy`'s own doc comment (`src/layout/renderer.ts`)
for what each of the five values does. The resolved side is `data-label` on `.fg-bar` (`'inside'` /
`'outside'`) — a level-2 hook for a consumer stylesheet, styled by default through
`--fg-bar-label-gap` and `--fg-bar-label-outside-color` (`docs/10-styling-and-theming.md`). `data-label` is
absent for `'none'` and for a `barRenderer` result — no label child exists either time.
`'insideOrNone'` on a bar too narrow is `data-label='hidden'` instead: the label child exists,
measured, so a resize drag that widens the bar back across the fit line has something to reveal —
the hot path only flips the attribute, never mounts a child mid-drag (F1, #435 follow-up). The token
is named for what the DOM shows (present, unpainted), not for the `'none'` policy value that
produces it — the two meet a consumer writing a `[data-label=...]` stylesheet selector, and reusing
one word there would read backwards (R1, pass-2 branch review). `.fg-bar[data-label='hidden']
.fg-bar-label { display: none }` is the rule that keeps it unpainted either way.

**`BarLabelSpec` (`#421` C5) is the expert form: a bar names the Field it prints.** `{ field?:
FieldKey; placement?: BarLabelPolicy }` — either key alone keeps whichever half is already in force
(`mergeBarLabels`, `src/layout/renderer.ts`), so `{ field: 'hours' }` prints a Field other than
`name` at whatever placement policy already applies, and `{ placement: 'outside' }` changes only
placement. `EntryVariant.barLabels` overrides `GanttOptions.barLabels` per row the Variant resolves
to, the same override order every other per-variant key follows.

A `barRenderer` result owns its bar's content, so the library injects no label child and stamps no `data-label` for it. It still reads the same answer: `ctx.label` carries the resolved `{ text, placement }` for that bar at that width, and is absent under `barLabels: 'none'` and under `'insideOrNone'` on a bar too narrow for its label. So a consumer who customises a bar keeps fit-based labelling and never needs a text ruler — the library measures once, in one place, for its own label and a renderer's alike.

**Actions.** The `capabilities` config takes a boolean or a per-entry predicate for each gesture (`move`, `resize`, `linkCreate`, `select`), layered over the resolved Variant's own `capabilities` (ADR 0018), which is layered over the library rule. A predicate at any level may answer `undefined` for "no opinion", and the answer falls to the next level. One resolution both hides the affordance and refuses the gesture — pointer and keyboard alike (I14) — so a non-resizable entry simply has no handles, rather than handles that scold. `select` has no affordance to hide; `select: false` (or a predicate that returns false) refuses pointer and keyboard selection, and the entry skips it in a shift-range. The public `gantt.selectedEntryIds` setter (`selectedSegmentIds` retired, #421, ADR 0025) does not consult the capability — it is the programmatic path, matching `entries.update` under `move: false`. Context-menu items and commands carry a `when(entry)` clause, so a Variant (`when: ({ variant }) => ...`) or any predicate ships its own action set.

**`capabilities.edit` names a cell, not an entry** (#256). Its predicate takes `(entry, field)`, because a write names one Entry and one Field — the changeset's own shape. It narrows `Field.editable` (§2.6) per entry, and only narrows: it opens no cell `Field.editable` already refuses, and it is the only per-entry axis that key has. It answers for every writer at once — the cell editor, both resize handles, and the bar move — because all three write a cell. A predicate returns `undefined` for a cell it has no opinion about, and the rules below it decide that cell, so locking one End does not open every derived value on the page. A bare boolean pins every cell with no fall-through.

**A gesture asks two questions, and needs both.** `move`/`resize`/`select` say whether the gesture is *offered*; `edit` says whether the values it writes *may change*. `move` writes `start` and `end`, so it needs both cells. `resize` writes the dragged edge's own Field. `select` writes nothing, so it never asks. This is why `resize: true` opens a handle the library would have closed and still cannot write a Field `Field.editable` refuses — `edit` cannot reopen that cell; only `Field.editable` itself can.

**Keyboard bindings on the Selection.** The full pane-scoped chord map is
`plans/s5-extensibility-and-editing/s5.11-a11y-completion.md`'s D-S5-26; these two act on the
Selection and belong on any consumer's cheat sheet:

| Chord | Command | What it does |
|---|---|---|
| `Delete` | `freegantt.deleteSelection` | Two intents, kept apart by what was clicked (ADR 0012, ADR 0026): on a bar it un-dates the child Entry that bar draws (`entries.update`, clearing `start`/`end`); on a grid row or cell it removes the record (`dataset.entries.remove`). A `beforeChange` veto leaves the target untouched. |
| `Mod+ArrowRight` / `Mod+ArrowLeft` | `freegantt.selectNextEntry` / `selectPreviousEntry` (renamed from `selectNextSegment`/`selectPreviousSegment`, ADR 0025, #421) | Steps the Selection between the Entries the row it already sits on owns (#212, ADR 0010, issue #218). A row that owns one Entry has nowhere to step, so the chord writes nothing; it clamps at both ends. |
| `Escape` | `freegantt.discardCellEdit` | Closes an open Cell editor and writes nothing (`inlineEditing()`, D-S5-47, issue #160). Escape runs the command itself, and so does the editor's own discard button, shown in the invalid state — one road, so overriding the command changes both (#231 F2). A Gantt with no `inlineEditing()` answers the id with an inert registration and holds no editor code. |

**Division of labor:** capabilities answer the *static* question ("groups don't resize"); `before*` events answer the *contextual* one ("not before mobilization"). Use the shallowest one that fits.

**Viewport gestures** are a separate knob (`Gantt.viewportGestures`): they are not per-entry, they write no data, and they do not belong on `capabilities`. `false` turns wheel zoom, shift+wheel pan, and keyboard pan off together; `{ wheelZoom: false }` pins one gesture and leaves the others on. `zoomBy` / `panToDate` / `zoomIn` stay available either way.

**Convenience chords vs. obligation chords (#262).** Every default chord `view/gantt-shell.ts` binds falls into exactly one of these, and the split is written once, here, so the next chord has a rule to follow instead of re-litigating the question.

A **convenience chord**'s command has another door — a button, a menu item, or a public method — so an app author embedding a Gantt in a page that wants the same chord for something else (its own undo stack, say) may take it back. `Gantt.convenienceChords` turns them off, `false` for all of them or a per-command map for one at a time (typed against `ConvenienceCommandId`, so an obligation id below does not compile there). Turning a chord off never removes the command: `gantt.commands.run(id)`, a menu item, or a toolbar button reach it either way.

| Chord | Command | Why it is negotiable |
|---|---|---|
| `Mod+Z` / `Mod+Shift+Z` | `freegantt.undo` / `freegantt.redo` | `dataset.undo()` / `redo()`, and a toolbar button. |
| `Mod+A` | `freegantt.selectAll` | `gantt.selectedEntryIds = ...`. |
| `Delete` | `freegantt.deleteSelection` | `entries.update` (un-date a bar) / `entries.remove()` (drop a row) directly. |
| `Mod+=` / `Mod+-` | `freegantt.zoomIn` / `freegantt.zoomOut` | The methods of the same name. |
| `Mod+0` | `freegantt.panToToday` | The method of the same name. |
| `Alt+ArrowRight` / `Alt+ArrowLeft` | `freegantt.panRight` / `freegantt.panLeft` | `gantt.panToDate(...)`. |
| `Mod+Home` / `Mod+End` | `freegantt.panToStart` / `freegantt.panToEnd` | `gantt.panToDate(...)`. |

An **obligation chord** is the only keyboard path to what it does, so `[S5-A4]` and WCAG 2.1.1 keep it bound no matter what `convenienceChords` says — a code comment names both at each one's registration.

| Chord | Command | What it is the only keyboard path to |
|---|---|---|
| Plain arrows, `Home`/`End`, `Page Up`/`Page Down` | Roving focus (`view/roving-focus.ts`), not a `Command` | Moving DOM focus through the grid and timeline panes at all. |
| The splitter's own arrows | `view/splitter.ts`, not a `Command` | Resizing the grid/timeline split without a pointer. |
| `Shift+ArrowRight` / `Shift+ArrowLeft` | `freegantt.resizeColumnWider` / `freegantt.resizeColumnNarrower` | Resizing a focused grid column. |
| `Alt+ArrowRight` / `Alt+ArrowLeft` (header focused) | `freegantt.moveColumnRight` / `freegantt.moveColumnLeft` | Reordering a focused grid column. |
| `Mod+ArrowRight` / `Mod+ArrowLeft` | `freegantt.selectNextEntry` / `freegantt.selectPreviousEntry` | Reaching a second bar on a row that draws several (#212, ADR 0010, issue #218). |
| `Escape` | `freegantt.clearSelection` | Clearing the Selection from the keyboard. |
| `Enter` | `freegantt.activateEntry` | Firing `entryActivate` from the keyboard — a click activates too, and #434's ruling is that the one keyboard equivalent of a pointer capability is an obligation the same as any other. |

---

### 4.2 Fields and grid columns

One sentence separates them: **a field is what a value *is*; a grid column is where a Gantt *shows* it.** Fields live on the `Dataset`, because the rollup writes stored, undoable values and runs at construction — before any Gantt exists. Nothing but the Rollup writes a rolling-up parent's cell (ADR 0013). Grid columns live on the `Gantt`, because which fields this view shows is a view question (`01` §2.6).

Core fields and consumer fields are the same declaration, so `'start'` and `'cost'` take one code path — one renderer, one editor, one comparison rule, one rollup.

Four levels, each an addition to the one under it. Consumers stop at the shallowest that works:

```ts
// 1 — a field with no aggregate. One key. Lives in props under that key.
{ key: 'owner' }

// 2 — a shipped aggregator, by name, still no Field type.
{ key: 'cost', rollUp: 'sum' }

// 3 — a field type, so one bundle serves many fields: rollup, formatter, compare, column.
fieldTypes: { money: { rollUp: 'sum', formatValue: asCurrency, column: { align: 'end' } } }
{ key: 'cost', type: 'money' }

// 4 — your own aggregator: register the function under `aggregators`, then name it on the type or Field.
//    The function never goes on `rollUp` — only the name does (`01` §2.6).
aggregators: { riskWeighted: (parent, ctx) => /* ... */ }
fieldTypes: { risk: { rollUp: 'riskWeighted', formatValue: asRisk } }
{ key: 'risk', type: 'risk' }
// One-off without a type: { key: 'risk', rollUp: 'riskWeighted' } with the same `aggregators` entry.
```

Levels 1–3 are plain data on the Field declaration, so they diff in review and they travel with the consumer's own data. Level 4 adds a function in `DatasetOptions.aggregators`. `rollUp` on the Field or Field type is always an **Aggregator name** — shipped (`'sum'`) or yours (`'riskWeighted'`). It never takes a bare function: a name can be refused when it is not registered, and a function cannot travel with data. The Aggregator signature is `01` §2.6 (`parent`, `ctx`); return `undefined` to leave the parent's stored value alone — except on a rolling-up parent, where it means no value (ADR 0013). The Field key is the address. `formatValue` is display: money stays a number in the store; the cell shows currency text. Sort reads the stored value (`01` §2.6, S4.9).

A custom Aggregator that only needs the field it is rolling up skips the manual child loop: `ctx.numericValues()` reads `ctx.field` off every child, in order, dropping holes and non-numeric values the same way shipped `sum`/`min`/`max` do. The child list rides on the context, never beside a `parent` that cannot answer for it (ADR 0017).

```ts
// A single-field numeric Aggregator, in a few lines — no manual child loop, no manual hole-skipping.
aggregators: {
  average: (parent, ctx) => {
    const values = ctx.numericValues();
    return values.length === 0 ? undefined : values.reduce((a, b) => a + b) / values.length;
  },
}
```

`ctx.values()` is the same read, without the numeric filter — use it when a hole itself is meaningful (e.g. `count`). A multi-field Aggregator like `riskWeighted` above reads each field it needs with `ctx.values(key)` or `ctx.numericValues(key)`, and a child's duration with `ctx.durations()` — never `entry.duration()`, which answers for the store's row and not for the effective child this pass built (ADR 0017).

**Because a field carries its own column defaults, `gridColumns` is mostly ordering:**

```ts
gantt.gridColumns = ['name', 'start', 'duration', 'cost'];
```

The object form overrides this Gantt's presentation and never the data half — `{ field: 'cost', header: 'Budget — site A' }`. Aggregation is never a column key: a stored value must not depend on whether a column is visible, and the rollup has already run before the Gantt was built.

**`columnRenderer` types its `fieldValue` from the column's own Field key.** `GridColumn<TProps>` maps a core key or a declared `TProps` key to its own `FieldValue`, so a `start` column's renderer reads `fieldValue` as `Instant`, and a `cost` column's renderer reads it as `number` — the same type `entry.read(key)` answers. An open key — a plugin's own, or any key on an untyped `Gantt` — keeps `fieldValue: unknown`. The accepted cost: an inline arrow that destructures its context on a known key needs a `ColumnRendererContext<TValue>` annotation, because the parameter is otherwise implicit `any`. **The read and write sides of `gantt.gridColumns` split on purpose:** the setter types each column's `columnRenderer` from this Gantt's own Dataset props, one cast at the façade (ADR 0018, the same cast `set variants` makes); the getter stays erased (`readonly GridColumnInput[]`, no `TProps`), because `TValue` sits in `columnRenderer`'s parameter, a contravariant position, and typing the read side too would stop a `Gantt<TProps>` from widening to a plain `Gantt`.

`measureDuration` names how core measures a duration (ADR 0017). `'span'`, the default, counts from `start` to `end` and includes every gap — what the library ships. `'children'` (ADR 0026 retired the Segment-named `'segments'` value, #421) sums each direct child's own span and counts no gap between them; a childless entry falls back to its own span. It sits on the `Dataset`, not on a `Field` and not on a `Gantt`: a per-Field setting would let two Fields on one Dataset disagree about what a duration is, and a view may not change what a value **is**. `entry.duration()` reads it, and so does `ctx.duration()` inside a pass.

**A value with no stored home** is a computed field — core's own `duration` is one:

```ts
{ key: 'duration', compute: (entry, ctx) => /* Duration | undefined from start/end through time/ */ }
```

A stored Field (a core key or a key in `props`) has somewhere to put a parent's aggregate, so it is stored and undoable; a computed field's aggregate is computed on read and is never stored. Nothing but the Rollup writes a rolling-up parent's cell (ADR 0013). A computed field reads the dataset only — never zoom, visible range or selection. A value that depends on the view is a renderer's business, not a field. **An Aggregator reads its children's durations with `ctx.durations()`** ([ADR 0017](../docs/adr/0017-the-entry-answers-questions-about-itself.md)). `FieldContext.read(entry, key)` and `FieldContext.durationOf(entry)` are both gone, and so is `entries.fieldValue(id, key)`: a row answers a Field by key through `entry.read(key)` and its duration through `entry.duration()`. Neither door survives on a row a caller names. The Rollup, the ChangeSet and every `compute` Field hold a row the store does not hold, so they carry stored values and ask the pass, not the row — `ctx.read(key)`, `ctx.duration()` and `ctx.children()`, none of them taking an entry. `entry.duration()` would answer for the store's row instead, so an Aggregator never calls it. A `compute` Field's signature stays `(entry, ctx)`, and `entry` is a `StoredEntry`. **`entry.read('parentId')` answers the stored value, on every door, the same as any other key** ([ADR 0024](../docs/adr/0024-parentid-answers-the-stored-value-on-every-door.md)): the tree's own checked answer is a separate core Field, `hierarchyParentId`, computed like `duration` and equal to `entry.parent()?.id`.

**Editing crosses core and consumer fields freely** — one call, one transaction, one undo step:

```ts
dataset.entries.update('t1', { start: '2026-10-05', cost: 12_000 });
const t1 = dataset.entries.get('t1')!;
t1.read('cost');                         // 12_000 — props
t1.read('start');                        // core key
t1.read('duration');                     // compute; no Gantt required
t1.duration();                           // the same value, off the row's own member
t1.children();                           // the tree, off the row (ADR 0017)
dataset.field('cost');                   // resolved Field | undefined
dataset.fields.all;                      // every declared Field, core included
```

`entries.update()` refuses three ways, and it never writes silently. An unregistered key throws `UnknownFieldError`. A `compute` Field throws `ComputedFieldCannotBeWrittenError`. A Field at `editable: 'never'` throws `FieldNotEditableError`. The door checks `compute` before `editable`. Nested `props:` at `update()` is refused. A missing id on `read` is an `EntryNotFoundError`. The read goes through the same Field registry path as the write: a consumer who declared `{ key: 'cost' }` does not reach into `entry.props` for a Field read. `dataset.field` and `dataset.fields.all` return **resolved** declarations (type merge applied). They are not the raw `DatasetOptions.fields` array. `PropsEdit<TProps>` and `EntryEdit<TProps>` are public.

**`editable` lives on the Field, never on the column** (S5.8, D-S5-19, #142, #256, ADR 0015, amended ADR 0033). `{ key: 'cost', editable: 'anywhere' }` opens that field's cell editor in `inlineEditing()`. On `start` and `end` the same value opens the bar's own drag-resize handles and its move. The Field states how far a value may change (`'never' | 'api' | 'anywhere'`). Every gesture — the cell editor, a drag, a resize, a keyboard nudge, Delete on a bar — asks for `'anywhere'` and refuses anything else. `entries.update()` refuses only `'never'`. Default is `'anywhere'`. `true`/`false` are input aliases for `'anywhere'`/`'never'`. `capabilities.edit` narrows which entries an already-`'anywhere'` Field is writable on (§4.1); it never reopens `'api'` or `'never'`. Core's own `name`, `start` and `end` declare `'anywhere'`, matching the resize a bar already allowed before this Field existed; `{ key: 'end', editable: false }` still constructs and stores as `'never'` without redeclaring `end`'s rollup — `IllegalCoreFieldOverrideError` is thrown for any other key on a core field name. Check `compute` before `editable`. `dataset.setFieldEditable('start', 'never')` changes one Field's `editable` after setup. It is the only Field attribute that may change. An unknown key throws.

**Default `gridColumns` is `['name', 'start', 'end']`** (ADR 0012). Naming a Field does not add it to the grid by itself. Hide is live, so a product that wants fewer columns hides one. **The date path is the grid**: the date editor opens on a blank cell and writes one Field, so a dateless row is dated there. A timeline *set dates* gesture is not this cut. A plugin Field key in `gridColumns` is written exactly as the plugin registered it, prefix included (`scheduling:progress`, ADR 0008). Nothing in `src/` enforces that prefix — it is the convention a plugin follows, not a rule the registry checks.

**Hiding one column is one call, not a restated list** (S5.7, D-S5-34, #184):

```ts
gantt.hideGridColumn('cost');
gantt.showGridColumn('cost');
gantt.hiddenGridColumns; // ['cost'] while it is hidden
```

`hidden: true` on the column is the stored state; the two verbs write it. The hidden column keeps its width, keeps its place in the order, and stays in `gridColumns` as `{ field: 'cost', hidden: true }`, so a saved list restores it hidden and `showGridColumn` puts it back where it was. Assignment cannot do this: `gantt.gridColumns = shorterList` replaces the whole authored list, and drops every width and every position the user set on the other columns. A hidden column leaves the grid, the pane width, and `ctx.view.resolvedColumns()` — that seam answers what this Gantt paints right now.

**No new event pair.** Hiding runs the same commit sequence a resize drag and a reorder drop run, so it raises `beforeGridColumnsChange`/`gridColumnsChange` and a handler can refuse it. This is the opposite call from `registerGridColumn` (D-S5-33), which got no pair: a plugin's registration changes nothing the consumer owns, so its `from` would always equal its `to`. Hiding changes what `gantt.gridColumns` answers, so the pair is already the right one and a second pair would only split one veto across two names. A hidden column that a plugin declared is the plugin's own, so it reports no change — the same truthful answer a resize of one already gives. `UnknownGridColumnError` (`code: 'unknown-grid-column'`) names a field no declared column carries: neither verb adds a column, so there is nothing to act on.

**Row-source sort** names a declared Field, not a visible column — `sort: { field: 'cost' }` orders by the stored value through `FieldCompare`, even when `gridColumns` is `['name']` only (`01` §2.6, S4.9, D-S4-13/D-S4-28).

---

### 4.3 Row sources, collapse, and tree

A **Row** is a derived horizontal track — not an Entry. One Row may carry many Entries' bars; a row source may produce Rows that stand for no Entry at all. **`gantt.rowSource`** names the config that decides what the Rows are for this Gantt. It leaves `rows` free for a future getter of the derived rows themselves. The setter takes a `RowSource`; the getter reads back a `ResolvedRowSource`, which fills every key `layout/` defaults at consumption — `filterPolicy` and the entries source's `tree` (#248). So a consumer reads the value the library uses, and never has to know a default to read it.

Default: `{ source: 'entries', tree: true }` — a tree over `parentId` (plans/01 §2.3's classic Gantt). Three occupants ship:

```ts
// Entries, optionally as a tree over parentId
rowSource: { source: 'entries', tree: true }

// One header row per groupBy value, then that group's entries.
// groupBy (and filter / sort.compare) receive the bound Field reader as a second argument.
rowSource: { source: 'group', groupBy: (entry, fields) => fields?.read<string>(entry, 'team') ?? 'unassigned' }

// Consumer-supplied rows — id, optional entryIds, optional label
rowSource: {
  source: 'custom',
  resolve: ({ entries }) => [
    { id: 'hdr-a', label: 'Team A' },
    { id: 'row-a1', entryIds: ['t1', 't2'] },
  ],
}
```

`{ source: 'entries' }` and `{ source: 'group' }` share a common block (`RowSourceCommon`): `filter`, `sort`, `filterPolicy`. `{ source: 'custom' }` takes none of them — the resolver owns row membership.

**`childrenAsSegments`** (`EntriesRowSource`, entries source only) draws a parent's children as Segments on the
parent's own row instead of giving each a row of its own:

```ts
rowSource: { source: 'entries', tree: true, childrenAsSegments: true }               // every parent
rowSource: { source: 'entries', tree: true, childrenAsSegments: { team: 'framing' } } // a field match
```

It takes an `EntryRule` (a field match or a predicate, `layout/entry-rule.ts`) or `true` for every
parent. A parent the rule matches is a **segmented parent**: its children draw their own Bars on its
row rather than on rows of their own, and the parent itself draws no Bar of its own — core ships no
producer that draws one for a segmented row (ADR 0027). An parent no rule matches is unaffected: its
children keep their own rows, and its own row still draws the one Bar `wholeSpanUnlessSegments` (or a
rolling-up producer of its own) gives it. A key the rule names that no Field declares reports once
per rule and key, `code: 'unknown-row-source-field'` (`08` for the worked example).

**Sort and filter** live on the row source (`rowSource.filter`, `rowSource.sort`, `rowSource.filterPolicy`) — view knobs that never reorder `dataset.entries.all` or change what the Rollup sees (D-S4-28). `sort.field` names a declared Field; sort reads `fieldCompares`, not visible `gridColumns`.

**Collapse is Gantt state**, not Dataset state — no transaction, no changeset:

```ts
gantt.collapsed = ['p1'];           // live; RowIds, loose on the way in
gantt.collapse('p1');
gantt.expand('p1');
gantt.toggleCollapse('p1');
gantt.collapseAll();
gantt.expandAll();
gantt.collapseStateOf('p1');        // 'collapsed' | 'expanded' | 'leaf' | undefined for no such row

gantt.on('beforeCollapseChange', ({ from, to }) => false);  // veto
gantt.on('collapseChange', ({ to }) => saveCollapsed(to));
```

For `{ source: 'entries' }`, a `RowId` equals the `EntryId`, so `collapse('p1')` names the parent entry. A grouping header uses a derived `RowId` from the `groupBy` value. Collapsed subtrees are absent from the row list, not merely hidden — `rowCount`, `aria-setsize`, and the scrollbar stay honest. The collapsed set survives data edits; a stale id simply matches nothing, the same way a removed entry's id can linger in `selectedEntryIds`.

**Live reconfiguration.** Assigning `gantt.rowSource` re-resolves rows, invalidates the height index from 0, and requests one frame — no remount. Scroll survives as a pixel position, clamped against the new content height.

Group header rows show the `groupBy` label in column 0 and blank cells elsewhere. Per-group aggregates are the caller's data — declare a computed Field or write through a group entry; the grid does not invent them (D-S4-11).

Published types: `RowSource`, `EntriesRowSource`, `GroupRowSource`, `CustomRowSource`, `CustomRow`, `CustomRowInput`, `RowSourceCommon`, `RowId`, `CollapseChange`, `RowFilter`, `RowSort`, `FilterPolicy`, and the three the getter reads back — `ResolvedRowSource`, `ResolvedEntriesRowSource`, `ResolvedGroupRowSource` (a custom row source resolves to no extra keys, so it needs no `Resolved` type of its own).

### 4.4 One plugin, two halves, one install site (ADR 0019)

**A plugin is one object.** `definePlugin({ id, requires, data, view })` is the door.

```ts
const scheduling = () =>
  definePlugin({
    id: 'freegantt.scheduling',
    requires: ['freegantt.calendar'],
    fields: [], // declared before any entry is read (#496 grill round 3, R1)
    data(ctx) {
      /* the edit hook, the store — DOM-free, runs as the Dataset constructs */
    },
    view(ctx) {
      /* variants, renderers, commands, keys — runs on a finished Gantt, before its first frame */
    },
  });

const dataset = new Dataset({ entries, plugins: [scheduling()] });
const gantt = new Gantt({ dataset }); // its Fields, variants, bars and menu are already there
```

**The install site is where the state lives.** A plugin with a `data` half installs on the
`Dataset`, because it declares everything that shapes construction — `fields`, `fieldTypes`,
`aggregators` and `hierarchySource` (ADR 0031) — on the definition itself, before any plugin code
runs. Every `Gantt` bound to that Dataset then runs the `view` half once, each with its own context,
so I2 holds by construction. A
chrome-only plugin — `weekendShading()` — has no `data` half and keeps installing on the `Gantt`.
`gantt.plugins` stays live-reconfigurable, and `dataset.plugins` stays read-only.

**The type refuses the wrong site first.** `GanttOptions.plugins` takes `ChromePlugin` alone, which
carries `data?: never`, so a plugin with a `data` half is a red squiggle in the editor. The runtime
refusal — `PluginSetupError`, with a message naming the Dataset — is the second line, for the caller
the compiler never met: plain JavaScript, or a list a helper widened. No new error type ships.

**`requires` sits on the one type and covers both halves.** A Gantt sorts the Dataset's own plugins
together with its own chrome under that one graph (D-S5-31), so a chrome plugin may require a plugin
whose only half is `data`. There is no ordering knob.

**The `data` half's own doors are namespaced, and every one is expert.** `ctx.store.reserve` takes
this plugin's store, `ctx.edits.setExtender` claims the extension hook, and `ctx.edits.setLockRule`
claims the per-entry lock rule (ADR 0015, #473). Each door takes one occupant that composes — a
plugin receives the current occupant and may call it — so a second plugin adds to the first rather
than evicting it (D-S5-23). `setExtender` and `setLockRule` are legal while `data()` runs and not
after (ADR 0031); `ctx.store.reserve` is ungated. A store row belongs to one Entry: `store.set(id,
row)` throws `EntryNotFoundError` for an id with no Entry, as the open transaction leaves it, the
rule `entries.update` follows. Removing an Entry removes its rows in the same `ChangeSet`, even a
row the same transaction wrote first.

**A Field, a Field type, an Aggregator and the hierarchy source are not a `ctx` door at all** — a
plugin declares them on itself, `fields`/`fieldTypes`/`aggregators`/`hierarchySource`, the same shape
`DatasetOptions` takes (#496 grill round 3, R1; ADR 0031). An app author never meets the hierarchy
source: they write `parentId` on an Entry, and core's own source answers it. `Dataset`'s constructor
builds every plugin's declarations, alongside its own, completely before `data()` runs; `data()` then
runs after, so it still sees every entry. One way to declare, so there is no `ctx.fields.register` or
`ctx.hierarchy.setSource` a later call could reach (R2, ADR 0031).

```ts
ctx.edits.setLockRule((next) => (entry, field) =>
  field === 'cost' && entry.isDescendantOf(unlockedSubtreeRootId) ? 'anywhere' : next(entry, field));
```

That reads: open `cost` under one subtree root, otherwise whatever the next rule says. `entry` is a
`FieldLockQuery` (`id`, and `isDescendantOf(ancestorId)` for the subtree question) — not the live
`Entry`, so a lock rule reads structure and nothing a Field write could see. The rule answers
`FieldEditable | undefined`; `undefined` is silence, and the resolver falls to `Field.editable`
(`data/write-rule.ts`'s `resolveFieldEditable`). Every write door — the grid, `entries.update()`, and
an `EditExtender` cascade — reads the same resolved answer, and `Dataset.editableOf(id, field)` /
`EditRequest.editableOf(id, field)` publish it so a consumer or a plugin can ask before it writes
(I14).

```ts
definePlugin<PlannerProps>({
  id: 'demo.planner',
  fields: [{ key: 'phaseId' }],
  hierarchySource: (next) => (entry) => entry.props.phaseId ?? next(entry),
});
```

That reads: its hierarchy source is the entry's phase id, or the next source's answer. A source reads
a `StoredEntry` and answers one parent id — never the live `Entry`, whose `parent()`, `children()`,
`depth` and `descendants()` are all built from this answer, and never the whole dataset, which would
make a child query O(dataset). Composition follows setup order (D-S5-31): the first plugin wraps
core's own source, each later plugin wraps the one before it, and the last plugin answers first —
the same order `data()` runs in. Core owns everything downstream: the child index, the walks, and the
Rollup. `parentId` is still stored and `update()` still writes it; a source that ignores the field is
a plugin taking the tree over on purpose, and core does not warn about it. **`entry.read('parentId')`
answers what was authored, never this source's checked answer** ([ADR 0024](../docs/adr/0024-parentid-answers-the-stored-value-on-every-door.md)) —
a plugin-owned hierarchy is exactly a case where the two can disagree on purpose, and `entry.read('hierarchyParentId')`
or `entry.parent()` is how a caller reads this source's own answer instead.

Published types: `ChromePlugin`, `DataPlugin`, `Plugin`, `PluginContext`, `DatasetPluginContext`,
`HierarchySource`, `HierarchySourceWrapper`, `FieldLockQuery`, `FieldLockRule`,
`FieldLockRuleWrapper`, and the generic `*Of` shapes behind each. The retired pair is
`GanttPlugin` / `DatasetPlugin`. `DatasetHierarchy` retires with `ctx.hierarchy.setSource` (ADR 0031).

### 4.5 Plugin registrations: one collision policy, one lifetime (#155)

A `PluginContext` hands a plugin six `register*` seams. They answer a collision the same way, so an
app author installing two plugins meets one rule rather than one rule per seam.

| Seam shape | Two plugins claim the same thing | Seams |
|---|---|---|
| **A single paint slot** | **Throws** `RendererAlreadyRegisteredError`, naming the slot and both plugin ids. Two plugins painting one slot is an authoring mistake, and silence would make it look like the second plugin did nothing. | `view.registerRenderer` |
| **Keyed by an identifier** | **The newest registration wins**, and the one it covered is still there. | `commands.register`, `variants.add`, `view.registerGridColumn` |
| **Additive, no key** | No collision to have — every registration runs. | `view.registerDecoration`, `interaction.registerKeybinding` (newest-first at resolve time) |

**Lifetime is the same for all six: a registration lives exactly as long as the plugin that made it.**
Uninstalling a plugin (`gantt.plugins = […]` without it) removes its registrations, whatever order
plugins are dropped in. What answers next is the newest registration still standing — the library's
own default where nothing else claimed the key, and core's own command where a plugin had overridden
one. So `plugins = [p] → [] → [p]` is an ordinary sequence, not a plugin colliding with what its
earlier installation left behind.

**Every `register*` returns a `Disposer`.** Ignoring it is the common case, because the plugin's own
teardown already holds a copy. A plugin that shows a column, a key binding or a decoration in one
mode only calls it to retract that registration while the plugin keeps running. Calling it twice is
safe.

**Every paint point is a whole point.** `bar`, `cell`, `header` and `tooltip` all hold one slot, and
one plugin claims each. The `bar` point held one slot per variant name until ADR 0018, so two
plugins that each defined a variant both registered here. They install through `ctx.variants.add`
now, and each Variant carries its own `paint`, so the per-variant map retires with `RendererByLook`
and D-S5-12 with it.

**A Variant's `paint` names the rows it covers, so it answers before `barRenderer`.** `barRenderer`
is the catch-all for every bar no Variant paints, which is what the retired map's `'*'` entry meant.
D-S5-11 still orders that catch-all: a consumer's own `barRenderer` beats a plugin's whole-point
`bar` renderer. To take a row a plugin's Variant claimed, declare a Variant of the same name — the
consumer's rules outrank every plugin's.

**A plugin's `setup(ctx)` returns a `Disposer`, or nothing.** Every `register*` and every
`onDomEvent` files its own removal in `ctx.disposables`, so a plugin that owns no timer, socket or
subscription of its own has nothing left to return. `return () => {};` was ceremony, and to a
newcomer it read as if something were missing.

**`wholeEntryBar(entry, variant)` is public.** It returns one Bar covering the entry's whole span, and it
is pure and DOM-free, and it is the one owner of the `barId(entry, partIndex)` convention — the one
thing a plugin could otherwise get wrong from documentation alone. `wholeSpanUnlessSegments(entry, variant,
childrenAsSegments)` (ADR 0023, ADR 0026, #421 — retired the Segment-keyed `ignoreSegments`/
`followSegments` pair) is core's own producer for a parent: it returns `wholeEntryBar`'s one Bar
when the row source has not matched the parent, and `[]` when it has — a segmented parent draws no bar
of its own unless a consumer's own producer says otherwise. A Variant that omits `bars` draws
`wholeSpanUnlessSegments` — `summary()` states it explicitly, because a summary is one rail over its children's
span whether or not a row source draws them as Segments.

One shared mechanism implements all of this — see **Registration table** in `CONTEXT.md`. A seam that
writes its own stack-and-restore bookkeeping is a bug, not a variation.

**One module declares the whole context.** `view/plugin-ports.ts` types every member in the group a
plugin reads it in (`ctx.commands`, `ctx.interaction.*`, `ctx.view.*`, `ctx.layout.*`).
`api/gantt.ts` adds `dataset` and `gantt`, and nothing else. Adding a seam is therefore one edit in
one file. A member declared in the wrong group does not compile.

**A read seam is not a registration.** `ctx.view.resolveTooltipContent(entryId)` returns an
`ElementDescription` — the tooltip's *body*, which `tooltips()` then mounts. It pairs with
`ctx.view.resolveTooltipColumns(entry)` and `ctx.interaction.canWrite(entry, field)` (#256). None of the three is
gated: a plugin reads them for as long as it runs, not only while `setup` runs.

### 4.6 The plugin-to-DOM seam: `ctx.view.dom` and `ctx.view.onDomEvent`

A plugin never writes a `.fg-*` selector or a `data-*` key of the rendered Gantt. It asks
`ctx.view.dom` instead:

```ts
ctx.view.onDomEvent('dblclick', (event, target) => {
  if (target?.kind !== 'cell') return;
  openEditor(target.entry, target.field, target.element);
});

const bar = ctx.view.dom.barFor(entryId);       // this entry's bar in the current frame
const cell = ctx.view.dom.cellFor(entryId, 'cost');
```

**`ctx.view.focusedCell()` answers which cell the keyboard is on** (S5.11, D-S5-39). It hands back `{ entryId, field }`, or `undefined` when focus sits on a row, a bar, a header cell, the splitter, or nothing. It reports a *fact*, never a node: which cell has focus is a view concern, so a plugin reads the answer rather than querying the DOM for it or keeping a focus model of its own. `inlineEditing()`'s `Enter` handler is the first caller — before this port it opened the first editable column of the selected Entry, because per-cell focus did not exist yet.

- **`targetUnder(node)` answers `{ kind, element, entry?, entryIds, field? }`.** `kind`
  is `TargetKind` — `'row' | 'cell' | 'bar' | 'header' | 'splitter'`, the same union
  `CommandTarget.kind` uses. One vocabulary, so a resolved right-click fills a
  `CommandContext.target` with no translation table. `undefined` means the node is outside this
  Gantt, or inside it and on none of the five.
- **A target answers two questions about Entries, because a Row may own several** (#185, #199).
  `entry` is the node's **subject**: the one Entry whose Fields the node's content shows. A tooltip
  describes it, and the cell editor anchors on it. `entryIds` is everything the node stands for, and
  is what an action on the node acts on. The `Segment` type retired (ADR 0026, #421), so there is one id set
  here, not a pair. For a bar the subject and the set agree. For a row, and for every cell of that
  row, `entry` is the row's first Entry, and `entryIds` names every Entry the row owns. It is always
  present, and empty for a header cell, for the splitter, and for a grouping header row.
- **`owns(node)` is the one answer to "is this event mine?"** (I2). `onDomEvent` asks it for every
  listener, so no plugin writes that guard again.
- **`onDomEvent(type, handler, options?)` listens on `document`, filtered to this Gantt.** It hands
  the handler the resolved target and files its own removal — with the capture flag it added — in
  `ctx.disposables`. The returned `Disposer` removes it sooner, for a listener a plugin attaches per
  open popup.
- **`bounds` and `paneBounds` are the rects a popup places against**, and `cellText(cell)` is the
  string the grid already painted. `Overlay` keeps only `present`, `render` and `onResize` — the
  mount layer, and nothing else.
- **`createPopup(ctx.view, keymap)`** takes the whole view surface now, because a `Popup` needs the
  overlay to mount in and `ctx.view.dom` to place against.

**`CommandTarget` carries what the invocation acts on, as one id set: `entryIds`** (#199, widened by
ADR 0010/#212 to a Segment set, retired back to Entries alone by ADR 0025/#421 once `Segment`
retired). A command reads it from `ctx.target` — no command declares its reach, and two commands can
never disagree, because both read the one resolution:

```ts
gantt.commands.register({
  id: 'app.lockRow',
  label: 'Lock',
  run: (ctx) => ctx.target?.entryIds.forEach((id) => locks.lock(id)),
});

gantt.commands.register({
  id: 'app.deleteEntry',
  label: 'Delete',
  run: (ctx) => ctx.target?.entryIds.forEach((id) => dataset.entries.remove(id)),
});
```

- **`entryIds: readonly EntryId[]`** is every Entry the invocation acts on — the same word
  `DomTarget.entryIds` uses, and not always the same set (#199): a `DomTarget` states a DOM fact,
  what the node stands for; a `CommandTarget` states what the command acts on. Lock and Delete both
  read `entryIds` now — a lock is a property of the record, and so, since ADR 0026, is a bar.
- **The right-click rule (#199, ADR 0010, ADR 0025, #421).** *A right-click acts on the Selection
  when the thing you clicked is part of it. It acts on the thing you clicked when it is not.* So a
  right-click on an unselected grid row names every Entry that row owns; a right-click on one bar of
  a segmented row names that one Entry; and a right-click on one of three selected bars names all
  three. A node stands inside the Selection only when every Entry it names is selected. A node that
  names no Entry — a header cell, the splitter, a grouping header row — is part of nothing.
- **A right-click outside the Selection replaces the Selection with what you clicked**, before the
  menu opens. It runs the same cancelable `beforeSelectionChange` an assignment runs. Otherwise the
  command acts on Entries the user cannot see highlighted.
- **The keyboard runs the same rule** (D-S5-14, #205). `Shift+F10` and the Menu key open the menu
  for the Selection, so three selected bars reach one menu that acts on three. The bar of the first
  selected Entry stays the popup's anchor, because a popup needs a box on screen.
- **A command that wants exactly one Entry says so**: `when: (ctx) => ctx.target?.entryIds.length
  === 1`, and reads `ctx.entry` for it. `ctx.entry` is the subject, never the set.
- `kind` and `field` are the same two words `DomTarget` uses. There is no `rowId`: a row's identity
  is a `RowId`, and this names Entries, never rows.

**`PopupOptions.onDismiss(trigger)`** tells a popup's owner that the popup closed *itself* —
`'escape' | 'outsidePointer' | 'scroll' | 'blur'`. It runs after the close, so `isOpen` reads
`false` inside it. `close()` called by the owner never fires it. Without this an owner had two
choices, and `contextMenu()` took the worse one: leave two `document` listeners attached and poll
`isOpen` on every click and keystroke in the page.

---

## 5. Shared axes and scroll (multi-Gantt, D9)

> **This section describes HEAD**, for the same reason §4 does. [ADRs 0017–0020](../docs/adr/) have not landed.

```ts
import { TimeScaleModel, ScrollAxis } from 'freegantt';

const scale = new TimeScaleModel({ preset: 'weekAndMonth', fit: 'preset' });
const x = new ScrollAxis();

const deliveries = new Gantt({ container: '#top',    dataset: deliverySchedule, scale, scroll: { x } });
const workforce  = new Gantt({ container: '#bottom', dataset: staffing,         scale, scroll: { x } });
```

### `fit` — how dense the axis is

`fit` lives on both a `Gantt` and a `TimeScaleModel`, and is live on each. It takes four shapes:

```ts
gantt.fit = 'pane';                            // default — the whole range fills the measured pane
gantt.fit = 'preset';                          // the showing preset's own density, pane ignored
gantt.fit = { unit: 'day', widthPx: 14 };      // one day paints 14px wide
gantt.fit = 0.000162;                          // expert: pixels per millisecond
```

The third is the one an app author writes. "A day tile is 14 pixels" is the sentence they have, and the library owns the arithmetic that turns it into a density. Stating it as a `number` means writing `14 / 86_400_000`, which claims every day is 24 hours — wrong in every zone that observes DST, and wrong for a month or a year in every zone at all. The `number` form stays, because `zoomTo`/`zoomBy` write it and a caller who already holds a density should not have to dress it up (#15).

A scale carries one density across its whole span, so a stated width lands exactly on the unit at `range.start` and each later unit follows its own calendar length — a 23-hour day paints narrower than the days beside it, which is what a reader of a DST week expects. `increment` defaults to 1: `{ unit: 'week', increment: 2, widthPx: 90 }` reads "a fortnight is 90 pixels".

Every mode passes through the preset's `minTickWidthPx` floor and `MAX_CONTENT_PX` ceiling. A page that wants tiles below the shipped floor states its own preset, the same "a new zoom level is never a library edit" knob as any other — see `harness/bar-label-fit.ts`.

The two Gantts hold **different** datasets — D9's own example is a delivery-schedule Gantt above a workforce Gantt. What is shared is the time axis and the scroll, never the data. Two Gantts *may* bind one `Dataset`: nothing forbids it, a second Gantt is simply a second subscriber to `dataset.on('change')` (D-S2-24), and it costs the library nothing. It is not a case the library designs around or tests, and a consumer who wants it owns the arrangement.

Omit `scale`/`scroll` and the Gantt creates private ones — single-Gantt users never meet the concept. Passing shared instances is the *entire* sync API: no link manager, no event plumbing. `ScrollModel`, which fused both directions into one object, is retired (S6, D-S6-1); `ScrollAxis` is one direction, so `scroll: { x?, y? }` shares exactly the directions a caller supplies. The example above shares `x` and leaves `y` private on each Gantt — sharing `y` too, or instead, is `scroll: { x, y }` or `scroll: { y }`. Whichever direction is shared, a shorter chart's own row (or content) count clamps the shared position locally, so it pins at its own last row while a taller chart keeps going, with zero remembered state.

---

## 6. Persistence (ADR 0016)

**The library holds no save format.** There is no `toJSON`, no `fromJSON`, no Document type and no `schema` integer. The consumer brought the data in, and the consumer owns where it goes.

```ts
const rows    = dataset.entries.all;                   // every Entry, as stored
const fields  = dataset.fields.all;                    // the Field declarations
const risk    = dataset.pluginStore('risk');            // one plugin's store, or undefined
```

`entries.all` and `fields.all` already ship. `pluginStore(id)` ships with ADR 0016. An application maps these into its own shape and saves that shape. It writes the same mapping in the inbound direction to build the `Dataset`, so this is the outbound half of work it does anyway, against a shape it chose.

**The inbound half is one call.** `dataset.entries.load(rows)` (#496) writes a saved list back onto a live Dataset, in any order — a child may list before its parent. Before #496 the only inbound door was `new Dataset({ entries })`, which a mounted Gantt cannot take (`gantt.dataset` is read-only) and which gives every subscriber a new identity to rebind. `load` is not a save format: it takes `FlatEntryInput[]`, the shape the constructor already takes, and adds no document type, no schema and no version — ADR 0016 stands.

**A periodic server poll calls `dataset.entries.syncAll(rows)` (#517) or `dataset.entries.syncChanges(delta)` (#527), not `load`.** `load` clears History and resets every kept entry's selection, collapse state and plugin store rows on every call — the right posture for opening a saved file, the wrong one for a refresh a user is looking at. `syncAll` takes the same `FlatEntryInput[]` shape and keeps a kept entry's state, so it fits a poll loop that runs while the app stays open; `syncChanges` takes only the rows a server changed, for a server that already sends a delta.

**A plugin that owns data a consumer must keep publishes its own reader.** It gets no hook into a library format. A consumer saves that data by reading it from the plugin, in the plugin's own vocabulary.

- **Changesets are the incremental counterpart**: `dataset.on('change')` carries `{from, to}` per field, which is what discharges this document's promise that a sync adapter be *"an extension, not a core change"*. `dataset.apply(changeSet)` is what such an extension writes; it is not in S2 (D-S2-11).
- **View state is not data.** Column widths, collapsed rows and scroll position were never part of the format. Whether the library helps save them is a separate question, and ADR 0016 does not answer it.
- **A plugin's rows come out through `dataset.pluginStore(id)`**, or through its no-argument form for every store this Dataset holds. A Dataset carries no rows for a plugin it does not install: passenger data went with the format it existed to protect (ADR 0016, D-S5-24).
---

## 7. Developer experience commitments

- **Dev-mode invariant warnings**: dependency cycle detected (with member ids), config set on destroyed instance, non-deterministic item identity, renderer returned a live node, and (S1.9) `GanttOptions.scale` supplied alongside any of `preset`/`range`/`zoom` — "FreeGantt: GanttOptions.preset/range/zoom are ignored when 'scale' is also supplied. The shared TimeScaleModel already carries its own intent — set preset/range/zoom on it directly." The shared `scale` always wins; the constructor keys are never merged into it (D-S1.9-9).
- **Stable test hooks**: `data-testid` on every part so consumers can write E2E tests against the Gantt without brittle selectors. Shipped at S1.10 (D-S1.10-5/§3.5, U6): `[data-testid="fg-row"]` (with `data-row-id`) and `[data-testid="fg-bar"]` (alongside the existing `data-bar-id`) — the selectors S1.11's e2e boxes select on.
- **Errors are typed and actionable**: `FreeGanttError` subclasses with codes, never bare strings; validation failures name the entity and field. `BuiltInThrownCode` names every code the library throws, so a consumer's `switch` on `error.code` is exhaustive; `ThrownCode` is that union plus a consumer's own code, for a subclass they write themselves. Every throw site in the library is typed against the closed union, so a mistyped code fails to compile (#333). `ContainerNotFoundError` (`code: 'container-not-found'`, S1.8) is thrown when a string `container` selector matches nothing. `UnknownPresetError` (`code: 'unknown-preset'`, S1.9) is thrown by `resolvePreset` for a `PresetId` string outside every table it searched: `gantt.preset` searches this Gantt's own `zoomPresets` before the shipped table (#489 owner ruling), so a custom rung a consumer spliced into their own ladder resolves the same way a shipped id does; `gantt.zoomPresets` and a shared `TimeScaleModel`'s own `preset` have no ladder to search and stay shipped-only. `ladderIds`/`shippedIds` name exactly which tables the failed lookup checked. `EntryNotFoundError` (`code: 'entry-not-found'`) is thrown by `entries.update`/`entries.remove`/a bad `parentId` (S2.3)/a plugin's `store.set` (#555), for an id the Dataset has no entry for — also by `entries.load` and `new Dataset({ entries })` for a `parentId` naming no id in the batch (ADR 0031, Q3), the message naming the door. A read never raises it: a value is read off a row, and `entries.get(id)` answers `undefined` for an id the Dataset has no entry for (ADR 0017) — its message names the call that failed. `SegmentNotFoundError`, `DuplicateSegmentIdError` and `SegmentsOutOfSyncError` retired with the `Segment` type and no legacy (ADR 0026, #421) — there is no second record for an id to fail to name, no second id kind to collide, and no second span reading to fall out of step with `start`/`end`. `RevealTargetNotFoundError` (`code: 'reveal-target-not-found'`, ADR 0010, issue #227) is thrown by `reveal(id)` for an id the Dataset reads as no Entry; `reveal` takes `EntryId | string` (the `Segment` type retired, #421), so this is the one reading it can fail. `DuplicateEntryIdError` (`code: 'duplicate-entry-id'`, S2.3) is thrown by `entries.add` given an id already in the store — also by `entries.load` and `new Dataset({ entries })` for a duplicate id inside the batch (ADR 0031, Q3), the message naming the door. `DerivedFieldNotWritableError` (`code: 'derived-field-not-writable'`) is the refusal every rolling-up parent's own cell owes a direct write through `entries.update()`, segmented row or not (ADR 0013). An installed `EditExtender`'s cascade owes the same invariant, but on that edge nothing throws: the Rollup overwrites the cascade's proposed value on a rolling-up parent's cell unconditionally, on both the commit path and the drag preview, and reports the drop once per commit as `derived-values-dropped` (ADR 0013, decision 5; `rollup.test.ts` pins this for `start` under Q39) — never `DerivedFieldNotWritableError`, which stays a direct-write-only refusal. An extender can check before it writes and avoid the drop entirely: `EditRequest.hasChildren(id)` names a parent, and `EditRequest.writeTarget(id, field)` (`WriteTarget`, #466, narrowed by #470) reads the same resolver the Rollup and the grid already ask — `'entry'` or `'refused'` — so a cascade that proposes only where `writeTarget` answers `'entry'` never meets this silent overwrite at all. `data/entry-reader.ts`'s `moveEntryTo(entry, start)` is the write a plugin author reaches for instead of the refused direct one. This refusal is judged against `EditRequest.entryAfterEdits(id)` — the Entry as this transaction's own body edits leave it — not against `EditRequest.entries.get(id)`, which stays the pre-transaction snapshot (D-S5-45, `plans/s5-extensibility-and-editing/s5.10-dataset-plugins.md`): a cascade that reasons from the stale snapshot can propose a write this same refusal then rejects, over the state the body already replaced. `ParentCycleError` (`code: 'parent-cycle'`, S2.3) is thrown by a `parentId` edit that would make an entry its own ancestor, self-parenting included — also by `entries.load` and `new Dataset({ entries })` for a raw `parentId` loop in the batch (ADR 0031, Q3), the message naming the door. `UnknownFieldError` (`code: 'unknown-field'`, S2.3) is thrown by `entries.update` or `entry.read` given a key that names no field — the Field registry is the legal set. `ComputedFieldCannotBeWrittenError` (`code: 'computed-field-cannot-be-written'`) is thrown at registration and at `entries.update()` for a `compute` Field — one name, two doors; the message names the door. `FieldNotEditableError` (`code: 'field-not-editable'`) is thrown by `entries.update()` when `editable` is `'never'`. `DuplicateFieldKeyError` (`code: 'duplicate-field-key'`, S4.1) is thrown when two Field declarations share a key. `UnknownAggregatorError` (`code: 'unknown-aggregator'`, S4.1) is thrown when a Field names an Aggregator that is not registered. `UnknownFieldTypeError` (`code: 'unknown-field-type'`, S4.1) is thrown when a Field names a `type` with no matching `fieldTypes` entry. `FieldColumnNotDefinedError` (`code: 'field-column-not-defined'`, S4.3) is thrown when `gridColumns` uses a bare key and that Field has no `column` defaults. `UnknownGridColumnError` (`code: 'unknown-grid-column'`, S5.7) is thrown by `hideGridColumn`/`showGridColumn` given a field no declared column carries. `DuplicateRowIdError` (`code: 'duplicate-row-id'`, S4.6) is thrown by a `{ source: 'custom' }` resolver that returns the same `id` twice. `TransactionAlreadyOpenError` (`code: 'transaction-already-open'`, #496) is thrown by `entries.load` (and `entries.syncAll`, #517) called inside `dataset.transaction()` — both doors are always their own transaction, never a step inside a caller's. `SiblingIndexOutOfRangeError` (`code: 'sibling-index-out-of-range'`, ADR 0034) is thrown by `entries.add`/`entries.update` for a requested `siblingIndex` that is not a whole number from zero through the target group's own last index — negative, non-integer and `NaN` all read as the same rule — and names the entry, the requested index, the last valid index, and the operation; nothing stages when it throws.
- **Docs site with live, editable examples** grows with the slices (the harness pages are its seed) — budgeted as a deliverable, not an afterthought.
- **Semver honesty**: internal modules are not importable (enforced by the `exports` map), so semver only governs surfaces we actually promise.

## 8. Framework wrappers (later, out of scope for the slices)

The core stays framework-free (D5). Wrappers, when demanded, are thin adapters: props → config assignment, callbacks → event subscriptions, children/slots → renderer callbacks. Nothing in the core may require a wrapper to function, and no wrapper gets private API access — if a wrapper needs a back-door, the public API is missing something; fix the API.
