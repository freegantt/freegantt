---
status: accepted — ruled 2026-11-22 by the owner.
decided: `gantt.headerTickRenderer` lets a consumer draw one header tick and flag it. A preset header band may state its own `heightPx`. The core stamps `data-flag="today"` itself.
open: none.
---

# A header tick can be drawn by the consumer

## Context

A consumer app needs a header that shows a weekday letter above a day number, a week-start label, off-day shading and a highlight on today. A preset `format` returns a string. It cannot return two lines or a flag.

## Decision

```ts
gantt.headerTickRenderer = (ctx: HeaderTickContext) => HeaderTickPaint | undefined;

interface HeaderTickContext { band: number; tick: Tick; time: ZonedTime; locale: Intl.LocalesArgument; rangeStart: ZonedTime }
interface HeaderTickPaint   { content?: ElementDescription; flags?: readonly string[] }

{ unit: 'month', format: { month: 'long' }, heightPx: 30 }
```

- `undefined` means the library text.
- `flags` become `data-flag` tokens on the tick. A consumer adds `off` from its own calendar. The library never assumes Saturday and Sunday.
- The core stamps `today` itself, because the library owns the clock. For the week unit, the tick that holds today.
- `heightPx` on a header band wins over `--fg-band-height`, which wins over the default.
- `HeaderFormat` also receives `rangeStart`, so a label can show a year only when the year changes.

## Options rejected

- **A richer `format` string.** It cannot carry a flag or a second line.
- **A consumer flag for `today`.** The consumer would need the library's clock and zone.

## Consequences

- With no renderer, the header draws as before.
