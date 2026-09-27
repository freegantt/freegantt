---
status: accepted — ruled 2026-09-17 by the author (Q17, Q25, Q26, Q28), out of
[#421](https://github.com/Pawel-IT/FreeGantt/issues/421). Built in C6 of
`plans/segment-is-a-bar/README.md`. Working material: `plans/segment-is-a-bar/CHILD-ENTRY-DESIGN.md`,
`plans/segment-is-a-bar/SPIKE-FINDINGS.md`, and the rulings appendix at the end of this ADR.
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
(Option C, [Q1–Q16](#appendix--the-rulings-behind-the-retirement-q1q46)) proposed keeping that shape and adding a
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
(`plans/segment-is-a-bar/SPIKE-FINDINGS.md`, [Q17](#appendix--the-rulings-behind-the-retirement-q1q46)). Read
literally, "10,000 child Entries" never was more expensive than "10,000 Segments" — it was a second,
unbuilt type being compared against a first, shipped one, and the shipped one was cheaper once
someone measured it.

## Decision

**`Segment` retires as a type, with nothing standing in for it.** What it named — a drawn piece of
one Entry's span, matched onto a row that is not its own — is now an ordinary child `Entry`, whose
`parentId` names the row it draws on. A row source rule,
`rowSource: { source: 'entries', childrenAsSegments: <when-pattern> }`, says which segmented parent
draws its children as bars on its own row rather than giving each child a row of its own
([Q17](#appendix--the-rulings-behind-the-retirement-q1q46), ruled 2026-09-17). Nothing marks such a
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
| api/fields | the `segmented-entry` cell-editor reason |

**No migration path ships.** This library has never shipped to a user (CLAUDE.md), so there is no
consumer document written against `segments` to carry forward, and no compatibility key is added for
one that does not exist.

**`Item` retires into `Bar`** ([Q28](#appendix--the-rulings-behind-the-retirement-q1q46), ruled 2026-09-17).
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
`plans/segment-is-a-bar/CHILD-ENTRY-DESIGN.md` and this ADR's rulings appendix, and cited above by their own
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
  ([Q24](#appendix--the-rulings-behind-the-retirement-q1q46)); this ADR is where the type half of that overlap
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

## Appendix — the rulings behind the retirement (Q1–Q46)

This table was `plans/segment-is-a-bar/BUILD-LOG.md`. That log is deleted; the rulings the ADRs
cite live here, so a citation of `Q17` or `Q25` resolves inside the record that depends on it.
**Q** was a question for the author. **J** was a call an agent made alone.

**Read this table, not the old bodies.** An entry marked *Void* or *Superseded* keeps its text as
the record. Its job may survive. Its shape does not.

| | Question | Status |
|---|---|---|
| Q1 *(void)* | does `update(id, { segments: [] })` make an Entry plain? | **Ruled**, then corrected — it leaves the row dateless. Q11(e): a plain bar from a segmented row is two calls in one transaction |
| Q2 *(void)* | what does removing the last authored Segment leave? | **Ruled** — it un-dates the Entry, and the row stays |
| Q3 *(void)* | does `addSegment` ship beside `updateSegment`? | **Ruled yes; Q13 confirms the name** after Q10 briefly moved it to `dataset.segments.add` |
| Q4 *(void)* | does `updateSegment` write the Entry's envelope row? | **Superseded in mechanism by Q8/Q9.** A Segment write re-runs the Rollup, which writes the row's `start`/`end` rows in the same transaction |
| Q5 *(void)* | can an `EditExtender` propose a one-Segment edit? | **Ruled yes.** `SegmentEdit`/`SegmentEdits` keep their names; Q11(c) puts them inside `DatasetEdits` |
| Q6 *(void)* | is there one write door, or two? | **Ruled 2026-09-17: Option C.** Every bar is a Segment; Q10–Q14 fix the shape |
| Q7 *(void)* | does an Entry read across to its Segments, or a Segment to its Entry? | **Ruled** — `read(key)` never falls through. Navigation (`segment.entry()`) ships. J-plan-6 is reversed |
| Q8 *(void)* | can an Aggregator run over Segments? | **Ruled** — yes, onto the row's cell, never onto a bar. Segments and children union, no knob |
| Q9 *(void)* | is the envelope the Rollup over Segments? | **Ruled 2026-09-17: yes.** `start`/`end` roll up from Segments to the row through the normal Aggregators (`min`, `max`). The four hand-written paths retire |
| Q10 *(void)* | under C: the bar's name, where writes go, what backs a plain bar, a write to a segmented row's dates | **Ruled 2026-09-17** — `Segment`; the Entry backs a plain bar; the rolling-up parent's rule. **Answer 2 (`dataset.segments`) is superseded by Q13** |
| Q11 *(void)* | the Option C details Q10 does not answer | **Ruled 2026-09-17** — (a) one `EntryVariant` + `whenSegment`; (b) `edit` stays the cell rule, `formatValue(value, ctx, owner)`; (c) `DatasetEdits`; (d) `BarRendererContext.segments`; (e) derivation read before the patch, `#derives` |
| Q12 *(void)* | how does `update(id, { segments })` treat the array? | **Ruled 2026-09-17** — replaces the list; each element replaces its Segment; match by `id` only; positional match retires |
| Q13 *(void)* | `updateSegment`, or `dataset.segments.update`? | **Ruled 2026-09-17** — `entries.updateSegment` / `addSegment` / `removeSegments`. No second collection |
| Q14 *(void)* | should every spanning row store a Segment? | **Ruled 2026-09-17: no.** Q10's storage stays. Every bar is still a Segment to the consumer |
| Q15 *(void)* | which ChangeSet rows do structural Segment writes make, and how do they sit beside value rows? | **Ruled 2026-09-17** — one row per Segment added, removed or changed; only `update(id, { segments })` writes a whole-array row, and the refusal applies to that call alone |
| Q16 *(void)* | what does `removeSegments` do to a derived row's minted id? | **Ruled 2026-09-17** — refused with `DerivedFieldNotWritableError` |
| Q17 | is a bar a regular child Entry, drawn on its parent's row by a row source rule? | **RULED 2026-09-17: yes.** Spike S4 measured the cost objection away. The Segment retires, Option C is void, and Q1–Q16 go with it |
| Q18 | is the rule Gantt-wide or per Entry, and does it need `tree`? | **RULED with Q17, 2026-09-17** — both, through one key; `tree` is orthogonal and leaves the two-level call site |
| Q19 | where does a claimed row name its own Entry, and where does the parent's Item suppression live? | **RULED 2026-09-17: shape (a).** `entryIds[0]` stays the subject; `PlannedRow` carries the claimed marker. Shape (b) was written and breaks nine call sites with no compile error. C2 builds the rail seam; C3 fixes the nine sites — seven read a row's list, two read the Selection's |
| Q20 | can a row filter hide one bar on a shared row? | **RULED 2026-09-17 by the author: it does not need to.** A filter hides a parent, and its segments go with it, because they sit on the parent's row. `applyFilter` already does exactly this, so nothing ships and no item-level knob exists |
| Q21 | does the entries row source take the Field registry, so `childrenAsSegments` matches with typed `equals` and reports an unknown key? | **RULED 2026-09-17 by the author: yes, thread it.** C1 passes `fieldContext` into the entries-source pass, as `sort` already receives it, so a misspelt key reports once through `reportUnknownFieldMatch` instead of drawing a blank screen in silence. C1 rewrites `row-source.ts`'s own statement of D-S4-19/D-S4-21 |
| Q22 | does core ship a `boolean` Field type? | **RULED 2026-09-17 by the author: yes.** It lands in C1 with ingest, `formatValue`, `parseValue`, `compare` and `equals`, because the rule's own examples are its first consumer. Today `{ type: 'boolean' }` throws `UnknownFieldTypeError` (`data/fields/field-registry.ts:70`) |
| Q23 | does a hierarchy source declare the Field keys it reads? | **RULED 2026-09-17 by the author: decide it later, on its own evidence.** Split out as **#426**. C4 ships the fast path for core's own `storedParentSource` alone, gated on `tree.source === storedParentSource`; a consumer's own source keeps today's behaviour, which is correct and slower |
| J1 *(void)* | S1's ChangeSet address | **Void with Q17** — a bar writes no Segment row. The measurement stands as a record; its subject does not |
| J2–J3 *(void)* | S2 and S3 findings | **Void with Q17.** S1–S3's own text was removed from `SPIKE-FINDINGS.md` on the author's word, so the bodies below are the only record left |
| Q24 | what is the key called? | **RULED 2026-09-17 by the author: `childrenAsSegments`.** It frees the word *Segment* from the type that retires in C6. `plans/segment-is-a-bar/README.md` holds the reasoning, the rejected names, and the one cost — the word means two things between C1 and C6 |
| Q25 | what does a row's duration count once the Segment retires? | **RULED 2026-09-17 by the author; #428 settled it: the row's own span, `end - start`.** Overlap has no rule of its own. |
| Q26 | how does a claimed parent ask for a rail instead of a bar? | **RULED 2026-09-17 by the author: it draws no bar of its own, and core ships nothing else.** A consumer variant with an explicit `items` producer still wins, as it does today. No new key, no rail concept, no special case |
| Q27 | a claimed parent draws no bar — so how does core's own `summary()` not draw one? | **RULED 2026-09-17 by the author.** `produceItemsForRow` skips the row's subject when the row claims, and the producer seam takes **one** more fact, per Entry, carrying the key's own name: `childrenAsSegments`. Not two facts, and no `global` prefix — the two spellings of the key resolve in one place |
| Q28 | is the layout unit a `Bar`, not an `Item`? | **RULED 2026-09-17 by the author: yes, and in C6.** `Item` → `Bar`, `ItemId` → `BarId`, `ItemProducer` → `BarProducer`, and the rest of the table below. `MenuItem` and `CellItem` keep the generic word |
| Q29 | can `reportUnknownFieldMatch` carry a rule that is not a variant? | **RULED 2026-09-18 by the author: no — a second report code.** `UnknownFieldMatch.rule` is a `VariantClaimant` (`{ variant, pluginId? }`), and `GanttShell`'s message hardcodes "The variant rule 'X'". `childrenAsSegments` is not a variant and has no name to put there. C1 adds `unknown-row-source-field` to `BuiltInReportCode`, with its own message naming the config key. **This also corrects Q21's stated reason:** `RowPassInput.fieldContext` is `{ timeZone }` alone (`model/field.ts:247` says so on purpose), so it never carried `equals`. C1 adds a `fieldFor: (key) => Field \| undefined` port — the shape `VariantRegistryPorts` already uses |
| Q30 | is `VariantRule` still the right name once a row source key takes it? | **RULED 2026-09-18 by the author: no.** `childrenAsSegments?: boolean \| VariantRule` reads as "children as segments: a variant rule", and the key is not a variant. C1 renames `VariantRule` → `EntryRule` and `VariantPredicate` → `EntryPredicate` with `pk-rename-symbol`. `FieldMatch` is already neutral and keeps its name. One name per concept (#7) |
| Q31 | does a `boolean` Field edit as a checkbox? | **RULED 2026-09-18 by the author: yes.** `FieldType.inputType` is `'text' \| 'number' \| 'email' \| 'tel' \| 'url'` today, and `extensions/features/inline-editing.ts:715` sets `input.type` then reads `.value` — so a `boolean` Field would edit as a text box where the user types "true". C1 adds `'checkbox'` to `inputType` and teaches the editor to read `.checked`. This is what makes the design's "a grid checkbox drives it" true |
| Q32 | is a rename of the Segment duration enough? | **RULED 2026-09-18 by the author: `duration` should not be special at all. #428 made it an ordinary computed Field: the row's own span.** |
| Q33 | does `produceItemsForRow` skip a claimed parent's subject, or does the producer answer? | **The producer answers. Ruled by the coordinator, 2026-09-18, because Q26 already decided it.** C2's cell said both, and the two do not compose: a skip inside `produceItemsForRow` means a consumer's own `items` producer never runs for the claimed parent, which contradicts Q26's "a consumer variant with an explicit `items` producer still wins, as it does today". So `produceItemsForRow` does **not** skip. It passes the per-Entry `childrenAsSegments` fact to the producer (Q27's ruling), and core's own shipped producers return `[]` for it. A consumer producer that ignores the parameter still paints, which is what Q26 promised |
| Q34 | can a **childless** Entry be claimed, so `claimed` must be read before the children are known? | **No. Ruled by the coordinator, 2026-09-18, because `J-plan-D` already says how the blank row happens.** C1's pass asks `childRowsOf.get(entry.id)` before it reads the rule's Field, which is one of the three costs the S4 spike measured — so an Entry with no children never asks the rule. That is the right answer, not only the cheap one. `J-plan-D` says a blank row "is what a dateless row already draws": the blankness comes from the row being dateless, and a day-carrier Entry is authored with no `start`/`end`. So the gate holds with no marker. The case the two readings part on is an Entry with dates and no children that a rule names, and there the bar must stay — `J-plan-I` forbids a row whose Entry vanishes with no bar standing for it. **C2 builds on this**: `row.claimed` is never `true` for a childless Entry |
| Q35 | on a claimed row, can `ctx.entry` and `ctx.target` name **different** bars? | **Yes, and C3 left it that way on purpose — this is for the author.** `GanttShell.#buildCommandContext` (`view/gantt-shell.ts:1487`) reads `entry` from the **Selection's** first Entry, while `target` comes from **DOM focus** (`roving-focus.ts`, D-S5-39). Before #421 a row drew one bar, so the focused bar, the Selection's first bar and the row's subject were the same Entry, and nothing could tell them apart. A claimed row breaks the tie: focus one bar, select several, and the two answers part. **C3 audited this site and ruled it correct as designed**, because `CommandContextOf.entry` (`api/command.ts:133-136`) says so in words — "A row that owns several names them all in `target.entryIds`; this stays the one." That reading holds. **What is left open is the sentence beside it**: the same doc opens with "the right-clicked bar", and on a claimed row the Selection's first Entry is not always the bar under the cursor. Either the contract's first sentence is now wrong, or `entry` should follow the DOM target. **Not ruled here**: `entry` feeds every command, not only a claimed row's, so changing it is a public behaviour change that needs the author. **C8 must check this one by name** |
| Q36 | a producer sets an Item's own `label`, and `barLabels` also resolves one — which draws? | **RULED 2026-09-18 by the coordinator, because Q26 already decided this precedence.** **The producer wins.** Q26 ruled "a consumer variant with an explicit `items` producer still wins, as it does today", and Q33 re-applied it. A producer answers per Item, authored, for one bar; `barLabels` is a Gantt-level or variant-level default, and the specific answer beats the default. C5's first cut bound `barLabelFor` unconditionally, so it always won and silently discarded the only way a plugin could label a bar — caught by an existing test (`'ctx.variants.add draws a variant's own shape'`), not by review. **The ruling needs one shape change to be buildable:** `Item.label` was a required `string` that `wholeEntryItem` already filled with `entry.name ?? ''`, so "the producer set one" could not be detected. `Item.label` becomes optional; the built-in producers stop setting it from `entry.name`, which is C5's own point; `placeFrame` prefers `item.label` and falls back to the resolver; `FrameBar.label` stays required, because it is the resolved answer and not the override. The contract reads as one sentence: **set `label` and you own the text; omit it and the Gantt's `barLabels` decides** — which is also how a custom producer opts back into Field resolution |
| Q37 | C6's gate says ADRs 0003, 0010, 0017, 0018, 0022 and 0023 must "say `Bar`" — does C6b rename inside an accepted ADR? | **RULED 2026-09-18 by the coordinator: no. A spec changes its words; a record keeps them.** `docs/adr/README.md` states the repo's own policy: "An accepted record is superseded, never rewritten. A later record states the change, and the earlier body stays as it was written." It also draws the line this question needs — "A record says **why**. A spec (`plans/00`–`04`) says **what is true now**." So C6b changes the word in the specs — `plans/01` §2.4 and **I8**, `plans/02`, `plans/03`, `CONTEXT.md` — and **does not** rewrite an ADR body. ADR 0010 now carries C6a's own notice saying *"Do not rewrite the body"*, so a sweep would contradict a document this build just wrote. **What the ADRs get instead:** a one-line notice at the top, in the shape C6a already used, saying the record predates the `Item`→`Bar` rename and pointing at ADR 0026. That serves the gate's real intent — a reader is never stranded on a word that no longer exists in `src/` — without falsifying what was decided and in what vocabulary. **The gate's wording is what was loose, not its purpose** |
| Q38 | is `wholeSpan` still the right name for `ignoreSegments` after C2? | **No. RULED 2026-09-18: the name is `unclaimedSpan`.** Q26 ruled `wholeSpan` **before** C2 shipped. After C2 that producer returns `[]` when `childrenAsSegments` claims the Entry, so `bars: wholeSpan` promises a span and then draws none — true in one branch, false in the other, which is the `#7` fault class this project retired the word "chart" over. The build agent re-ran the naming skill against **today's** behaviour, as C6c's dispatch required, and `wholeSpan` failed check 2: the call site must read true. `bars: unclaimedSpan` reads true in both branches — unclaimed draws the Entry's span, and a claimed Entry has no unclaimed span to draw. **The word is not a new coinage**: `CONTEXT.md:78` already uses *claimed* and *unclaimed* for this exact fact, and `variant-matched-twice` already ships in the public `BuiltInReportCode`, so a reader meets the term in the glossary and in the API. `followSegments` is deleted in the same wave, so no second producer is left to contrast "whole" against "per-piece" — the live axis is claimed against unclaimed, which the name states. **Lesson worth keeping: a name ruled before the behaviour it names was built is a claim, not a decision.** |
| Q39 | D-S5-44 made an `EditExtender`'s cascade owe the envelope invariant a refusal. Does that decision die with the Segment? | **The mechanism dies; the invariant does not, and it was already held elsewhere. RULED 2026-09-18.** `gesture-pipeline.ts`'s third catch arm named "an envelope-only cascade against a several-Segment Entry", and no such Entry exists after C6c. But D-S5-44's title is about an **extender cascade and the envelope**, not about Segments — Segments were only the envelope's source when it was written, and the source is now a rolling-up parent's children. So the decision had a live subject and the question was real. **The traced answer corrected the coordinator's own framing:** `entry-store.ts:526,540`'s `DerivedFieldNotWritableError` is **never reached by a cascade** — that throw sits in `#splitDerivedWrites`, behind `entries.update()`'s door alone. The cascade path runs through `rollUpFields`, where **ADR 0013 decision 5 already holds the line** (`rollup.ts:308-311`): a cascade's value on a rolling-up parent's cell is overwritten by the Rollup's own and reported once as `derived-values-dropped`. Refused in effect, by overwrite-and-report rather than throw-and-catch — so there was never anything for the deleted arm to catch. Pinned by a new `rollup.test.ts` case. **`'write-refused'` leaves the public `GestureDroppedReason` union with it**, as an unreachable literal is dead surface. **CORRECTED 2026-09-18 by branch review F9 — the literal was reachable, and this row keeps its prose as a record of what was traced at the time (Q37).** The trace above is right about `DerivedFieldNotWritableError` and right that the envelope mechanism dies. It missed that `isEnvelopeRefusal` named *two* errors: `SegmentsOutOfSyncError`, which does die with the Segment, and `InvertedSpanError`, which never was Segment-specific. An extender cascading an end before its start still reaches the catch arm, so retiring the literal reclassified a live case from a `warning` dropped gesture to an `error` fault. [ADR 0028](../../docs/adr/0028-a-plugins-impossible-proposal-is-a-refusal.md) rules the refusal-versus-fault line and replaces the retired literal with `'inverted-span'`. `plans/01`'s envelope paragraph is rewritten because it is a spec; `s5.10`'s `D-S5-xx` bodies keep their prose and take a notice, because they are records (Q37) |
| Q40 | does inline editing's segmented-entry cell refusal still mean anything once an Entry has at most one span? | **No. It retires, and `'segmented-entry'` leaves `BuiltInReportCode`. RULED 2026-09-18 by the coordinator.** `inline-editing.ts:810` refuses a date cell with *"these dates span the segments below; move a segment instead"* when `writesSegmentEnvelope(entry, field)`. **Read the check order at `:805`:** `ctx.interaction.canWrite` runs **first**, and only then the segment check. The case the segment check ever caught was an Entry with several Segments and **no children** — its `start`/`end` came from its own Segments, not from a roll-up, so `canWrite` said yes and this was the only thing that said no. **That case is exactly what #421 deletes.** After the retirement there are two kinds of Entry and neither reaches it: a childless Entry has one span and is writable; a parent's `start`/`end` derive from its children, so `canWrite` already refuses it as `derived-value` under ADR 0013, one line earlier. Same shape as Q39 — the mechanism dies, and the protection was already held by a more general rule that ships. **One thing to verify, not assume:** the `derived-value` refusal message must read true for a claimed parent, whose children are bars on its own row. If it still tells the reader to do something impossible, fix the message; do not revive the check |
| Q41 | what does **Delete on a bar** do once a bar is an Entry? | **It un-dates that Entry. RULED 2026-09-18 by the coordinator, because ADR 0012 already decided it, and C6c had reversed it without an ADR.** C6c collapsed `freegantt.deleteSelection`'s two branches into one `entries.remove(id)` loop, with the comment *"a former Segment is an ordinary Entry, removed the same way"*. ADR 0012 says otherwise, verbatim: *"`removeSegments` of the last Segment keeps the Entry and clears start and end; `entries.remove(id)` deletes the row; grid-row Delete on the name cell is `remove(id)`. Keyboard Delete on a bar un-dates both dates when it was the last bar. ... Two intents."* **ADR 0026 changed what a bar *is*, not which of the two doors a Delete opens.** A bar draws a span, so deleting it clears the span and leaves the record; a grid row or cell names the record, so deleting it removes the record. A claimed child bar takes the first door, exactly as a Segment delete used to drop one drawn stretch. `e2e/hierarchy.spec.ts:116` was red on precisely this, and two `gantt.test.ts` tests had been rewritten to assert the opposite of the ADR they cite by name. **This is a coordinator's call restoring an accepted decision, not a new one — reverse it only by superseding ADR 0012.** Two ports carry it, `canClearDates` and `clearDates`; the first exists because a rolling-up parent's dates are not its own to clear (ADR 0013), and without it a Delete on a summary bar throws `DerivedFieldNotWritableError` out of a keypress |
| Q42 | why did nine DOM tests go red on a resize after the retirement? | **Because a resize edit changed shape and two readers still assumed the old one. Found and fixed 2026-09-18 by the coordinator.** Before ADR 0026 `resizeEdit` returned the whole envelope — `segments`, plus a `start` and an `end` recomputed over them. It now names the one edge the drag moved and holds the other, which is the right edit: writing an unchanged edge is a false write. But `previewOffsets` and `GesturePipeline.#commit` both guarded on `spansTime(edit)`, which a one-edge edit never passes — so **every resize previewed nothing and committed nothing**: no ghost, no `beforeEntryResize`, no `entryResize`, no refusal report. `spanAfterEdit(entry, edit)` now states the rule once, in `layout/gesture-draft.ts` beside the math that produces the edit: **a drafted span is the edit read over the entry it edits.** **The lesson is about the class of bug, not this instance:** retiring a stored shape changes what every *derived* shape means, and `tsc` cannot see it because both shapes are the same type. Grep for readers of the shape, not only for the word |
| Q43 | is a subagent's "pre-existing and unrelated" verdict on a failing test trustworthy? | **No, and one is now on record. 2026-09-18.** C6c's wave-two agent reported 12 red DOM tests as *"pre-existing and unrelated to this slice, confirmed via git-stash-and-compare"*. All 12 were regressions that same build introduced. The proof took one command: check the last green commit out into a scratch worktree and run the same three files there — **372 passed, 0 failed**. The agent told the truth as it understood it; its comparison method could not see the difference. **The rule that falls out: a failing test is "pre-existing" only when it has been reproduced at a named green commit, and the report must name that commit.** This is the same failure family as #142's two agents reporting `verify` green over a red `e2e/` — an honest report against the wrong question |
| Q44 | did ADR 0027 ship a false decision sentence, and how was it fixed? | **Yes — amended pre-merge, not noticed. C8's doc review (2026-09-18) caught it same-day, before the ADR reached any reader outside this branch.** It said *"A rolling-up parent draws no bar of its own either (ADR 0013)"*, unqualified. `src/layout/items/item.ts:173-176`'s `unclaimedSpan` proves otherwise: an **unclaimed** rolling-up parent still returns `[wholeEntryBar(entry, variant)]` — one bar, over its own rolled-up span. Only a **claimed** parent draws none. The sentence now reads: an unclaimed rolling-up parent keeps its rail (one Bar over its own span); only a claimed parent's own row shows no Bar. `docs/adr/README.md:5` protects a landed decision from a correction notice, so a reader trusts the body without re-checking a footnote — but 0027 was one day old, unmerged, and cited by nothing outside this work. Shipping a false record plus a notice pointing at the true one is worse than making the record true. Amending beat noticing here for the same reason D1 keeps ADR 0012's body untouched and adds a notice instead: 0012 is an accepted, cited record; 0027 was neither yet |
| Q45 | core always draws `partIndex` 0 now — does `partIndex` retire, so `BarId` is an `EntryId`? | **No. It stays, and it is the multi-bar-producer seam. Ruled 2026-09-18 by the coordinator, because `plans/01` §2.4 already says what the index is for.** ADR 0026 rules that **core** draws one Bar per Entry, and every shipped producer does. It does not rule that a plugin may not draw several: `BarProducer` returns `readonly Bar[]`, and `barId(entry, n)` is public (`etc/freegantt.api.md`). Retiring the index would take that away, and §2.4 calls it *"frame identity within one Entry's own Bars, never a key into a store"* — which is exactly what a plugin drawing two Bars for one Entry needs. So `partCountByEntry`, `partIndexOfBar` and frame.ts's *"part N of M"* label are a live seam with no core caller, not dead code. C8 adds the comment that says so at `partCountByEntry`; `model/ids.ts` and `plans/01` §2.4 already said it. `frame.test.ts:585` pins the branch with a two-Bar producer |
| Q46 | the `claims` rename retired "claimed" — which ADRs follow it, and which keep their prose? | **An ADR this branch wrote follows it; an accepted one keeps its prose. Ruled 2026-09-18 by the coordinator, because ADR 0026 already states the rule and then broke it.** ADRs 0025, 0026 and 0027 are new here and have reached no reader outside this branch, so their bodies now read *segmented parent* / *segmented row*, and 0027's dead pointer `src/layout/items/item.ts`'s `unclaimedSpan` is now `src/layout/bars/bar.ts`'s `wholeSpanUnlessSegments`. ADRs 0003, 0010, 0017, 0018, 0022 and 0023 are accepted and keep every sentence — only a live code identifier inside them moves, which is why C8 changed `variant-claimed-twice` in 0023 and nothing else. **ADR 0026's own first Consequence said the opposite** and contradicted its own third bullet (0010 both "says `Bar`" and "stays as written"). Caught the same way Q44 was, pre-merge; the bullet is amended to name the live specs only. Same failure mode as Q44: a Consequences bullet written as a to-do, then read as a fact |
| J4 | S4 — a bar is a child Entry | **The ruling.** Cost measured, shape (a) chosen, nine open points closed as `J-plan-A`…`J-plan-I` in [`plans/segment-is-a-bar/README.md`](../../plans/segment-is-a-bar/README.md). Q8, Q10 and Q11 of the spike were not reached; C1 and C3 cover them as real tests, not probes |

**Entries that record a reversed call.** Q1's first ruling was wrong, and Q11(e) corrected its plain-bar call site. Q5's first shape was wrong, and Q11(c) wraps its maps in `DatasetEdits`. Q9 replaced Q4's envelope pass, and Q4's naming trap with it. Q7 reverses the plan's first hard rule 3 and J-plan-6. Q8 reverses "no Aggregator over Segments". Q10 answer 2 (`dataset.segments`) was reversed by Q13, so Q3 stands. The Q6 grill's sketch was refined by Q10–Q13. Each keeps the rejected text, so a reader sees what was refused and why. Read the correction, never the first answer.
