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
  history: { capacity: 100 },             // default; undo/redo stack depth — see "Undo and redo" below
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

  interactions: {
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
```

- **`dataset.entries.update(id, { segments })` is how a consumer moves one Segment** (#212, ADR
  0010, fix plan R1). A Segment named by position and no `id` keeps the `SegmentId` already at that
  position — a move, not a replacement — the same way `entries.update(id, { start })` moves an
  Entry's own envelope. Naming an `id` replaces the id at that position instead; a position past the
  Entry's current Segment count mints a fresh id, the same as an added Segment on `entries.add`. Two
  Segments never share one `SegmentId` — on the same Entry, on two different Entries, or authored
  twice in one construction-time `entries` list — and a write that would create that collision
  throws `DuplicateSegmentIdError` (`code: 'duplicate-segment-id'`) before anything stages — on
  every mutating call a consumer writes. `dataset.replay(changeSet)` is the one exception: it
  applies undo/redo rows with no validation, by design (D-S2-14, §2), so a duplicate id stays
  representable through that one door.
  `segments: []` throws `EmptySegmentsError` (`code: 'empty-segments'`): empty is illegal;
  absent is dateless (ADR 0012). An update has no whole-span input to mint a replacement from the way
  `entries.add({ segments: [] })` does — so it refuses rather than silently dropping the Segment ids
  already there (#212 fix-plan review, finding S2). Removing the last Segment un-dates the Entry. A `start`/`end` written in the same edit as
  `segments` must agree with that write's own envelope — `envelopeOfSegments` over the Segments named
  — or the edit throws `SegmentsOutOfSyncError` (`code: 'segments-out-of-sync'`): the caller cannot
  propose one span through `start`/`end` and a different one through `segments` and have the library
  silently pick a winner (#212 fix-plan review, finding S3). Naming `segments` alone, with neither
  `start` nor `end`, keeps its documented silent derivation: the Entry's own span reads back off the
  Segments just written.
- **`dataset.entries.removeSegments(ids)` removes Segments in one transaction and one changeset**,
  across several Entries when the ids name several (ADR 0010). Removing an Entry's last Segment
  removes the Entry too, in the same transaction. **It never removes that Entry's descendants**
  (#212, ADR 0010, fix plan R3): each direct child re-parents to the removed Entry's own parent, or
  to the root when it had none. `entries.remove(id)` is the separate, deliberate call that takes a
  whole subtree; `removeSegments` never does, even when its last Segment happens to be the Entry's
  own. One undo step restores the Entry, its Segment, and every promoted child's `parentId`.
- **`dataset.entries.entryIdOfSegment(id)`** answers the Entry that draws a given Segment, or
  `undefined` when no Entry does (ADR 0010, #212). **`entryIdsOfSegments(ids)`** answers every Entry
  named by at least one id in `ids`, deduped, in the order first named — the projection a Selection
  runs to turn its Segments into the Entries they belong to. Both read the Segment→Entry index
  `data/` maintains on write, so neither call scans the dataset. **`segmentIdsOfEntries(ids)`** is
  the reverse projection: every Segment id these Entries draw, deduped, each Entry named once in the
  order first named, and each Entry's own Segments in Entry order — an id no Entry currently draws,
  or an Entry already named, contributes nothing (#212 R2 fix-plan review, finding E). It is the
  published way to select an
  Entry (#212 fix-plan review, finding 10): `gantt.selectedSegmentIds =
  dataset.entries.segmentIdsOfEntries([id])`. The Selection itself stays Segment-only (ADR 0010) —
  this is a lookup a caller composes with the setter, not a second selection action alongside it.

Single mutations outside an explicit transaction are auto-wrapped in one — convenience without a second code path (D-S2-8). Each mutator validates against its own in-progress write set before staging anything, so a rejected call leaves the store untouched and a stack trace points at the call that made the bad edit, not at a transaction's closing brace.

`transaction()` returns the body's own return value, not a `ChangeSet` — `dataset.on('change')` is the only channel a committed changeset travels on (§3). A nested `transaction()` call runs its body against the already-open transaction and returns that body's value without committing a second time; only the outermost call commits. A veto (`beforeChange` returning `false`, §3) makes `transaction()` throw `MutationCancelledError` carrying the refused changeset, rather than returning at all.

`dataset.plugins` is **read-only**, unlike `gantt.plugins`. A Dataset plugin may declare a Field, and a Field must exist before the first Rollup walks (D-S5-4) — adding one later would mean re-rolling the whole dataset under a Field the first Rollup never walked. So a Dataset installs its plugins once, in its constructor, and a consumer who wants a different plugin set builds a Dataset with it (ADR 0016). A Gantt has no such moment — its plugins register paint and gesture seams that are re-resolved on the next frame — so `gantt.plugins = [...]` stays assignable. Uninstalling a Dataset plugin is `dataset.destroy()`, which releases every installed plugin in reverse setup order.

A child arriving is the derivation door (`01` §2.5). An Entry that gains its first child starts deriving in the same transaction. Losing the last child leaves a normal Entry with no dates. There is no `autoGroup` key and no promotion of a stored classification.

### Undo and redo

`undo()`/`redo()` return nothing — like every other commit, what they did arrives on `dataset.on('change')`, tagged `origin: 'undo'`/`'redo'`; a caller that needs to know what an undo did reads the event, not a return value. `canUndo`/`canRedo` answer "is there anything to undo/redo" without a caller needing to try and catch. `history: { capacity: 200 }` at construction keeps 200 undoable transactions; the default is 100. An undo replays a cascade exactly as it committed — it never re-runs the extension hook, so an engine whose behaviour changed between library versions cannot rewrite history (`01` §6, `plans/s2-data-core/s2.5-undo-redo.md`).

`dataset.replay(changeSet)` is the write path `undo()`/`redo()` are built on, published so a consumer can write their own History against the public surface alone: `on('change')`, `invertChangeSet`, `fieldRowsOf`, and `replay` — no `data/` import needed. `replay` writes the rows exactly as given, through the same `beforeChange`/`change` channel, with no extension hook and no rollup. `changeSet.origin` must be `'undo'` or `'redo'`; `'user'` throws `InvalidReplayOriginError` — that door is `apply`, later (§6). An empty changeset is a no-op (`plans/s2-data-core/s2b-undo-replay-seam.md`). A History panel lists what a step changed with `fieldRowsOf(changeSet).map((row) => row.field)`, dropping the plugin-store rows `updated` also carries.

### Reconfiguration is just assignment

```ts
gantt.preset = 'dayAndWeek';
gantt.rowSource = { source: 'group', groupBy: (entry, fields) => fields?.read<string>(entry, 'team') ?? 'unassigned' };
gantt.gridColumns = [...gantt.gridColumns, 'cost'];
gantt.snap = { unit: 'day', increment: 2 };   // D-S3-24 — this Gantt's own snap, over the showing preset's
gantt.gridWidth = 220;                  // S1.8 — same cancelable commit sequence a splitter drag runs
gantt.gridWidth = 'fitColumns';         // #157 — as wide as the columns, and stays that way
gantt.minGridWidth = 80;                // #127 — floor the Splitter drag clamps gridWidth to (default 40)
```

Every config key is a live property. Setting one triggers exactly the invalidation it needs (a preset change rebuilds the axis; a row-source change re-resolves rows) — never a full remount.

**Two keys are exceptions, and both belong to the `Dataset`: `fields` and `plugins`.** A Field declaration and a Dataset plugin are fixed at construction. `dataset.fields` is a read-only getter, `Dataset.plugins` is read-only, and `ctx.fields.register` is legal only while that plugin's own `setup()` runs — a later call throws `RegistrationClosedError`.

**What is fixed is the Field *set*, not every attribute on it (ADR 0015).** `dataset.setFieldEditable(key, editable)` changes one declared Field's `editable` after setup, and it is the only attribute that may change. It adds no key and removes none, so the Rollup reason below does not apply to it: `editable` is a write-door threshold, and no aggregate depends on it. An unknown key is refused.

**The reason is the Rollup, and it reaches undo.** A Field arriving mid-life makes every rolling-up parent owe a new aggregate at once. That is a whole-dataset Rollup pass, outside any user action, writing stored values that enter undo — and a declaration is a **config assignment**, which `ChangeSet` has no row shape for. Undo would then restore values the still-declared Field re-derives on the next commit. `rollUpKinds` is deleted (ADR 0013), so that flip is gone. A live `fields` would still be this problem.

**A late install rebuilds the `Dataset`:** `new Dataset({ entries: dataset.entries.all, fields, fieldTypes, aggregators, plugins })`. **State the price whenever this path is offered** — a new `Dataset` identity, so every subscriber rebinds and the undo History is lost. That price suits a *turn scheduling on* toggle. It does not suit an *add a column the consumer never declared* feature, and that gap is a known hole rather than a solved case.

**The hole is narrower than it was (ADR 0015).** It covers adding or removing a Field key, and nothing else. *Lock a column the consumer already declared* was the case most often mistaken for this hole, and it is now solved outright: `dataset.setFieldEditable('start', 'never')` keeps the Dataset identity, the subscribers and the undo History. Reach for the rebuild only when the Field **set** has to change.

**A Gantt plugin is not affected.** `gantt.installPlugin()` (D-S5-36, below) stays live. A view plugin declares no Field and rolls nothing up: `ctx.view.registerGridColumn` names a Field the `Dataset` already declares, and an undeclared key throws `UnknownFieldError` exactly as `gantt.gridColumns` does. **A live column, over a fixed Field set.**

**A config value is a value, not a mutable object (#187).** Assignment compares against what the property already holds, by identity. So a mutation of the object you already handed over, followed by an assignment of that same object, changes nothing and paints nothing. Assign a copy to ask for the repaint:

```ts
gantt.barRenderer = { ...gantt.barRenderer, parent: paintSummary };   // repaints
gantt.rowSource = { ...gantt.rowSource, groupBy: byTeam };                 // re-resolves rows
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

**A verb does not merge into the value, and it never mutates it.** It reads the current value, computes the next one, and assigns that copy. So the paragraph above still holds in full: the object a consumer handed over is never written to, and the property still compares by identity. A merging setter was considered for `interactions` and rejected for the same reason — it would make assignment mean two things, and it would leave no way to *remove* a key.

The setter is the long form: restate a whole config, reorder a whole list. The verb is the shorthand for the common case. That is CLAUDE.md's "common case is a shorthand; the long form is expert", and both write the same stored value.


### 2.1 What a consumer writes, and what the library stores

Ids and dates are loose on the way in and strict everywhere behind the boundary. `Dataset` reads an `EntryInput` into an `Entry` once, at construction: ids are plain strings that gain the `EntryId` brand here, and dates are any `InstantInput` — an ISO string, a `Date`, epoch milliseconds, or an already-branded `Instant`. A consumer never has to call `entryId()` or `instant()`. An `Entry` is itself a valid `EntryInput`, so a consumer holding branded values passes them through unchanged.

A string with an explicit `Z` or numeric offset is absolute. Every other string is a Plain time and resolves through the dataset's `timeZone`, so one entry list renders identically for every viewer. A value naming no instant — including a date the calendar does not have, such as `'2026-02-31'` — throws `InvalidInstantError`; it never slides to a nearby date.

`timeZone` is optional (#129). Passed explicitly, it is what the paragraph above describes: one zone, so a Plain time in `entries` reads identically for every viewer, in any timezone. Omitted, `Dataset` resolves the current environment's own zone once, at construction (`Intl.DateTimeFormat().resolvedOptions().timeZone`, falling back to `'UTC'` when that reports nothing, e.g. a bare Node process) and stores the resolved IANA string — `dataset.timeZone` is always a concrete zone after construction, never a sentinel. This trades cross-viewer consistency for ergonomics: a dataset built this way authors Plain times in *this* viewer's calendar, so the same entry list can read differently for a viewer in a different zone. Reach for it for single-viewer or demo use; pass `timeZone` explicitly whenever the dataset is shared across viewers, such as a project plan multiple people open.

`dateOnlyEnd` names how a *date-only* `end` is read against half-open `[start, end)` storage. `'inclusive'` (the default) reads `end: '2026-09-08'` as "through the 8th" and stores the start of the 9th; `'exclusive'` reads it literally. It applies to nothing else: an `end` carrying a time of day, a `Date`, epoch milliseconds, or an `Instant` is a boundary already, and `start` is never adjusted.

The reading itself lives in `time/` (`toInstant`, `toEndInstant`) — resolving a Plain time needs the zone and the DST fold/gap policy, and advancing a date-only end by one day is zone-aware arithmetic, which I10 confines to that layer. `api/` maps fields and does no date math of its own.

`start` and `end` are optional on every Entry (ADR 0012). An Entry has dates if and only if it holds at least one Segment. `{ id: 'p1', name: 'Sitework' }` above is a dateless parent; the store does not mint a fake span from the dataset's reference date. `{ start: undefined, end: undefined }` un-dates. Omitting one field but not the other is `InvalidInstantError`: one date without the other names no span. Empty `segments: []` is still `EmptySegmentsError` — absent is dateless; empty is illegal.

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
| — | `error` (every refusal and every recovered fault; **the one name on both buses**) |
| — | `scheduleDiagnostics` (engine findings) |

`navigationChange` (S1.12) fires once per Viewport Batch after Preset, Fit, Range, Pan, or Anchored zoom actually change. There is no `before*` pair: those writes are reconfiguration (S1.9), not a vetoable gesture. Chrome reads `presetId` / `canZoom*` from the payload, or re-reads the live Gantt getters.

`beforeGridWidthChange`/`gridWidthChange` (S1.8) carry `{ from, to }` in px. Fired by both a Splitter drag's commit and a direct `gantt.gridWidth = px` assignment — one commit sequence, one place it lives (`GanttShell`). A veto restores the width the drag started from, so a rejected drag leaves nothing behind. The grid pane never sits wider than its own columns (#139): every path that sets a width — the constructor option, a live assignment, a drag — is capped at the columns' total width, because past the last column's right edge there is nothing to draw. So `gantt.gridWidth = 900` against 360px of columns reads back `360` and fires `to: 360`, and hiding a column brings the pane in with it through this same sequence. Narrower is always legal — the columns overflow and the pane scrolls to reach them (#126) — and a column set holding a `flex` column has no cap at all, since a flex column has no fixed edge to stop at.

`gridWidth` also takes `'fitColumns'` (#157): the pane sits exactly on the columns' edge, and keeps sitting there as the columns change — a column resize, a hidden column, a plugin-registered column all move it, in both directions, through this same commit sequence. It is a standing instruction, not a width read once, so a consumer never restates a number the library already computes. The getter still answers in px: "how wide is the pane" is a question about pixels. Two things end the instruction: a later `gantt.gridWidth = px`, and a Splitter drag, which is the consumer changing their mind (a vetoed drag ends nothing). A column set holding a `flex` column names no edge to sit on, so the pane keeps the width it has until the set names one again.

`minGridWidth` (#127) is a live, plain-reconfiguration property — not a gesture, so it carries no `before*`/`*Change` pair of its own. It floors what the Splitter drag can reach, and nothing else: no floor applies to a written width, so `gantt.gridWidth = 0` collapses the grid pane on purpose. (#139's ceiling is the one bound that does reach a written width — a floor guards against a user accident, which an app author is allowed past; a ceiling states a layout fact.) Default `40` — wide enough for one narrow column, so a drag cannot take the pane to nothing by accident; `minGridWidth: 0` restores an unfloored splitter. Raising `minGridWidth` above the current `gridWidth` fires `beforeGridWidthChange`/`gridWidthChange` to lift it — the same commit sequence a drag would use, so a veto leaves the width exactly where it was.


`beforeGridColumnsChange`/`gridColumnsChange` (S4.3, S5.7) carry `{ from, to }` as `GridColumn[]` — the consumer's own authored columns, before the change and after it, never the layout-only `ResolvedColumn`. So a consumer holds `to` and hands it straight back as `gridColumns`, and that round-trip can never save a column a plugin declared (#162, #181). Every column change raises the one pair: a resize drag's commit, a reorder drop, `hideGridColumn`/`showGridColumn` (S5.7), and a direct `gantt.gridColumns = [...]` assignment. Hiding raises no pair of its own, so a handler that guards every other column change refuses a hide too. A veto restores the column list the interaction started from. `registerGridColumn` is the deliberate exception (D-S5-33): a plugin's own registration changes nothing the consumer authored, so it raises nothing and never appears in `gantt.gridColumns`.
`beforeCollapseChange`/`collapseChange` (S4.6, D-S4-22) carry `{ from, to }` as `RowId[]` — Gantt view state, no Dataset transaction. Fired by a twisty click, keyboard collapse/expand, and a direct `gantt.collapsed = ids` assignment. A veto restores the set the interaction started from. Collapse is per Gantt: two Gantts on one Dataset collapse independently, the same way `selectedSegmentIds` already does.

`error` (S5.12, D-S5-40/41/42) is the one event name that lives on **both** buses, and it carries the
same `ErrorReport` on each. That is not the "every event name exists exactly once" rule breaking. The
rule keeps one *concept* to one name, and a report is one concept: a Dataset raises what a Dataset
observes, a Gantt raises what a Gantt observes, and neither forwards the other's. Two Gantts on one
Dataset therefore deliver a Dataset report once, not twice, and a report raised inside
`new Dataset(...)` is not lost for want of a Gantt to raise it on. A consumer who wants the two feeds
as one calls `watchAllErrors([dataset, gantt], handler)`, which de-duplicates by emitter identity and
returns one disposer. There is no `before*` pair: a report states what already happened.

The payload is flat — `at`, `code`, `message`, `severity`, `by`, and the optional `entryId`, `field`
and `cause` — so it renders and serializes with no type test. `severity` is `'info'` for a Refusal
(the library said no on purpose), `'warning'` for something it recovered from, `'error'` for
something it did not. Core raises and retains nothing: there is no `gantt.errors` array, because the
cap, the overflow rule and the dedupe are the consumer's policy.

S3 data-gesture payloads (D-S3-22): `beforeEntryMove`/`entryMove` carry `ProposedSpan` (`entry`, `start`, `end`) plus `entries` (grabbed first; extender extras never included). `beforeEntryResize`/`entryResize` add `edge: 'start' | 'end'`. `beforeSelectionChange`/`selectionChange` carry `{ from, to }` as `SegmentId[]` (ADR 0010, #212 — `EntryId[]` until then) — Gantt state, no Dataset transaction. `beforeEntryMove`/`beforeEntryResize` handlers may return `Promise<void | false>` (D-S3-17); every other Gantt event stays sync-only. One case fires `selectionChange` with no `before*`: a Dataset write that removes a selected Entry's Segments has already committed, so the Selection can only drop the dead ids after the fact — there is nothing left to veto (#212, finding 19).

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

Documented in this order; each level solves what the previous can't, and consumers stop at the shallowest level that works.

| Level | Mechanism | Example |
|---|---|---|
| 1 | **CSS custom properties** | `--fg-bar-radius: 3px; --fg-row-height: 32px;` |
| 2 | **State classes / parts** | `.fg-bar[data-flag~="conflict"] { outline: 2px solid var(--warn) }` |
| 3 | **Renderer callbacks** | `barRenderer`, `cellRenderer`, `headerRenderer`, `tooltipRenderer` — return plain element-description objects |
| 4 | **Events + feature config** | veto a drop, custom context-menu items, replace the editor |
| 5 | **Plugins** | full `GanttPlugin` (see `01` §10): fields, decorations, columns, controllers, commands |

Every level-1 property the library reads as a length goes through one reader (`render/dom/pixel-property.ts`): computed value → px → validated → library default. What counts as authored is stated per property rather than re-implemented per call site — a property whose zero value would be nonsense (a zero-height row is not a row) rejects it; a property whose zero value is a real, intentional choice (a consumer turning the grid pane off) keeps it. Re-read cadence stays the caller's own choice, and is stated at each call site — some properties read once at construction, others read again on every pane measurement, none per render.

**The complete level-1 `--fg-*` reference — every token, its light/dark defaults, what reads it, and the retired/renamed tokens' migration notes — moved to [`docs/05-consumer-api.md`](../docs/05-consumer-api.md) (issue #221).** Level 1 stays documented here as a level of the ladder; the token-by-token values are a reference that drifts out of date faster than this design statement does, so they live beside the rest of the consumer-facing surface instead.

**`data-flag` is real (S1.10, D-S1.10-2).** Generated from `BarFlags`'/`LinkFlags`' own keys, not hand-mapped — `.fg-bar[data-flag~="conflict"]`, `.fg-bar[data-flag~="cycle"]` are live selectors today (nothing sets them true until S7's scheduling plugin, but the mechanism and the vocabulary both ship now, U2). A new `BarFlags` key needs no `render/dom` edit to show up as a token (U7).

S3 Parts: `.fg-bar-handle` (shared resize-handle pair), `.fg-cursor-line`, `.fg-cursor-line-label`. S3 State attribute: `data-state` on `.fg-bar` (`hovered`, `selected`, `pending`, `dragging`, `ghost`) and `data-movable` (grab cursor).

**D-S3-10 amendment (bug hunt, "grid row highlight and row click" — locked pre-1.0, no compat shim needed).** A click on a `.fg-row` in the grid pane is the same select as a click on that row's own bar: plain replaces, ctrl/⌘ toggles, and shift ranges over the Segments in draw order (ADR 0010, #212). A grid-row click names every Segment its row owns, so a range that ends on one takes that whole row. It never arms move or resize — a grid-row pointerdown never grabs `EntryGestureSession`. A click on `.fg-row-twisty` is not a row hit at all: collapse stays on the twisty, never selection. An empty *timeline* click still clears `gantt.selectedSegmentIds` (ADR 0010, #212 — `gantt.selectedIds` until then), with either button — a right-click is a click for this rule (#199/#205 follow-up). A miss on the grid pane (a header row, padding, a twisty) never does — only the timeline's own empty click is "the" clearing gesture. `data-state~="selected"` paints on the matching `.fg-row` the same way it already does on `.fg-bar` — same `--fg-selection-color` Token, a background instead of an outline (`.fg-bar[data-state~="selected"]`, `.fg-row[data-state~="selected"]`). A row click selects **every Segment of every Entry** the row owns (`FrameRow.entryIds`, #185; widened to Segments by ADR 0010, #212, because the grid pane's unit is the row); the row's cells still describe the first Entry. A grouping header row carries no entry and is never selectable.

Three reasons support this rule. First, D-S3-10 already names the empty timeline click as "the" clearing gesture. The same pixels must not give two different answers for two different buttons. Second, common desktop file managers clear a selection on a background right-click. The background menu that opens acts on the container, and a surviving highlight would misstate the menu's scope. Third, on a bar or a row the pointer path writes nothing; `contextMenu()` decides what the Selection becomes (§4.5, the right-click rule).

The clear rides on `pointerup`. `contextmenu` fires before `pointerup` on macOS and Linux, and after `pointerup` on Windows. So the empty-timeline clear can land before or after the menu opens, depending on the platform. A command's `when` always sees the Selection as of the moment the menu opens, on every platform — it never sees a fixed ordering guarantee against the clear.

A background menu whose commands never read the Selection could keep it. FreeGantt's menu is consumer-registered, so it carries no such guarantee.

**Rejected:** clear the Selection only when the open menu holds no selection-scoped command. We reject this: the same click would clear, or not clear, by which plugins the page installs. A click's outcome must not depend on what else is installed.

S5.5 Parts (D-S5-13/14, both mounted inside S5.3's `.fg-popup`): `.fg-tooltip`, `.fg-tooltip-title`, `.fg-tooltip-dates` (`tooltips()`); `.fg-menu`, `.fg-menu-item`, `.fg-menu-separator` (`contextMenu()`).

S5.8 Parts (D-S5-19, D-S5-47): `.fg-cell-editor`, `.fg-cell-editor-control`, `.fg-cell-editor-discard`, `.fg-cell-notice` (`inlineEditing()`) — mounted through the row layer (`ctx.view.rowLayer`) directly, not inside `.fg-popup` (the cell editor has no flip/clamp; it always sits at the cell's own rect). #158 moved this mount out of the Overlay: the row layer travels with the rows on both axes, so the editor stays on its cell through a scroll with no scroll listener. State attribute `data-state="invalid"` on `.fg-cell-editor` marks a failed `parseValue`, a `beforeChange` veto, or the default `dateInput`'s non-midnight refusal (issue #137 F11/F12). In that state the editor also carries `data-reason` (shipped values: `unreadable-value`, `refused-write`) and shows `.fg-cell-editor-discard`, so Escape is not its only exit (D-S5-47). A cell that offers an editor which cannot open at all mounts a `.fg-cell-notice` instead: words over the cell, no control, `pointer-events: none`, and its own `data-reason` (shipped values: `derived-value`, `no-parse-value`, `no-date-value`, `time-of-day`, `unsaved-value`, `segmented-entry`). The two carry two classes so a stylesheet for one never reaches the other (#231 F1). Each reason key is machine-readable and is also the `code` of the Error report the editor raises, so one refusal has one spelling (#234, D-S5-40); the words the user reads sit beside it on the wrapper's own `title`.

A cell renderer reads its cell two ways. `text` is the string the library painted, through the
Field's own `formatValue`. `value` is the same Field value before formatting — what
`dataset.entries.fieldValue(id, column.field)` answers, for a core, `props`, plugin, or `compute` Field
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

**Look.** Every bar element carries `data-kind`, so look styling is level-2 CSS with zero JS (`.fg-bar[data-kind="parent"] { ... }`). That attribute is the look a producer claimed — parent, leaf, or a plugin look — not a stored Entry classification (ADR 0013). A bar whose painted span was widened to `--fg-bar-min-width` or a diamond floor also carries `data-span="minimum"` (#212 follow-up) — pair it with `data-kind` to style a floored span differently from a floored diamond (`.fg-bar[data-kind="leaf"][data-span="minimum"] { ... }`). At level 3, `barRenderer` is either one function that branches, or a map keyed on look so the common case needs no branching — a plugin look slots in by the id the plugin stores:

```ts
barRenderer: {
  parent: ({ entry }) => summaryRail(entry),
  leaf:   ({ entry }) => defaultBar(entry),
  buffer: ({ entry }) => hatched(entry),   // plugin-owned look
  '*':    ({ entry }) => defaultBar(entry),
}
```

**Label placement (J1).** `gantt.barLabels` (`'fitBar' | 'inside' | 'outside' | 'none'`, default `'fitBar'`) picks where the bar label paints, live-reconfigurable (I8). `'fitBar'` paints inside when the label fits, outside to the right when it does not, and falls back to an ellipsised inside label as the last resort; `'inside'`/`'outside'` force one side and still fall back to ellipsised-inside when the forced side has no room; `'none'` paints no label at all. The resolved side is `data-label` on `.fg-bar` (`'inside'` / `'outside'`, absent for `'none'` or a `barRenderer` result) — a level-2 hook for a consumer stylesheet, styled by default through `--fg-bar-label-gap` and `--fg-bar-label-outside-color` (`docs/05-consumer-api.md`).

A `barRenderer` result owns its bar's content, so the library injects no label child and stamps no `data-label` for it. It still reads the same answer: `ctx.label` carries the resolved `{ text, placement }` for that bar at that width, and is absent under `barLabels: 'none'`. So a consumer who customises a bar keeps fit-based labelling and never needs a text ruler — the library measures once, in one place, for its own label and a renderer's alike.

**Actions.** The `interactions` config takes a boolean or a per-entry predicate for each gesture (`move`, `resize`, `linkCreate`, `select`), layered over per-kind defaults. One resolution both hides the affordance and refuses the gesture — pointer and keyboard alike (I14) — so a non-resizable entry simply has no handles, rather than handles that scold. `select` has no affordance to hide; `select: false` (or a predicate that returns false) refuses pointer and keyboard selection, and the entry skips it in a shift-range. The public `gantt.selectedSegmentIds` setter does not consult the capability — it is the programmatic path, matching `entries.update` under `move: false`. Context-menu items and commands carry a `when(entry)` clause, so a kind (or any predicate) ships its own action set.

**`interactions.edit` names a cell, not an entry** (#256). Its predicate takes `(entry, field)`, because a write names one Entry and one Field — the changeset's own shape. It is the one override above `Field.editable` (§2.6), and the only per-entry axis that key has: a Field states which values are writable at all, and this states which of them are writable *here*. It answers for every writer at once — the cell editor, both resize handles, and the bar move — because all three write a cell. A predicate returns `undefined` for a cell it has no opinion about, and the rules below it decide that cell, so locking one End does not open every derived value on the page. A bare boolean pins every cell with no fall-through.

**A gesture asks two questions, and needs both.** `move`/`resize`/`select` say whether the gesture is *offered*; `edit` says whether the values it writes *may change*. `move` writes `start` and `end`, so it needs both cells. `resize` writes the dragged edge's own Field. `select` writes nothing, so it never asks. This is why `resize: true` opens a handle the library would have closed and still cannot write a Field the consumer locked — to open that, open the Field, or answer `edit` for the cell.

**Keyboard bindings on the Selection.** The full pane-scoped chord map is
`plans/s5-extensibility-and-editing/s5.11-a11y-completion.md`'s D-S5-26; these two act on the
Selection and belong on any consumer's cheat sheet:

| Chord | Command | What it does |
|---|---|---|
| `Delete` | `freegantt.deleteSelection` | Removes the Selection's Segments (`dataset.entries.removeSegments`), across every Entry the Selection touches, in one transaction. A `beforeChange` veto leaves the Selection untouched. |
| `Mod+ArrowRight` / `Mod+ArrowLeft` | `freegantt.selectNextSegment` / `selectPreviousSegment` | Steps the Selection between the Segments of the row it already sits on (#212, ADR 0010, issue #218). A row that draws one bar has nowhere to step, so the chord writes nothing; it clamps at both ends. |
| `Escape` | `freegantt.discardCellEdit` | Closes an open Cell editor and writes nothing (`inlineEditing()`, D-S5-47, issue #160). Escape runs the command itself, and so does the editor's own discard button, shown in the invalid state — one road, so overriding the command changes both (#231 F2). A Gantt with no `inlineEditing()` answers the id with an inert registration and holds no editor code. |

**Division of labor:** capabilities answer the *static* question ("groups don't resize"); `before*` events answer the *contextual* one ("not before mobilization"). Use the shallowest one that fits.

**Viewport gestures** are a separate knob (`Gantt.viewportGestures`): they are not per-entry, they write no data, and they do not belong on `interactions`. `false` turns wheel zoom, shift+wheel pan, and keyboard pan off together; `{ wheelZoom: false }` pins one gesture and leaves the others on. `zoomBy` / `panToDate` / `zoomIn` stay available either way.

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
aggregators: { riskWeighted: (children, parent, ctx) => /* ... */ }
fieldTypes: { risk: { rollUp: 'riskWeighted', formatValue: asRisk } }
{ key: 'risk', type: 'risk' }
// One-off without a type: { key: 'risk', rollUp: 'riskWeighted' } with the same `aggregators` entry.
```

Levels 1–3 are plain data on the Field declaration, so they diff in review and they travel with the consumer's own data. Level 4 adds a function in `DatasetOptions.aggregators`. `rollUp` on the Field or Field type is always an **Aggregator name** — shipped (`'sum'`) or yours (`'riskWeighted'`). It never takes a bare function: a name can be refused when it is not registered, and a function cannot travel with data. The Aggregator signature is `01` §2.6 (`children`, `parent`, `ctx.read(entry, fieldKey)`); return `undefined` to leave the parent's stored value alone — except on a rolling-up parent, where it means no value (ADR 0013). The Field key is the address. `formatValue` is display: money stays a number in the store; the cell shows currency text. Sort reads the stored value (`01` §2.6, S4.9).

A custom Aggregator that only needs the field it is rolling up skips the manual child loop: `ctx.numericValues(children)` reads `ctx.field` off every child, in order, dropping holes and non-numeric values the same way shipped `sum`/`min`/`max` do.

```ts
// A single-field numeric Aggregator, in a few lines — no manual child loop, no manual hole-skipping.
aggregators: {
  average: (children, parent, ctx) => {
    const values = ctx.numericValues(children);
    return values.length === 0 ? undefined : values.reduce((a, b) => a + b) / values.length;
  },
}
```

`ctx.values(children)` is the same read, without the numeric filter — use it when a hole itself is meaningful (e.g. `count`). A multi-field Aggregator like `riskWeighted` above still reads each field it needs through `ctx.read(child, fieldKey)` directly; `values`/`numericValues` only cover "one field off my children."

**Because a field carries its own column defaults, `gridColumns` is mostly ordering:**

```ts
gantt.gridColumns = ['name', 'start', 'duration', 'cost'];
```

The object form overrides this Gantt's presentation and never the data half — `{ field: 'cost', header: 'Budget — site A' }`. Aggregation is never a column key: a stored value must not depend on whether a column is visible, and the rollup has already run before the Gantt was built.

**A value with no stored home** is a computed field — core's own `duration` is one:

```ts
{ key: 'duration', compute: (e, ctx) => /* Duration | undefined from start/end through time/ */ }
```

A stored Field (a core key or a key in `props`) has somewhere to put a parent's aggregate, so it is stored and undoable; a computed field's aggregate is computed on read and is never stored. Nothing but the Rollup writes a rolling-up parent's cell (ADR 0013). A computed field reads the dataset only — never zoom, visible range or selection. A value that depends on the view is a renderer's business, not a field. Aggregators read duration with `ctx.read(entry, 'duration')`. There is no `durationOf`.

**Editing crosses core and consumer fields freely** — one call, one transaction, one undo step:

```ts
dataset.entries.update('t1', { start: '2026-10-05', cost: 12_000 });
dataset.entries.fieldValue('t1', 'cost');       // 12_000 — props
dataset.entries.fieldValue('t1', 'start');      // core key
dataset.entries.fieldValue('t1', 'duration');   // compute; no Gantt required
dataset.field('cost');                   // resolved Field | undefined
dataset.fields.all;                      // every declared Field, core included
```

`entries.update()` refuses three ways, and it never writes silently. An unregistered key throws `UnknownFieldError`. A `compute` Field throws `ComputedFieldCannotBeWrittenError`. A Field at `editable: 'never'` throws `FieldNotEditableError`. The door checks `compute` before `editable`. Nested `props:` at `update()` is refused. A missing id on `read` is an `EntryNotFoundError`. The read goes through the same Field registry path as the write: a consumer who declared `{ key: 'cost' }` does not reach into `entry.props` for a Field read. `dataset.field` and `dataset.fields.all` return **resolved** declarations (type merge applied). They are not the raw `DatasetOptions.fields` array. `PropsEdit<TProps>` and `EntryEdit<TProps>` are public.

**`editable` lives on the Field, never on the column** (S5.8, D-S5-19, #142, #256, ADR 0015). `{ key: 'cost', editable: 'anywhere' }` opens that field's cell editor in `inlineEditing()`. On `start` and `end` the same value opens the bar's own drag-resize handles and its move. The Field states how far a value may change (`'never' | 'api' | 'anywhere'`). Gestures ask `'anywhere'`. `entries.update()` refuses only `'never'`. Default is `'anywhere'`. `true`/`false` are input aliases for `'anywhere'`/`'never'`. `interactions.edit` states which of them are writable on *which entry* (§4.1). Core's own `name`, `start` and `end` declare `'anywhere'`, matching the resize a bar already allowed before this Field existed; `{ key: 'end', editable: false }` still constructs and stores as `'never'` without redeclaring `end`'s rollup — `IllegalCoreFieldOverrideError` is thrown for any other key on a core field name. Check `compute` before `editable`. `dataset.setFieldEditable('start', 'never')` changes one Field's `editable` after setup. It is the only Field attribute that may change. An unknown key throws.

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

A **Row** is a derived horizontal track — not an Entry. One Row may carry many Entries' items; a row source may produce Rows that stand for no Entry at all. **`gantt.rowSource`** names the config that decides what the Rows are for this Gantt. It leaves `rows` free for a future getter of the derived rows themselves. The setter takes a `RowSource`; the getter reads back a `ResolvedRowSource`, which fills every key `layout/` defaults at consumption — `heightMode`, `filterPolicy`, and the entries source's `tree` (#248). So a consumer reads the value the library uses, and never has to know a default to read it.

Default: `{ source: 'entries', tree: false }` — a flat list, exactly what S1 drew. Three occupants ship:

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

`{ source: 'entries' }` and `{ source: 'group' }` share a common block (`RowSourceCommon`): `heightMode` today. `{ source: 'custom' }` takes `heightMode` only — the resolver owns row membership.

```ts
rowSource: {
  source: 'entries',
  tree: true,
  heightMode: 'pack', // 'fixed' (default) or 'pack' — stack overlaps into lanes
}
```

**Sort and filter** live on the row source (`rowSource.filter`, `rowSource.sort`, `rowSource.filterPolicy`) — view knobs that never reorder `dataset.entries.all` or change what the Rollup sees (D-S4-28). `sort.field` names a declared Field; sort reads `fieldCompares`, not visible `gridColumns`.

**Collapse is Gantt state**, not Dataset state — no transaction, no changeset:

```ts
gantt.collapsed = ['p1'];           // live; RowIds, loose on the way in
gantt.collapse('p1');
gantt.expand('p1');
gantt.toggleCollapse('p1');
gantt.collapseAll();
gantt.expandAll();

gantt.on('beforeCollapseChange', ({ from, to }) => false);  // veto
gantt.on('collapseChange', ({ to }) => saveCollapsed(to));
```

For `{ source: 'entries' }`, a `RowId` equals the `EntryId`, so `collapse('p1')` names the parent entry. A grouping header uses a derived `RowId` from the `groupBy` value. Collapsed subtrees are absent from the row list, not merely hidden — `rowCount`, `aria-setsize`, and the scrollbar stay honest. The collapsed set survives data edits; a stale id simply matches nothing, the same way a removed entry's Segments can linger in `selectedSegmentIds`.

**Live reconfiguration.** Assigning `gantt.rowSource` re-resolves rows, invalidates the height index from 0, and requests one frame — no remount. Scroll survives as a pixel position, clamped against the new content height.

Group header rows show the `groupBy` label in column 0 and blank cells elsewhere. Per-group aggregates are the caller's data — declare a computed Field or write through a group entry; the grid does not invent them (D-S4-11).

Published types: `RowSource`, `EntriesRowSource`, `GroupRowSource`, `CustomRowSource`, `CustomRow`, `CustomRowInput`, `RowHeightMode`, `RowSourceCommon`, `RowId`, `CollapseChange`, `RowFilter`, `RowSort`, `FilterPolicy`, and the four the getter reads back — `ResolvedRowSource`, `ResolvedEntriesRowSource`, `ResolvedGroupRowSource`, `ResolvedCustomRowSource`.

### 4.4 Plugin registrations: one collision policy, one lifetime (#155)

A `PluginContext` hands a plugin six `register*` seams. They answer a collision the same way, so an
app author installing two plugins meets one rule rather than one rule per seam.

| Seam shape | Two plugins claim the same thing | Seams |
|---|---|---|
| **A single paint slot** | **Throws** `RendererAlreadyRegisteredError`, naming the slot and both plugin ids. Two plugins painting one slot is an authoring mistake, and silence would make it look like the second plugin did nothing. | `view.registerRenderer` |
| **Keyed by an identifier** | **The newest registration wins**, and the one it covered is still there. | `commands.register`, `interaction.registerKindDefaults`, `view.registerGridColumn`, `layout.registerItemProducer` |
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

**A paint slot is not always a whole point.** `cell`, `header` and `tooltip` are: one plugin claims
each, because a cell belongs to a column and a header to a band, so neither has a key to merge on.
The `bar` point already takes a per-kind map (D-S5-12), and that map **is** the key. So
`registerRenderer('bar', { buffer: … })` claims `bar:buffer` alone. A plugin that defines one kind
and a plugin that defines another both install, and both paint. Two plugins that name the same kind
still throw. The whole-point form, `registerRenderer('bar', fn)`, stays exclusive: one function
answers every kind, so it refuses, and is refused by, any per-kind claim. A consumer's own
`barRenderer` still wins over every plugin slot (D-S5-11), and a registered `'*'` still answers every
kind the exact slots miss.

**A plugin's `setup(ctx)` returns a `Disposer`, or nothing.** Every `register*` and every
`onDomEvent` files its own removal in `ctx.disposables`, so a plugin that owns no timer, socket or
subscription of its own has nothing left to return. `return () => {};` was ceremony, and to a
newcomer it read as if something were missing.

**`wholeEntryItem(entry)` is public.** It returns one Item covering the entry's whole span, which is
what almost every item producer wants: `ctx.layout.registerItemProducer(kind, (entry) =>
[wholeEntryItem(entry)])`. It is pure and DOM-free, and it is the one owner of the
`${entryId}:${segmentIndex}` Item id convention — the one thing a plugin could otherwise get wrong
from documentation alone.

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

### 4.5 The plugin-to-DOM seam: `ctx.view.dom` and `ctx.view.onDomEvent`

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

- **`targetUnder(node)` answers `{ kind, element, entry?, entryIds, segmentIds, field? }`.** `kind`
  is `TargetKind` — `'row' | 'cell' | 'bar' | 'header' | 'splitter'`, the same union
  `CommandTarget.kind` uses. One vocabulary, so a resolved right-click fills a
  `CommandContext.target` with no translation table. `undefined` means the node is outside this
  Gantt, or inside it and on none of the five.
- **A target answers two questions about Entries, because a Row may own several** (#185, #199).
  `entry` is the node's **subject**: the one Entry whose Fields the node's content shows. A tooltip
  describes it, and the cell editor anchors on it. `entryIds`, alongside `segmentIds` (ADR 0010,
  #212), is everything the node stands for, and is what an action on the node acts on. For a bar the
  two agree. For a row, and for every cell of that row, `entry` is the row's first Entry, and
  `entryIds`/`segmentIds` name every Entry and Segment the row owns. Both are always present, and
  empty for a header cell, for the splitter, and for a grouping header row.
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

**`CommandTarget` carries what the invocation acts on, as ids: `segmentIds` and `entryIds`** (#199,
widened by ADR 0010, #212). A command reads whichever one it needs from `ctx.target` — neither
command declares its reach, and the two answers can never disagree, because both come from one
resolution:

```ts
gantt.commands.register({
  id: 'app.lockRow',
  label: 'Lock',
  run: (ctx) => ctx.target?.entryIds.forEach((id) => locks.lock(id)),
});

gantt.commands.register({
  id: 'app.deleteSegment',
  label: 'Delete',
  run: (ctx) => dataset.entries.removeSegments(ctx.target?.segmentIds ?? []),
});
```

- **`segmentIds: readonly SegmentId[]`** is every Segment the invocation acts on. **`entryIds:
  readonly EntryId[]`** is a projection of `segmentIds` — the Entries those Segments belong to,
  deduped, in row order. `entryIds` is the same word `DomTarget.entryIds` uses, and not always the
  same set. A `DomTarget` states a DOM fact: what the node stands for. A `CommandTarget` states what
  the command acts on. Lock reads `entryIds`, because a lock is a property of the record and not of
  one drawing of it; Delete reads `segmentIds`.
- **The right-click rule (#199), restated over Segments (ADR 0010, #212).** *A right-click acts on
  the Selection when the thing you clicked is part of it. It acts on the thing you clicked when it
  is not.* So a right-click on an unselected grid row names every Segment of every Entry that row
  owns; a right-click on one bar of a multi-bar row names that one Segment; and a right-click on one
  of three selected bars names all three. A node stands inside the Selection only when every Segment
  it names is selected. A node that stands for no Segment — a header cell, the splitter, a grouping
  header row — is part of nothing.
- **A right-click outside the Selection replaces the Selection with what you clicked**, before the
  menu opens. It runs the same cancelable `beforeSelectionChange` an assignment runs. Otherwise the
  command acts on Segments the user cannot see highlighted.
- **The keyboard runs the same rule** (D-S5-14, #205). `Shift+F10` and the Menu key open the menu
  for the Selection, so three selected bars reach one menu that acts on three. The bar of the first
  selected Segment stays the popup's anchor, because a popup needs a box on screen.
- **A command that wants exactly one Entry says so**: `when: (ctx) => ctx.target?.entryIds.length
  === 1`, and reads `ctx.entry` for it. `ctx.entry` is the subject, never the set. A command that
  wants exactly one Segment reads `ctx.target?.segmentIds.length === 1` the same way.
- `kind` and `field` are the same two words `DomTarget` uses. There is no `rowId`: a row's identity
  is a `RowId`, and this names Segments and Entries, never rows.

**`PopupOptions.onDismiss(trigger)`** tells a popup's owner that the popup closed *itself* —
`'escape' | 'outsidePointer' | 'scroll' | 'blur'`. It runs after the close, so `isOpen` reads
`false` inside it. `close()` called by the owner never fires it. Without this an owner had two
choices, and `contextMenu()` took the worse one: leave two `document` listeners attached and poll
`isOpen` on every click and keystroke in the page.

---

## 5. Shared axes and scroll (multi-Gantt, D9)

```ts
import { TimeScaleModel, ScrollModel } from 'freegantt';

const scale  = new TimeScaleModel({ preset: 'weekAndMonth', fit: 'preset' });
const scroll = new ScrollModel();

const deliveries = new Gantt({ container: '#top',    dataset: deliverySchedule, scale, scroll });
const workforce  = new Gantt({ container: '#bottom', dataset: staffing,         scale, scroll });
```

The two Gantts hold **different** datasets — D9's own example is a delivery-schedule Gantt above a workforce Gantt. What is shared is the axis and the scroll, never the data. Two Gantts *may* bind one `Dataset`: nothing forbids it, a second Gantt is simply a second subscriber to `dataset.on('change')` (D-S2-24), and it costs the library nothing. It is not a case the library designs around or tests, and a consumer who wants it owns the arrangement.

Omit `scale`/`scroll` and the Gantt creates private ones — single-Gantt users never meet the concept. Passing shared instances is the *entire* sync API: no link manager, no event plumbing. Sharing a `scroll` instance links both axes (S1.5, D-S1.5-3) — a shorter chart's own row count clamps the shared position locally, so it pins at its last row while a taller chart keeps going, with zero remembered state. `TimeScaleModel` is a class with no `Source` interface; `ScrollModel` gets no `xOnly()`/`yOnly()` either — partial sharing returns when a caller actually needs "share x, keep y private".

---

## 6. Persistence (ADR 0016)

**The library holds no save format.** There is no `toJSON`, no `fromJSON`, no Document type and no `schema` integer. The consumer brought the data in, and the consumer owns where it goes.

```ts
const rows    = dataset.entries.all;                   // every Entry, as stored
const fields  = dataset.fields.all;                    // the Field declarations
const risk    = dataset.pluginStore('risk');            // one plugin's store, or undefined
```

`entries.all` and `fields.all` already ship. `pluginStore(id)` ships with ADR 0016. An application maps these into its own shape and saves that shape. It writes the same mapping in the inbound direction to build the `Dataset`, so this is the outbound half of work it does anyway, against a shape it chose.

**A plugin that owns data a consumer must keep publishes its own reader.** It gets no hook into a library format. A consumer saves that data by reading it from the plugin, in the plugin's own vocabulary.

- **Changesets are the incremental counterpart**: `dataset.on('change')` carries `{from, to}` per field, which is what discharges this document's promise that a sync adapter be *"an extension, not a core change"*. `dataset.apply(changeSet)` is what such an extension writes; it is not in S2 (D-S2-11).
- **View state is not data.** Column widths, collapsed rows and scroll position were never part of the format. Whether the library helps save them is a separate question, and ADR 0016 does not answer it.
- **A plugin's rows come out through `dataset.pluginStore(id)`**, or through its no-argument form for every store this Dataset holds. A Dataset carries no rows for a plugin it does not install: passenger data went with the format it existed to protect (ADR 0016, D-S5-24).
---

## 7. Developer experience commitments

- **Dev-mode invariant warnings**: dependency cycle detected (with member ids), config set on destroyed instance, non-deterministic item identity, renderer returned a live node, and (S1.9) `GanttOptions.scale` supplied alongside any of `preset`/`range`/`zoom` — "FreeGantt: GanttOptions.preset/range/zoom are ignored when 'scale' is also supplied. The shared TimeScaleModel already carries its own intent — set preset/range/zoom on it directly." The shared `scale` always wins; the constructor keys are never merged into it (D-S1.9-9).
- **Stable test hooks**: `data-testid` on every part so consumers can write E2E tests against the Gantt without brittle selectors. Shipped at S1.10 (D-S1.10-5/§3.5, U6): `[data-testid="fg-row"]` (with `data-row-id`) and `[data-testid="fg-bar"]` (alongside the existing `data-item-id`) — the selectors S1.11's e2e boxes select on.
- **Errors are typed and actionable**: `FreeGanttError` subclasses with codes, never bare strings; validation failures name the entity and field. `ContainerNotFoundError` (`code: 'container-not-found'`, S1.8) is thrown when a string `container` selector matches nothing. `UnknownPresetError` (`code: 'unknown-preset'`, S1.9) is thrown by `resolvePreset` for a `PresetRef` string outside the shipped set. `EntryNotFoundError` (`code: 'entry-not-found'`) is thrown by `entries.fieldValue`, and by `entries.update`/`entries.remove`/a bad `parentId` (S2.3), for an id the Dataset has no entry for — its message names the call that failed. `SegmentNotFoundError` (`code: 'segment-not-found'`, ADR 0010, #212) is thrown by `entries.removeSegments(ids)` for an id that names no Segment on any Entry — the same before-anything-stages posture `EntryNotFoundError` takes for `entries.remove`. `RevealTargetNotFoundError` (`code: 'reveal-target-not-found'`, ADR 0010, issue #227) is thrown by `reveal(id)` for an id the Dataset reads as neither an Entry nor a Segment; `reveal` alone takes `EntryId | SegmentId`, and once neither reading resolves nothing says which one the caller meant, so this names both rather than reusing `EntryNotFoundError` or `SegmentNotFoundError` and forging the id's brand to match. `DuplicateEntryIdError` (`code: 'duplicate-entry-id'`, S2.3) is thrown by `entries.add` given an id already in the store. `DuplicateSegmentIdError` (`code: 'duplicate-segment-id'`, #212) is thrown by a Segment write that would make two Segments share one `SegmentId` — construction, `entries.add`, or `entries.update`; its message names which. `SegmentsOutOfSyncError` (`code: 'segments-out-of-sync'`, #212) is thrown by `entries.update` two ways: naming `start`/`end` with no `segments` on an Entry that draws several (`'ambiguous'` — moving the envelope alone says nothing about which Segment moved), or naming both in one edit with disagreeing spans (`'conflicting'` — the #212 fix-plan review, finding S3). An installed `EditExtender`'s cascade owes `entries.update()` the same refusal, on both edges (D-S5-44, `plans/s5-extensibility-and-editing/s5.10-dataset-plugins.md`): the commit path throws it for real, and the drag preview, which runs with nothing to catch a throw, drops the offending edit instead and paints no ghost for it that frame. `data/entry-reader.ts`'s `moveEntryTo(entry, start)` is the write a plugin author reaches for instead of the refused envelope-only one. This refusal is judged against `EditRequest.entryAfterEdits(id)` — the Entry as this transaction's own body edits leave it — not against `EditRequest.entries.get(id)`, which stays the pre-transaction snapshot (D-S5-45, `plans/s5-extensibility-and-editing/s5.10-dataset-plugins.md`): a cascade that reasons from the stale snapshot can propose a write this same refusal then rejects, over Segments the body already replaced. `EmptySegmentsError` (`code: 'empty-segments'`, #212 fix-plan review, finding S2) is thrown by `entries.update(id, { segments: [] })` — empty is illegal; absent is dateless (ADR 0012). `ParentCycleError` (`code: 'parent-cycle'`, S2.3) is thrown by a `parentId` edit that would make an entry its own ancestor, self-parenting included. `UnknownFieldError` (`code: 'unknown-field'`, S2.3) is thrown by `entries.update` or `entries.fieldValue` given a key that names no field — the Field registry is the legal set. `DerivedFieldNotWritableError` (`code: 'derived-field-not-writable'`) is thrown by `entries.update()` on a rolling-up Field of a parent that has children. `ComputedFieldCannotBeWrittenError` (`code: 'computed-field-cannot-be-written'`) is thrown at registration and at `entries.update()` for a `compute` Field — one name, two doors; the message names the door. `FieldNotEditableError` (`code: 'field-not-editable'`) is thrown by `entries.update()` when `editable` is `'never'`. `DuplicateFieldKeyError` (`code: 'duplicate-field-key'`, S4.1) is thrown when two Field declarations share a key. `UnknownAggregatorError` (`code: 'unknown-aggregator'`, S4.1) is thrown when a Field names an Aggregator that is not registered. `UnknownFieldTypeError` (`code: 'unknown-field-type'`, S4.1) is thrown when a Field names a `type` with no matching `fieldTypes` entry. `FieldNotColumnableError` (`code: 'field-not-columnable'`, S4.3) is thrown when `gridColumns` names a Field that declared no `column`. `UnknownGridColumnError` (`code: 'unknown-grid-column'`, S5.7) is thrown by `hideGridColumn`/`showGridColumn` given a field no declared column carries. `DuplicateRowIdError` (`code: 'duplicate-row-id'`, S4.6) is thrown by a `{ source: 'custom' }` resolver that returns the same `id` twice.- **Docs site with live, editable examples** grows with the slices (the harness pages are its seed) — budgeted as a deliverable, not an afterthought.
- **Semver honesty**: internal modules are not importable (enforced by the `exports` map), so semver only governs surfaces we actually promise.

## 8. Framework wrappers (later, out of scope for the slices)

The core stays framework-free (D5). Wrappers, when demanded, are thin adapters: props → config assignment, callbacks → event subscriptions, children/slots → renderer callbacks. Nothing in the core may require a wrapper to function, and no wrapper gets private API access — if a wrapper needs a back-door, the public API is missing something; fix the API.
