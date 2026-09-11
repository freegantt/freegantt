# ADR 0012 — dates are optional on every kind

**The decision:** [`docs/adr/0012-…`](../../../docs/adr/0012-dates-are-optional-on-every-kind.md)

**An Entry spans if and only if both `start` and `end` are present.** It holds a Segment, and draws a bar, iff it spans. One date without the other is legal (decision 4, grill 2026-09-10).

## Where it stands

**No decision is open. Two are closed — 4 and 15.** This ADR is ready to build.

**It lands second**, after [ADR 0016](../../../docs/adr/0016-the-library-holds-no-save-format.md). Nothing here waits on the storage rename, and [0013](../0013-what-decides-derivation/README.md) waits on this: 0013 demotes an Entry to *"a normal Entry with no dates"*, and `model/entry.ts:31-33` declares `start: Instant` and `end: Instant` **required**. That shape is not representable until this ADR lands. **There is no Document.** ADR 0016 deleted it, so this ADR writes no schema number and adds no reader arm.

**The old work plan ordered this group last, as D.** That was backwards, and the type is the proof.

## What it touches, and what it does not

It reaches bar geometry, the Segment invariant ([#212](https://github.com/Pawel-IT/FreeGantt/issues/212)), the sort comparators, `range: 'fitDataset'`, and the duration calculation (`field-access.ts:92`) with its call sites.

It shares three files with [0011](../0011-consumer-values-in-props/README.md) — `model/entry.ts`, `data/fields/field-access.ts`, `data/entry-reader.ts` — and **collides with it in none of them**. `data/serialization/read.ts` was the fourth shared file; build 0016 deletes it. This ADR guards the duration calculation (`field-access.ts:92`) and deletes the `referenceDate` fill (`entry-reader.ts:168`); 0011 rewrites different functions in the same files. Landing this before 0011 means 0011 rebases onto it, which is the cheap direction.

## Ordering constraint

**This ADR lands before [#242](https://github.com/Pawel-IT/FreeGantt/issues/242)'s own fix.** Optional dates change what `InvalidInstantError` guards.

## Required follow-up — the date path, and last-bar-remove

**The date path is the grid.** Default `gridColumns` is `['name', 'start', 'end']`. The date editor opens on a blank cell (today `no-date-value`) and writes one Field. `update({ start })` on a blank row is legal. A timeline “set dates” gesture is not this cut.

**Last-segment-remove un-dates both dates. It does not delete the row.** ADR 0010 said *an Entry never survives as an empty record* and bound grid-row Delete to `removeSegments`. This ADR makes zero Segments a legal row that does not span. Zero Segments cannot mean “deleted” and “unscheduled” at once. **This ADR revises that consequence of ADR 0010** (ADR 0006: the old ADR is not edited; the new rule lives here):

- `removeSegments` of the last Segment clears both dates: the Entry stays, with no Segments.
- Clearing one grid cell leaves the other date and drops the Segment.
- `entries.remove(id)` deletes the row and the subtree.
- Grid-row Delete on the name cell is `remove(id)`, not `removeSegments`.
- Keyboard Delete on a bar un-dates both dates when it was the last bar.

`update(id, { segments: [] })` still throws `EmptySegmentsError`. Absent is not a span. Empty is illegal.

---

# The work

## The build

**An Entry spans iff both dates are present.** A Segment and a bar exist iff it spans.

- `add({ start, end })` mints one Segment. `add({ segments })` with no dates derives the envelope. `add({})` stores no dates and no Segments. `add({ start })` and `add({ end })` store that one date, no Segment, no bar.
- `update(id, { start })` on a blank row is legal. `update(id, { start: undefined, end: undefined })` is the un-date verb; it clears both dates and the Segments.
- One refusal stays: `segments: []` (`EmptySegmentsError`). **Do not refuse one date without the other.**
- Default `gridColumns` is `['name', 'start', 'end']`. Open the date editor on a blank cell. Write one Field.
- Core does not paint a diamond. `start === end` is a bar of no width.
- A parent whose every child is start-only has a start, no end, no bar. [0013](../0013-what-decides-derivation/README.md) owns the Rollup pass.
- **Last-segment-remove un-dates both dates** — it does not delete the Entry. Clearing one cell leaves the other date.
- `start` and `end` join `isOptionalEntryKey`. `entry-reader.ts` gains a `length === 0` arm for constructor ingest. There is no serialization arm — ADR 0016 deleted the Document.
- Delete the `referenceDate` fill (`entry-reader.ts:168-172`). Written down under D-S2-10 **and** D-S2-22. Not under D-S5-46, which survives.
- Reaches bar geometry, the Segment invariant (#212), sort comparators, and `range: 'fitDataset'`.
- A row with neither date sorts **last**, both directions. Do not inherit HEAD `direction * order` — that puts a hole first on `desc`. A row that does not span is inert to a **date** gesture (no bar to drag). `fitDataset` includes a one-date instant. An S7 link to an endpoint that does not span raises a diagnostic and draws nothing.
- **No schema number.** ADR 0016 deleted the Document. Do not write a reader.

**The duration compute Field returns `Duration | undefined`.** Guard the calculation at `field-access.ts:92`. [0014](../0014-plugin-author-surface/README.md) decision 13 deletes `FieldContext.durationOf` — do not treat that wrapper as this ADR's public API. If this ADR lands first, keep `durationOf` as a thin wrapper around the guarded helper until 0014 removes it. **This list is an audit's, not a re-derivation — do not rebuild it.**

| Site | What changes |
|---|---|
| `field-access.ts:92` | **The canonical implementation, and the guard goes here first.** Unguarded it yields `NaN`, not a throw — see [`refuted.md`](../shared/refuted.md) item 10 |
| `core-fields.ts:118` | The shipped **`duration` core Field** reads the helper in its `compute` arm, so the column answers `undefined` on a dateless row. The cell is **blank** — `formatDuration` answers `''` for `undefined` (`core-fields.ts:44-45`). **Assert the blank cell.** Do not invent an em dash or a placeholder. After 0014 this arm does not go through `ctx.durationOf` |
| `aggregators.ts:14` | `durationMs`, behind `weightedMeanByDuration` at `:51` — skips a dateless child rather than weighting it at zero. After 0014 this reads `ctx.read(entry, 'duration')` |
| `inline-editing.ts:113` | **A provider, not a caller.** Dies with `durationOf` in 0014. Until then it changes as an implementation |
| `etc/freegantt.api.md` | The helper's return type is not a published `durationOf` signature after 0014. If this ADR lands first, I11 still sees the wrapper |
| two `FieldContext` stubs | `layout/rows/filter.test.ts`, `data/fields/field-types.test.ts` drop the `durationOf` key. **V6:** `field-access.test.ts` needs its test rewritten, not a stub edit. `layout/rows/sort.test.ts` holds a local helper named `durationOf`, not a stub key — leave it |


---

# Closed decisions

## 4 — what `InvalidInstantError` refuses

**Settled 2026-09-08. Overruled 2026-09-10 (grill).**

It refuses an unreadable date. It no longer refuses an Entry that authors one date without the other, and it no longer refuses an Entry that authors neither. A one-date row is stored, shows in the grid, and draws no bar until the second date arrives.

## 15 — `Duration` and the magic constant

**Closed 2026-09-09 by the code.** Was: *`FieldContext` owes a usable duration, or `time/` owes a public conversion.*

Neither is owed. `MS` is **already public** — exported at `api/index.ts:365`, defined at `time/instant.ts:45`, with `SECOND`, `MINUTE`, `HOUR` and `DAY`. The library divides by it itself at `core-fields.ts:46`.

**It was a documentation defect, not a design question.** The published `compute` sample wrote `duration.value / 86_400_000` and taught every consumer to write what I10 refuses to write inside `src/`. The sample writes `duration.value / MS.DAY`. **Never publish the raw constant.**

