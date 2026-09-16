# Harness docs

Maps of the library as the harness demos run it today. These pages sit next to the demos so a
maintainer can open the Gantt and the explanation in one session. Start below with how to run the
harness and what the smallest working Gantt looks like, then follow a page from the list at the
bottom.

## Run the harness

The harness is the library's first consumer: plain TypeScript against `src/api/index.ts`, with no
framework and no build step of its own. One command serves every page below, this one included.

*Derived from `package.json`, `vite.config.ts`, `harness/*.html`, `harness/*.ts`.*

```bash
pnpm install
pnpm dev            # serves harness/ — open the printed URL
pnpm build          # production build of the same pages into dist-harness/
```

| Page | What it shows | Read alongside |
| --- | --- | --- |
| `index.html` | The general demo: timeline, viewport, selection, snap, and theme. Driven by `harness/main.ts`. | [Lifecycle](./lifecycle.md) |
| `hierarchy.html` | Tree and grouped row sources, filter and sort, collapse, declared-field rollup, and JSON round-trip. Driven by `harness/hierarchy.ts`. | [Class map](./classes.md) |
| `scroll-sync.html` | One pair of Gantts sharing a `TimeScaleModel` and both `ScrollAxis` instances, beside a pair sharing only the `x` axis and a pair sharing only the `y` axis. | [Class map](./classes.md) |
| `grid-scroll.html` | The grid pane as its own vertical scroll surface, kept in step with the timeline rows. | [Lifecycle](./lifecycle.md) |
| `zoom.html` | Presets, zoom in/out, pan to a date, pan to today, and the header bands. | [Timeline render](./timeline.md) |
| `large-dataset.html` | Row virtualization under a large entry count. | [Lifecycle](./lifecycle.md) |
| `data.html` | Mutation, live binding, undo/redo, and JSON export/import. | [Class map](./classes.md) |
| `editing.html` | Direct manipulation: drag to move, resize, keyboard editing, snapping, inline cell edit, and the lock Dataset plugin. | [Lifecycle](./lifecycle.md) |
| `plugins.html` | The plugin runtime: weekend shading, a milestone variant, extra variants, commands, and a popup demo. Driven by `harness/plugins.ts`. | [Plugin lifecycle](./plugins.md), [plugin authoring guide](../06-plugin-authoring.md) |

:::note The harness is reviewed like library code
It sits outside the `src/**` lint scope on purpose, so a rule it breaks fires no lint. Code here
that re-derives what the library already computes is an API gap — record it and close it in
`src/` rather than tidying the harness. See [Class map](./classes.md) for the current reading of
`harness/main.ts`.
:::

## Basic usage

What an app author writes. Two classes carry the whole surface: a `Dataset` owns the entries and
every edit to them; a `Gantt` mounts one view of that dataset. This is a summary —
[`README.md`](https://github.com/Pawel-IT/FreeGantt/blob/main/README.md) is the full and current
consumer API.

*Derived from `README.md`, `docs/05-consumer-api.md`, `src/api/index.ts`, `harness/main.ts`.*

### The smallest Gantt

```ts
import { Gantt, Dataset } from 'freegantt';

const dataset = new Dataset({
  timeZone: 'America/Chicago', // IANA zone — every date below is read through it
  entries: [
    { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-07' },
    { id: 't2', name: 'Build', start: '2026-09-08', end: '2026-09-21' },
  ],
});

const gantt = new Gantt({ container: '#gantt', dataset });
gantt.destroy(); // tears the view down; the dataset outlives it
```

Ids are plain strings and dates are plain strings, a `Date`, epoch milliseconds, or an `Instant`.
Nothing has to be constructed first. `container` takes an `HTMLElement` or a CSS selector.

`timeZone` is optional. Omit it and the Dataset resolves the environment's own zone once, at
construction, then stores that IANA string:

```ts
const dataset = new Dataset({ entries }); // no timeZone
dataset.timeZone; // → 'America/Chicago' — resolved, concrete, never a sentinel
```

Omission reads the dates in *this* viewer's calendar, so the same entries can render differently
for a viewer in another zone. Pass `timeZone` whenever more than one person opens the dataset.

### Editing

Every mutator auto-wraps in its own transaction, and a bound `Gantt` renders the result on the
next frame — there is no second render path and no remount.

```ts
dataset.entries.add({ id: 't9', name: 'Roofing', start: '2026-10-01', end: '2026-10-15' });
dataset.entries.update('t2', { name: 'Framing — north wing' });
dataset.entries.remove('t9'); // and every descendant, in the same changeset

dataset.transaction(() => {
  dataset.entries.update('t1', { start: '2026-10-05' });
  dataset.entries.update('t2', { start: '2026-10-12' });
}); // one changeset, one render

dataset.undo(); // what it did arrives on 'change', tagged origin: 'undo'
dataset.redo();
```

### Panes, fields, columns

A Gantt is two panes on one set of rows. The **Grid pane** is on the left. The **Timeline pane**
is on the right. The time axis is not a column. The whole view is a Gantt — not a chart (#7).

A **field** is what a value *is*, and it is declared on the dataset. A **grid column** is one
vertical slice of the Grid pane: it names a field and carries presentation, and it is declared on
the Gantt. Declaring a field does not put it on screen. The Timeline pane paints **Items** as
bars; a bar is paint, not identity.

```ts
const dataset = new Dataset({
  timeZone: 'UTC',
  entries,
  fieldTypes: { money: { rollUp: 'sum', formatValue: asCurrency, column: { align: 'end' } } },
  fields: [{ key: 'cost', type: 'money' }],
});

gantt.gridColumns = ['name', 'start', 'duration', { field: 'cost', header: 'Budget' }];
gantt.rowSource = { source: 'entries', tree: true };          // parentId as a tree
gantt.rowSource = { source: 'group', groupBy: (e) => e.kind }; // one header row per value
gantt.collapse('p1'); // per-Gantt view state, never in the dataset
```

Every config key is a live property: assign `gantt.preset`, `gantt.gridColumns`,
`gantt.rowSource`, `gantt.theme` and the rest without remounting. Pass
`plugins: [tooltips(), contextMenu(), inlineEditing()]` on the Gantt, or call
`gantt.installPlugin` later. Two Gantts on one page stay independent; give them the same `scale`
or `scroll` and they stay in sync.

### Events

```ts
dataset.on('change', ({ changeSet }) => save(changeSet)); // data events on the Dataset
gantt.on('selectionChange', () => render(gantt.selectedEntries)); // view events on the Gantt
gantt.on('beforeEntryMove', () => false); // every mutating interaction has a cancelable before* pair
```

:::note Where the full surface lives
[`README.md`](https://github.com/Pawel-IT/FreeGantt/blob/main/README.md) documents the public API
as it lands,
[`plans/02-public-api.md`](https://github.com/Pawel-IT/FreeGantt/blob/main/plans/02-public-api.md)
is the defended spec,
[`docs/05-consumer-api.md`](https://github.com/Pawel-IT/FreeGantt/blob/main/docs/05-consumer-api.md)
is the index, and `CONTEXT.md` is the glossary. The pages below describe the *inside* of the
library and are not a consumer reference.
:::

## The pages here

Maintainer maps of `src/`, in reading order. Each page names the files it was derived from, so a
change to a file says which page to update.

- **[Layers & import rules](./layers.md)** — the ten directories under `src/`, which of them may
  import which, and the custom lint rules that hold the line.
- **[File inventory](./files.md)** — every non-test file in `src/`, with the one thing it is for.
- **[Construction, render, notification](./lifecycle.md)** — what `new Gantt(…)` builds, what one
  `render()` does, and how an edit reaches the screen, with measured pass counts.
- **[How a refusal reaches the caller](./refusals.md)** — a `beforeChange` veto from the mutator to
  the Error report and the thrown `MutationCancelledError`, plus the gesture and cell-editor doors.
- **[Class map](./classes.md)** — every class in the built layers — `layout/`, `view/`, `time/`,
  `model/`, `render/`, `api/`, `extensions/` — plus the consumer boundary and the harness reading.
- **[Timeline render](./timeline.md)** — how the header, density floor, sticky tick labels, and
  today line paint. Includes a pipeline graph and a density chart of the shipped presets.
- **[Plugin lifecycle](./plugins.md)** — what `installPlugin` and `uninstallPlugin` do, when the
  registration gate is open, how `install()` diffs a plugin list by id, and how a Dataset plugin's
  setup order resolves from `requires`.
- **[Module map diagrams](./diagram.md)** — the layer graph as a picture: the DOM-free core on the
  left, the DOM column on the right, the transaction pipeline, and the public API surface.
- **[Maintaining these pages](./maintaining.md)** — what to update when a file changes, the rules
  for the content, and the recipe that re-measures the construction pass count. Read this before
  editing any page here.
- **[API reference](../../etc/freegantt.api.md)** — generated by TypeDoc. The full exported surface, generated from
  `src/api/index.ts` at build time — not a maintainer map like the pages above, the consumer
  reference itself, one folder over.
- **[Consumer API guide](../05-consumer-api.md)** — outside this folder: links to the README,
  `plans/02`, `CONTEXT.md`, and the generated export report.
- **[Plugin authoring guide](../06-plugin-authoring.md)** — outside this folder: `definePlugin`, the
  one plugin's two halves, every registration seam, and the errors an author meets.
