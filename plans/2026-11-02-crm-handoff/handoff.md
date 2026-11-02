# Handoff: what FreeGantt needs for the CRM project schedule

**From:** CRM_Filament, a consumer · **To:** whoever works in `freegantt` · **Date:** 2026-11-02
**FreeGantt state checked:** `main` at `1ecdbdf9`, `.slice` = S6, `src/scheduling/index.ts` is an empty stub, #136 open.

## The rule for this handoff

FreeGantt gains **generic, opt-in hooks that any consumer could use**. It gains no CRM features.
- A baseline ghost bar, a variance label or a % fill is something the CRM draws through a hook. FreeGantt never draws one by default.
- Dependencies and scheduling are **plugins**: a Gantt without them installed has neither, and core is unchanged.

If an item below reads like "FreeGantt should show X for every entry", it's written wrong. Push back.

## Already enough, no FreeGantt work

| CRM need | Today's hook |
|---|---|
| % complete column, WBS roll-up, fill inside the bar | Consumer `percent` Field, `meter()` cell, the Field's `rollUp`, a `barRenderer` (ADR 0008 respected) |
| WBS summary rows, milestones, today line, zoom | `summary()`, `diamond()`, `todayLine`, presets |
| Group by cost code / sub; extra columns | `GroupRowSource.groupBy`, `gridColumns` + `ColumnRenderer` |
| Proposed tasks drawn dashed; late tasks flagged | `EntryVariant` rules on consumer Fields (ADR 0018) |
| Holidays and weekends shaded | `timeShading()` (#404) |
| Server confirms a drag before it sticks | Async veto on `beforeEntryMove` / `beforeEntryResize` (S3.5) |
| Read-only viewers | Capabilities / `setCapabilityRule` |

**Please don't build:** drag-to-set %, a `progress()` plugin, a `baselines()` plugin, any default ghost or variance drawing, or a save format.

## Requests

### A. A decoration that paints a time span on one row (core, generic)

Today a decoration is a `rangeBand` (a time span over all rows) or a `rowStripe` (a whole row). Nothing paints a time span on one row. Consumers need that for baseline and planned-vs-actual ghosts, maintenance windows, booked slots, and a lookahead window per row.

```ts
{ kind: 'rowSpan'; rowId: RowId; start: Instant; end: Instant; class?: string; text?: string }
```
- Time in, pixels out through the bound `TimeScale` (I12), like `rangeBand`.
- Works on both layers (`underBars` / `overBars`).
- Not hit-tested, not focusable, `aria-hidden`. Paint, not a bar.
- `class` is the styling hook. `text` is optional, a short label at the span's end ("+4d").
- Alternative rejected: a `BarProducer` returning a second Bar per Entry (selectable, draggable, announced).
- **Done when:** the harness has a "planned vs actual" fixture. Unit test: resolves to pixels under zoom. Render test: no hit target, `aria-hidden`.

### B. Settle #136: links any plugin can contribute (core seam)

A `registerLinkEmitter`-style seam so `layout/` draws links without importing any plugin's types. Generic: dependency arrows are one use; "related to" or handoff arrows are others. C depends on it.

### C. `entryDependencies()`: first-party, opt-in plugin (S7 first half)

- The host owns the data. Seed and replace the `Dependency` store from outside. FreeGantt never decides a link exists.
- `{ id, fromId, toId, type: FS|SS|FF|SF, lag }`, negative lag allowed. Removing an entry removes its links.
- Link-create gesture: add `beforeLinkCreate` to the async-veto events.
- Link ports follow capabilities.
- Keyboard select/delete. A link label built from the entries' label Field. Links stay drawn when one end is off-screen.
- Not installed → no store, no arrows, no ports.

### D. `scheduling()`: first-party, opt-in plugin, requires C (S7 second half)

- Propagation through the edit extender: live successor ghosts during drag, pins, cycle diagnostics.
- Calendar as input, not policy: workdays (weekday set) plus holiday dates, optional per-entry calendar from a consumer-named Field key. Durations count in workdays. No shipped holiday list.
- One calendar for paint and math: `timeShading()` takes the same calendar object.
- Constraints (start no earlier than, finish no later than, must start on), stored by the plugin like pins.
- Phase 2: float, critical flag, `drivingPath(entry)`, as plugin output through flags and Fields. Core paints nothing extra.
- Not installed → links (if C is installed) are drawn and nothing moves.

### E. Swap data without losing the view

The CRM replaces entries and links wholesale. Confirm, or make true, that a full replace keeps scroll position, zoom and collapsed groups. A harness test either way.

## Later

- Export: an image or SVG snapshot (the "After S7" seam 5).

## Question back

- A's `text`: a plain string is enough. Say so if decorations should stay text-free.
