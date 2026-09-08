# FreeGantt

Framework-free TypeScript Gantt/timeline library. Library-first: the API, docs, and packaging are
designed for external consumers from day one. See `plans/00-overview.md` for the full spec,
`plans/03-slices.md` for the delivery roadmap, and `docs/05-consumer-api.md` for a consumer API index;
this file documents the public surface as it lands, slice by slice.

**Status:** pre-release, slice **S4** in progress (hierarchy, fields, row sources — see `plans/03-slices.md`).
The public API below reflects what ships on this branch; names and options may still change until S4
closes. The full, defended spec is `plans/02-public-api.md`; `CONTEXT.md` is the glossary.

## Quick start

Minimal example: put a small, fixed set of entries into a `Gantt`.

```ts
import { Gantt, Dataset } from 'freegantt';

const dataset = new Dataset({
  timeZone: 'America/Chicago', // IANA zone; required — every date below is read through it (D6)
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
entries in a `Dataset` with the IANA `timeZone` they are written in, mount a `Gantt` on a container
element, and `gantt.destroy()` tears it down.

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
anything to undo/redo. Dependencies land in a later slice — see `plans/03-slices.md`.

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

### `dateOnlyEnd` — what a bare date on `end` means

Storage is half-open `[start, end)`, so `end` is the boundary _after_ the entry, not its last
moment. A consumer writing a bare date on `end` normally means the last day it wants included, so that
is the default reading:

```ts
new Dataset({
  timeZone: 'America/Chicago',
  dateOnlyEnd: 'inclusive', // the default
  entries: [{ id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-07' }],
});
// covers Sept 1 through Sept 7 — the stored end is the start of Sept 8
```

Set `dateOnlyEnd: 'exclusive'` to read a bare date literally instead, matching stored geometry
exactly:

```ts
new Dataset({
  timeZone: 'America/Chicago',
  dateOnlyEnd: 'exclusive',
  entries: [{ id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' }],
});
// covers Sept 1 through Sept 7 — the stored end is the start of Sept 8
```

The rule applies **only to a date-only string on an `end` field** (entry ends and segment ends). An
`end` that already carries a time of day, a `Date`, epoch milliseconds, or an `Instant` is a
boundary already and is read literally under either setting. `start` is never adjusted.

## Public API

Everything importable by a consumer lives under `src/api/` and `src/model/` (types only). Internal
layers (`time/`, `data/`, `scheduling/`, `layout/`, `render/`, `view/`) are not part of the public
surface. The authoritative design doc is `plans/02-public-api.md`.

### `Dataset`

```ts
import { Dataset } from 'freegantt';

const dataset = new Dataset({
  entries, // readonly EntryInput[] — see "Dates and ids a consumer can write"
  timeZone, // IANA zone, required (D6)
  dateOnlyEnd, // optional, 'inclusive' (default) | 'exclusive'
  rollUpKinds: ['group'], // default; 'none' keeps caller-assigned parent values
  hierarchy: { autoGroup: true }, // default; first child promotes parent to kind 'group'
  fieldTypes: { money: { rollUp: 'sum', formatValue: asCurrency, column: { align: 'end' } } },
  fields: [{ key: 'cost', type: 'money' }, { key: 'team' }],
});

dataset.entries.all; // readonly Entry[] — ids branded, dates resolved to Instant
dataset.entries.childrenOf('p1'); // direct children in store order

dataset.entries.add({ id: 't9', name: 'Roofing', start: '2026-10-01', end: '2026-10-15' });
dataset.entries.update('t2', { name: 'Framing — north wing', cost: 12_000 });
dataset.entries.remove('t9'); // and every descendant, in the same changeset
dataset.entries.fieldValue('t2', 'cost'); // reads through the Field registry

dataset.field('cost'); // resolved Field | undefined
dataset.fields.all; // every declared Field, core included

dataset.transaction(() => {
  /* several entries.add/update/remove calls, one changeset */
});

dataset.on('beforeChange', ({ changeSet }) => false); // veto — throws MutationCancelledError
dataset.on('change', ({ changeSet }) => {
  /* changeSet.added / .removed / .updated — a bound Gantt reacts to this itself */
});

dataset.undo(); // origin: 'undo' on the change event it emits
dataset.redo(); // origin: 'redo'
dataset.canUndo;
dataset.canRedo;

const doc = dataset.toJSON(); // schema: 2
const copy = Dataset.fromJSON(doc, { aggregators }); // function keys travel with the app

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

Dependencies land in slice S7 — see `plans/03-slices.md`.

### Fields and grid columns

**A field is what a value _is_; a grid column is where a Gantt _shows_ it.** Fields live on the
`Dataset`; grid columns live on the `Gantt` (`gridColumns`). A Field with a `column` declaration is
columnable; naming a non-columnable Field in `gridColumns` throws `FieldNotColumnableError`.

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
`{ source: 'entries', tree: false }`.

```ts
// Entries as a tree (parentId)
gantt.rowSource = { source: 'entries', tree: true };

// One header row per groupBy value
gantt.rowSource = { source: 'group', groupBy: (entry) => entry.meta.team };

// Consumer-supplied rows
gantt.rowSource = {
  source: 'custom',
  resolve: ({ entries }) => [{ id: 'a', entryIds: ['t1'] }],
};

// Sort, filter, and pack mode live on the row source (entries and group only)
gantt.rowSource = {
  source: 'entries',
  tree: true,
  heightMode: 'pack', // 'fixed' (default) stacks overlaps into lanes
  filter: (entry) => entry.meta.team === 'A',
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
gantt.on('collapseChange', ({ to }) => save(to));
```

For `{ source: 'entries' }`, a `RowId` equals the `EntryId`. Group headers use derived ids from the
`groupBy` value.

### `TimeScaleModel` and `ScrollModel`

```ts
import { TimeScaleModel, ScrollModel } from 'freegantt';

const scale = new TimeScaleModel({ preset: 'weekAndMonth', range: 'fitDataset' });
const scroll = new ScrollModel();

const gantt = new Gantt({ container, dataset, scale, scroll });
```

Pass the **same** `TimeScaleModel` and/or `ScrollModel` to two `Gantt` instances to x-sync them (D9).
Omit both and the Gantt builds private defaults — single-chart usage never has to meet the concept.

On `Gantt` directly (when no shared `scale` is passed): `preset`, `range`, `fit`, `zoomIn`/`zoomOut`,
`zoomPresets`, `panToDate`, `panToToday`, and `navigationChange`. Supplying `scale` alongside
`preset`/`range`/`fit` is a type error — set axis intent on the shared model instead.

### `Gantt`

```ts
import { Gantt } from 'freegantt';

const gantt = new Gantt({
  container: element, // HTMLElement or CSS selector
  dataset,
  scale, // optional TimeScaleModel — omit for a private default
  scroll, // optional ScrollModel
  preset: 'weekAndMonth', // when scale is omitted
  range: 'fitDataset', // or { start, end } — InstantInput
  gridColumns: ['name', 'start', 'duration'],
  rowSource: { source: 'entries', tree: true },
  theme: 'auto', // 'light' | 'dark'
  todayLine: true,
  locale: 'de-DE',
  interactions: { move: true, resize: (e) => e.kind !== 'group' },
  viewportGestures: { wheelZoom: true },
});

gantt.destroy();
```

Mounts a Gantt into `container`: a grid pane (configurable columns), a splitter, and a timeline pane
with header bands and bars. Row height comes from `--fg-row-height` (default 36px) unless
`heightMode: 'pack'` is set on the row source. Two `Gantt` instances on one page are fully
independent (I2); two given the same `scale`/`scroll` x-sync (D9).

Every config key is a live property — assign `gantt.preset`, `gantt.gridColumns`, `gantt.rowSource`,
and so on without remounting.

### Selection (S3)

Selection is **Gantt state**, not **Dataset** state — two `Gantt` instances on one `Dataset` can
hold different selections. The Selection holds Segments, not Entries. The library exposes it three
ways, and the suffix says which one you get: segment ids, entry ids, or `Entry` records.

| Getter                     | Type                   | Writable                             | What it is                                                        |
| -------------------------- | ---------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| `gantt.selectedSegmentIds` | `readonly SegmentId[]` | yes (`gantt.selectedSegmentIds = …`) | Which Segment ids are selected                                    |
| `gantt.selectedEntryIds`   | `readonly EntryId[]`   | no                                   | The Entry each selected Segment belongs to, deduped, in row order |
| `gantt.selectedEntries`    | `readonly Entry[]`     | no                                   | The bound dataset's `Entry` records for those ids                 |

A click in the grid pane selects every Segment of every Entry the row owns. A click on a bar in the timeline
selects only the Segment under the pointer. `selectedEntryIds` and `selectedEntries` cover both
cases without asking a reader to track which Segments made up the click.

Assign **`selectedSegmentIds`** to **set** the selection (click parity: assignment runs
`beforeSelectionChange` → `selectionChange` and opens no transaction). Read **`selectedEntryIds`**
when you only need which records are involved, not which Segments.

Use **`selectedEntries`** when you need entry **fields** — `name`, `start`, `end`, and so on — for
a toolbar, bulk rename, or any "act on the selected rows" control:

```ts
gantt.on('selectionChange', () => {
  const names = gantt.selectedEntries.map((entry) => entry.name);
  toolbar.textContent = names.join(', ');
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
`dataset.entries.remove` left a stale Segment behind in `selectedSegmentIds`. To change which
entries are selected, assign `selectedSegmentIds`; `selectedEntryIds` and `selectedEntries` are
read-only.

`selectionDataset` was not used: **`Dataset`** is already the name of the entry store (`new
Dataset({ … })`), so a getter named `selectionDataset` reads like a second `Dataset` instance rather
than a list of `Entry` records.

### Dragging bars and snapping (S3)

A pointer drag on a `move`-capable bar previews at full pixel resolution — the grabbed spot on the
bar tracks the cursor with no drift — and snaps only the value it writes on release, so the visible
motion is always smooth even when the committed `start`/`end` lands on a calendar boundary.

Where a drag snaps to comes from the active `ViewPreset`'s `snap` field, live-reconfigurable like
any other config:

```ts
gantt.preset = { ...gantt.preset, snap: 'none' }; // free placement, no snapping at all
gantt.preset = { ...gantt.preset, snap: 'tick' }; // default: whatever the preset's own tick is
gantt.preset = { ...gantt.preset, snap: { unit: 'hour', increment: 2 } }; // every 2 hours
```

Holding **Alt** during a drag suspends snapping for that one gesture, regardless of the configured
`snap` — useful for fine placement without changing the preset. The harness (`harness/index.html`)
has a "Snap" control (Auto / Off / Hour / Day / Week, plus an increment) wired to this same
`gantt.preset` assignment — try it against a live drag at `pnpm dev`.

## Plugins

`docs/06-plugin-authoring.md` covers both plugin contracts (`GanttPlugin`, `DatasetPlugin`), every
registration seam, and the errors an author meets. `tooltips()`, `contextMenu()`, and
`inlineEditing()` ship as built-in plugins; installing none of them keeps them out of a consumer's
bundle.

```ts
import { Gantt, tooltips, contextMenu } from 'freegantt';

const gantt = new Gantt({ container, dataset, plugins: [tooltips(), contextMenu()] });
```

### Decorations — painting behind or over the bars

A decoration is a band the timeline paints that is not an Entry: a weekend, a holiday, a freeze
window, a highlighted row. A plugin registers a provider, and the library calls it with the visible
window each time that window changes.

```ts
import type { GanttPlugin } from 'freegantt';

export function weekendShading(): GanttPlugin {
  return {
    id: 'demo.weekendShading',
    setup(ctx) {
      ctx.view.registerDecoration('underBars', ({ span, time, tickUnit, tickIncrement }) => {
        // Only where a reader can see individual days — a weekend is meaningless at month zoom.
        if (tickUnit !== 'day' || tickIncrement !== 1) return [];
        return time
          .eachDay(span)
          .filter((day) => time.dayOfWeek(day) === 6) // Saturday
          .map((saturday) => ({
            kind: 'rangeBand' as const,
            start: saturday,
            // One band for the whole weekend. Two adjacent one-day bands meet at a fractional
            // pixel, and the remainder shows through as a hairline splitting every stripe.
            end: time.addDays(saturday, 2),
            class: 'demo-weekend-band',
          }));
      });
    },
  };
}
```

Three things make this work, and they are the whole contract:

- **A provider states time, never pixels.** It returns `Instant`s; the library converts them through
  the bound `TimeScale`. That is what lets two Gantts share one axis without a provider knowing.
- **`ctx` answers what the window is.** `span` is the visible range (already widened by overscan),
  `rows` are the rows in it, `time` is zone-bound date maths, and `tickUnit`/`tickIncrement` say what
  one tick column stands for — so a provider that only makes sense at some granularity can return
  nothing at the others.
- **`class` is how it gets its paint.** It lands on the node beside the library's own
  `.fg-range-band`, so a consumer styles it in CSS. The library never invents a colour for you.

`'underBars'` paints below the bar layer, `'overBars'` above it. The other input kind is
`{ kind: 'rowStripe', rowId, class }`, for shading a row rather than a date range. Registration is
retracted with the plugin — `ctx.disposables` already holds it, so there is no disposer to return.

A worked example lives in `harness/plugins/weekend-shading.ts`, written against the public entry
point only. `docs/06-plugin-authoring.md` has the full contract.

## Events

Gantt events (`entryMove`, `selectionChange`, `collapseChange`, `navigationChange`, …) fire on the
`Gantt`. Data events (`change`, `beforeChange`) fire on the `Dataset`. Every mutating interaction has
a cancelable `before*` pair where veto applies — see `plans/02-public-api.md` §3 for the full table.

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
`--fg-warn`, `--fg-indent-width`, `--fg-lane-gap`, and so on) is listed in `plans/02-public-api.md`
§4.1 and `src/view/styles.ts`. Any selector the library renders
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

| Doc                           | Audience                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `plans/02-public-api.md`      | Full consumer API — events, errors, serialization, customization ladder          |
| `docs/05-consumer-api.md`     | Consumer API index and S4 surface summary                                        |
| `CONTEXT.md`                  | Glossary (Entry, Field, Row, Row source, Rollup, …)                              |
| `plans/03-slices.md`          | Delivery roadmap and acceptance criteria                                         |
| `etc/freegantt.api.md`        | Generated TypeScript export report (api-extractor)                               |
| `docs/06-plugin-authoring.md` | Plugin authoring guide — `GanttPlugin`, `DatasetPlugin`, every registration seam |
| `harness/docs/`               | Internal module maps for maintainers (may lag the current slice)                 |

## Development

```
pnpm install
pnpm dev        # harness at http://localhost:5173
pnpm verify:full # the gate: everything below, then Playwright against the harness
pnpm verify      # CI parity only — no browser, so it cannot see e2e/
pnpm test:e2e    # Playwright against the harness, on its own
```

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
`pnpm dev` — the main page demos tree rows, grid columns, field rollups, live `rowSource` switching,
selection, and timeline controls. `harness/data.html` demos transactions and undo. Every slice adds
to the harness; acceptance criteria live in `plans/03-slices.md`.
