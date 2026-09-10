---
status: proposed — a draft, not a decision. Split out of ADR 0011 on 2026-09-09.
decided: an Entry has dates if and only if it holds at least one Segment; `start`/`end` are always the envelope; a dateless Entry draws no bar and still shows its grid row.
open: none. Two decisions closed — 4 and 15. The working material is in `plans/field-redesign/0012-optional-dates/`.
---

# Dates are optional on every kind

**This ADR carries no open decision, and it lands first.** [ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) demotes an Entry to *a normal Entry with no dates*, and `model/entry.ts:31-33` declares `start: Instant` and `end: Instant` **required** today. That shape is not representable until this lands.

The working material is [`plans/field-redesign/0012-optional-dates/`](../../plans/field-redesign/0012-optional-dates/README.md).

## Context

`entry-reader.ts:170` refuses a dateless `'span'` with `InvalidInstantError`, and gives a childless group a zero-length span at `referenceDate` — a clock reading taken when the Dataset was built, never saved, so an empty group reloads somewhere else.

An author adds a row now and dates it later. That is ordinary use, and today's rule refuses it.

## Decision

### Dates are optional on every kind, and dates are Segments

**An Entry has dates if and only if it holds at least one Segment**, and `start`/`end` are always the envelope. One biconditional keeps the blast radius to one rule.

| Call | Result |
|---|---|
| `add({ start, end })` | mints one Segment, as today |
| `add({ segments })`, no dates | derives the envelope from them |
| `add({})` | stores no dates and no Segments |
| `update(id, { start: undefined, end: undefined })` | the un-date verb. It clears the Segments in the same write |
| `add({ start })` | `InvalidInstantError` — one date without the other |
| `update(id, { segments: [] })` | `EmptySegmentsError` — *never empty*, [#212](https://github.com/Pawel-IT/FreeGantt/issues/212) |

An author adds a row now and dates it later, which is ordinary use, and today's `InvalidInstantError` for a dateless `'span'` refuses it. An Entry with no span **draws no bar and still shows its grid row**.

Four consequences are visible to a consumer, so each gets an answer here rather than a file to visit:

- A dateless Entry sorts **last** under every comparator, and the order is stable.
- A dateless row is **inert to a gesture**. It draws no bar, so there is no grip to grab and no drag creates one.
- `range: 'fitDataset'` over a dataset where nothing is dated shows the range an empty dataset already shows.
- An S7 link naming a dateless endpoint raises a diagnostic and draws nothing.

`FieldContext.durationOf` becomes `Duration | undefined`, and a dateless row's `duration` cell is **blank**. That needs a guard, not nothing: `field-access.ts:92` computes `diffMs(entry.end, entry.start)` with no guard, and `diffMs` is `a - b`, so an absent date yields **`NaN`, not a throw**. The cell then renders `"NaN d"` and `weightedMeanByDuration` poisons the parent's aggregate. Guard `durationOf` first. The full call-site list is in [`work-plan.md`](../../plans/field-redesign/0012-optional-dates/README.md) [ADR 0012](0012-dates-are-optional-on-every-kind.md) — **do not re-derive it**.

**A zero-length span stays legal, and D-S5-46 needs no rewrite.** Its two stated reasons are the half-open interval `[start, end)` and `layout/gesture-draft.ts`'s resize clamp. Neither is the `referenceDate` fill. A milestone is one instant, and that is an authored shape.

`entry-reader.ts:170` gives a childless group a zero-length span at `referenceDate` today — a clock reading taken when the Dataset was built, never saved, so an empty group reloads somewhere else. **The fill is deleted.** It is written down under D-S2-10 **and** D-S2-22.


## Consequences

- **`Entry.segments` stops being *never empty*.** The biconditional replaces it: an Entry holds at least one Segment, or it holds no dates at all. `update(id, { segments: [] })` still throws `EmptySegmentsError` ([#212](https://github.com/Pawel-IT/FreeGantt/issues/212)).
- **The `referenceDate` fill is deleted.** It is written down under D-S2-10 **and** D-S2-22. Name both halves separately or a reader retires the wrong sentence.
- **A zero-length span stays legal, and D-S5-46 needs no rewrite.** Its two stated reasons are the half-open interval `[start, end)` and `layout/gesture-draft.ts`'s resize clamp. Neither is the `referenceDate` fill. A milestone is one instant, and that is an authored shape.
- **The Document gains optional `start` and `end`**, and spends one schema number. See [`plans/field-redesign/shared/rulings.md`](../../plans/field-redesign/shared/rulings.md).

### Known hole

**A dateless row cannot be dated through the UI.** It draws no bar, so no gesture reaches it, and the default `gridColumns` is `['name']`, so no cell editor reaches `start`. Dating from the timeline is its own gesture, with its own capability and veto surface, and it does not belong in a storage redesign. Recorded as a hole, the way [#235](https://github.com/Pawel-IT/FreeGantt/issues/235) is.

## Issues this ADR depends on

| Issue | What this ADR needs from it |
|---|---|
| [#242](https://github.com/Pawel-IT/FreeGantt/issues/242) | Optional dates change what `InvalidInstantError` guards. **This ADR lands before #242's own fix** |
