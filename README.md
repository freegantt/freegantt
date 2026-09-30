# FreeGantt

![FreeGantt demo: a Gantt chart being edited](https://freegantt.dev/img/video_1.5x.webp)

**Live demo:** [Planner](https://freegantt.dev/demo/) ([Light](https://freegantt.dev/demo/?theme=light) · [Dark](https://freegantt.dev/demo/?theme=dark) · [Paper](https://freegantt.dev/demo/?theme=paper)) · [Generic](https://freegantt.dev/demo/generic.html) · [Performance](https://freegantt.dev/demo/performance.html) · [Docs](https://freegantt.dev/docs/guardrails-overview)

**An accessible Gantt chart.** A keyboard user can move, resize, reorder, and edit every task. A screen
reader user hears the grid as an ARIA grid or tree grid, and a live region announces each refusal. Every
demo page passes automated axe checks in CI, in every built-in theme.

Framework-free TypeScript Gantt/timeline library. Library-first: the API, docs, and packaging are
designed for external consumers from day one. See `docs/05-consumer-api.md` for a consumer API index.
`CONTEXT.md` is the glossary.

<!-- doc-example-setup
// What the examples below stand on: the classes a reader has already imported, a live Dataset and
// Gantt, the values their options take, and the app's own elements and callbacks. Every example on
// this page is typechecked against the built package types by `pnpm check-doc-examples`.
declare const Dataset: typeof import('freegantt').Dataset;
declare const Gantt: typeof import('freegantt').Gantt;
declare const invertChangeSet: typeof import('freegantt').invertChangeSet;
type Props = { cost: number; team: string };
declare const dataset: import('freegantt').Dataset<Props>;
declare const gantt: import('freegantt').Gantt<Props>;
declare const entries: import('freegantt').DatasetOptions<Props>['entries'];
declare const timeZone: string;
declare const aggregators: NonNullable<import('freegantt').DatasetOptions<Props>['aggregators']>;
declare const plugins: NonNullable<import('freegantt').DatasetOptions<Props>['plugins']>;
declare function asCurrency(value: unknown, ctx: import('freegantt').FormatContext, entry: import('freegantt').Entry): string;
declare const recordedChangeSet: import('freegantt').ChangeSet;
declare const container: HTMLElement;
declare const element: HTMLElement;
declare const selectionLabel: HTMLElement;
declare const renameBtn: HTMLButtonElement;
declare const input: HTMLInputElement;
declare function save(value: unknown): void;
declare const api: { save(changeSet: import('freegantt').ChangeSet): Promise<void> };
-->

## Quick start

Minimal example: put a small, fixed set of entries into a `Gantt`.

```ts
import { Gantt, Dataset } from 'freegantt';

const dataset = new Dataset({
  entries: [
    { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-07' },
    { id: 't2', name: 'Build', start: '2026-09-08', end: '2026-09-21' },
    { id: 't3', name: 'QA', start: '2026-09-22', end: '2026-09-28' },
  ],
});

const gantt = new Gantt({
  container: document.getElementById('gantt')!, // an HTMLElement or a CSS selector
  dataset,
});
```

Ids are plain strings and dates are plain strings; nothing has to be constructed first. Wrap the
entries in a `Dataset`, mount a `Gantt` on a container element, and `gantt.destroy()` tears it down.

The `Dataset` reads each date in the viewer's own time zone. Pass an IANA `timeZone`, such as
`'America/Chicago'`, when every viewer must see the same day boundaries — a shared project plan,
for example.

Editing after mount is a plain call on `dataset.entries` — no second render path, no re-mount. Every
call auto-wraps in its own transaction (D-S2-8), so a bound `Gantt` moves the bar on the next frame:

```ts
dataset.entries.add({ id: 't9', name: 'Roofing', start: '2026-10-01', end: '2026-10-15' });
dataset.entries.update('t2', { name: 'Framing — north wing' });
dataset.entries.remove('t9'); // and every descendant, in the same changeset

dataset.transaction(() => {
  dataset.entries.update('t1', { start: '2026-10-05' });
  dataset.entries.update('t2', { start: '2026-10-12' });
}); // one changeset, one render

dataset.undo(); // reverts the transaction above in one call
dataset.redo();
```

`undo()`/`redo()` return nothing — like every other commit, what they did arrives on
`dataset.on('change')`, tagged `origin: 'undo'`/`'redo'`. `canUndo`/`canRedo` say whether there is
anything to undo/redo, and `dataset.on('historyChange')` fires when either answer changes.

## Dates and ids a consumer can write

`Dataset` reads what a consumer writes (`EntryInput`) into what the library stores (`Entry`) once, at
construction. Two things get looser at that boundary, and only there.

**Ids** are plain `string`s. Internally an id is a branded `EntryId` so it cannot be mixed with an
ordinary string, but the brand is applied on the way in — a consumer never calls `entryId()`. (It is
still exported for a consumer that wants to hold branded ids of its own.)

**Dates** are any `InstantInput`: a string, a `Date`, epoch milliseconds, or an already-branded
`Instant`. Every form below is legal in the same entry list:

```ts
import { Dataset, instant } from 'freegantt';

const dataset = new Dataset({
  timeZone: 'America/Chicago', // CDT (UTC-5) on the dates below
  entries: [
    // A bare calendar date — that day's start, in the dataset's timeZone.
    { id: 'a', name: 'Date only', start: '2026-09-08', end: '2026-09-10' },
    //                                    -> 2026-09-08T05:00:00Z

    // A wall-clock time with no zone — read in the dataset's timeZone.
    { id: 'b', name: 'With a time', start: '2026-09-08T14:30', end: '2026-09-10' },
    //                                     -> 2026-09-08T19:30:00Z
    // Seconds and a fractional second are optional, and a space works instead of the `T`.
    { id: 'c', name: 'To the ms', start: '2026-09-08 14:30:45.250', end: '2026-09-10' },
    //                                   -> 2026-09-08T19:30:45.250Z

    // A zone of its own — the offset wins and timeZone is not consulted.
    { id: 'd', name: 'UTC', start: '2026-09-08T14:30:00Z', end: '2026-09-10' },
    //                            -> 2026-09-08T14:30:00Z
    { id: 'e', name: 'Offset', start: '2026-09-08T14:30:00+02:00', end: '2026-09-10' },
    //                               -> 2026-09-08T12:30:00Z

    // A Date object — absolute, as written. Its own timezone handling already happened.
    { id: 'f', name: 'Date object', start: new Date('2026-09-08T14:30:00Z'), end: '2026-09-10' },
    //                                    -> 2026-09-08T14:30:00Z

    // Epoch milliseconds, and an Instant a consumer built with instant() — both pass straight through.
    { id: 'g', name: 'Epoch ms', start: 1788000000000, end: '2026-09-10' },
    { id: 'h', name: 'Instant', start: instant('2026-09-08T14:30:00Z'), end: '2026-09-10' },
  ],
});
```

As a table:

| Written                                                    | Read as                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `'2026-09-08'`                                             | that day's start, in the dataset's `timeZone`           |
| `'2026-09-08T14:30'` · `'2026-09-08 14:30'` · `'…:45.250'` | that wall-clock time, in the dataset's `timeZone`       |
| `'2026-09-08T14:30:00Z'` · `'…+02:00'`                     | absolute — the offset wins, `timeZone` is not consulted |
| `new Date(…)` · `1788000000000` · `instant(…)`             | absolute, as written                                    |

### Which zone applies, and when

A string with **no** offset is a _Plain_ time — a wall-clock reading that names no instant until a
zone resolves it. The dataset's `timeZone` is that zone. This is why `timeZone` is required: it
makes one entry list render identically for every viewer, rather than shifting with whatever machine
opens the page.

If you want an entry pinned to an absolute moment regardless of the dataset's zone, write the zone
into the string (`'…Z'` or `'…+02:00'`) or pass a `Date`. Those never consult `timeZone`.

```ts
const entries = [{ id: 't1', name: 'Design', start: '2026-09-08', end: '2026-09-10' }];

// One bare date, three zones, three different instants:
new Dataset({ timeZone: 'America/Chicago', entries }); // start -> 2026-09-08T05:00:00Z
new Dataset({ timeZone: 'Asia/Tokyo', entries }); //      start -> 2026-09-07T15:00:00Z
new Dataset({ timeZone: 'UTC', entries }); //             start -> 2026-09-08T00:00:00Z

// Write the zone into the string instead, and all three agree:
const pinned = [{ id: 't1', name: 'Design', start: '2026-09-08T00:00:00Z', end: '2026-09-10' }];
new Dataset({ timeZone: 'Asia/Tokyo', entries: pinned }); // start -> 2026-09-08T00:00:00Z
```

DST is resolved explicitly rather than left to chance: a Plain time inside a spring-forward gap
shifts forward by the gap, and an ambiguous fall-back time takes the earlier offset.

A value that names no instant — `'next tuesday'`, or a date the calendar does not have such as
`'2026-02-31'` — throws `InvalidInstantError` rather than sliding to a nearby date.

### A bare date on `end` — what it means

Storage is half-open `[start, end)`, so `end` is the boundary _after_ the entry, not its last
moment. A consumer writing a bare date on `end` means the last day it wants included:

```ts
new Dataset({
  timeZone: 'America/Chicago',
  entries: [{ id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-07' }],
});
// covers Sept 1 through Sept 7 — the stored end is the start of Sept 8
```

The rule applies **only to a date-only string on an `end` field** (entry ends and segment ends). An
`end` that already carries a time of day, a `Date`, epoch milliseconds, or an `Instant` is a
boundary already and is read literally. `start` is never adjusted.

## Public API

Everything importable by a consumer lives under `src/api/` and `src/model/` (types only). Internal
layers (`time/`, `data/`, `scheduling/`, `layout/`, `render/`, `view/`) are not part of the public
surface.

### `Dataset`

```ts
import { Dataset } from 'freegantt';

const dataset = new Dataset<{ cost: number; team: string }>({
  entries, // readonly EntryInput[] — see "Dates and ids a consumer can write"
  timeZone, // IANA zone; omit it and the environment's own zone resolves once, at construction
  fieldTypes: { money: { rollUp: 'sum', formatValue: asCurrency, column: { align: 'end' } } },
  fields: [{ key: 'cost', type: 'money' }, { key: 'team' }],
  aggregators, // optional — named rollUp functions beside the shipped ones
  history: { capacity: 100 }, // optional undo depth
  plugins, // a plugin with a `data` half installs here, at construction only (ADR 0019)
});

dataset.entries.all; // readonly Entry[] — ids branded, dates resolved to Instant
dataset.entries.get('p1')?.children(); // direct children, in store order

dataset.entries.add({ id: 't9', name: 'Roofing', start: '2026-10-01', end: '2026-10-15' });
dataset.entries.update('t2', { name: 'Framing — north wing', cost: 12_000 });
dataset.entries.remove('t9'); // and every descendant, in the same changeset

// There is no `rollUpKinds` and no `hierarchy: { autoGroup }`. An Entry carries no stored kind
// (ADR 0013): a parent rolls up because it has children. One entry opts out with `rollUp: 'none'`,
// which keeps the caller-assigned dates on that parent alone (#470).
dataset.entries.get('t2')?.read('cost'); // reads through the Field registry

dataset.field('cost'); // resolved Field | undefined
dataset.fields.all; // every declared Field, core included

dataset.transaction(() => {
  /* several entries.add/update/remove calls, one changeset */
});

dataset.on('beforeChange', ({ changeSet }) => false); // veto — throws MutationCancelledError
dataset.on('change', ({ changeSet }) => {
  /* changeSet.added / .removed / .updated — a bound Gantt reacts to this itself */
  /* undo()/redo() emit this too, tagged origin: 'undo'|'redo' — sample: docs/05-consumer-api.md */
});

dataset.undo(); // origin: 'undo' on the change event it emits
dataset.redo(); // origin: 'redo'
dataset.canUndo;
dataset.canRedo;
dataset.on('historyChange', ({ canUndo, canRedo }) => {}); // fires when either answer changes

// There is no `toJSON` and no `fromJSON`: the library holds no save format (ADR 0016). A consumer
// reads `entries.all` and `fields.all` above, and saves the shape its own backend wants.

// The write path undo()/redo() are built on, published for a consumer's own History:
dataset.replay(invertChangeSet(recordedChangeSet)); // origin must be 'undo' or 'redo'
```

`Dataset` is headless and DOM-free. It reads each `EntryInput` into an `Entry` once, at
construction. Every mutator auto-wraps in a transaction; `dataset.transaction(() => { ... })` batches
several into one changeset. A `Gantt` bound to the dataset subscribes to `change` itself — editing
after mount renders on the next frame with no extra call.

**Fields** declare what values _are_ (`fields`, `fieldTypes`, `aggregators` on the Dataset). A Field
key on `entries.update` and `entries.fieldValue` is the one write/read path for entry-sourced,
meta-sourced, and compute-sourced values. An unregistered key throws `UnknownFieldError`.

### Fields and grid columns

**A field is what a value _is_; a grid column is where a Gantt _shows_ it.** Fields live on the
`Dataset`; grid columns live on the `Gantt` (`gridColumns`). `Field.column` is optional defaults for
the bare-key shorthand. A column object supplies presentation. A bare key with no defaults throws
`FieldColumnNotDefinedError`.

```ts
gantt.gridColumns = ['name', 'start', 'duration', 'cost'];
gantt.gridColumns = [
  'name',
  'start',
  { field: 'cost', header: 'Budget — site A' }, // per-Gantt presentation override only
];
```

Default `gridColumns` is `['name']`. Declaring a Field does not add it to the grid — only names it
in `gridColumns`.

### Row sources and collapse

**`gantt.rowSource`** names the config that decides what rows this Gantt draws. Default:
`{ source: 'entries', tree: true }` — every Entry a row, nested under its `parentId`.

```ts
// Entries as a tree (parentId) — the default
gantt.rowSource = { source: 'entries', tree: true };

// One header row per groupBy value
gantt.rowSource = { source: 'group', groupBy: (entry) => String(entry.read('team') ?? '') };

// Consumer-supplied rows
gantt.rowSource = {
  source: 'custom',
  resolve: ({ entries }) => [{ id: 'a', entryIds: ['t1'] }],
};

// Sort and filter live on the row source (entries and group only)
gantt.rowSource = {
  source: 'entries',
  tree: true,
  filter: (entry) => entry.read('team') === 'A',
  filterPolicy: 'keepAncestors', // or 'matchOnly'
  sort: { field: 'start', direction: 'asc' },
};
```

Assigning `gantt.rowSource` re-resolves rows live with no remount; scroll position survives.

**Collapse** is per-Gantt view state (not in the Dataset):

```ts
gantt.collapsed = ['p1'];
gantt.collapse('p1');
gantt.expand('p1');
gantt.collapseAll();
gantt.expandAll();
gantt.collapseStateOf('p1'); // 'collapsed' | 'expanded' | 'leaf' | undefined for no such row
gantt.on('collapseChange', ({ to }) => save(to));
```

For `{ source: 'entries' }`, a `RowId` equals the `EntryId`. Group headers use derived ids from the
`groupBy` value.

### `TimeScaleModel` and `ScrollAxis`

```ts
import { TimeScaleModel, ScrollAxis } from 'freegantt';

const scale = new TimeScaleModel({ preset: 'weekAndMonth', range: 'fitDataset' });
const scroll = { x: new ScrollAxis(), y: new ScrollAxis() }; // a `ScrollAxes` — either key is optional

const gantt = new Gantt({ container, dataset, scale, scroll });
```

Pass the **same** `TimeScaleModel` to two `Gantt` instances to share the time axis, and the same
`ScrollAxis` under `x` and/or `y` to share that scroll direction (D9). One axis alone is legal:
`{ x }` syncs the timelines and leaves each Gantt its own vertical scroll. Omit both and the Gantt
builds private defaults — a single Gantt never has to meet the concept.

On `Gantt` directly (when no shared `scale` is passed): `preset`, `range`, `fit`, `zoomIn`/`zoomOut`,
`zoomPresets`, `panToDate`, `panToToday`, and `navigationChange`. Supplying `scale` alongside
`preset`/`range`/`fit` is a type error — set axis intent on the shared model instead.

### `Gantt`

```ts
import { Gantt, ScrollAxis } from 'freegantt';

const gantt = new Gantt({
  container: element, // HTMLElement or CSS selector
  dataset,
  preset: 'weekAndMonth', // or a shared `scale: TimeScaleModel` — one arm or the other, never both
  range: 'fitDataset', // or { start, end } — InstantInput
  scroll: { x: new ScrollAxis(), y: new ScrollAxis() }, // optional ScrollAxes — either key on its own is legal
  gridColumns: ['name', 'start', 'duration'],
  rowSource: { source: 'entries', tree: true },
  theme: 'auto', // 'light' | 'dark'
  todayLine: true,
  locale: 'de-DE',
  capabilities: { move: true, resize: (entry) => !entry.hasChildren }, // a Capabilities rule
  viewportGestures: { wheelZoom: true },
});

gantt.destroy();
```

Mounts a Gantt into `container`: a grid pane (configurable columns), a splitter, and a timeline pane
with header bands and bars. Row height comes from `--fg-row-height` (default 36px). Two `Gantt`
instances on one page are fully independent (I2); two given the same `scale`/`scroll` x-sync (D9).

Every config key is a live property — assign `gantt.preset`, `gantt.gridColumns`, `gantt.rowSource`,
and so on without remounting.

### Selection (S3)

Selection is **Gantt state**, not **Dataset** state — two `Gantt` instances on one `Dataset` can
hold different selections. The Selection holds Entry ids (ADR 0010, ADR 0025) — the `Segment` type retired in
#421, and with it `selectedSegmentIds`. The library exposes it two ways, and the suffix says which
one you get: entry ids, or `Entry` records.

| Getter                   | Type                 | Writable                           | What it is                                        |
| ------------------------ | -------------------- | ---------------------------------- | ------------------------------------------------- |
| `gantt.selectedEntryIds` | `readonly EntryId[]` | yes (`gantt.selectedEntryIds = …`) | Which Entry ids are selected, in row order        |
| `gantt.selectedEntries`  | `readonly Entry[]`   | no                                 | The bound dataset's `Entry` records for those ids |

A click in the grid pane selects every Entry the row owns — one for an ordinary row, several for a
segmented row (`childrenAsSegments`). A click on a bar in the timeline selects only the Entry that bar
belongs to.

Assign **`selectedEntryIds`** to **set** the selection (click parity: assignment runs
`beforeSelectionChange` → `selectionChange` and opens no transaction).

Use **`selectedEntries`** when you need entry **fields** — `name`, `start`, `end`, and so on — for
a toolbar, bulk rename, or any "act on the selected rows" control:

```ts
gantt.on('selectionChange', () => {
  const names = gantt.selectedEntries.map((entry) => entry.name);
  selectionLabel.textContent = names.join(', ');
});

renameBtn.addEventListener('click', () => {
  dataset.transaction(() => {
    for (const entry of gantt.selectedEntries) {
      dataset.entries.update(entry.id, { name: input.value });
    }
  });
});
```

`selectedEntries` re-reads the store on every access, so field edits show up without a selection
change. It keeps Selection order and **skips** ids that no longer exist — for example after
`dataset.entries.remove` left a stale id behind in `selectedEntryIds`. To change which entries are
selected, assign `selectedEntryIds`; `selectedEntries` is read-only.

`selectionDataset` was not used: **`Dataset`** is already the name of the entry store (`new
Dataset({ … })`), so a getter named `selectionDataset` reads like a second `Dataset` instance rather
than a list of `Entry` records.

### Dragging bars and snapping (S3)

A pointer drag on a `move`-capable bar previews at full pixel resolution — the grabbed spot on the
bar tracks the cursor with no drift — and snaps only the value it writes on release, so the visible
motion is always smooth even when the committed `start`/`end` lands on a calendar boundary.

Where a drag snaps to comes from `gantt.snap`, live-reconfigurable and independent of the active
`ViewPreset` — it survives a zoom on its own, and a caller who states nothing gets `'none'`: free,
unsnapped dragging.

```ts
import { nextTickBoundary } from 'freegantt';

gantt.snap = 'none'; // default: free placement, no snapping at all
gantt.snap = 'tick'; // whatever the showing preset's own tick is
gantt.snap = { unit: 'hour', increment: 2 }; // every 2 hours, anchored on the calendar (#489)
gantt.snap = (zone, at) => nextTickBoundary(zone, at, { unit: 'hour', increment: 6 }); // a custom SnapRule
```

Holding **Alt** during a drag suspends snapping for that one gesture, regardless of the configured
`snap` — useful for fine placement without changing it. The harness (`harness/generic.html`) has a
"Snap" control (Tick / Off / Hour / Day / Week) wired to this same `gantt.snap` assignment — try it
against a live drag at `pnpm dev`.

## Plugins

`docs/06-plugin-authoring.md` covers both plugin contracts (`ChromePlugin`, `DataPlugin`), every
registration seam, and the errors an author meets. `tooltips()`, `contextMenu()`, `inlineEditing()`,
and `timeShading()` ship as built-in plugins; installing none of them keeps them out of a consumer's
bundle.

```ts
import { Gantt, tooltips, contextMenu } from 'freegantt';

const gantt = new Gantt({ container, dataset, plugins: [tooltips(), contextMenu()] });
```

### Decorations — painting behind or over the bars

A decoration is a band the timeline paints that is not an Entry: a weekend (`timeShading()`, a
shipped built-in — see `docs/06-plugin-authoring.md`), a highlighted row, a freeze window. A plugin
registers a provider, and the library calls it with the visible window each time that window
changes.

```ts
import { definePlugin } from 'freegantt';

function overBudgetRows(threshold: number) {
  return definePlugin({
    id: 'demo.overBudgetRows',
    view(ctx) {
      ctx.view.registerDecoration('underBars', ({ rows }) =>
        rows
          .filter((row) => {
            const entryId = row.entryIds[0];
            if (entryId === undefined) return false;
            const cost = ctx.dataset.entries.get(entryId)?.read('cost');
            return typeof cost === 'number' && cost > threshold;
          })
          .map((row) => ({ kind: 'rowStripe' as const, rowId: row.id })),
      );
    },
  });
}

export { overBudgetRows };
```

Three things make this work, and they are the whole contract:

- **A provider states time or rows, never pixels.** A `rangeBand` names `Instant`s; the library
  converts them through the bound `TimeScale`. That is what lets two Gantts share one axis without a
  provider knowing.
- **`ctx` answers what the window is.** `rows` are the rows in view, `span` is the visible time range
  (already widened by overscan), `time` is zone-bound date maths, and `tickUnit`/`tickIncrement` say
  what one tick column stands for — so a provider that only makes sense at some granularity can
  return nothing at the others.
- **`class` is how it gets its paint.** It lands on the node beside the library's own `.fg-row-stripe`
  or `.fg-range-band`, so a consumer styles it in CSS. The library never invents a colour for you.

`'underBars'` paints below the bar layer, `'overBars'` above it. The other input kind is
`{ kind: 'rangeBand', start, end, class }`, for shading a date range rather than a whole row —
`timeShading()` is the shipped example. Registration is retracted with the plugin —
`ctx.disposables` already holds it, so there is no disposer to return.

A worked example lives in `harness/plugins/over-budget-rows.ts`, written against the public entry
point only. `docs/06-plugin-authoring.md` has the full contract.

## Events

Gantt events (`entryMove`, `selectionChange`, `collapseChange`, `navigationChange`, …) fire on the
`Gantt`. Data events (`change`, `beforeChange`) fire on the `Dataset`. Every mutating interaction has
a cancelable `before*` pair where veto applies.

### Talking to a server

Two shapes, and they answer different questions.

| You want                                           | Door                                      | What the user sees                                                           |
| -------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| The server is **told** the move happened           | `entryMove`, or `change` on the `Dataset` | Nothing waits. The bar stays where the user dropped it                       |
| The server **decides** whether the move is allowed | `beforeEntryMove` returning a `Promise`   | The bar holds at the drop point, dimmed and dotted, until the answer arrives |

Pick the first unless the server can genuinely refuse.

```ts
import { invertChangeSet } from 'freegantt';

dataset.on('change', ({ changeSet }) => {
  if (changeSet.origin !== 'user') return; // do not re-post an undo or a rollback
  void api.save(changeSet).catch(() => {
    dataset.replay(invertChangeSet(changeSet)); // reverse this one, not the last one
  });
});
```

Nothing blocks the thread either way. `beforeEntryMove`, `beforeEntryResize` and `beforeEntryEdit`
may return `Promise<void | false>` (D-S3-17). Every other event is sync-only, `beforeChange`
included: a data commit has nothing to suspend into, so the async door stays where the gestures are.

While such a `Promise` is unsettled, the Gantt arms no new move or resize, and keyboard editing
refuses with it. Scrolling, selection and column drags keep working. So does every write through
`dataset.entries.update()` — which is why a stale draft is possible; see below.

Two open defects sit on that door. A handler that never settles holds the gesture forever
([#272](https://github.com/Pawel-IT/FreeGantt/issues/272)), so race your own timeout for now. A
commit that lands during the wait leaves the held draft stale
([#273](https://github.com/Pawel-IT/FreeGantt/issues/273)).

## Styling and theming

`Gantt` injects its own default stylesheet once per `document` (`<style data-freegantt-styles>`),
so nothing renders unstyled. A consumer never edits that stylesheet — instead, override the CSS custom
properties it defines, in the consumer app's own `.css`:

```css
/* consumer app's own stylesheet — no build step, no TypeScript */
:root {
  --fg-bar-fill: #2563eb;
  --fg-header-bg: #ffffff;
}
```

The full set of overridable tokens (`--fg-pane-bg`, `--fg-header-bg`, `--fg-bar-fill`,
`--fg-warn`, `--fg-indent-width`, and so on) is listed in `src/view/styles.ts`. Any selector the library renders
(`.fg-bar`, `.fg-row`, `.fg-header`, …) can also be targeted directly for changes a token doesn't
cover.

### Light and dark mode

The base stylesheet ships both a light token set (on `:root`) and a dark token set, applied two
ways:

- **Automatic:** a `prefers-color-scheme: dark` media query supplies the dark tokens whenever the
  consumer page hasn't set `data-fg-theme`, so a `Gantt` follows the OS/browser preference with no
  extra wiring.
- **Explicit:** setting `data-fg-theme="dark"` (or `"light"`) on an ancestor element — typically
  `<html>` or the `Gantt`'s `container` — pins the theme regardless of `prefers-color-scheme`.

To customize dark mode instead of just light mode, scope the override to the dark selector(s):

```css
:root {
  --fg-bar-fill: #2563eb; /* light mode */
}
[data-fg-theme='dark'] {
  --fg-bar-fill: #60a5fa; /* explicit dark mode */
}
@media (prefers-color-scheme: dark) {
  :root:not([data-fg-theme]) {
    --fg-bar-fill: #60a5fa; /* OS-preference dark mode */
  }
}
```

## Further reading

| Doc                               | Audience                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `docs/05-consumer-api.md`         | Consumer API index                                                              |
| `CONTEXT.md`                      | Glossary (Entry, Field, Row, Row source, Rollup, …)                             |
| `etc/freegantt.api.md`            | Generated TypeScript export report (api-extractor)                              |
| `docs/09-integration-pitfalls.md` | Integration traps — theme, zoom notification, overscan, row click               |
| `docs/06-plugin-authoring.md`     | Plugin authoring guide — `ChromePlugin`, `DataPlugin`, every registration seam  |
| `pnpm docs`                       | Docs site from `freegantt/docs`, run against this checkout's `docs/` and `src/` |

## Development

```
pnpm install
pnpm dev        # harness at http://localhost:5173
pnpm verify:full # the gate: everything below, then Playwright against the harness
pnpm verify      # the browser-free chain — on its own it cannot see e2e/
pnpm test:e2e    # Playwright against the harness, on its own
pnpm open-pr     # push the branch, open a draft pull request (docs/04 §5.2)
```

`pnpm verify:full` is the one command every caller runs: you, `.githooks/pre-push`, and CI. Its last
line is the verdict — quote that, never an exit code (`docs/04` §3.2). CI runs it in one job, on any
pull request that is ready for review; a draft runs nothing, so `pnpm open-pr --ready` is what starts it.

### `isDevMode()` is a library-build flag, not a consumer's

`src/data/dev-mode.ts` reads `import.meta.env.DEV`. Vite resolves that constant when **this repo**
builds `dist/`, not when a consumer builds their app. It bakes to `false`, and Rollup then drops
every `if (isDevMode())` branch from the shipped bundle.

The built output shows it. `src/render/dom/index.ts:81`'s "falling back to the default output"
message sits behind the guard and appears **zero** times in `dist/api/index.js`. The two disposer
`console.error` calls that carry no guard both survive. Three `console.` calls reach the bundle in
total.

So `isDevMode()` is true in exactly one place: this repo's own harness, running from source through
`pnpm dev`. It is a **library-development** flag. It is not a consumer-environment flag, and a
consumer's own dev server never turns it on.

Two consequences for anyone adding a call site:

- Use it for an assertion that helps **us** develop the library. That is what the existing sites
  read as.
- Never use it to give a consumer different behaviour in their dev and their production. One `dist/`
  serves everyone, and their mode is invisible when we build it. `docs/adr/0009` records the three
  mechanisms that _can_ see a consumer's mode, and why this project rejects all three.

**Not yet audited:** thirteen further `isDevMode()` call sites exist in `src/` — `data/transaction.ts`,
`data/build-commit-change-set.ts`, `data/serialization/`, `extensions/plugin-runtime.ts`,
`view/plugin-ports.ts` and `view/gantt-shell.ts`. Each is dead-code-eliminated from `dist/` the same
way. The ones read so far are genuine library-development assertions, which is the correct use. None
has been checked against the question "was this written expecting a _consumer's_ dev build to reach
it?" Parked here until it gets its own issue.

The dev harness (`harness/`) is the library's first consumer. Open `http://localhost:5173` after
`pnpm dev`. Five demo pages share one nav and one theme picker (Auto, Light, Dark, Paper):

- **Planner** (`index.html`) — the featured demo: a full design on the public surface, in four themes.
- **Generic demo** (`generic.html`) — the smallest setup, with a bench of harness controls.
- **Editing & data** (`editing-and-data.html`) — gestures, mutation, undo, vetoes, plugins, JSON.
- **Hierarchy & timeline** (`hierarchy-and-timeline.html`) — tree rows, roll-ups, zoom, date lines.
- **Performance** (`performance.html`) — 50,000 entries.

Each page lists the features it shows above the chart. The pages under `harness/e2e/` are Playwright
fixtures, not demos; the nav does not link them.
