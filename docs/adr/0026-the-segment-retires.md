---
status: accepted — ruled 2026-09-17 by the author (Q17, Q25, Q26, Q28), out of
[#421](https://github.com/Pawel-IT/FreeGantt/issues/421). Built in C6 of
`plans/segment-is-a-bar/README.md`. Working material: `plans/segment-is-a-bar/CHILD-ENTRY-DESIGN.md`,
`plans/segment-is-a-bar/SPIKE-FINDINGS.md`, `plans/segment-is-a-bar/BUILD-LOG.md`.
decided: the `Segment` type retires, with no legacy key and no migration path. What it named — a
drawn piece of one Entry's span — is now an ordinary child `Entry`, matched onto its parent's row by
a rule on the row source. `Item` retires into `Bar`, because the word `Item` named a drawn unit under
a name none of its own consumers used.
open: nothing.
---

# The Segment retires

**Reads after [0025](0025-the-selection-holds-entries-not-segments.md).** That ADR states where the
Selection's unit goes; this one states why the type behind the old unit goes with it.

## Context

`Segment` was a stored, drawn piece of one Entry's span — never its own record, never addressable by
`entries.update`, matched by its own write doors (`updateSegment`, `addSegment`, `removeSegments`),
its own errors (`SegmentNotFoundError`, `EmptySegmentsError`, `SegmentsOutOfSyncError`,
`DuplicateSegmentIdError`), and its own rollup pass (`widenSegmentsToEnvelope`,
`fitSegmentsToEnvelope`). An early design for [#421](https://github.com/Pawel-IT/FreeGantt/issues/421)
(Option C, `plans/segment-is-a-bar/BUILD-LOG.md` Q1–Q16) proposed keeping that shape and adding a
name, props, a variant and capabilities to it — the four things an `Entry` already has.

**The Q6 grill counted the cost of that path and found it did not pay for itself.** Read against an
ordinary Entry, Option C doubled eight doors:

| Job | Entry door | Segment door under Option C |
|---|---|---|
| read a value | `entry.read(k)` | `segment.read(k)` |
| write a value | `entries.update` | `entries.updateSegment` |
| add one | `entries.add` | `entries.addSegment` |
| remove | `entries.remove` | `entries.removeSegments` |
| match | `when` | `whenSegment` |
| propose an edit | `EntryEdits` | `SegmentEdits` |
| address a change | `store: 'entries'` | `store: 'segments'` |

Only the optional `segment?` argument on a producer disappeared under Option C; everything else on
the list was a second name for a job the Entry door already does
(`plans/segment-is-a-bar/CHILD-ENTRY-DESIGN.md`). Building `Segment` out fully meant building a
second id index, a second live-object cache, a second props ingest, a second `ChangeSet` store, a
second Rollup input, and a second round of variant and capability resolution — the whole `Entry`
machine, under a second name, for a record with no stored classification of its own to justify the
duplication (ADR 0013).

**Spike S4 measured the one number that had kept Option C alive: the cost of 10,000 child Entries
instead of 10,000 Segments.** The Q6 grill called that number "the decisive objection," and nobody
had measured it before S4 ran. The measured result reverses the objection: against a 10,000-bar
baseline on the shipped Segment design, the same 10,000 bars as child Entries build the frame **20%
cheaper**, and the two costs that grew — one write, one row resolution — each **halve** once the
Rollup stops re-deriving an index `EntryStore` already memoizes
(`plans/segment-is-a-bar/SPIKE-FINDINGS.md`, `plans/segment-is-a-bar/BUILD-LOG.md` Q17). Read
literally, "10,000 child Entries" never was more expensive than "10,000 Segments" — it was a second,
unbuilt type being compared against a first, shipped one, and the shipped one was cheaper once
someone measured it.

## Decision

**`Segment` retires as a type, with nothing standing in for it.** What it named — a drawn piece of
one Entry's span, matched onto a row that is not its own — is now an ordinary child `Entry`, whose
`parentId` names the row it draws on. A row source rule,
`rowSource: { source: 'entries', childrenAsSegments: <when-pattern> }`, says which segmented parent
draws its children as bars on its own row rather than giving each child a row of its own
([Q17](../../plans/segment-is-a-bar/BUILD-LOG.md), ruled 2026-09-17). Nothing marks such a
child — that it draws as a Segment is a fact about its parent's row, never a stored fact on the
child (ADR 0013).

**Every door a Segment needed twice, an Entry already has once**, so the retirement deletes rather
than replaces:

| Area | What retires |
|---|---|
| model | `Segment`, `SegmentId`, `segmentId()`, `StoredEntry.segments`, `EntryInput.segments`, `Item.segmentId`, `FrameBar.segmentIds`, `FrameRow.segmentIds` |
| errors | `SegmentNotFoundError`, `EmptySegmentsError`, `SegmentsOutOfSyncError`, `DuplicateSegmentIdError` |
| data | `updateSegment`, `addSegment`, `removeSegments`, `entryIdOfSegment`, `entryIdsOfSegments`, `segmentIdsOfEntries`, `segmentIdsDroppedBy`, the positional id match, `#removeSegmentsFrom`, `toSegment`/`toSegments`, `reconcileEnvelope`, `reconcileExtenderEdits`'s envelope clause |
| rollup | `widenSegmentsToEnvelope`, `fitSegmentsToEnvelope`, and the clamp-then-widen block that exists only because a rolling-up parent could also own Segments — a state a child Entry can never be in, since an Entry that rolls up and an Entry that is a bar are never the same record |
| time | `envelopeOfSegments` |
| layout | `followSegments`/`ignoreSegments`, `segmentIdsByItem`/`segmentIdsOfEntries`, `segmentIdsForItem`, the `segments` branch of the gesture-draft pass |
| view | `view/segment-selection.ts` as a module (retired into `view/entry-selection.ts`, [0025](0025-the-selection-holds-entries-not-segments.md)), `selectedSegmentIds`, `selectableSegmentsInRowOrder`, `reveal`'s dual resolution |
| render | the `data-segment-id` stamps |
| api/fields | `measureDuration: 'segments'` (renamed `'children'`, [Q25](../../plans/segment-is-a-bar/BUILD-LOG.md)), the `segmented-entry` cell-editor reason |

**No migration path ships.** This library has never shipped to a user (CLAUDE.md), so there is no
consumer document written against `segments` to carry forward, and no compatibility key is added for
one that does not exist.

**`measureDuration: 'segments'` becomes `measureDuration: 'children'`**
([Q25](../../plans/segment-is-a-bar/BUILD-LOG.md), ruled 2026-09-17). A row's worked duration is the
sum of its children's spans, not its own envelope — the `Dataset` has no Gantt and cannot see whether
a consumer draws those children as bars on their parent's row, so `'segments'` named a drawing
decision on a surface that never draws. **Overlap has no rule of its own: core adds the children and
never reads them for overlap**, whatever the sum happens to count twice. A consumer who wants an
overlapped span counted once registers their own Aggregator, under their own name, the way every
other rollup policy in this library already works.

**`Item` retires into `Bar`** ([Q28](../../plans/segment-is-a-bar/BUILD-LOG.md), ruled 2026-09-17).
`Item` named the layout unit a variant draws, and every consumer of that unit already called it a
bar: `placeFrame` turns an `Item` into a `FrameBar`, `barSpan` places it, `BarRenderer` paints it,
`barLabels` labels it, `data-variant` stamps it. `Item` was the one name upstream of all of them, and
it doubled as a name for two unrelated concepts elsewhere in `src/**` — `MenuItem`, a context-menu
row, and `CellItem`, a grid cell — the same fault class issue #7 named for the word "chart," where
one word covering two concepts stalled a review with nothing to say which concept was meant.
`ItemId`/`itemId()`, `ItemProducer`, `VariantItems`/`EntryVariant.items`, `produceItemsForRow`,
`wholeEntryItem`/`fixedWidthItem`, and every `*ItemId` local rename to `Bar`, `BarId`/`barId()`,
`BarProducer`, `VariantBars`/`EntryVariant.bars`, `produceBarsForRow`, `wholeEntryBar`/`fixedWidthBar`
and `*BarId` respectively, through `pk-rename-symbol`. `MenuItem` and `CellItem` keep the generic
word, because it is generic in its place — a menu has items, a grid cell is one.

## Why other Gantt products' comparable ideas do not change the call

`plans/segment-is-a-bar/CHILD-ENTRY-DESIGN.md` surveyed how three shipped products represent a piece
of a task drawn on its parent's row, before this ADR existed to hold the names. The survey is
evidence for a decision already ruled on the measured cost above, not the reason for it — a Gantt
naming its own shape one way is not, by itself, checkable against this library's own constraints
(ADR 0013's ban on a stored classification chief among them). It is recorded here, named, so a reader
can verify each claim against its source rather than trust a paraphrase with the name removed.

- **DHTMLX Gantt's "Split tasks" feature draws a task's children on the task's own row, and the
  children are ordinary task records, not an index-addressed shape.** A split task's pieces are
  regular parent/child task records — the docs' own worked example gives each piece an id and a
  `parent` pointing at the split task (`{ id: 2, text: "Stage #1", ..., parent: 1 }`). Whether a task
  draws its children on its own row or gives each a row of its own is a per-task display switch
  (`task.render = "split"`), not a difference in the stored record. This is the same shape ADR 0026
  ships: a piece is a full record of the same kind as everything else, and a rule (here, a per-task
  property; in this library, a row source rule) decides how it draws. Source:
  <http://docs.dhtmlx.com/gantt/guides/split-tasks/>.
- **Syncfusion's Gantt "Split tasks" feature stores a piece as an index-addressed entry in an array on
  the parent task, with no id of its own.** Its worked example nests a `Segments` array directly on
  the task record, each entry holding only a start date and a duration:
  `{ TaskID: 1, ..., Segments: [{ StartDate, Duration }, { StartDate, Duration }] }`. A second,
  self-referential form links rows back to a task through a repeated `segmentId` foreign key instead
  of an array, but neither form gives a piece an identity a caller can address the way this library
  addresses an `EntryId`. This is the shape Option C's rejected `Q10`–`Q13` came closest to,
  and it is the shape this ADR's retirement removes: a piece with no id of its own, reachable only
  through its parent or through a foreign key nobody else in the record space uses. Source:
  <https://help.syncfusion.com/gantt-sdk/javascript/gantt-chart/data-binding#split-task>.
- **vis-timeline represents every drawn bar as one flat record, placed on its row by a `group` field
  the record carries.** An item takes `id`, `start`, `end`, `content` and `group`, where `group`
  names the row-like grouping the item draws under; there is no parent/child relation and no separate
  segment concept at all — every bar, whatever it represents, is the same flat shape. This is the
  shape this library's own `Entry` already has, once `parentId` is read as the row-naming field: one
  record kind, addressed once, with the row it draws on named by an ordinary field rather than by a
  second type. Source: <https://visjs.github.io/vis-timeline/docs/timeline/#items> (documented as
  "group" under *Items*).

**What the survey does not settle, and is not asked to.** None of the three sources rules on whether
a piece may carry a stored classification, whether its match syntax reads a `when` pattern, or how
undo folds a piece's write into one `ChangeSet` — those are this library's own decisions, made in
`plans/segment-is-a-bar/CHILD-ENTRY-DESIGN.md` and `BUILD-LOG.md` and cited above by their own
evidence. The survey answers one narrower question: whether "a piece of a task drawn on its own row,
with a stable id and no second type," is a shape other shipped products already chose, or an idea
unique to this library. DHTMLX's split tasks say it is not unique. Syncfusion's segments say the
narrower, index-addressed shape Option C rejected is also a real product's choice, and this library
is not the first to reject it in favor of a real id.

## Consequences

- **The live specs — `plans/01` §2.4, §11's I8, `plans/02` and `CONTEXT.md` — say `Bar` where they
  said `Item`.** I8's own wording — "Item identity is deterministic" — changes with it, and the
  layout snapshot test's name moves alongside. **An accepted ADR does not.** ADRs 0003, 0010, 0017,
  0018, 0022 and 0023 keep their prose, for the reason the third bullet below gives: a record is
  superseded, never rewritten. Only a live symbol one of them names moves — 0023's
  `variant-claimed-twice` is now `variant-matched-twice`, because that string is a code identifier a
  reader can still grep, not a sentence about what was decided.
- **`CONTEXT.md`'s *Segment* entry keeps one meaning with no type behind it: a child Entry drawn as
  one piece of its parent's row.** The entry was rewritten once already, in C1, to carry both the
  retiring type and the new `childrenAsSegments` key as one bounded, dated overlap
  ([Q24](../../plans/segment-is-a-bar/BUILD-LOG.md)); this ADR is where the type half of that overlap
  ends.
- **`ADR 0012`'s worked table, which reads `add({ start, end })` as "mints one Segment," and
  `ADR 0010`'s own body, stay as written** — an accepted record is superseded, never rewritten
  (`docs/adr/README.md`). A reader of either sees the type as it stood when that ADR was written, with
  this ADR's notice on 0010 pointing forward.
- **The 37 test files that read `segments` are deleted or rewritten against Entries** in the same
  build that deletes the type, so no test asserts a shape the library no longer has.
- **No `Item` symbol remains in `layout/`, `view/`, `render/` or `interaction/`** once the rename
  lands; `MenuItem` and `CellItem` are the only survivors of the word, each in the place it is
  generic.

Supersedes no earlier ADR on its own — [0025](0025-the-selection-holds-entries-not-segments.md)
carries that supersession. This ADR retires a type the earlier ADRs assumed shipped. Issue
[#421](https://github.com/Pawel-IT/FreeGantt/issues/421).
