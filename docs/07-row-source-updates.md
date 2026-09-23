# Row source — change one setting, keep the rest

**Scope:** `gantt.rowSource` for app authors. The row source is one object that carries several
settings together: which rows to build, which filter to apply, which sort to apply. This guide shows
how to change the filter or the sort and keep the rest.

Every example below typechecks against the built package types on each CI run
(`scripts/check-doc-examples.mjs`), so none of it can drift from the shipped API.

## The use case

You put a toolbar above the Gantt. The toolbar holds two independent controls.

- A **team** control filters the rows to one team.
- A **sort** control orders the rows by name.

A person uses them in any order. They pick a team, then sort by name, then change the team again. The
sort must survive the team change, and the filter must survive the sort change. Neither control knows
what the other one did.

The trap is to keep the answers in local variables and rebuild the whole row source on every click.
That works until something else assigns `gantt.rowSource`, and then the local copies are stale.

## Use `gantt.filterRows()` and `gantt.sortRows()`

Each call replaces one setting and leaves the other alone:

```ts
import type { Gantt } from 'freegantt';

export function sortByName(gantt: Gantt): void {
  gantt.sortRows({ field: 'name' });
}
```

`filterRows` and `sortRows` each read `gantt.rowSource` back, replace one key, and assign the result —
you do not write that pattern yourself. Pass `undefined` to turn the setting off:

```ts
import type { Gantt } from 'freegantt';

export function clearSort(gantt: Gantt): void {
  gantt.sortRows(undefined);
}
```

One control can therefore toggle its own setting and touch nothing else:

```ts
import type { Gantt } from 'freegantt';

export function toggleSort(gantt: Gantt): void {
  const current = gantt.rowSource;
  const isOn = current.source !== 'custom' && current.sort !== undefined;
  gantt.sortRows(isOn ? undefined : { field: 'name' });
}
```

### `gantt.rowSource.source === 'custom'` throws

A `'custom'` source resolves its own rows through `resolve`, so it carries no `filter` or `sort` for
either call to replace. `filterRows` and `sortRows` throw
`CustomRowSourceNotFilterableOrSortableError` in that case. Filter or sort inside `resolve` instead.

## A filter closure must not read page state that changes later

`filterRows` takes a function. That function runs later, on a future render, not at the moment you
call `filterRows`. Capture the value it needs in a `const`, so a later change to your page state
cannot reach it:

```ts
import type { Gantt, Entry } from 'freegantt';

export function filterByTeam(gantt: Gantt, team: string | null): void {
  // `team` is captured in a const, so the closure cannot read a later value.
  gantt.filterRows(team === null ? undefined : (entry: Entry) => entry.read('team') === team);
}
```

A new team means a new `filterRows` call, not a mutation of a variable the old closure already
captured. `gantt.rowSource.filter` gives the function back, but nothing reports the value inside it —
keep `team` yourself to label your own button.

## Change a setting `filterRows`/`sortRows` do not cover

`filterRows` and `sortRows` are shorthand for one pattern: read `gantt.rowSource` back, replace one
key, assign the result. A setting neither helper owns — `childrenAsSegments`, for example — takes that
pattern directly:

```ts
import type { Gantt } from 'freegantt';

export function toggleSegments(gantt: Gantt): void {
  const current = gantt.rowSource;
  if (current.source !== 'entries') return;
  gantt.rowSource = {
    ...current,
    childrenAsSegments: current.childrenAsSegments === undefined ? true : undefined,
  };
}
```

The getter returns the source **resolved**, so every key you did not set comes back filled in. That
resolved value assigns straight back into the setter, so nothing you did not touch is lost.

## Why the `source` check

`gantt.rowSource` answers with one of three row sources, and the compiler does not know which one you
hold. A `'custom'` source resolves its own rows, so it carries no `filter`, `sort`, `filterPolicy` or
`tree` — those keys do not exist on it. The check tells the compiler which of the three you have.

Call `nestsRows(gantt.rowSource)` when your real question is whether the rows nest.

## Do not keep a second copy

Read each setting off the Gantt. Do not mirror it in a local variable:

```ts
import type { Gantt } from 'freegantt';

export function sortIsOn(gantt: Gantt): boolean {
  const current = gantt.rowSource;
  // One source of truth. No local flag to drift.
  return current.source !== 'custom' && current.sort !== undefined;
}
```

A local flag drifts. Something else assigns `gantt.rowSource` — a preset, a reset button, a second
toolbar — and the flag keeps the stale answer. Then the button label lies about the Gantt.

## A worked example

`harness/main.ts` drives three toolbar buttons this way. Run `pnpm dev`, open
`http://localhost:5173`, and use **Group by team**, **Filter team**, and **Sort by name** together.

- [`harness/main.ts`](../harness/main.ts) — the three
  handlers. Two call `filterRows`/`sortRows`. The grouping button switches `source`, so it builds a
  new source.
- [`harness/e2e/hierarchy.ts`](../harness/e2e/hierarchy.ts) —
  the same settings driven from `<select>` controls. It uses the same helpers: a filter or sort
  change calls `filterRows`/`sortRows`, and only a `source` switch (tree, flat or grouped) builds a
  fresh one (#429). [`harness/hierarchy-and-timeline.ts`](../harness/hierarchy-and-timeline.ts),
  the demo page, does the same. The harness pages follow the pattern above; neither keeps a
  second copy of the row-source state.

## Related

- [Consumer API index](05-consumer-api.md) — the rest of the app-author surface.
- [API reference](../etc/freegantt.api.md) — generated `RowSource`, `EntriesRowSource`, `GroupRowSource`,
  `CustomRowSource` and `RowSourceCommon`.
