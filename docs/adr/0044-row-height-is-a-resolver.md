---
status: accepted — ruled 2026-11-22 by the owner. Follows [ADR 0043](0043-a-lane-is-a-band-inside-a-row.md).
decided: `gantt.rowHeight` takes a number or a function. The function receives a `RowHeightContext` and returns a pixel height. The context carries `laneHeight`, so a resolver can defer to the Lane geometry. `--fg-row-height` stays the fallback.
open: none.
---

# Row height is a resolver

## Context

Every Row had one height from `--fg-row-height`. A consumer app has Rows of several kinds: a group Row, a Row with one Lane, and a Row with two Lanes. The height index (`PrefixSumHeightIndex`) already takes a height per Row. No public option reached it.

## Decision

```ts
gantt.rowHeight = 32;
gantt.rowHeight = (ctx: RowHeightContext) => number;

interface RowHeightContext {
  entry: Entry | undefined;
  kind: PlannedRowKind;
  depth: number;
  lanes: number;                  // 0 when the Row has no Lanes
  laneHeight: number | undefined; // derived from the Lane tokens
}
```

- The resolver runs once per layout pass, never per frame.
- A number keeps today's behaviour.
- `laneHeight` is the px height the Lane formula gives. A resolver writes `ctx => ctx.laneHeight ?? 48`. It does not repeat the formula.
- With no `rowHeight`, `--fg-row-height` sets every Row.

## Options rejected

- **A per-Entry `rowHeight` Field.** It puts a display value into authored data.
- **A token only.** A token cannot change per Row.
- **A resolver with no `laneHeight`.** Every consumer would copy the Lane formula.

## Consequences

- A Row is as tall as the resolver says. Content taller than the Row clips. That is a consumer choice.
