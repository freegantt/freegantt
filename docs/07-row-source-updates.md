# Row source — change one setting, keep the rest

**Scope:** `gantt.rowSource` for app authors. The row source is one object that carries several
settings together: which rows to build, which filter to apply, which sort to apply. This guide shows
how to change one of them and keep the others.

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

## Read the source back, then spread it

`gantt.rowSource` is a getter as well as a setter. Read it, replace the one key your control owns, and
assign the result:

```ts
import type { Gantt } from 'freegantt';

export function sortByName(gantt: Gantt): void {
  const current = gantt.rowSource;
  if (current.source !== 'entries') return;
  gantt.rowSource = { ...current, sort: { field: 'name' } };
}
```

The filter survives, because you never touched it. The getter returns the source **resolved**, so
`filterPolicy` and `tree` come back filled in even when you never set them. That resolved value
assigns straight back into the setter.

The same pattern carries `childrenAsSegments` unchanged: `ResolvedEntriesRowSource` extends
`EntriesRowSource`, so a spread that changes `sort` or `filter` leaves it exactly as it was.

## Turn one setting off

Pass `undefined` for the key. The other settings stay:

```ts
import type { Gantt } from 'freegantt';

export function clearSort(gantt: Gantt): void {
  const current = gantt.rowSource;
  if (current.source !== 'entries') return;
  gantt.rowSource = { ...current, sort: undefined };
}
```

One control can therefore toggle its own setting and touch nothing else:

```ts
import type { Gantt } from 'freegantt';

export function toggleSort(gantt: Gantt): void {
  const current = gantt.rowSource;
  if (current.source !== 'entries') return;
  gantt.rowSource = {
    ...current,
    sort: current.sort === undefined ? { field: 'name' } : undefined,
  };
}
```

## Why the `source` check

`gantt.rowSource` answers with one of three row sources, and the compiler does not know which one you
hold. A `'custom'` source resolves its own rows, so it carries no `filter`, `sort`, `filterPolicy` or
`tree` — those keys do not exist on it. The check tells the compiler which of the three you have.

An `'entries'` source and a `'group'` source both take a filter and a sort. Exclude `'custom'` alone
when your control applies to both:

```ts
import type { Gantt } from 'freegantt';

export function sortAnySource(gantt: Gantt): void {
  const current = gantt.rowSource;
  if (current.source === 'custom') return; // no filter or sort to change
  gantt.rowSource = { ...current, sort: { field: 'name' } };
}
```

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

### The one thing the getter cannot answer

The getter hands back your `filter` function. It cannot hand back a value captured *inside* that
function. Keep a local variable for that value, and only for that one:

```ts
import type { Gantt, Entry } from 'freegantt';

export function filterByTeam(gantt: Gantt, team: string | null): void {
  const current = gantt.rowSource;
  if (current.source !== 'entries') return;
  // `team` is captured in a const, so the closure cannot read a later value.
  gantt.rowSource = {
    ...current,
    filter: team === null ? undefined : (entry: Entry) => entry.read('team') === team,
  };
}
```

`gantt.rowSource.filter` gives the function back. Nothing reports the string inside it, so the caller
holds `team` to label its own button.

## A worked example

`harness/main.ts` drives three toolbar buttons this way. Run `pnpm dev`, open
`http://localhost:5173`, and use **Group by team**, **Filter team**, and **Sort by name** together.

- [`harness/main.ts`](../harness/main.ts) — the three
  handlers. Two spread one key. The grouping button switches `source`, so it builds a new source.
- [`harness/hierarchy.ts`](../harness/hierarchy.ts) —
  the same settings driven from `<select>` controls. **It does not use the pattern above**: its
  `buildRowSource()` rebuilds the whole source from the controls on every change, so the page keeps a
  second copy of the row-source state. That is the shape "Do not keep a second copy" warns against,
  and it works there only because the `<select>` elements are the page's own single source of truth.
  Read it as a demo of the keys, not of how to update them ([#429](https://github.com/Pawel-IT/FreeGantt/issues/429)).

## Related

- [Consumer API index](05-consumer-api.md) — the rest of the app-author surface.
- [API reference](../etc/freegantt.api.md) — generated `RowSource`, `EntriesRowSource`, `GroupRowSource`,
  `CustomRowSource` and `RowSourceCommon`.
