---
status: accepted — built and verified 2026-09-11, in the field redesign. Amended 2026-09-30 ([#648](https://github.com/freegantt/freegantt/issues/648)) — Delete on a bar removes its Entry and never clears dates. "Clear dates" is its own command. Verdict: [BUILD-SPEC.md §Build 1](../../plans/field-redesign/BUILD-SPEC.md#build-1--adr-0012-optional-dates). Spike report: [reviews/2026-09-09-0012-optional-dates-spikes](../../plans/field-redesign/reviews/2026-09-09-0012-optional-dates-spikes/README.md).
decided (*"core does not paint a diamond"* narrowed 2026-09-12 by [ADR 0022](0022-core-ships-variants-and-a-variant-answers-about-itself.md), proposed — core paints no diamond **for a zero-length span on its own**; it ships `diamond()`, which claims one only once an author writes it): an Entry spans iff both `start` and `end` are present; it holds a Segment (and draws a bar) iff it spans; one date without the other is legal (decision 4, grill 2026-09-10); default `gridColumns` is `['name', 'start', 'end']`; core does not paint a diamond. **Amended 2026-09-30 (#648):** Delete on a focused bar removes the Entry that bar draws; it never clears dates. "Clear dates" is its own context-menu command and the only UI path that clears dates.
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

> **One sentence here is retired.** §Decision's line 63 reads: *"End with no start is allowed.
> Inclusive-end formatting has no start: show the stored end as a plain instant. Do not guess a
> day."* [#577](https://github.com/Pawel-IT/FreeGantt/issues/577) ships `formatInclusiveDate`, and
> its "show the stored end as a plain instant" clause does not survive: with no start, it still
> steps `end` back one millisecond and shows the day that lands on, the same as it does with a
> start. Only a zero-length span (`end === start`) shows `end` unchanged — and that check needs a
> start to fire at all. **The rest of the paragraph — end with no start is allowed — stands.**

> **Two sentences here are retired by [#648](https://github.com/freegantt/freegantt/issues/648).**
> §Consequences says: *"Keyboard Delete on a bar un-dates both dates when it was the last bar."* The
> "Required follow-up" section repeats it. Both sentences are void. Delete on a bar removes the
> Entry. See "Amendment: Delete on a bar removes its Entry" below. **The rest of both paragraphs
> stands.**

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

The duration **compute Field** returns `Duration | undefined` until both dates exist, and the cell is **blank**. That needs a guard, not nothing: `diffMs(entry.end, entry.start)` with no guard, and `diffMs` is `a - b`, so an absent date yields **`NaN`, not a throw**. The cell then renders `"NaN d"` and `weightedMeanByDuration` poisons the parent's aggregate. Guard the calculation first. Duration is a computed Field like any other — a caller reads it through `entry.read('duration')`, not a fourth door. The full call-site list is in [ADR 0012's work](../../plans/field-redesign/0012-optional-dates/README.md#the-work) — **do not re-derive it**.

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

## Amendment: Delete on a bar removes its Entry

Amended 2026-09-30, [#648](https://github.com/freegantt/freegantt/issues/648).

### Why the old rule ends

The old rule said a bar draws a span, so Delete on a bar clears the span and keeps the record. A grid
row names the record, so Delete on a row removes it. The rule was true when a bar could draw a Segment
that was not an Entry.

Three facts changed it:

- [ADR 0026](0026-the-segment-retires.md) retired the Segment type. Each Segment is an ordinary child
  Entry now. A bar always names one Entry.
- The library cannot tell a split task from a lane. A segmented row (`childrenAsSegments`) can mean
  either. The library must never remove a record the user did not point at. A bar points at exactly one
  Entry, so removing that Entry is safe. Clearing its dates is not the same as pointing at it.
- The old rule left a dateless Entry with no bar and no row. A segment child with no dates has no bar on
  the segmented row, and the parent draws no row for it. The user cannot see it or reach it.

One key on two targets did two different things. That was a trap. Now the key does one thing.

### The rule

**Delete on a focused bar removes the Entry that the bar draws. It never clears dates.**

| Target | What Delete does |
|---|---|
| A bar that is the one bar of its row | Removes the Entry. The row goes. |
| A bar of a Variant that draws several bars for one Entry | Removes that one Entry. Every bar of it goes. |
| A bar in a segmented row (`childrenAsSegments`) | Removes only the child Entry that the bar draws. The other children stay. |
| The last child bar of a segmented row | Removes that child. The parent stays as an empty row. |
| The bar of a parent that rolls up its children | Removes the parent and every Entry below it, the same as row Delete. |
| A bar of a locked Entry, or of an Entry a remove rule refuses | Writes nothing. Announces the reason. |

The parent stays when its last child goes. The empty row still shows in the grid. The user can delete it
there. The library does not remove the parent for the user.

Bar Delete asks the remove rule, the same as row Delete ([ADR 0039](0039-a-remove-rule-refuses-a-user-delete.md)).
The rule answers for the Entry and for every Entry below it. One refused Entry stops the whole Delete.
A refusal writes nothing. The Gantt raises one `info` report, code `entry-remove-refused`, that names the
refused Entries.

One Delete is one undo step. Undo restores every removed Entry together.

### "Clear dates" is its own command

"Clear dates" is a context-menu command. It clears `start` and `end` of the acted-on Entry and keeps the
record. It is the only UI path that clears dates. No key runs it by default.

- It writes `update(id, { start: undefined, end: undefined })` in one transaction. That is one undo step.
- It offers itself only where the Entry owns its dates. A rolling-up parent does not own its dates
  ([ADR 0013](0013-what-decides-that-a-row-derives-its-values.md)), so the command does not appear for
  it. An Entry with no dates has nothing to clear, so the command does not appear for it either.
- The lock and the Field's writable rule apply, as they do for a cell edit.
- On a selection, it clears every acted-on Entry that owns its dates and passes over the rest. A
  rolling-up parent or a dateless Entry has nothing to clear, so passing over it is not a refusal.
- A refusal is all or nothing, the same as Delete. If the lock, the writable rule or `beforeChange`
  refuses one Entry, the command writes nothing and reports the reason.

The dataset door does not change. `update(id, { start: undefined, end: undefined })` stays the un-date
verb. `entries.remove(id)` stays the remove verb.

### What stays the same

- An Entry spans if and only if both `start` and `end` are present.
- One date without the other is legal.
- A grid row Delete removes the Entry, as before.
- The remove rule stops only the user. `entries.remove()`, `load`, `syncAll` and undo still remove past it.

## Issues this ADR depends on

| Issue | What this ADR needs from it |
|---|---|
| [#242](https://github.com/Pawel-IT/FreeGantt/issues/242) | Optional dates change what `InvalidInstantError` guards. **This ADR lands before #242's own fix** |

## Appendix — the calls this ADR's span invariant rests on

These entries were `plans/field-redesign/BUILD-LOG.md`. That log is deleted; what this ADR and
`src/` cite lives here.

| | The call |
|---|---|
| `Q5` | does `model/`'s types-only carve-out admit a small runtime helper? **Answered 2026-09-11: yes, one function.** `spansTime(entry)` states this ADR's span invariant in one place, and five of the six casts that restated it are gone |
| `J2` | `wholeEntryBar`'s signature is untouched; the span guard sits once in `produceBarsForRow` |
| `N10` | `wholeEntryBar`'s parameter should be a spanning Entry, and that is a public change |

