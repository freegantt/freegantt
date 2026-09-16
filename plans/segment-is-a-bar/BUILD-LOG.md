# A Segment is a bar — build log (#421)

**Q** is a question for the author. It waits. **J** is a call an agent made alone, so a reviewer can find it and reverse it.

Write the entry the moment it comes up, not at the end. Check that one does not already exist before you open a second.

---

## Q1 — does `update(id, { segments: [] })` make an Entry plain?

**Raised 2026-09-16, in the plan. B2. OPEN.**

Today it throws `EmptySegmentsError` (`data/entry-reader.ts:600`): under ADR 0012 a spanning Entry always held a Segment, so empty was illegal. Under #421 a spanning Entry with `segments: []` is the plain bar — the state every plain Entry stores.

**Recommendation:** make it legal. It clears the authored Segments and keeps the Entry's dates, so the row draws one plain bar. `EmptySegmentsError` retires. A consumer un-dates with `update(id, { start: undefined, end: undefined })`, which is already the ADR 0012 door.

---

## Q2 — what does removing the last authored Segment leave?

**Raised 2026-09-16, in the plan. B2. OPEN.**

Today `removeSegments` on the last Segment un-dates the Entry (`CONTEXT.md:67`). Under #421 the dates are what make a bar, and the Segments are pieces of it.

**Recommendation:** the Entry keeps its envelope and becomes a plain bar. Removing pieces of a bar does not delete the bar's dates. `removeSegments([plainBarId])` is the one call that un-dates, because the plain bar's id names the whole bar. If the author keeps today's rule instead, Q1 and Q2 must still agree with each other.

---

## Q3 — does `entries.addSegment(entryId, input)` ship beside `updateSegment`?

**Raised 2026-09-16, in the plan. B3. RULED the same day: yes, it ships in B3.** The first recommendation was "not in this issue", on scope alone. The author asked why, and the scope reason did not hold. It stands here as the record.

#421 names `updateSegment` and keeps the positional `update(id, { segments })` as the structural door. Adding one day to a request then reads `update(id, { segments: [...entry.segments.map((s) => s.toInput()), { start, end }] })`.

**Why it ships now.**
- The positional form makes the consumer rebuild the array to add one piece. That is the consumer re-deriving what the store holds, which is the stop rule's smell. B7's "add a day" story would log it as an API gap mid-build.
- The positional door is fragile for this job. `toInput()` omits Segment ids, so the write keeps ids by index. Append works. A reorder swaps ids under the Selection.
- `removeSegments` exists and `updateSegment` ships in B3. Remove and change with no add is a lopsided surface.
- The labour brief adds days to a request as a first-class action.

**Shape.** `entries.addSegment(entryId, input): Segment`. Singular, like `updateSegment`. Reads through `toSegment`, mints or takes the id, refuses a duplicate id as `add` does, writes one structural `segments` row (J-plan-3), returns the live `Segment`. On a plain Entry it drops the plain bar's id and the new Segment's id names the bar. Recorded as J-plan-8 in the README.
