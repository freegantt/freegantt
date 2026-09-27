# FreeGantt — Consumer API (index)

This file points app authors at the consumer surface. It does not replace the spec.

## Start here

| Document | What it is |
| --- | --- |
| [`README.md`](../README.md) | Quick start, dates/ids, and the API as it ships on the current branch |
| [`CONTEXT.md`](../CONTEXT.md) | Glossary — one word per concept (Entry, Field, Row, Row source, Rollup, …) |
| [`etc/freegantt.api.md`](../etc/freegantt.api.md) | Generated TypeScript export list (api-extractor); the same public surface is also browsable as generated API docs on the Docusaurus site (`pnpm docs`) |
| [`docs/09-integration-pitfalls.md`](09-integration-pitfalls.md) | Traps real integrators hit — theme and an application's `dark` class, the zoom notification, `overscan`, the row click |
| [`docs/06-plugin-authoring.md`](06-plugin-authoring.md) | Plugin authoring guide — `definePlugin`, the two halves, every registration seam |
| [`docs/07-row-source-updates.md`](07-row-source-updates.md) | Change one row-source setting and keep the rest — toolbar controls that do not fight each other |
| [`docs/12-grid-columns.md`](12-grid-columns.md) | Grid columns — a plain column object, and `createGridColumnHelper` to type a column renderer's `fieldValue` |
| [`docs/11-server-data.md`](11-server-data.md) | Polling a server with `entries.syncAll()` and `entries.syncChanges()` — the conflict rule, what undo/redo do across a sync, and what changes |

## What a Gantt shows

A Gantt is two panes on one set of rows. The **Grid pane** is on the left. The **Timeline pane** is on the right.

A **Grid column** is one vertical slice of the Grid pane. It names a Field and carries presentation only — header, width, order. Declaring a Field does not put it on the Grid pane. A Grid column on the Gantt does that.

The Timeline pane paints **Bars** on a time scale. A bar is paint, not identity (`CONTEXT.md`). Item is a retired word for Bar. The time axis is not a column. The whole view is a **Gantt**. Chart is a retired word.

## Undo, redo, and the `change` event

Undo and redo are ordinary commits. `dataset.undo()` and `dataset.redo()` return nothing; what
they did arrives on `dataset.on('change')` — the same channel a user edit uses — tagged
`origin: 'undo'` or `'redo'`.

```ts
import { Dataset, fieldRowsOf } from 'freegantt';

const dataset = new Dataset<{ cost: number }>({
  timeZone: 'Europe/Warsaw',
  entries: [ /* … */ ],
  fields: [{ key: 'cost', type: 'number' }], // `cost` is written below, so it is declared here
});

dataset.on('beforeChange', ({ changeSet }) => {
  if (changeSet.origin === 'undo' && !confirm('Undo this step?')) return false;
  // a refused undo throws MutationCancelledError and leaves history where it was
});

dataset.on('change', ({ changeSet }) => {
  if (changeSet.origin === 'user') return; // a user edit, not an undo/redo
  const verb = changeSet.origin === 'undo' ? 'undid' : 'redid';

  for (const row of fieldRowsOf(changeSet)) {
    // row: { store: 'entries', id, field, from, to }
    // on undo, `from` is the value the undo replaced, `to` is the value it wrote back
    console.log(`${verb} ${String(row.id)} ${row.field}: ${row.from} -> ${row.to}`);
  }
  // changeSet.added / changeSet.removed carry the entries an undo restored or a redo removed
});

dataset.entries.update('t1', { cost: 200 }); // origin 'user'
dataset.undo(); // origin 'undo', cost 200 -> 500
dataset.redo(); // origin 'redo', cost 500 -> 200
```

`historyChange` fires whenever `canUndo` or `canRedo` changes, so one handler can drive a
toolbar. The payload carries both answers:

<!-- doc-example-setup
// What the examples below stand on: a Dataset, a Gantt, and the app's own toolbar.
declare const dataset: import('freegantt').Dataset;
declare const gantt: import('freegantt').Gantt;
declare const undoButton: HTMLButtonElement;
declare const redoButton: HTMLButtonElement;
declare const isDark: boolean;
-->

```ts
dataset.on('historyChange', ({ canUndo, canRedo }) => {
  undoButton.disabled = !canUndo;
  redoButton.disabled = !canRedo;
});
```

Use `historyChange`, not `change`, for these buttons. After a sync, one `undo()` or `redo()` click
can find that every remaining step has nothing left to write. It then forgets those steps, writes
nothing, and fires no `change`. `historyChange` still fires, because `canUndo` changed.

`historyChange` fires only when one of the two answers changes. A second edit in a row fires
nothing, because `canUndo` was already `true`. A handler may not write, the same as a `change`
handler. Under `history: false` it never fires.

`updated` also carries plugin-store rows (`store: 'plugin:…'`, whole-value, no `field` key).
`fieldRowsOf(changeSet)` filters to Field rows.

### Undo after a sync

`entries.syncAll()` (a poll against a server list) and `entries.syncChanges()` (a poll against a
server delta) record no undo step of their own — the user's own earlier edits stay undoable across
a poll. An undo never writes over a value a sync brought in: when a sync changed a Field an undo
step wrote, that entry keeps the sync's values. See [`docs/11-server-data.md`](11-server-data.md)
for the full set of rules a poll needs.

### Advanced: your own History with `dataset.replay()`

Most apps call `undo()` and `redo()` and never touch this. Reach for `dataset.replay()` only when
the app keeps its own undo stack outside the library — one stack per user, a stack a server keeps,
or an undo rule the library does not ship.

Construct the Dataset with `history: false` first. The library then keeps no stack of its own:
`canUndo` and `canRedo` always read `false`, `undo()` and `redo()` do nothing, and the Gantt's own
Undo and Redo commands turn off. Mod+Z is then free for the app's own undo.

`replay(changeSet)` is the write `undo()` and `redo()` use. It writes the `ChangeSet` you give it.
It keeps no stack of its own and moves no cursor.

`changeSet.origin` must be `'undo'` or `'redo'`. `'user'` throws `InvalidReplayOriginError`.

`replay()` writes onto the store's **current** values, not the recorded ones. A row a sync has
already settled since the step was recorded writes nothing; the rest of the changeset still lands.
A row for a key no Field declares writes nothing. An entry a foreign write changed keeps its current
values. Pass
`{ overwriteForeignWrites: true }` to write the step over them instead. See
[`docs/11-server-data.md`](11-server-data.md) for the full set of rules a sync needs.

`replay()` renumbers every sibling group it touches, and re-rolls every parent it touches, the same
way an ordinary commit does. No extension hook runs.

A step with nothing left to write fires no event. Otherwise `beforeChange` fires, then `change`. A
veto throws `MutationCancelledError` and writes nothing.

<!-- doc-example-setup
declare const undoButton: HTMLButtonElement;
-->

```ts
import { invertChangeSet, type ChangeSet } from 'freegantt';

// A minimal History on a Dataset built with `history: false`: record every 'user' step, and undo
// the last one on a click.
const undoStack: ChangeSet[] = [];

dataset.on('change', ({ changeSet }) => {
  if (changeSet.origin === 'user') undoStack.push(changeSet);
});

undoButton.addEventListener('click', () => {
  const step = undoStack.pop();
  if (step !== undefined) dataset.replay(invertChangeSet(step));
});
```

## Hierarchy and rows

### Sibling order

`siblingIndex` is a core Field: an entry's rank among the entries that share its group (its parent,
or its group under a plugin `hierarchySource`). `entries.add()` and `entries.update()` write it —
name a target index, or name none and the entry goes to the end of its group. Every sibling the move
passes renumbers around it in the same commit.

```ts
import { Dataset } from 'freegantt';

const dataset = new Dataset({
  timeZone: 'Europe/Warsaw',
  entries: [
    { id: 'foundation', parentId: 'house' },
    { id: 'framing', parentId: 'house' },
    { id: 'roofing', parentId: 'house' },
    { id: 'house' },
  ],
});

// moves "roofing" to the front of its group — "foundation" and "framing" shift down by one
dataset.entries.update('roofing', { siblingIndex: 0 });
```

### Dataset

- `fields`, `fieldTypes`, `aggregators` — declare consumer Fields beside core's. `{ key: 'due', type: 'date' }` names a shipped type with no local `fieldTypes` entry. Core Fields name those types (`name` is `text`, `start`/`end` are `date`, `duration` is `duration`). `currency({ code: 'EUR' })` is a factory, not a seeded name: `{ key: 'cost', type: currency({ code: 'EUR' }), rollUp: 'sum' }`. A core Field's key cannot be redeclared (`IllegalCoreFieldOverrideError`) — but every core Field takes a consumer override on `editable` and `formatValue`, and on `rollUp` too where the core Field declares one of its own (`start`, `end`). Type name `date` is replaceable at construction via `fieldTypes` — that door is construction-only.
- A parent rolls up because it has children. An Entry carries no stored classification, so nothing opts a row in or out by kind.
- `entries.get(id)?.read(key)`, `dataset.field(key)`, `dataset.fields.all` — `read` is the one value door
- `locale` — this Dataset's own locale (#583), fixed at construction, the same as `timeZone`. `dataset.locale` reads it back. Omit it to let each caller name its own, or fall back further to the runtime's own.
- `dataset.formatFieldValue(entry, key, locale?)` — a Field's shown text, with no Gantt. See "A Field's text outside the grid" below.
- `plugins` — a plugin with a `data` half installs here

### The duration Field

`duration` is a core computed Field. Its value is a `Duration`, `{ value, unit: 'millisecond' }` —
the row's own `end - start`. It is `undefined` until the row has both dates.

A parent's `start` and `end` roll up (`min`, `max`), so a parent's duration spans its children, and
the gaps between them count.

Read it like any Field: `entry.read('duration')` on a row, `ctx.read('duration')` in a computed
Field, `ctx.values('duration')` in an Aggregator.

Its text comes from the `duration` type: whole calendar days in the Dataset's zone (`12 d`), else
one decimal. Override `formatValue` as on `start` or `end`. It takes no `editable` and no `rollUp`,
because a computed Field has no stored home.

Core declares it with the shape you use for your own computed Field:

```ts
import { diffMs, spansTime, type Duration, type Field } from 'freegantt';

// What core declares. Your own computed Field takes the same shape under your own key.
const duration: Field = {
  key: 'duration',
  type: 'duration',
  compute: (entry): Duration | undefined =>
    spansTime(entry) ? { value: diffMs(entry.end, entry.start), unit: 'millisecond' } : undefined,
  column: { header: 'Duration', align: 'end', width: 100 },
};
```

Set a formatter through `fields`, on the `Dataset`, the same way you would on `start` or `end`:

```ts
import { Dataset, MS, type Duration } from 'freegantt';

new Dataset({
  entries: [ /* … */ ],
  fields: [
    // Duration shows hours, not days.
    { key: 'duration', formatValue: (value: Duration | undefined) => (value === undefined ? '' : `${value.value / MS.HOUR} h`) },
  ],
});
```

### A Field that sums its children

`compute` runs on every row, a parent included. `ctx.hasChildren` and `ctx.leaves` read the tree. A
`compute` Field can use them to sum its children's own values:

```ts
import { diffMs, spansTime, type Duration, type Field } from 'freegantt';

const work: Field<Duration> = {
  key: 'work',
  type: 'duration',
  compute: (entry, ctx): Duration | undefined => {
    const rows = ctx.hasChildren(entry) ? ctx.leaves(entry) : [entry];
    const spans = rows.filter(spansTime);
    return spans.length === 0
      ? undefined
      : { value: spans.reduce((ms, row) => ms + diffMs(row.end, row.start), 0), unit: 'millisecond' };
  },
};
```

A leaf answers its own span. A parent answers the sum of its leaves' spans, so the gaps between them
do not count. `duration` answers a different question: its parent value spans the whole envelope of
its children, gaps included. The value is never stored. There is no `ChangeSet` row for it, and
`editable` is refused — the same rule every computed Field follows.

A stored Field takes a shorter route to the same shape. `sum`, `min` and `max` also fold `Duration`
values, so a stored Field takes `rollUp: 'sum' | 'min' | 'max'`. `{ key: 'effort', type: 'duration',
rollUp: 'sum' }` fills a parent's cell from its children's stored `effort`, with no `compute` to
write.

### Gantt

- `gridColumns` — which Fields this view shows, in order. `columnRenderer` stays on the column. `createGridColumnHelper(dataset)` types a renderer's `fieldValue` from the column's key — see [`docs/12-grid-columns.md`](12-grid-columns.md). `meter()` and `image()` are the shipped column renderers; default alt is the Field's formatted value, and `{ alt: 'Logo' }` is a static override for a column that is one picture. Store a URL; let `formatValue` return the caption so alt (and tooltip) speak the name, not the URL.
- Grid columns are fixed-width. A column takes its own `width`, else its Field's `column.width`, else `--fg-column-width` (120). When the set outgrows the grid pane, the pane scrolls horizontally to reach it. Give a column `flex` instead to have it share the pane's leftover room.
- The grid pane never sits wider than its columns — a splitter drag stops at the last column's edge, and a `gridWidth` past it is capped to it. Narrower is always fine: the columns overflow and the pane scrolls. A `flex` column lifts the cap, since it has no fixed edge.
- `gridWidth: 'fitColumns'` — size the grid pane to its columns and keep it there, instead of hand-computing the number. Live, and re-measured whenever the columns change. Reads back in px. A Splitter drag ends it; a `flex` column leaves nothing to fit, so the pane keeps the width it has.
- `gridResizable: false` — lock the grid pane: the splitter no longer drags and shows no resize cursor, and no column paints a resizer grip, whatever its own `resizable` says. Default `true`. Live. Locks the gesture, not the value — `gantt.gridWidth = 240` and `gantt.gridColumns = […]` still write. Neither `beforeGridWidthChange` nor `beforeGridColumnsChange` fires for a gesture that can no longer arm — this is what keeps a `gridWidth: 'fitColumns'` pane from turning into a fixed px width on a stray drag.
- `fit` — how dense the time axis is. `'pane'` (default) fills the measured pane with the whole range; `'preset'` uses the showing preset's own density and ignores the pane; `{ unit: 'day', widthPx: 14 }` paints one day 14px wide; a bare `number` is pixels per millisecond, what `zoomTo`/`zoomBy` write. Live, on a `Gantt` and on a `TimeScaleModel` alike.
- Reach for the `{ unit, widthPx }` form whenever the sentence you have is "a day tile is 14 pixels". Writing that as a number means `14 / 86_400_000`, which claims every day is 24 hours — false in any zone that observes DST, and false for a month or a year in every zone. The library resolves the real length through the dataset's zone, so you never own that arithmetic. `increment` defaults to 1: `{ unit: 'week', increment: 2, widthPx: 90 }` reads "a fortnight is 90 pixels". One density spans the whole scale, so the stated width lands on the unit at the range start and each later unit follows its own calendar length — a 23-hour day paints narrower than the days beside it. The preset's `minTickWidthPx` floor still applies, so a page that wants tiles below the shipped floor brings its own preset (`harness/e2e/bar-label-fit.ts`).
- `overscan` — the culling buffer around the visible window: `verticalRows` whole rows above and below, `horizontalPx` px left and right. Live. Default `{ verticalRows: 2, horizontalPx: 128 }`.
- `rowSource` — what rows are (`entries` tree, `group` by value, or `custom` resolve). Reads back
  resolved, and one setting changes by spreading that value — see
  [Row source updates](07-row-source-updates.md).
- `rowSource.filter` and `groupBy` take the `Entry` alone, and read a value off it: `(entry) => entry.read('team') === 'Blue'`. `sort.compare(a, b, fields)` compares two *values* of `sort.field`, not two Entries, and its third argument is a `FieldContext` — the dataset `timeZone`, for a comparer that needs the zone to read a date.
- `collapsed`, `collapse()`, `expand()`, `toggleCollapse()`, `collapseAll()`, `expandAll()`, `collapseStateOf(id)` — per-Gantt view state; `collapseStateOf` reads back `'collapsed' | 'expanded' | 'leaf' | undefined`
- Events: `beforeCollapseChange` / `collapseChange`
- `scroll` — pass the same `ScrollAxis` instances (`{ x?, y? }`) into a new `Gantt` after `destroy()` so pane scroll survives remount (for example after the app rebuilds the Dataset). Do not copy `scrollTop` off the pane.
- `variants` — the rules this Gantt paints rows with; `bar()`, `summary()`, `diamond()` are core's own shipped looks.
- `gantt.variantFor(entry): ResolvedVariant` — the whole variant this Gantt resolved for one row, never `entry.variant`: an Entry belongs to a `Dataset`, a variant resolves per Gantt, and two Gantts on one Dataset may answer differently for the same row.

### Formatters

A Formatter is `(value, ctx: FormatContext) => string` — a Field's `formatValue` takes the same
shape plus the row it came from: `(value, ctx, entry) => string`. `ctx` carries the zone and the
locale; a Formatter never reads either off the Dataset or the Gantt directly. A missing value
gives `''`, never `'undefined'` and never a throw. A Formatter that needs options — `dateFormatter`
below, `currency({ code })` — is built by a factory, so the call site never carries options: build
it once, then hand the returned function to `formatValue`.

### Dates: `formatDateTime`, `formatInclusiveDate`, `lastCoveredInstant`

Storage is half-open: `end` is the boundary *after* the span, not its last moment. A date-only
`end` you write — `'2026-09-08'` — always means "through that day": it stores the start of the
9th. Pass a timed string, such as `'2026-09-09T00:00:00'`, for an exclusive end instead.

Two Field formatters ship for display, both plain `formatValue` functions with the signature
`(value, ctx, entry) => string`:

- **`formatDateTime`** — a Field's `formatValue`: the stored moment, date and clock time. This is
  the `date` type's default formatter.
- **`formatInclusiveDate`** — a Field's `formatValue`: the last day a span covers, date only. It
  reads `entry.start` and the value it is given for `end`, so it works on `start` too. Core `end`
  sets this as its default formatter.

`formatDate(value, ctx)` is a Formatter itself, date only — `ctx` is a `FormatContext`, the
`timeZone`/`locale` pair the Gantt builds. `formatDateTime` is built the same way, from
`dateFormatter` with date-and-time `Intl.DateTimeFormatOptions`. To show other fields, build a Formatter once with
**`dateFormatter(options)`**, any `Intl.DateTimeFormatOptions` — it is the general-purpose helper
`formatDate` and `formatDateTime` both build on. Build it once, outside a `formatValue`: the
returned function is a stable reference, so the shared `Intl.DateTimeFormat` cache reuses it.

**`lastCoveredInstant({ start?, end })`** — the instant `formatInclusiveDate` builds on: `end`
stepped back one millisecond, unless the span is zero-length (`end === start`), which answers its
own `end` unchanged. Reach for it directly when you format an end yourself, outside a Field.

A zero-length span (a milestone, `end === start`) shows its own moment unchanged — `end` names no
day to step back from. `formatInclusiveDate` and `lastCoveredInstant` both take a missing `start`;
they still step `end` back one millisecond and show the day that lands on.

Set either formatter on `start` or `end` like any other Field override:

```ts
import { Dataset, formatDateTime } from 'freegantt';

new Dataset({
  timeZone: 'Europe/Warsaw',
  entries: [ /* … */ ],
  fields: [{ key: 'end', formatValue: formatDateTime }], // End shows the stored moment with clock time
});
```

A custom format builds on `dateFormatter` and `lastCoveredInstant` — the harness planner page's
compact "02 Mar" Finish column, with no year and no clock time:

```ts
import { dateFormatter, lastCoveredInstant, type FormatContext, type Instant } from 'freegantt';

const compactDay = dateFormatter({ day: '2-digit', month: 'short' });

function compactFinish(
  value: unknown,
  ctx: FormatContext,
  entry: { readonly start?: Instant | undefined },
): string {
  if (value === undefined || value === null) return '';
  return compactDay(lastCoveredInstant({ start: entry.start, end: value as Instant }), ctx);
}
```

### A pair of dates: `formatStartAndEnd`, `joinStartAndEnd`

A start and an end read as one line through two public functions, never a hand-built `' – '`:

- **`formatStartAndEnd(pair, ctx)`** — a Formatter for a `{ start?, end? }` value: the start's own
  day and the last day the pair covers, both date only. Takes an `Entry`, a `Bar`,
  `gantt.visibleSpan`, or any object shaped that way.
- **`joinStartAndEnd(startText, endText, separator?)`** — joins two texts a caller already read
  through each side's own Field `formatValue`. Use this when start and end may carry different
  formatters (a tooltip, a status line); use `formatStartAndEnd` when a plain date pair is enough.

Both agree on the same cases:

| Start | End | Result |
| --- | --- | --- |
| both | both | `'Mar 2, 2026 – Mar 4, 2026'` |
| set | missing | `'Mar 2, 2026 –'` |
| missing | set | `'– Mar 4, 2026'` |
| missing | missing | `''` |
| equal text | equal text | shown once: `'Mar 2, 2026'` |

A row's tooltip reads each side through its own Field, so setting `formatValue: formatDate` on
`start` matches its date-only `end` — a one-day bar's tooltip then names its date once instead of
reading `'Mar 2, 2026, 12:00 AM – Mar 2, 2026'`:

```ts
import { Dataset, formatDate } from 'freegantt';

new Dataset({
  entries: [ /* … */ ],
  fields: [{ key: 'start', formatValue: formatDate }], // date only, matching end's own default
});
```

### A Field's text outside the grid: `gantt.formatFieldValue`

**`gantt.formatFieldValue(entry, key)`** gives the text a Field shows for one `Entry`, through the
same door the Grid cell and the bar label read through — a status line, a CSV row, any place a
Field's own formatted text is useful outside the Grid pane. It follows this Gantt's own locale
first, then its Dataset's own locale (#583), then the runtime's own, live. It works for a Field
with no column and for a `compute` Field, and throws `UnknownFieldError` for a key no Field
declares.

<!-- doc-example-setup
declare const entry: import('freegantt').Entry;
-->

```ts
const statusLine = `${entry.name} · ${gantt.formatFieldValue(entry, 'progress')}`;
const csvRow = gantt.gridColumns
  .map((column) => gantt.formatFieldValue(entry, typeof column === 'string' ? column : column.field))
  .join(',');
```

**`dataset.formatFieldValue(entry, key, locale?)`** gives the same text with no Gantt at all, for a
server-side export or a report. The zone is this Dataset's own; a missing `locale` reads as this
Dataset's own `locale` (#583), then the runtime's own. `gantt.formatFieldValue` reads through this
method with its own effective locale — its own `locale` first, then its Dataset's.

```ts
const csvRows = dataset.entries.all.map((entry) =>
  ['name', 'start', 'end', 'cost'].map((key) => dataset.formatFieldValue(entry, key, 'de-DE')).join(';'),
);
```

### Naming

Use **`gantt.rowSource`**, not `gantt.rows`. The config names the source; `Row` is the derived track
(`CONTEXT.md`). `rowSource` matches the `RowSource` type and leaves `rows` free for a future getter
of resolved rows.

### Published types

`Field`, `FieldType`, `FieldTypeName`, `FieldKey`, `FieldContext`, `Aggregator`, `GridColumn`, `GridColumnInput`,
`RowSource`, `EntriesRowSource`, `GroupRowSource`, `CustomRowSource`, `CustomRow`,
`RowSourceCommon`, `CustomRowInput`,
`CollapseChange`, and the hierarchy error classes re-exported from `freegantt`.
`FieldSource` retired (a Field key is the whole address) and `SerializedField` retired (the
library holds no save format) — neither is in `etc/freegantt.api.md`.

## Plugins

FreeGantt takes one plugin type with two halves. `definePlugin`
writes it: a `data` half installs on a `Dataset`, a `view`-only half installs on
a `Gantt`. Install at construction (`plugins: [...]`), or reconfigure a `Gantt`'s
plugins live (`gantt.plugins = [...]`). The [plugin authoring guide](06-plugin-authoring.md) covers both
halves, every registration seam, the registration gate, disposal, `requires`, and
the errors an author meets. `tooltips()`, `contextMenu()`, and
`inlineEditing()` are the three built-in plugins that ship with the package,
none of them loaded unless a consumer installs them.

## Styling and theming

Restyling a Gantt — the `--fg-*` token reference, the Parts list, `data-flag`, and how to style
date lines and the Today line — moved to its own page:
[Styling and theming](10-styling-and-theming.md).

## Harness demos

Run `pnpm dev` and open `http://localhost:5173`.

| Page | Demonstrates |
| --- | --- |
| `harness/generic.html` | Tree `rowSource`, `gridColumns`, field rollup (`cost`), live row-source switch, selection, timeline toolbar |
| `harness/e2e/data.html` | Transactions, undo/redo, `change` events |

The [Architecture pages](architecture/index.md) map what the code does now — the files, the classes,
the call order. Run `pnpm docs` to read them, and everything else, as the site. The API reference is
generated from TSDoc comments via TypeDoc, so it never drifts from the source.
