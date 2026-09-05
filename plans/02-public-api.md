# FreeGantt — Public API Design

The API is a product surface, designed once and defended. Everything here is what a consumer sees; everything else in the codebase is internal and free to change.

**Public entry points:** `Dataset`, `Gantt`, the event vocabulary, the plugin contract, the JSON schema, and the model types. Nothing else.

---

## 1. Principles

1. **One config object, everything live.** No builder-vs-mount split, no "must be set before mount" options. If an option can't change at runtime, it's a constructor argument or it doesn't exist.
2. **Data and view are separate objects.** A `Dataset` (headless, Node-safe) holds data and scheduling; a `Gantt` binds a dataset to a DOM container. Many views of one dataset is the normal case, not a trick.
3. **Every mutating interaction has a cancelable `before*` event.** Consumers can veto a drop, substitute their own editor, validate a link — before commit, not after.
4. **Honest surface.** Nothing in the published types throws "not implemented" (invariant I11). Declared events fire; declared methods work.
5. **Predictable naming.** One vocabulary, one bus, greppable pairs (`beforeEntryMove` / `entryMove`). No synonyms, no two names for one concept.
6. **Typed extensibility.** `meta` generics flow end-to-end: `new Dataset<{ team: string }>` makes `entry.meta.team` typed in renderers, events, and queries. Declared Field writes take a second type parameter: `new Dataset<{ team: string }, { cost: number }>` types `update({ cost })`. TypeScript does not infer that map from the `fields` array once TMeta is written.

---

## 2. Shape

```ts
import { Dataset, Gantt } from 'freegantt';

// ── Data: headless, works in Node ───────────────────────────────
const dataset = new Dataset<{ team: string }, { cost: number }>({
  timeZone: 'America/Chicago',            // optional (#129); omit it to author in the viewer's own zone
  dateOnlyEnd: 'inclusive',               // default; see §2.1
  rollUpKinds: ['group'],                 // default; `'none'` keeps caller-assigned parent values
  history: { capacity: 100 },             // default; undo/redo stack depth — see "Undo and redo" below
  hierarchy: { autoGroup: true },         // default; first child promotes parent to kind 'group'; promote only
  entries: [
    { id: 'p1', name: 'Sitework', kind: 'group' },     // span derives from children (default policy)
    { id: 't1', parentId: 'p1', name: 'Groundwork', start: '2026-09-01', end: '2026-09-11' },
    { id: 't2', parentId: 'p1', name: 'Framing',    start: '2026-09-12', end: '2026-09-30',
      meta: { team: 'A' } },
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
  locale: 'de-DE',                        // presentation; live; never reaches toJSON()
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

Single mutations outside an explicit transaction are auto-wrapped in one — convenience without a second code path (D-S2-8). Each mutator validates against its own in-progress write set before staging anything, so a rejected call leaves the store untouched and a stack trace points at the call that made the bad edit, not at a transaction's closing brace.

`transaction()` returns the body's own return value, not a `ChangeSet` — `dataset.on('change')` is the only channel a committed changeset travels on (§3). A nested `transaction()` call runs its body against the already-open transaction and returns that body's value without committing a second time; only the outermost call commits. A veto (`beforeChange` returning `false`, §3) makes `transaction()` throw `MutationCancelledError` carrying the refused changeset, rather than returning at all.

`dataset.plugins` is **read-only**, unlike `gantt.plugins`. A Dataset plugin may declare a Field, and a Field must exist before the first Rollup walks (D-S5-4) — adding one later would mean re-rolling the whole dataset under a Field the Document never had. So a Dataset installs its plugins once, in its constructor, and a consumer who wants a different plugin set builds a Dataset with it (`Dataset.fromJSON` takes the same `plugins` for that reason: a Document stores a plugin's rows, never its behaviour). A Gantt has no such moment — its plugins register paint and gesture seams that are re-resolved on the next frame — so `gantt.plugins = [...]` stays assignable. Uninstalling a Dataset plugin is `dataset.destroy()`, which releases every installed plugin in reverse setup order.

`autoGroup` is data behavior, so it lives on `Dataset` (not `Gantt`): the promotion runs inside the same transaction as the edit that caused it — one changeset, one undo step. It only promotes; turning a group back into an entry is always an explicit edit (`01` §2.5).

### Undo and redo

`undo()`/`redo()` return nothing — like every other commit, what they did arrives on `dataset.on('change')`, tagged `origin: 'undo'`/`'redo'`; a caller that needs to know what an undo did reads the event, not a return value. `canUndo`/`canRedo` answer "is there anything to undo/redo" without a caller needing to try and catch. `history: { capacity: 200 }` at construction keeps 200 undoable transactions; the default is 100. An undo replays a cascade exactly as it committed — it never re-runs the extension hook, so an engine whose behaviour changed between library versions cannot rewrite history (`01` §6, `plans/s2-data-core/s2.5-undo-redo.md`).

`dataset.replay(changeSet)` is the write path `undo()`/`redo()` are built on, published so a consumer can write their own History against the public surface alone: `on('change')`, `invertChangeSet`, and `replay` — no `data/` import needed. `replay` writes the rows exactly as given, through the same `beforeChange`/`change` channel, with no extension hook and no rollup. `changeSet.origin` must be `'undo'` or `'redo'`; `'user'` throws `InvalidReplayOriginError` — that door is `apply`, later (§6). An empty changeset is a no-op (`plans/s2-data-core/s2b-undo-replay-seam.md`).

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

**A config value is a value, not a mutable object (#187).** Assignment compares against what the property already holds, by identity. So a mutation of the object you already handed over, followed by an assignment of that same object, changes nothing and paints nothing. Assign a copy to ask for the repaint:

```ts
gantt.barRenderer = { ...gantt.barRenderer, milestone: paintMilestone };   // repaints
gantt.rowSource = { ...gantt.rowSource, groupBy: byTeam };                 // re-resolves rows
```

One rule covers every config key, object-valued ones included. A per-key exemption would put the rule back in each setter, which is what `frame-settings.ts`'s one invalidation table exists to prevent. It also keeps a repeated assignment of an unchanged value off the frame path.

**Assignment replaces the whole value. A verb writes one key (#184, #195).** The rule above says what assignment is, and the consequence is that a consumer who changes one key must restate the rest. Anything they forget to carry is dropped, with no error and no event. So where changing one key is the common case, the library ships a verb for that key:

```ts
gantt.setCapabilityRule('resize', false);   // this one gesture; every other rule stands
gantt.clearCapabilityRule('resize');        // the per-kind table answers that gesture again
gantt.hideGridColumn('cost');               // D-S5-34 — the widths and the order stay as the user set them
gantt.installPlugin(tooltips());            // D-S5-36 — the installed set is not restated
```

**A verb does not merge into the value, and it never mutates it.** It reads the current value, computes the next one, and assigns that copy. So the paragraph above still holds in full: the object a consumer handed over is never written to, and the property still compares by identity. A merging setter was considered for `interactions` and rejected for the same reason — it would make assignment mean two things, and it would leave no way to *remove* a key.

The setter is the long form: restate a whole config, reorder a whole list. The verb is the shorthand for the common case. That is CLAUDE.md's "common case is a shorthand; the long form is expert", and both write the same stored value.


### 2.1 What a consumer writes, and what the library stores

Ids and dates are loose on the way in and strict everywhere behind the boundary. `Dataset` reads an `EntryInput` into an `Entry` once, at construction: ids are plain strings that gain the `EntryId` brand here, and dates are any `InstantInput` — an ISO string, a `Date`, epoch milliseconds, or an already-branded `Instant`. A consumer never has to call `entryId()` or `instant()`. An `Entry` is itself a valid `EntryInput`, so a consumer holding branded values passes them through unchanged.

A string with an explicit `Z` or numeric offset is absolute. Every other string is a Plain time and resolves through the dataset's `timeZone`, so one entry list renders identically for every viewer. A value naming no instant — including a date the calendar does not have, such as `'2026-02-31'` — throws `InvalidInstantError`; it never slides to a nearby date.

`timeZone` is optional (#129). Passed explicitly, it is what the paragraph above describes: one zone, so a Plain time in `entries` reads identically for every viewer, in any timezone. Omitted, `Dataset` resolves the current environment's own zone once, at construction (`Intl.DateTimeFormat().resolvedOptions().timeZone`, falling back to `'UTC'` when that reports nothing, e.g. a bare Node process) and stores the resolved IANA string — `dataset.timeZone` is always a concrete zone after construction, never a sentinel. This trades cross-viewer consistency for ergonomics: a dataset built this way authors Plain times in *this* viewer's calendar, so the same entry list can read differently for a viewer in a different zone. Reach for it for single-viewer or demo use; pass `timeZone` explicitly whenever the dataset is shared across viewers, such as a project plan multiple people open.

`dateOnlyEnd` names how a *date-only* `end` is read against half-open `[start, end)` storage. `'inclusive'` (the default) reads `end: '2026-09-08'` as "through the 8th" and stores the start of the 9th; `'exclusive'` reads it literally. It applies to nothing else: an `end` carrying a time of day, a `Date`, epoch milliseconds, or an `Instant` is a boundary already, and `start` is never adjusted.

The reading itself lives in `time/` (`toInstant`, `toEndInstant`) — resolving a Plain time needs the zone and the DST fold/gap policy, and advancing a date-only end by one day is zone-aware arithmetic, which I10 confines to that layer. `api/` maps fields and does no date math of its own.

`start` and `end` are required on every `EntryInput` except one case: an entry of a `rollUpKinds` kind (`01` §2.5, default `['group']`) may omit both — `{ id: 'p1', name: 'Sitework', kind: 'group' }` above is exactly this — and the store writes a zero-length span at the dataset's reference date until the Rollup gives it a real one (`01` §2.6). `rollUpKinds: 'none'` does not grant that omit: every entry must bring `start` and `end`, because the parent keeps the caller's values. Omitting one field but not the other, on any kind, is `InvalidInstantError`: the field is required and `undefined` names no instant.

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
| `beforeCollapseChange` | `collapseChange` |
| — | `navigationChange` (one Viewport Batch: Preset, Fit, Range, Pan, Anchored zoom) |
| `beforeChange` | `change` (every committed `ChangeSet`) |
| — | `error` (every refusal and every recovered fault; **the one name on both buses**) |
| — | `scheduleDiagnostics` (engine findings) |

`navigationChange` (S1.12) fires once per Viewport Batch after Preset, Fit, Range, Pan, or Anchored zoom actually change. There is no `before*` pair: those writes are reconfiguration (S1.9), not a vetoable gesture. Chrome reads `presetId` / `canZoom*` from the payload, or re-reads the live Gantt getters.

`beforeGridWidthChange`/`gridWidthChange` (S1.8) carry `{ from, to }` in px. Fired by both a Splitter drag's commit and a direct `gantt.gridWidth = px` assignment — one commit sequence, one place it lives (`GanttShell`). A veto restores the width the drag started from, so a rejected drag leaves nothing behind. The grid pane never sits wider than its own columns (#139): every path that sets a width — the constructor option, a live assignment, a drag — is capped at the columns' total width, because past the last column's right edge there is nothing to draw. So `gantt.gridWidth = 900` against 360px of columns reads back `360` and fires `to: 360`, and hiding a column brings the pane in with it through this same sequence. Narrower is always legal — the columns overflow and the pane scrolls to reach them (#126) — and a column set holding a `flex` column has no cap at all, since a flex column has no fixed edge to stop at.

`gridWidth` also takes `'fitColumns'` (#157): the pane sits exactly on the columns' edge, and keeps sitting there as the columns change — a column resize, a hidden column, a plugin-registered column all move it, in both directions, through this same commit sequence. It is a standing instruction, not a width read once, so a consumer never restates a number the library already computes. The getter still answers in px: "how wide is the pane" is a question about pixels. Two things end the instruction: a later `gantt.gridWidth = px`, and a Splitter drag, which is the consumer changing their mind (a vetoed drag ends nothing). A column set holding a `flex` column names no edge to sit on, so the pane keeps the width it has until the set names one again.

`minGridWidth` (#127) is a live, plain-reconfiguration property — not a gesture, so it carries no `before*`/`*Change` pair of its own. It floors what the Splitter drag can reach, and nothing else: no floor applies to a written width, so `gantt.gridWidth = 0` collapses the grid pane on purpose. (#139's ceiling is the one bound that does reach a written width — a floor guards against a user accident, which an app author is allowed past; a ceiling states a layout fact.) Default `40` — wide enough for one narrow column, so a drag cannot take the pane to nothing by accident; `minGridWidth: 0` restores an unfloored splitter. Raising `minGridWidth` above the current `gridWidth` fires `beforeGridWidthChange`/`gridWidthChange` to lift it — the same commit sequence a drag would use, so a veto leaves the width exactly where it was.

`beforeCollapseChange`/`collapseChange` (S4.6, D-S4-22) carry `{ from, to }` as `RowId[]` — Gantt view state, no Dataset transaction. Fired by a twisty click, keyboard collapse/expand, and a direct `gantt.collapsed = ids` assignment. A veto restores the set the interaction started from. Collapse is per Gantt: two Gantts on one Dataset collapse independently, the same way `selectedIds` already does.

`error` (S5.12, D-S5-35/36/37) is the one event name that lives on **both** buses, and it carries the
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

S3 data-gesture payloads (D-S3-22): `beforeEntryMove`/`entryMove` carry `ProposedSpan` (`entry`, `start`, `end`) plus `entries` (grabbed first; extender extras never included). `beforeEntryResize`/`entryResize` add `edge: 'start' | 'end'`. `beforeSelectionChange`/`selectionChange` carry `{ from, to }` as `EntryId[]` — Gantt state, no Dataset transaction. `beforeEntryMove`/`beforeEntryResize` handlers may return `Promise<void | false>` (D-S3-17); every other Gantt event stays sync-only.

`beforeEntryEdit`/`entryEdit` (S5.8, D-S5-19) carry `EntryFieldEdit` — `entry`, `field` (a `FieldKey`), `from`, `to` (both `unknown`: a Field's stored type is open). `beforeEntryEdit` fires **before `inlineEditing()`'s built-in editor opens**, not before the write, so `from`/`to` are both the entry's current stored value at that point — nothing has been typed yet. `entryEdit` fires after the commit, `to` the value actually written. `beforeEntryEdit` joins `beforeEntryMove`/`beforeEntryResize` as the third handler that may return `Promise<void | false>` (D-S3-17) — the async veto is what lets a consumer `await myDialog.open(entry)` before deciding whether to suppress the built-in editor (the sample below).

**A plugin raises this one pair itself, through two verbs that differ.** `ctx.interaction.proposeEntryEdit(payload)` asks: it raises `beforeEntryEdit` and hands back what the handlers answered — `true`/`undefined`, `false`, or an unsettled `Promise`. The caller must read that answer. `ctx.interaction.announceEntryEdit(payload)` tells: it raises `entryEdit` after the commit and returns `void`. One verb per job, so a plugin author sees from the name whether a decision comes back. (`emit*` said neither, and is retired.) Every other `before*` event stays core's own to raise, so no plugin can forge `selectionChange` or any event core owns.

```ts
gantt.on('beforeEntryMove', ({ entry, start, end }) => {
  if (start < mobilization) { toast('Too early'); return false; }   // veto
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

dataset.on('beforeChange', ({ changeSet }) => {
  if (changeSet.updated.some(u => locked.has(u.id))) return false;   // veto — refuses the whole change
});

dataset.on('change', ({ changeSet }) => save(changeSet));           // persistence hook (D7)
```

Rules:

- Cancelable handlers may return `false` or `Promise<false>`; an async veto suspends the gesture with a visible pending state — it never commits optimistically. **`beforeChange` is the one exception: it is sync-only.** A data commit has nothing to suspend into — the store would have to hold its write set across an `await`, and every mutator would have to turn `async` to make that safe. The async path stays where gestures already are, one layer up in `interaction/`.
- Pointer/gesture events fire on the `Gantt` (view concern); data events fire on the `Dataset` (data concern). Every event name exists exactly once.
- Payloads are typed, stable, and carry entities plus context — no "re-read everything" events.
- `change` is the only path out of a commit: the view's live binding and the undo history are both ordinary subscribers to it, not privileged internals with a second, private channel. `beforeChange` may refuse a changeset but never edit one — rewriting a proposed edit is the extension hook's job, and it has exactly one owner. A vetoed programmatic call (e.g. `entries.update()`) throws `MutationCancelledError` carrying the refused changeset, because a function with a return contract cannot quietly not honour it; a vetoed gesture is silent, the way `beforeGridWidthChange` already is. **Silent in the UI, not
unrecorded (S5.12, D-S5-35):** nothing is drawn and nothing throws, and one `ErrorReport` goes out on
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

Every level-1 property the library reads as a length goes through one reader (`render/dom/pixel-property.ts`): computed value → px → validated → library default. What counts as authored is stated per property rather than re-implemented per call site — `--fg-row-height` rejects zero (a zero-height row is not a row), `--fg-grid-pane-width` keeps it (a consumer turning the grid pane off authored that). Re-read cadence stays the caller's and is stated at each call site: the grid pane's width is read once at construction (renamed from `--fg-row-label-width`, S1.8 — the gutter is a pane width now, not a backend reservation), row height again on every pane measurement, neither per render. Two more tokens joined at S1.8: `--fg-splitter-width` (fallback `4`) and `--fg-header-height` (fallback `20`, **retired at S1.12** — migration: `--fg-header-height: 40px` on a two-band preset becomes `--fg-band-height: 20px`). The grid pane's spacer now mirrors one empty `.fg-band` per header band, so both panes size from `--fg-band-height`.

**The complete level-1 `--fg-*` table (S1.10, D-S1.10-1/D-S1.10-9).** A consumer with no CSS of its own gets these defaults; every one is overridable by setting the same property on the container element, which `view/styles.ts`'s `var(--fg-x, default)` always prefers over its own fallback (U4). Metrics are read through `pixel-property.ts` (above); colour tokens are plain CSS custom properties consumed directly by the base stylesheet's class rules — no JS reads them.

| Token | Default (light) | Default (dark) | Read by |
|---|---|---|---|
| `--fg-row-height` | `32px` | — (not theme-dependent) | `pixel-property.ts`, re-read on pane measurement |
| `--fg-grid-pane-width` | `220px` | — | `pixel-property.ts`, read once at construction |
| `--fg-splitter-width` | `4px` | — | `pixel-property.ts` |
| `--fg-band-height` | `20px` | — | `.fg-band` / `.fg-tick` CSS (`--fg-header-height` retired, S1.12) |
| `--fg-tick-box-floor` | `9px` | — | `.fg-tick` padding calc + `pixel-property.ts` into `LayoutInput.tickBoxFloorPx` |
| `--fg-diamond-size` | `10px` | — | `.fg-bar-diamond::before` width/height + `pixel-property.ts` into `LayoutInput.diamondSizePx` — moves a milestone bar's own painted-span floor (`size × √2`) along with the glyph (bug hunt, S5 fixes) |
| `--fg-bar-radius` | `3px` | — | `.fg-bar` CSS rule directly (not `pixel-property.ts` — a border-radius, not a layout number) |
| `--fg-pane-bg` | `#FAFAF7` | `#15161A` | `.fg-grid-pane`, `.fg-timeline-pane` background |
| `--fg-splitter-color` | `#E6E2D9` | `#2B2F36` | `.fg-splitter` background |
| `--fg-header-bg` | `#F4F2EC` | `#22252B` | `.fg-header` background |
| `--fg-header-band-bg` | `#FFFFFF` | `#1B1D22` | `.fg-band` background |
| `--fg-header-text` | `#1A1815` | `#ECEAE3` | `.fg-band`/`.fg-tick` text |
| `--fg-header-subtext` | `#9A958B` | `#6E6A62` | `.fg-tick` text |
| `--fg-header-divider-color` | `#E6E2D9` | `#2B2F36` | rule between header bands |
| `--fg-row-even-bg` | `transparent` | `transparent` | `.fg-row:nth-child(even)` |
| `--fg-row-odd-bg` | `rgba(26,24,21,.028)` | `rgba(255,255,255,.032)` | `.fg-row:nth-child(odd)` |
| `--fg-row-label-color` | `#1A1815` | `#ECEAE3` | `.fg-row-label` text |
| `--fg-bar-fill` | `oklch(.55 .13 245)` | `oklch(.72 .13 245)` | `.fg-bar` background |
| `--fg-bar-label-color` | `#FFFFFF` | `#1A1815` | `.fg-bar` text |
| `--fg-warn` | `#D97706` | `#FBBF24` | `.fg-bar[data-flag~="conflict"]` outline (U2) |
| `--fg-date-line-color` | `#DC2626` | `#F87171` | `.fg-date-line`, `.fg-date-line-label`, `.fg-cursor-line`, `.fg-cursor-line-label` |
| `--fg-selection-color` | `oklch(.55 .19 25)` | `oklch(.75 .19 25)` | `.fg-bar[data-state~="selected"]` outline; pending uses the same token, dotted |
| `--fg-ghost-opacity` | `0.4` | — | `.fg-bar[data-state~="ghost"]` |
| `--fg-pending-opacity` | `0.6` | — | `.fg-bar[data-state~="pending"]` |

Colour defaults are sourced from an existing, unnamed palette this team maintains elsewhere (D-S1.10-9) — only the *values* cross over, never the palette's name (CLAUDE.md: vendor product names never appear in specs/docs/code). `theme: 'auto' | 'light' | 'dark'` (default `'auto'`) selects which block applies: `'auto'` writes no `data-fg-theme` attribute and follows `prefers-color-scheme`; `'light'`/`'dark'` write the attribute and always win over the media query on specificity. No named multi-preset picker beyond light/dark yet — that needs `extensions/`'s `PluginContext`, the only I2-safe place a `registerThemePreset`-shaped seam can live (deferred to S5, D-S1.10-9).

**`data-flag` is real (S1.10, D-S1.10-2).** Generated from `BarFlags`'/`LinkFlags`' own keys, not hand-mapped — `.fg-bar[data-flag~="conflict"]`, `.fg-bar[data-flag~="cycle"]` are live selectors today (nothing sets them true until S7's scheduling plugin, but the mechanism and the vocabulary both ship now, U2). A new `BarFlags` key needs no `render/dom` edit to show up as a token (U7).

S3 Parts: `.fg-bar-handle` (shared resize-handle pair), `.fg-cursor-line`, `.fg-cursor-line-label`. S3 State attribute: `data-state` on `.fg-bar` (`hovered`, `selected`, `pending`, `dragging`, `ghost`) and `data-movable` (grab cursor).

**D-S3-10 amendment (bug hunt, "grid row highlight and row click" — locked pre-1.0, no compat shim needed).** A click on a `.fg-row` in the grid pane is the same select as a click on that row's own bar: plain replaces, ctrl/⌘ toggles, shift ranges over `selectableEntriesInRowOrder()`. It never arms move or resize — a grid-row pointerdown never grabs `EntryGestureSession`. A click on `.fg-row-twisty` is not a row hit at all: collapse stays on the twisty, never selection. An empty *timeline* click still clears `gantt.selectedIds`; a miss on the grid pane (a header row, padding, a twisty) never does — only the timeline's own empty click is "the" clearing gesture. `data-state~="selected"` paints on the matching `.fg-row` the same way it already does on `.fg-bar` — same `--fg-selection-color` Token, a background instead of an outline (`.fg-bar[data-state~="selected"]`, `.fg-row[data-state~="selected"]`). A row click selects **every** Entry the row owns (`FrameRow.entryIds`, #185); the row's cells still describe the first one. A grouping header row carries no entry and is never selectable.

S5.5 Parts (D-S5-13/14, both mounted inside S5.3's `.fg-popup`): `.fg-tooltip`, `.fg-tooltip-title`, `.fg-tooltip-dates` (`tooltips()`); `.fg-menu`, `.fg-menu-item`, `.fg-menu-separator` (`contextMenu()`).

S5.8 Parts (D-S5-19): `.fg-cell-editor`, `.fg-cell-editor-control` (`inlineEditing()`) — mounted through the row layer (`ctx.view.rowLayer`) directly, not inside `.fg-popup` (the cell editor has no flip/clamp; it always sits at the cell's own rect). #158 moved this mount out of the Overlay: the row layer travels with the rows on both axes, so the editor stays on its cell through a scroll with no scroll listener. State attribute `data-state="invalid"` on `.fg-cell-editor` marks a failed `parseValue`, a `beforeChange` veto, or the default `dateInput`'s non-midnight refusal (issue #137 F11/F12).

A cell renderer reads its cell two ways. `value` is the string the library painted, through the
Field's own `formatValue`. `fieldValue` is the same Field value before formatting — what
`dataset.entries.fieldValue(id, column.field)` answers, for an `entry`-, `meta`- or `compute`-sourced
Field alike. A renderer that paints text reads `value`; one that branches on magnitude reads
`fieldValue`, and never parses the library's own output back with a regex. Reaching into
`entry.meta` is not the alternative: a `compute`-sourced Field has no stored home (ADR 0005).

Renderers return **plain serializable element descriptions** (tag/class/style/text/children), applied by the engine's reconciler — never live DOM nodes (nodes are recycled by virtualization) and never framework components in core (D5). Text by default; HTML by explicit opt-in only. `class` is `Readonly<Record<string, boolean>>` everywhere on `ElementDescription`, including its `children` (S5.4, D-S5-10) — this sample used a bare string until issue #137 F15 caught that it did not typecheck against its own referenced type.

```ts
barRenderer: ({ entry, item }) => ({
  class: { 'my-bar': true, 'my-bar--late': isLate(entry) },
  children: [
    { tag: 'span', class: { 'my-bar__label': true }, text: entry.name },
    { tag: 'span', class: { 'my-bar__team': true },  text: entry.meta.team },
  ],
})
```

### 4.1 Per-entry looks and actions

Both questions — *how does this entry look?* and *what can you do to it?* — resolve **per entry**, not per Gantt, and every mechanism sees the whole entry (`kind`, fields, typed `meta`):

**Look.** Every bar element carries `data-kind`, so per-kind styling is level-2 CSS with zero JS (`.fg-bar[data-kind="milestone"] { ... }`). At level 3, `barRenderer` is either one function that branches, or a per-kind map so the common case needs no branching — consumer-defined kinds slot in by name:

```ts
barRenderer: {
  milestone: ({ entry }) => diamond(entry),
  group:     ({ entry }) => bracket(entry),
  buffer:    ({ entry }) => hatched(entry),   // consumer-defined kind
  '*':       ({ entry }) => defaultBar(entry),
}
```

**Actions.** The `interactions` config takes a boolean or a per-entry predicate for each gesture (`move`, `resize`, `linkCreate`, `select`, `edit`), layered over per-kind defaults. One resolution both hides the affordance and refuses the gesture — pointer and keyboard alike (I14) — so a non-resizable entry simply has no handles rather than handles that scold. `select` has no affordance to hide; `select: false` (or a predicate that returns false) refuses pointer and keyboard selection of that entry and skips it in a shift-range. The public `gantt.selectedIds` setter does not consult the capability — it is the programmatic path, matching `entries.update` under `move: false`. Context-menu items and commands carry a `when(entry)` clause, so a kind (or any predicate) ships its own action set.

**Division of labor:** capabilities answer the *static* question ("groups don't resize"); `before*` events answer the *contextual* one ("not before mobilization"). Use the shallowest one that fits.

**Viewport gestures** are a separate knob (`Gantt.viewportGestures`): they are not per-entry, they write no data, and they do not belong on `interactions`. `false` turns wheel zoom, shift+wheel pan, and keyboard pan off together; `{ wheelZoom: false }` pins one gesture and leaves the others on. `zoomBy` / `panToDate` / `zoomIn` stay available either way.

---

### 4.2 Fields and grid columns

One sentence separates them: **a field is what a value *is*; a grid column is where a Gantt *shows* it.** Fields live on the `Dataset`, because the rollup writes stored, undoable, serialized values and runs at construction — before any Gantt exists. Grid columns live on the `Gantt`, because which fields this view shows is a view question (`01` §2.6).

Core fields and consumer fields are the same declaration, so `'start'` and `'cost'` take one code path — one renderer, one editor, one comparison rule, one rollup.

Four levels, each an addition to the one under it. Consumers stop at the shallowest that works:

```ts
// 1 — a field with no aggregate. One key. Lives in meta under that key.
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

Levels 1–3 are plain data on the Field declaration, so they serialize, they diff in review, and a document can carry them. Level 4 adds a function in `DatasetOptions.aggregators` (and the same map in `fromJSON`'s second argument on reload). `rollUp` on the Field or Field type is always an **Aggregator name** — shipped (`'sum'`) or yours (`'riskWeighted'`). It never takes a bare function: a name can be refused when it is not registered, and a function cannot travel with a document. The Aggregator signature is `01` §2.6 (`children`, `parent`, `ctx.read(fieldKey)`); return `undefined` to leave the parent's stored value alone. Write `source: { from: 'meta', key: 'budget' }` only when the Document key is not the Field key. `formatValue` is display: money stays a number in the store; the cell shows currency text. Sort reads the stored value (`01` §2.6, S4.9).

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
{ key: 'duration', source: { from: 'compute', read: (e, ctx) => ctx.durationOf(e) } }
```

Source decides what happens to a parent's aggregate: a field sourced from `entry` or `meta` has somewhere to put it, so it is stored, undoable and serialized; a computed field's aggregate is computed on read and never reaches the document. A computed field reads the dataset only — never zoom, visible range or selection. A value that depends on the view is a renderer's business, not a field.

**Editing crosses core and consumer fields freely** — one call, one transaction, one undo step:

```ts
dataset.entries.update('t1', { start: '2026-10-05', cost: 12_000 });
dataset.entries.fieldValue('t1', 'cost');       // 12_000 — meta-sourced
dataset.entries.fieldValue('t1', 'start');      // entry-sourced
dataset.entries.fieldValue('t1', 'duration');   // compute-sourced; no Gantt required
dataset.field('cost');                         // resolved Field | undefined
dataset.fields.all;                            // every declared Field, core included
```

An unregistered key is an `UnknownFieldError`, never a silent write. A missing id on `fieldValue` is an `EntryNotFoundError`. The read goes through the same Field registry path as the write: a consumer who declared `{ key: 'cost' }` does not reach into `entry.meta`. `dataset.field` and `dataset.fields.all` return **resolved** declarations (type merge applied, `source` filled). They are not the raw `DatasetOptions.fields` array.

**Default `gridColumns` is `['name']`.** Naming a Field does not add it to the grid by itself.

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

A **Row** is a derived horizontal track — not an Entry. One Row may carry many Entries' items; a row source may produce Rows that stand for no Entry at all. **`gantt.rowSource`** names the config that decides what the Rows are for this Gantt. The name matches its type (`RowSource`) and leaves `rows` free for a future getter of the derived rows themselves.

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

For `{ source: 'entries' }`, a `RowId` equals the `EntryId`, so `collapse('p1')` names the parent entry. A grouping header uses a derived `RowId` from the `groupBy` value. Collapsed subtrees are absent from the row list, not merely hidden — `rowCount`, `aria-setsize`, and the scrollbar stay honest. The collapsed set survives data edits; a stale id simply matches nothing, the same way a removed entry id can linger in `selectedIds`.

**Live reconfiguration.** Assigning `gantt.rowSource` re-resolves rows, invalidates the height index from 0, and requests one frame — no remount. Scroll survives as a pixel position, clamped against the new content height.

Group header rows show the `groupBy` label in column 0 and blank cells elsewhere. Per-group aggregates are the caller's data — declare a computed Field or write through a group entry; the grid does not invent them (D-S4-11).

Published types: `RowSource`, `EntriesRowSource`, `GroupRowSource`, `CustomRowSource`, `CustomRow`, `CustomRowInput`, `RowHeightMode`, `RowSourceCommon`, `RowId`, `CollapseChange`, `RowFilter`, `RowSort`, `FilterPolicy`.

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
`ctx.view.resolveTooltipColumns(entry)` and `ctx.view.isColumnEditable(field)`. None of the three is
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

- **`targetUnder(node)` answers `{ kind, element, entry?, entryIds, field? }`.** `kind` is
  `TargetKind` — `'row' | 'cell' | 'bar' | 'header' | 'splitter'`, the same union
  `CommandTarget.kind` uses. One vocabulary, so a resolved right-click fills a
  `CommandContext.target` with no translation table. `undefined` means the node is outside this
  Gantt, or inside it and on none of the five.
- **A target answers two questions about Entries, because a Row may own several** (#185, #199).
  `entry` is the node's **subject**: the one Entry whose Fields the node's content shows. A tooltip
  describes it, and the cell editor anchors on it. `entryIds` is everything the node stands for, and
  is what an action on the node acts on. For a bar the two agree. For a row, and for every cell of
  that row, `entry` is the row's first Entry and `entryIds` is all of them. `entryIds` is always
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

**`CommandTarget` carries the same two answers, as ids** (#199). A command's `when` and `run` read
`ctx.target`:

```ts
gantt.commands.register({
  id: 'app.lockRow',
  label: 'Lock',
  run: (ctx) => ctx.target?.entryIds.forEach((id) => locks.lock(id)),
});
```

- **`entryIds: readonly EntryId[]`** is every Entry the invocation acts on. It is the same word
  `DomTarget.entryIds` uses, and not always the same set. A `DomTarget` states a DOM fact: what the
  node stands for. A `CommandTarget` states what the command acts on.
- **The right-click rule (#199).** *A right-click acts on the Selection when the thing you clicked
  is part of it. It acts on the thing you clicked when it is not.* So a right-click on an unselected
  grid row names every Entry that row owns; a right-click on one bar of a multi-bar row names that
  one Entry; and a right-click on one of three selected bars names all three. A node stands inside
  the Selection only when every Entry it names is selected. A node that stands for no Entry — a
  header cell, the splitter, a grouping header row — is part of nothing.
- **A right-click outside the Selection replaces the Selection with what you clicked**, before the
  menu opens. It runs the same cancelable `beforeSelectionChange` an assignment runs. Otherwise the
  command acts on Entries the user cannot see highlighted.
- **The keyboard runs the same rule** (D-S5-14, #205). `Shift+F10` and the Menu key open the menu
  for the Selection, so three selected bars reach one menu that acts on three. The bar of the first
  selected Entry stays the popup's anchor, because a popup needs a box on screen.
- **A command that wants exactly one Entry says so**: `when: (ctx) => ctx.target?.entryIds.length
  === 1`, and reads `ctx.entry` for it. `ctx.entry` is the subject, never the set.
- `kind` and `field` are the same two words `DomTarget` uses. There is no `rowId`: a row's identity
  is a `RowId`, and this always named Entries.

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

## 6. Serialization contract (D7)

```ts
const doc = dataset.toJSON();
const p2  = Dataset.fromJSON(doc, { aggregators, fieldTypes, fields });
```

```ts
export interface DatasetDocument {
  schema: 2;
  timeZone: string;
  dateOnlyEnd: DateOnlyEndRule;
  rollUpKinds: readonly EntryKind[];
  fields?: readonly SerializedField[];
  entries: readonly EntryDocument[];
}
```

This build writes `schema: 2` (`rollUpKinds`, `fields`). `schema: 1` still reads (`derivedSpanKinds` lands on `rollUpKinds`; Fields come from `options.fields` only). `progress` is not an entry key (ADR 0008). Omit `aggregators` and a Field that names an Aggregator throws `UnknownAggregatorError`. Document `rollUpKinds: []` keeps stored parents and does not maintain them.

- The JSON shape is **public API**: documented, versioned by an integer `schema` field, semver-governed. The reader is a `readers: Record<number, Reader>` map — a second schema is a map addition, not a rewrite. `fromJSON` migrates older schemas forward when they exist; it never silently drops fields **of a schema it reads**. Keys the reader does not know are dropped: **anything of yours goes in `meta` and survives byte for byte; anything at top level belongs to the schema.** `progress` on an old entry row is an unknown key and is dropped (ADR 0008).
- Key order is a contract (`schema`, `timeZone`, `dateOnlyEnd`, `rollUpKinds`, `fields`, `entries`). Optional keys are omitted when absent, never written as `null`. Entries follow store insertion order. Instants serialize as `Z`-suffixed ISO-8601; brands exist only in TS types and never leak into JSON. `fromJSON` reads those instants as absolute, so the dataset zone never re-enters the reading.
- `meta` round-trips opaquely — **unless you declare a key as a field** (`01` §2.6), which makes that key addressable for editing, comparison and rollup while everything else in `meta` keeps the guarantee. The value is carried by reference into the document and back out, never walked field by field.
- **Changesets are the incremental counterpart**: `dataset.on('change')` already carries `{from, to}` per field, which is what discharges `02`'s promise that a sync adapter be *"an extension, not a core change"*. `dataset.apply(changeSet)` is what such an extension writes; it is not in S2 (D-S2-11).

---

## 7. Developer experience commitments

- **Dev-mode invariant warnings**: dependency cycle detected (with member ids), config set on destroyed instance, non-deterministic item identity, renderer returned a live node, and (S1.9) `GanttOptions.scale` supplied alongside any of `preset`/`range`/`zoom` — "FreeGantt: GanttOptions.preset/range/zoom are ignored when 'scale' is also supplied. The shared TimeScaleModel already carries its own intent — set preset/range/zoom on it directly." The shared `scale` always wins; the constructor keys are never merged into it (D-S1.9-9).
- **Stable test hooks**: `data-testid` on every part so consumers can write E2E tests against the Gantt without brittle selectors. Shipped at S1.10 (D-S1.10-5/§3.5, U6): `[data-testid="fg-row"]` (with `data-row-id`) and `[data-testid="fg-bar"]` (alongside the existing `data-item-id`) — the selectors S1.11's e2e boxes select on.
- **Errors are typed and actionable**: `FreeGanttError` subclasses with codes, never bare strings; validation failures name the entity and field. `ContainerNotFoundError` (`code: 'container-not-found'`, S1.8) is thrown when a string `container` selector matches nothing. `UnknownPresetError` (`code: 'unknown-preset'`, S1.9) is thrown by `resolvePreset` for a `PresetRef` string outside the shipped set. `EntryNotFoundError` (`code: 'entry-not-found'`) is thrown by `reveal(entryId)` (S1.9), `entries.fieldValue`, and by `entries.update`/`entries.remove`/a bad `parentId` (S2.3) for an id the Dataset has no entry for — its message names the call that failed. `DuplicateEntryIdError` (`code: 'duplicate-entry-id'`, S2.3) is thrown by `entries.add` given an id already in the store. `ParentCycleError` (`code: 'parent-cycle'`, S2.3) is thrown by a `parentId` edit that would make an entry its own ancestor, self-parenting included. `UnknownFieldError` (`code: 'unknown-field'`, S2.3) is thrown by `entries.update` or `entries.fieldValue` given a key that names no field — the Field registry is the legal set. `DuplicateFieldKeyError` (`code: 'duplicate-field-key'`, S4.1) is thrown when two Field declarations share a key. `DuplicateFieldSourceError` (`code: 'duplicate-field-source'`, S4.1) is thrown when two Fields claim the same `meta` key. `InvalidFieldSourceError` (`code: 'invalid-field-source'`, #196) is thrown when a `Field.source` names no known source — `source: 'meta'` where `{ from: 'meta' }` was meant. TypeScript refuses that shape, so this is for a JS caller; `ctx.fields.register` is public surface, and a library fault must be a `FreeGanttError` even there. `UnknownAggregatorError` (`code: 'unknown-aggregator'`, S4.1) is thrown when a Field names an Aggregator that is not registered. `UnknownFieldTypeError` (`code: 'unknown-field-type'`, S4.1) is thrown when a Field names a `type` with no matching `fieldTypes` entry. `FieldNotColumnableError` (`code: 'field-not-columnable'`, S4.3) is thrown when `gridColumns` names a Field that declared no `column`. `UnknownGridColumnError` (`code: 'unknown-grid-column'`, S5.7) is thrown by `hideGridColumn`/`showGridColumn` given a field no declared column carries. `DuplicateRowIdError` (`code: 'duplicate-row-id'`, S4.6) is thrown by a `{ source: 'custom' }` resolver that returns the same `id` twice. `UnsupportedSchemaError` (`code: 'unsupported-schema'`, S2.6) is thrown by `Dataset.fromJSON` for a `schema` this build has no reader for — the message names the version it found and the versions it reads.
- **Docs site with live, editable examples** grows with the slices (the harness pages are its seed) — budgeted as a deliverable, not an afterthought.
- **Semver honesty**: internal modules are not importable (enforced by the `exports` map), so semver only governs surfaces we actually promise.

## 8. Framework wrappers (later, out of scope for the slices)

The core stays framework-free (D5). Wrappers, when demanded, are thin adapters: props → config assignment, callbacks → event subscriptions, children/slots → renderer callbacks. Nothing in the core may require a wrapper to function, and no wrapper gets private API access — if a wrapper needs a back-door, the public API is missing something; fix the API.
