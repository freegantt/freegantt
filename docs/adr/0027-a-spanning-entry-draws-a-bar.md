---
status: accepted — ruled 2026-09-18 by the coordinator, out of
[#421](https://github.com/Pawel-IT/FreeGantt/issues/421). Built in C7b of
`plans/segment-is-a-bar/README.md`. Working material: `plans/segment-is-a-bar/BUILD-LOG.md`.
decided: an Entry spans iff both `start` and `end` are present (`spansTime`,
`src/model/stored-entry.ts:56`), and a spanning Entry draws one Bar, on the row its `parentId`
names. A claimed parent draws no Bar of its own; the Bars on its row are its children's.
open: nothing.
---

# A spanning Entry draws a Bar

**Reads after [0026](0026-the-segment-retires.md).** That ADR retires `Segment` as a type. This one
states the rule that replaces the half of [ADR 0012](0012-dates-are-optional-on-every-kind.md) that
named it.

## Context

ADR 0012 decided two things in one biconditional: *"an Entry spans iff both `start` and `end` are
present"*, and *"it holds a Segment (and draws a bar) iff it spans"*
(`docs/adr/0012-dates-are-optional-on-every-kind.md:3`). The first half is a fact about the record —
whether it has two dates or fewer. The second half named a fact about a type, `Segment`, that
[#421](https://github.com/Pawel-IT/FreeGantt/issues/421) removed
([ADR 0026](0026-the-segment-retires.md)). Once `Segment` is gone, "it holds a Segment" answers a
question nothing asks anymore, and ADR 0012's body is not rewritten to say so — an accepted record is
superseded, never rewritten (`docs/adr/README.md`).

**The drawing rule still needs an answer**, because a spanning Entry still draws something on the
timeline, and a segmented parent — an Entry whose children draw as bars on its own row, under
`rowSource: { childrenAsSegments: <when-pattern> }` (ADR 0026) — still needs a rule for what its own
row shows.

## Decision

**An Entry spans iff both `start` and `end` are present.** This half of ADR 0012's biconditional is
unchanged; `spansTime` (`src/model/stored-entry.ts:56`) is the one place it is written, and nothing
in this ADR moves it.

**A spanning Entry draws one Bar, on the row its `parentId` names.** This replaces "it holds a
Segment (and draws a bar) iff it spans." There is no second record to hold — the Entry that spans is
the Bar. A segmented parent draws no bar of its own; the Bars its row shows are its children's,
placed there by the row-source rule ADR 0026 states. A rolling-up parent the rule does **not** match
keeps its rail: it
still draws one Bar over its own (rolled-up) span
([ADR 0013](0013-what-decides-that-a-row-derives-its-values.md);
`src/layout/bars/bar.ts`'s `wholeSpanUnlessSegments`). Only a segmented parent's own row shows no Bar
of its own record — being segmented, not deriving, is what removes it.

**"At least one Segment iff it spans" has no successor**, because the thing it counted — how many
Segments one spanning Entry held — no longer exists. A spanning Entry is one record; it draws exactly
one Bar; there is nothing left to count.

## Consequences

- **ADR 0012's optional-dates decision stands untouched.** A one-date row still shows in the grid and
  draws nothing on the timeline; `add({})`, `add({ start })`, `add({ end })` and the un-date verb
  (`update(id, { start: undefined, end: undefined })`) all read the same today as ADR 0012 states
  them. Only the Segment half of its biconditional is superseded, and its body is not edited to say
  so — this ADR is the notice.
- **`EmptySegmentsError` and the *"never empty"* Segment-count rule ADR 0012 §Consequences state do
  not apply to a Bar.** A Bar is the spanning Entry itself; there is no count of drawn pieces to be
  empty or non-empty.
- **Delete on a child drawn as a Segment still un-dates, not removes**, the same outcome ADR 0012's
  worked table gave a bar's last-Segment removal — that child is a spanning Entry drawing a Bar, and clearing
  its span is what Delete on a Bar does. `entries.remove(id)` stays the row-removal door, unchanged.
- **`CONTEXT.md`'s *Bar* entry states this rule in full; `docs/08-a-bar-is-an-entry.md` states it
  through its figures.** This record exists so a reader who follows ADR 0012's own citation of
  "Segment" lands on the current rule rather than a dead end.

Supersedes the Segment clause of [ADR 0012](0012-dates-are-optional-on-every-kind.md) only. Its
optional-dates decision — one date without the other is legal, the biconditional on `start`/`end`
itself, `add`/`update`'s worked table for dates — stands as written. Issue
[#421](https://github.com/Pawel-IT/FreeGantt/issues/421).
