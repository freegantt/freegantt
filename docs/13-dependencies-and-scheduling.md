# FreeGantt — Dependencies and scheduling

This guide shows an app author how to draw lines between bars and keep those lines true.
Two plugins do the work. `entryDependencies()` stores the Dependencies and draws a connector for each. `scheduling()` moves the Entries so every Dependency holds.
Each plugin works alone, but `scheduling()` needs `entryDependencies()`.

<!-- doc-example-setup
declare const container: HTMLElement;
-->

## Install the two plugins

Install both on the `Dataset`. Put `entryDependencies()` first, because `scheduling()` names it in `requires`.

```ts
import { Dataset, Gantt, entryDependencies, scheduling } from 'freegantt';

const dependencies = entryDependencies();
const plan = scheduling();

const dataset = new Dataset({
  timeZone: 'UTC',
  entries: [
    { id: 'dig', name: 'Dig', start: '2026-03-02T00:00:00Z', end: '2026-03-06T00:00:00Z' },
    { id: 'pour', name: 'Pour', start: '2026-03-06T00:00:00Z', end: '2026-03-10T00:00:00Z' },
  ],
  plugins: [dependencies, plan],
});

new Gantt({ container, dataset, range: 'fitDataset', gridWidth: 'fitColumns' });
```

Keep the two objects. Their methods write the Dependencies and read the schedule.

With only `entryDependencies()`, the Gantt draws the lines and moves nothing. With `scheduling()` too, a moved Entry moves its successors.
A `Gantt` without `entryDependencies()` draws no line. Calling `scheduling()` methods before a Dataset installs the plugin throws `SchedulingNotInstalledError`.

## A Dependency

A Dependency joins a predecessor Entry (`fromId`) to a successor Entry (`toId`).

| Field | Meaning |
| --- | --- |
| `id` | A string you choose. It must be unique. A repeat throws `DuplicateDependencyIdError`. |
| `fromId`, `toId` | The two Entry ids. An unknown id throws `EntryNotFoundError`. |
| `type` | `'FS'`, `'SS'`, `'FF'` or `'SF'`. See the next table. |
| `lag` | `{ value, unit: 'day' }`. A negative value lets the successor overlap its predecessor. Another unit throws `UnsupportedLagUnitError`. |

The type names the edge of each Entry. The first letter is the predecessor edge. The second letter is the successor edge.

| Type | The successor... |
| --- | --- |
| `FS` finish to start | starts after the predecessor finishes. |
| `SS` start to start | starts after the predecessor starts. |
| `FF` finish to finish | finishes after the predecessor finishes. |
| `SF` start to finish | finishes after the predecessor starts. |

### Add, remove and replace

```ts
import { entryDependencies } from 'freegantt';

const dependencies = entryDependencies();

dependencies.add({
  id: 'dig-pour',
  fromId: 'dig',
  toId: 'pour',
  type: 'FS',
  lag: { value: 2, unit: 'day' },
});

dependencies.all(); // every Dependency
dependencies.predecessorsOf('pour'); // the Dependencies that end at 'pour'
dependencies.remove('dig-pour');
```

`add()` and `remove()` are undoable. Removing an Entry also removes every Dependency that names it, in the same change set. One undo brings both back.

An app that loads Dependencies from a server calls `replaceAll()` with the whole list:

```ts
import { entryDependencies } from 'freegantt';

const dependencies = entryDependencies();

dependencies.replaceAll([
  { id: 'a-b', fromId: 'a', toId: 'b', type: 'FS', lag: { value: 0, unit: 'day' } },
  { id: 'b-c', fromId: 'b', toId: 'c', type: 'SS', lag: { value: -1, unit: 'day' } },
]);
```

`replaceAll()` takes no undo step and keeps scroll, zoom and collapsed groups as they are. It throws, and writes nothing, when one Dependency names an unknown Entry.

## Connect two bars by dragging

`entryDependencies()` turns the connect gesture on. Hover a bar to see a port at each edge. Drag from a port to another bar.

1. Press on the port of the first bar.
2. Drag. A preview line follows the pointer.
3. Drop on the second bar.

A drop on a port joins that edge. A drop on the body of a bar joins its nearer edge: the left half is `start`, the right half is `end`.
While you drag, the bar under the pointer gets an outline, and every connectable bar shows its ports.

The two edges set the type of the new Dependency:

| From | To | Type |
| --- | --- | --- |
| end | start | `FS` |
| start | start | `SS` |
| end | end | `FF` |
| start | end | `SF` |

The lag is 0 days. A drop on the same Entry adds nothing. A repeat of a stored Dependency, with the same ends and type, adds nothing.
With `scheduling()` installed, a successor that starts too early moves in the same step. One undo removes the line and puts the bar back.

There is no keyboard connect. Add a Dependency from your own form with `dependencies.add()`.

### Hook the drag

The Gantt fires `beforeConnect`, then calls each plugin handler, then fires `connect`. All three carry two ends: `{ from, to }`, each `{ entryId, edge }`.

```ts
import { Gantt } from 'freegantt';

declare const gantt: Gantt;

// May a drop connect? Return false to veto, or a Promise of false.
gantt.on('beforeConnect', ({ from }) => {
  if (from.entryId === 'locked-task') return false;
});

// What did the drop connect? The Dependency exists by now.
gantt.on('connect', ({ from, to }) => {
  console.log(`${from.entryId} (${from.edge}) → ${to.entryId} (${to.edge})`);
});
```

A Promise keeps the preview line drawn and dimmed until it settles. Escape ends the wait.

### Close the gesture

Pass `connectByDrag: false` for an app that only shows Dependencies. No port draws then.

```ts
import { entryDependencies } from 'freegantt';

const readOnlyLines = entryDependencies({ connectByDrag: false });
```

To close it for some Entries only, use the `connect` capability. An Entry that cannot connect shows no port.

```ts
import { Gantt } from 'freegantt';

declare const container: HTMLElement;
declare const dataset: import('freegantt').Dataset;

new Gantt({
  container,
  dataset,
  capabilities: { connect: (entry) => (entry.read('locked') === true ? false : undefined) },
});
```

A locked Entry keeps `connect` open unless `capabilities.connect` says no.

## Select and delete a line

A click or focus on a connector selects its Dependency. The connector gets `data-flag="selected"`. A click elsewhere clears it. The Entry Selection does not change.

- Tab reaches one connector. The selected one is the tab stop, else the first.
- Arrow keys move focus to the next or previous connector.
- `Delete` removes the focused Dependency. One undo restores it.

On any other target, these keys keep their core meaning.

A Delete on a connector raises two plugin events. A handler on `beforeDependencyRemove` may veto:

```ts
import { entryDependencies } from 'freegantt';

const dependencies = entryDependencies();

dependencies.on('beforeDependencyRemove', ({ dependency }) => {
  if (dependency.id === 'keep-me') return false;
});
dependencies.on('dependencyRemove', ({ dependency }) => {
  console.log(`Removed ${dependency.id}`);
});
```

Both events fire for the keyboard remove only. `remove(id)` raises neither. `on` returns a call that removes the handler.

## Labels

Every connector has an accessible name, "<from name> → <to name>". Pass `labelField` to read the names from another Field. The default is `name`.

Pass `showLabels: true` to draw that text at the middle of each line:

```ts
import { entryDependencies } from 'freegantt';

const dependencies = entryDependencies({ showLabels: true, labelField: 'name' });
```

The drawn text is `aria-hidden`. The line keeps the label as its accessible name.

## Connector options on the Gantt

Three `Gantt` options change how the lines look. All three are live.

- `connectorArrow`: `'end'` (default) draws an arrowhead at the arrival end. `'none'` draws none.
- `connectorRouting`: `{ avoidBars, maxAvoidRows }`. See [Consumer API](05-consumer-api.md).
- `fitDatasetPaddingPx`: empty axis around the bars under `range: 'fitDataset'`. The default 24 px leaves room for a stub and an arrowhead.

## What `scheduling()` does

`scheduling()` keeps every Dependency true. A user edit, a connect drag or an `add()` can break a Dependency. The plugin then moves the successors, in the same change set. One undo restores every Entry.

### Which way successors move: `successorMoves`

```ts
import { scheduling } from 'freegantt';

const follows = scheduling(); // 'pushAndPull': a successor follows its predecessor earlier too
const waits = scheduling({ successorMoves: 'pushOnly' }); // a successor moves later only
```

`'pushAndPull'` is the default. With `'pushOnly'`, a successor that has slack stays where it is.

### A date the user edits: `editedDate`

A date a user sets on a scheduled Entry becomes its "start no earlier than" constraint. A Dependency still wins. The Entry lands where the Dependency allows, and the date stays as a floor.

```ts
import { scheduling } from 'freegantt';

const userWins = scheduling({ editedDate: 'userDateWins' });
```

`'dependencyWins'` is the default. With `'userDateWins'`, the plugin keeps the date the user set and reports a `blocked-move` diagnostic for the broken Dependency.

### An Entry the engine never moves: `manuallyScheduled`

`scheduling()` declares a boolean Field named `manuallyScheduled`. The plugin never moves an Entry with the flag on. A broken Dependency gives a diagnostic. Bind a grid column to the Field for a toggle:

```ts
import { Gantt } from 'freegantt';

declare const container: HTMLElement;
declare const dataset: import('freegantt').Dataset;

new Gantt({
  container,
  dataset,
  gridColumns: ['name', 'start', 'end', { field: 'manuallyScheduled', header: 'Manual', toggle: true }],
});
```

## Constraints

A constraint is a date rule on one Entry. Three kinds exist.

| Kind | Meaning |
| --- | --- |
| `startNoEarlierThan` | A floor. The Entry never starts before the date. A Dependency may still push it later. |
| `finishNoLaterThan` | A ceiling. The engine never moves an Entry to meet it. When a Dependency pushes the finish past it, the Dependency wins and a `constraint-violated` diagnostic names the Entry. |
| `mustStartOn` | A hard date. It wins over a Dependency. A Dependency it breaks gives a `blocked-move` diagnostic with the reason `'mustStartOn'`. |

The order of rules is: manually scheduled, `mustStartOn`, Dependency, `startNoEarlierThan`.

```ts
import { instant, scheduling } from 'freegantt';

const plan = scheduling();

plan.setConstraint('pour', { kind: 'startNoEarlierThan', date: instant('2026-03-11T00:00:00Z') });
plan.constraintOf('pour'); // { kind: 'startNoEarlierThan', date: … }
plan.clearConstraint('pour');
```

`setConstraint()` moves the Entry and its successors to meet the constraint. It is one undo step.
A user drag keeps a `mustStartOn` or `finishNoLaterThan` constraint. A drag replaces only a `startNoEarlierThan` floor.

## Working calendars

By default a day is 24 hours. Pass a `WorkingCalendar` to count lags and moves in workdays.

```ts
import { scheduling, timeShading, workingCalendar } from 'freegantt';

const calendar = workingCalendar({ workdays: [1, 2, 3, 4, 5], holidays: ['2026-03-11', '2026-03-12'] });

const plan = scheduling({ calendar });
const shading = timeShading([{ covers: calendar.offTime() }]);
```

Pass the same calendar to `timeShading()`. The shading and the schedule then agree on the days off.

- A day lag skips the days off, and so does a negative lag.
- A moved Entry keeps its length in workdays.
- A lag counts in the calendar of its successor.
- A week, month or year lag gives an `unsupported-lag-unit` diagnostic when a calendar applies.

For more than one calendar, pass `calendars`, a record of named calendars. Pass `calendarField`, the key of a Field whose value names one:

```ts
import { scheduling, workingCalendar } from 'freegantt';

const plan = scheduling({
  calendar: workingCalendar({ workdays: [1, 2, 3, 4, 5] }),
  calendars: { sixDay: workingCalendar({ workdays: [1, 2, 3, 4, 5, 6] }) },
  calendarField: 'calendar',
});
```

An Entry with no value, or an unknown name, uses `calendar`, then 24-hour days. All three options are optional. The library ships no holiday list.

## Float and the critical path

`scheduling()` declares two Fields and keeps them true with every edit that moves a date:

- `float`: the days a leaf Entry can start later without moving the project finish. It counts workdays when a calendar applies.
- `critical`: `true` when `float` is zero or less.

A summary Entry, an Entry with a missing date and a loop member have neither. Constraints do not change float.
Core paints nothing from these Fields. Style critical bars with a variant rule, and show the Fields in grid columns:

```ts
import { Gantt } from 'freegantt';
import type { EntryVariant } from 'freegantt';

declare const container: HTMLElement;
declare const dataset: import('freegantt').Dataset;

const criticalVariant: EntryVariant = {
  name: 'critical',
  when: { critical: true },
  paint: () => ({ class: { 'critical-bar': true } }),
  css: `.critical-bar { background: var(--fg-warn); }`,
};

new Gantt({ container, dataset, gridColumns: ['name', 'start', 'end', 'float', 'critical'], variants: [criticalVariant] });
```

`drivingPath(entryId)` returns the Entry ids, in order, of the chain of predecessors that holds an Entry in place. The Entry comes last. A loop member gives `[]`.

```ts
import { scheduling } from 'freegantt';

const plan = scheduling();

const names = plan.drivingPath('pour'); // for example ['dig', 'pour']
```

Without a plugin, `calculateFloat({ entries, dependencies, calendar? })` and `findDrivingPath(request, entryId)` are pure functions.

## Diagnostics: `scheduleDiagnostics`

The plugin reports what it could not make true. Each finding has a `code`:

- `cycle`: the Dependencies form a loop. `entryIds` names the members. Their connectors carry the `cycle` flag.
- `blocked-move`: a move the plugin skipped. `dependencyIds` names the broken Dependencies. `reason` says why.
- `constraint-violated`: a Dependency pushed an Entry past its `finishNoLaterThan` ceiling.
- `unknown-entry` and `unsupported-lag-unit`: a Dependency the plugin cannot read.

```ts
import { scheduling } from 'freegantt';

const plan = scheduling();

const stop = plan.on('scheduleDiagnostics', (findings) => {
  for (const finding of findings) {
    if (finding.code === 'cycle') console.log('Loop:', finding.entryIds.join(', '));
  }
});

plan.diagnostics(); // the latest findings
stop(); // removes the handler
```

The event fires after each commit.

## Undo

- A new link and the move it causes are one undo step. One undo removes the link and puts the bar back.
- `float` and `critical` follow in the same step.
- A removed Dependency moves nothing.
- `replaceAll()` takes no undo step. It pushes successors too, in a sync change set. Redo stays.
- A Dataset as built, and an undo, refresh `float` and `critical` in a sync change set with no undo step.

## Harness pages

Run `pnpm dev` and open these pages for a working example of each part:

| Page | Shows |
| --- | --- |
| `harness/dependencies.html` | All four types, a negative lag, `replaceAll()`, the connect drag, select and Delete |
| `harness/scheduling.html` | Successors that follow, calendar, `manuallyScheduled`, constraints, a loop |
| `harness/critical-path.html` | `float`, `critical`, a variant rule and `drivingPath()` |
| `harness/related-to.html` | A plugin that draws its own connectors. See [Plugin authoring](06-plugin-authoring.md) |

To restyle ports, connectors and arrowheads, read [Styling and theming](10-styling-and-theming.md).
