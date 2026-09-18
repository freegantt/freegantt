---
status: accepted — built and verified 2026-09-11, in the field redesign. Verdict: [BUILD-SPEC.md §Build 1](../../plans/field-redesign/BUILD-SPEC.md#build-1--adr-0012-optional-dates). Spike report: [reviews/2026-09-09-0012-optional-dates-spikes](../../plans/field-redesign/reviews/2026-09-09-0012-optional-dates-spikes/README.md).
decided (*"core does not paint a diamond"* narrowed 2026-09-12 by [ADR 0022](0022-core-ships-variants-and-a-variant-answers-about-itself.md), proposed — core paints no diamond **for a zero-length span on its own**; it ships `diamond()`, which claims one only once an author writes it): an Entry spans iff both `start` and `end` are present; it holds a Segment (and draws a bar) iff it spans; one date without the other is legal (decision 4, grill 2026-09-10); default `gridColumns` is `['name', 'start', 'end']`; core does not paint a diamond.
open: none. Two decisions closed — 4 (overruled 2026-09-10) and 15. The working material is in `plans/field-redesign/0012-optional-dates/`.
---

# Dates are optional on every kind

> **Superseded in one clause by [ADR 0027](0027-a-spanning-entry-draws-a-bar.md)**, ruled
> 2026-09-18 (#421). This ADR's decision line names a biconditional: *"an Entry spans iff both
> `start` and `end` are present; it holds a Segment (and draws a bar) iff it spans."* The first half
> stands, unchanged. The second half named `Segment`, a type [ADR 0026](0026-the-segment-retires.md)
> retired — ADR 0027 states what replaces it: a spanning Entry draws one Bar, on the row its
> `parentId` names, unless a row source has claimed it. `EmptySegmentsError` and the *"never
> empty"* Segment-count rule in this ADR's own §Consequences have no successor; there is nothing
> left to count. The optional-dates decision itself — one date without the other is legal — stands
> as written. **Do not rewrite the body.**

> **One sentence here is retired.** The paragraph on the duration Field cites ADR 0014 *decision 13* for deleting `FieldContext.durationOf`. The author withdrew ADR 0014 on 2026-09-11 before it was built ([the gap at 0014](README.md#the-gap-at-0014)), so `durationOf` still ships and [#274](https://github.com/Pawel-IT/FreeGantt/issues/274) is still open. [ADR 0017](0017-the-entry-answers-questions-about-itself.md) closes both. **The guard this ADR asked for landed, and the decision stands.**

**This ADR carries no open decision, and it lands second**, after [ADR 0016](0016-the-library-holds-no-save-format.md). [ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) demotes an Entry to *a normal Entry with no dates*, and `model/entry.ts:31-33` declares `start: Instant` and `end: Instant` **required** today. That shape is not representable until this lands. **There is no Document**, so this ADR writes no schema number.

The working material is [`plans/field-redesign/0012-optional-dates/`](../../plans/field-redesign/0012-optional-dates/README.md).

## Context

`entry-reader.ts:170` refuses a dateless `'span'` with `InvalidInstantError`, and gives a childless group a zero-length span at `referenceDate` — a clock reading taken when the Dataset was built, never saved, so an empty group reloads somewhere else.

An author adds a row now and dates it later. That is ordinary use, and today's rule refuses it.

## Decision

### Dates are optional on every kind, and a span is both dates

**An Entry spans if and only if both `start` and `end` are present.** It holds a Segment, and draws a bar, if and only if it spans. `start`/`end` are the envelope when Segments exist. One biconditional still keeps the blast radius to one rule; the pair is the span, not “any date.”

**Grill 2026-09-10 overruled decision 4’s pair refusal.** A row may hold only `start`, or only `end`. That date shows in the grid. It mints no Segment. The timeline draws nothing until both exist. When the second date arrives, mint one Segment. When one date of a pair is cleared, drop the Segment, keep the other date, and the bar goes.

| Call | Result |
|---|---|
| `add({ start, end })` | mints one Segment, as today |
| `add({ segments })`, no dates | derives the envelope from them |
| `add({})` | stores no dates and no Segments |
| `add({ start })` | stores start, no Segment, no bar |
| `add({ end })` | stores end, no Segment, no bar |
| `update(id, { start })` on a blank row | legal — one Field, same as the cell editor |
| `update(id, { start: undefined, end: undefined })` | the un-date verb. It clears both dates and the Segments |
| `update(id, { segments: [] })` | `EmptySegmentsError` — *never empty*, [#212](https://github.com/Pawel-IT/FreeGantt/issues/212) |

An author adds a row now and dates it later, which is ordinary use. An Entry that does not span **draws no bar and still shows its grid row**.

Four consequences are visible to a consumer, so each gets an answer here rather than a file to visit:

- A row with neither date sorts **last** under every comparator, and the order is stable. A start-only row sorts by start.
- A row that does not span is **inert to a date gesture**. It draws no bar, so there is no grip to grab and no drag creates one. The grid cell editor is the date path.
- `range: 'fitDataset'` includes a one-date instant. The window may jump when someone types a start with no bar. Accepted. Over a dataset where nothing has any date, it shows the range an empty dataset already shows.
- An S7 link naming an endpoint that does not span raises a diagnostic and draws nothing.

The duration **compute Field** returns `Duration | undefined` until both dates exist, and the cell is **blank**. That needs a guard, not nothing: `field-access.ts:92` computes `diffMs(entry.end, entry.start)` with no guard, and `diffMs` is `a - b`, so an absent date yields **`NaN`, not a throw**. The cell then renders `"NaN d"` and `weightedMeanByDuration` poisons the parent's aggregate. Guard the calculation first. [ADR 0014](README.md#the-gap-at-0014) decision 13 deletes `FieldContext.durationOf` — duration is that compute Field, not a fourth door. The full call-site list is in [ADR 0012's work](../../plans/field-redesign/0012-optional-dates/README.md#the-work) — **do not re-derive it**.

**A zero-length span stays legal, and D-S5-46 needs no rewrite.** Its two stated reasons are the half-open interval `[start, end)` and `layout/gesture-draft.ts`'s resize clamp. Neither is the `referenceDate` fill. `start === end` is an authored shape. **Core does not paint a diamond.** The bar has no width.

End with no start is allowed. Inclusive-end formatting has no start: show the stored end as a plain instant. Do not guess a day.

`entry-reader.ts:170` gives a childless parent a zero-length span at `referenceDate` today — a clock reading taken when the Dataset was built, never saved, so an empty parent reloads somewhere else. **The fill is deleted.** It is written down under D-S2-10 **and** D-S2-22.


## Consequences

- **`Entry.segments` stops being *never empty*.** The biconditional replaces it: an Entry holds at least one Segment iff it spans. A one-date row holds no Segments. `update(id, { segments: [] })` still throws `EmptySegmentsError` ([#212](https://github.com/Pawel-IT/FreeGantt/issues/212)).
- **Last-segment-remove un-dates both dates.** ADR 0010's *"An Entry never survives as an empty record"* is revised here, not in that file. `removeSegments` of the last Segment keeps the Entry and clears start and end. `entries.remove(id)` deletes it. Clearing one **cell** leaves the other date and drops the Segment. Two intents.
- **Default `gridColumns` is `['name', 'start', 'end']`.** Hide is live if a product wants fewer columns. The date editor must open on a blank cell (today it refuses with `no-date-value`). It still writes one Field.
- **The `referenceDate` fill is deleted.** It is written down under D-S2-10 **and** D-S2-22. Name both halves separately or a reader retires the wrong sentence.
- **A zero-length span stays legal, and D-S5-46 needs no rewrite.** Core does not paint a diamond.
- **No schema number.** [ADR 0016](0016-the-library-holds-no-save-format.md) deleted the Document. Optional dates live on `Entry` and on constructor ingest only.
- **A parent whose every child does not span has no bar.** The Rollup skips holes: all children start-only → parent has a start, no end, no bar. [ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) owns the Rollup pass; this biconditional is what that pass must restore. Combined spike Improvement D.

### Required follow-up

**The date path is the grid.** Default columns include `start` and `end`. The date editor opens on a blank cell and writes one Field. A timeline “set dates” gesture is not this cut.

**Last-segment-remove un-dates both dates.** ADR 0010 said an Entry never survives empty and bound grid-row Delete to `removeSegments`. This ADR makes zero Segments a legal row that does not span. The new rule: `removeSegments` of the last Segment keeps the Entry and clears start and end; `entries.remove(id)` deletes the row; grid-row Delete on the name cell is `remove(id)`. Keyboard Delete on a bar un-dates both dates when it was the last bar. ADR 0006: the old ADR is not edited. The revision lives here.

## Issues this ADR depends on

| Issue | What this ADR needs from it |
|---|---|
| [#242](https://github.com/Pawel-IT/FreeGantt/issues/242) | Optional dates change what `InvalidInstantError` guards. **This ADR lands before #242's own fix** |
