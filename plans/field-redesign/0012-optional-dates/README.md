# ADR 0012 — dates are optional on every kind

**The decision:** [`docs/adr/0012-…`](../../../docs/adr/0012-dates-are-optional-on-every-kind.md)

**An Entry has dates if and only if it holds at least one Segment**, and `start`/`end` are always the envelope. One biconditional keeps the blast radius to one rule.

## Where it stands

**No decision is open. Two are closed — 4 and 15.** This ADR is ready to build.

**It lands first.** Nothing here waits on the storage rename, and [0013](../0013-what-decides-derivation/README.md) waits on this: 0013 demotes an Entry to *"a normal Entry with no dates"*, and `model/entry.ts:31-33` declares `start: Instant` and `end: Instant` **required**. That shape is not representable until this ADR lands. 0013 also omits a rolling-up parent's dates from the Document, and `fromJSON` then meets an Entry with no dates — today that falls into the `referenceDate` fill this ADR deletes.

**The old work plan ordered this group last, as D.** That was backwards, and the type is the proof.

## What it touches, and what it does not

It reaches bar geometry, the Segment invariant ([#212](https://github.com/Pawel-IT/FreeGantt/issues/212)), the sort comparators, `range: 'fitDataset'`, and `FieldContext.durationOf` with its six call sites.

It shares four files with [0011](../0011-consumer-values-in-props/README.md) — `model/entry.ts`, `data/fields/field-access.ts`, `data/entry-reader.ts`, `data/serialization/read.ts` — and **collides with it in none of them**. This ADR guards `durationOf` (`field-access.ts:92`) and deletes the `referenceDate` fill (`entry-reader.ts:168`); 0011 rewrites different functions in the same files. Landing this first means 0011 rebases onto it, which is the cheap direction.

## Ordering constraint

**This ADR lands before [#242](https://github.com/Pawel-IT/FreeGantt/issues/242)'s own fix.** Optional dates change what `InvalidInstantError` guards.

## Required follow-up — a date path, and last-bar-remove

**A dateless row cannot be dated through the default UI.** It draws no bar, so no gesture reaches it, and the default `gridColumns` is `['name']`. That is not a hole this ADR lives with. Storage may land; a user-visible Gantt without a way to give dates is incomplete. Ship a date path with the first user-facing cut — put `start` in the default columns, or add a timeline “set dates” gesture — or the storage model has no user path. Dating from the timeline is its own gesture, with its own capability and veto surface. It may be a later slice. It is not optional.

**Last-segment-remove un-dates. It does not delete the row.** ADR 0010 said *an Entry never survives as an empty record* and bound grid-row Delete to `removeSegments`. This ADR makes zero Segments a legal dateless row. Zero Segments cannot mean “deleted” and “unscheduled” at once. **This ADR revises that consequence of ADR 0010** (ADR 0006: the old ADR is not edited; the new rule lives here):

- `removeSegments` of the last Segment is un-date: the Entry stays, with no dates and no Segments.
- `entries.remove(id)` deletes the row and the subtree.
- Grid-row Delete on the name cell is `remove(id)`, not `removeSegments`.
- Keyboard Delete on a bar un-dates when it was the last bar.

`update(id, { segments: [] })` still throws `EmptySegmentsError`. Absent is dateless. Empty is illegal.

---

# The work

## The build

**An Entry has dates if and only if it holds at least one Segment**, and `start`/`end` are always the envelope.

- `add({ start, end })` mints one Segment. `add({ segments })` with no dates derives the envelope. `add({})` stores no dates and no Segments.
- `update(id, { start: undefined, end: undefined })` is the un-date verb; it clears the Segments.
- Two refusals stay: one date without the other, and `segments: []` (`EmptySegmentsError`).
- `start` and `end` join `isOptionalEntryKey`. Serialization and `entry-reader.ts` each gain a `length === 0` arm.
- Delete the `referenceDate` fill (`entry-reader.ts:168-172`). Written down under D-S2-10 **and** D-S2-22. Not under D-S5-46, which survives.
- Reaches bar geometry, the Segment invariant (#212), sort comparators, and `range: 'fitDataset'`.
- A dateless Entry sorts **last**. A dateless row is inert to a **date** gesture (no bar to drag). `fitDataset` over nothing dated shows the empty-dataset range. An S7 link to a dateless endpoint raises a diagnostic and draws nothing.
- **Last-segment-remove un-dates** — it does not delete the Entry. `entries.remove(id)` deletes the row. See [Required follow-up](#required-follow-up--a-date-path-and-last-bar-remove).
- This ADR writes schema **5**.

**`FieldContext.durationOf` returns `Duration | undefined`.** It is **plugin-author surface**, so it is a published change, and it reaches further than the signature. **This list is an audit's, not a re-derivation — do not rebuild it.**

| Site | What changes |
|---|---|
| `field-access.ts:92` | **The canonical implementation, and the guard goes here first.** Unguarded it yields `NaN`, not a throw — see [`refuted.md`](../shared/refuted.md) item 10 |
| `core-fields.ts:118` | The shipped **`duration` core Field** reads `ctx.durationOf(entry)` in its `compute` arm, so the column answers `undefined` on a dateless row. The cell is **blank** — `formatDuration` answers `''` for `undefined` (`core-fields.ts:44-45`). **Assert the blank cell.** Do not invent an em dash or a placeholder |
| `aggregators.ts:14` | `durationMs`, behind `weightedMeanByDuration` at `:51` — skips a dateless child rather than weighting it at zero |
| `inline-editing.ts:113` | **A provider, not a caller.** `fieldContextFor` builds a `FieldContext` and supplies its own `durationOf`. It changes as an implementation |
| `etc/freegantt.api.md` | The API report gates on I11, so the signature lands there or CI fails |
| four test stubs | `layout/rows/filter.test.ts`, `layout/rows/sort.test.ts`, `data/fields/field-types.test.ts`, `data/fields/field-access.test.ts` build a `FieldContext` by hand |


---

# Closed decisions

## 4 — what `InvalidInstantError` refuses

**Settled 2026-09-08.**

It refuses an unreadable date, and an Entry that authors one date without the other. It stops refusing an Entry that authors neither, because dates become optional on every kind (this ADR).

## 15 — `Duration` and the magic constant

**Closed 2026-09-09 by the code.** Was: *`FieldContext` owes a usable duration, or `time/` owes a public conversion.*

Neither is owed. `MS` is **already public** — exported at `api/index.ts:365`, defined at `time/instant.ts:45`, with `SECOND`, `MINUTE`, `HOUR` and `DAY`. The library divides by it itself at `core-fields.ts:46`.

**It was a documentation defect, not a design question.** The published `compute` sample wrote `duration.value / 86_400_000` and taught every consumer to write what I10 refuses to write inside `src/`. The sample writes `duration.value / MS.DAY`. **Never publish the raw constant.**

