# Design pass — one Entry-from-Segment rule, one owner per question (#230)

**Source:** [#230](https://github.com/Pawel-IT/FreeGantt/issues/230), filed as the R7 close-out of
`2026-09-05-212-segment-selection-fixes.md` §6 (findings 14, 15, 16, 17).
**Also carries:** [#216](https://github.com/Pawel-IT/FreeGantt/issues/216) Q3, on the coordinator's
instruction of 2026-09-06. Q1 ("is a gesture a Command?") is settled **no** and this plan does not
reopen it.
**Slice:** S5 · **Branch base:** `s5-start` at `f4c7492` · **Status:** R0 landed. R1 is next.
**Gate state at plan time:** every gate green at `f4c7492`. Every finding below is invisible to CI.

> ## This is a plan, not a review
>
> Nothing here is a defect. Each finding is a rule or a name that is right, and lives in the wrong
> place, or in more than one place. The whole value is the shape. Read §1 before you read §3.
> Tick a box in the same commit as the code, the way the S5 README requires.
> Run `pnpm verify` at the end of every slice. Run `pnpm api-report` after R2 and after R5.

---

## 0. How to use this file

- Work one slice per session. The slices are ordered. Do not start R2 before R1 lands.
- R0 writes tests only. It must land first, and it must add no production code.
- Each slice keeps `pnpm verify` green on its own. No slice needs the next one to compile.
- §8 lists what this plan refuses to do, and why. Read it before you widen scope.

---

## 1. The shape

### 1.1 One question, asked at three depths

The review called this "one rule, three times". That reading is one word too strong. There are
**three questions**, and each one reads the answer above it:

| # | Question | Owner after this plan | Who asks |
|---|---|---|---|
| A | What Segments does this drawn thing stand for? | `layout/` — the frame states it | `render/dom`, `view/gantt-dom.ts`, `view/` selection |
| B | What Segments may this pointer land select? | `view/segment-selection.ts` | `interaction/entry-gestures.ts` |
| C | Given what was clicked and what is selected, what does this invocation act on? | `api/command.ts`'s `resolveActedOn` | `extensions/features/context-menu.ts` |

A answers a fact about the picture. B adds the `select` capability. C adds the Selection.
Each one is strictly wider than the one above it, and each one reads the one above it.

**There cannot be one function all three call.** The layer map forbids it (`plans/01` §1, I1):
`render/` may import `layout/` and nothing else, so it can never reach `api/`; `layout/` may import
`time/` and `model/` only, so it can never reach the Selection. A single owner would need an arrow
that is not in the diagram. So the answer is a chain with one owner per link, not a singleton.
State this in the code comments. A later reader who does not see the layer reason will try the
merge again.

### 1.2 Question A — the frame states what a bar stands for

Today the rule is an **exported function** (`src/layout/items/segment-ids-an-item-stands-for.ts:26`)
that any layer can call with its own Entry. That is what makes two Entry sources possible:

- `src/render/dom/index.ts:913` calls it with `entryById(bar.entryId)` — the **live Dataset**.
- `src/layout/frame-layout.ts:116` calls it with `this.#memory.entry(entryId)` — the **frame**.

The fix is not to harmonise the two sources. It is to remove the second one, by turning the rule
from a portable function into a produced fact:

1. `FrameMemory` resolves the set **once, where the Items are produced**, from the same Entry map
   `produceItemsForRow` already receives (`src/layout/frame-memory.ts:88`). Same snapshot, same
   source, by construction. A cached packed row and its Segment sets can never fall out of step,
   because they are one cached record.
2. `placeFrame` copies the reference onto the bar (`FrameBar.segmentIds`) and onto the row
   (`FrameRow.segmentIds`). A reference copy allocates nothing per frame (I5).
3. `render/dom` reads `bar.segmentIds` and `row.segmentIds`. It never asks the Dataset a
   Segment question again.
4. `FrameLayout.segmentIdsForItem` / `segmentIdsForRow` stay as the lookups the pointer path uses.
   They read the same cached record, so they answer in O(1) instead of walking the row's Items.
5. `segmentIdsAnItemStandsFor` stops being exported. Its body becomes a private function in
   `frame-memory.ts`. No layer outside `layout/` can restate the rule, because no layer can reach it.

**End state you can check with `git grep`:** `entryById` survives in `src/render/dom/index.ts` at
two call sites only — `cellItemsForRow` (line 846) and the bar renderer (line 961). Both hand a
consumer's own renderer its live Entry. Neither derives a Segment set. Nothing else in `render/`
reads an Entry.

### 1.3 Question B — one module owns the Selection and the pane rule

`interaction/entry-gestures.ts:241` re-implements ADR 0010's pane rule:

```ts
function selectableSegmentsOf(hit: EntryHit): readonly SegmentId[] {
  if (hit.kind === 'row') return ctx.segmentsOfEntries(ctx.entriesForRow(hit.rowId));
  const entry = ctx.entryFor(hit.itemId);
  return entry !== undefined && ctx.can('select', entry) ? ctx.segmentsForItem(hit.itemId) : [];
}
```

That `switch` on hit kind is the same switch `ContainerDom.#resolve` makes
(`src/view/gantt-dom.ts:244`). ADR 0010 line 19 says nothing downstream asks the question again.

The move: `EntryGestureContext` loses `entriesForRow` and `segmentsOfEntries`, and gains one member.
`interaction/` then asks once and branches never. The capability filter stays in `view/`, where the
one capability resolution already lives (I14).

Its home is a **new module**, `src/view/segment-selection.ts`, because `gantt-shell.ts` must not
grow. That module also takes `GanttShell`'s six Selection members (finding 15, §1.4). One module,
one sentence: *what is selected, and what would this land select?*

### 1.4 Question C — `resolveActedOn` does not change

The coordinator's #216 answer names `ActedOn` + `resolveActedOn` (`src/api/command.ts:19` and `:65`)
as the smallest shared seam, with one caller today. **I recommend you do not extend it, and do not
put a new module under it.** Three reasons:

1. `resolveActedOn` is pure and takes two **already paired** `ActedOn` values. Its own doc says it
   "never turns a Segment into an Entry itself" (`src/api/command.ts:56`). To make it derive a set,
   it would need the frame and the Selection. `api/` would then hold a frame read, and the one
   property that makes it testable in isolation would go.
2. The gap is not in its body. The gap is that two of its three would-be callers never call it.
   `GanttShell#buildCommandContext` (`src/view/gantt-shell.ts:1207`) does not, because a chord has
   no clicked thing. `interaction/` does not, because it resolves selection and not action.
3. Its input is the thing that is missing, not its logic. This plan **produces that input** in two
   places, so #216's remaining work is a wiring job and not a design job.

What this plan hands #216:

- `SegmentSelection` publishes `segmentIds` and `entryIds` on one object. That object is
  structurally an `ActedOn`. `#buildCommandContext` then passes it through instead of composing a
  literal from two reads (`src/view/gantt-shell.ts:1208-1209`). `view/` still may not *name*
  `ActedOn` (D-S5-5); a narrower object literal reaches `api/` fine, exactly as
  `GanttShellWiring.buildCommandContext`'s `target` already does.
- `DomTarget` already carries the same pair, so `context-menu.ts`'s `clickedActedOn`
  (`src/extensions/features/context-menu.ts:56`) is already a rewrap of two members it holds.

What this plan does **not** decide for #216: whether a focused thing counts as a "clicked" thing, so
that the chord path can call `resolveActedOn` too. That needs #137 F6's focus model, and it is
#216's own call. **See §7.**

### 1.5 What each current reader calls, before and after

| Reader | Today | After |
|---|---|---|
| `render/dom/index.ts:913` `indexBarBySegment` | `segmentIdsAnItemStandsFor(bar, entryById(bar.entryId))` | `bar.segmentIds` |
| `render/dom/index.ts:657` `entryHasSelectedSegment` | `entryById(id).segments.some(...)` | `row.segmentIds.some(...)` |
| `layout/frame-layout.ts:116` `segmentIdsForItem` | `segmentIdsAnItemStandsFor(item, memory.entry(id))` | `memory.packedRow(rowId).segmentIdsByItem.get(id)` |
| `layout/frame-layout.ts:125` `segmentIdsForRow` | walks `entryIdsForRow` then `memory.entry` | `memory.packedRow(rowId).segmentIds` |
| `view/gantt-dom.ts:255` bar target | `ports.segmentIdsForItem(id)` | `ports.layout.segmentIdsForItem(id)` |
| `view/gantt-dom.ts:309` row target | `ports.segmentIdsForRow(id)` | `ports.layout.segmentIdsForRow(id)` |
| `interaction/entry-gestures.ts:212` | `selectableSegmentsOf(hit)`, a local switch | `ctx.selectableSegmentsOf(hit)` |
| `interaction/entry-gestures.ts:104` grab | `ctx.segmentsForItem(grabbedItemId)` | unchanged |
| `interaction/keyboard-editing.ts:29` | `ctx.segmentsOfEntries([candidate])` | unchanged — it is the Entry projection, not the pane rule |
| `extensions/.../context-menu.ts:120` | `resolveActedOn(clicked, {…two reads…})` | unchanged in this plan |

`entriesForRow` leaves `EntryGestureContext` — its only use is inside the pane-rule switch
(`src/interaction/entry-gestures.ts:242`). `segmentsOfEntries` and `segmentsForItem` both stay:
the first is the Entry→Segment projection a keyboard row step needs, and the second is what
`drag.start()` reads when a grab arms the Selection (`src/interaction/entry-gestures.ts:104`).

---

## 2. Findings index

| # | Finding | Slice | What closes it |
|---|---|---|---|
| 14 | One rule, two Entry sources, three times | R1–R3, R5 | The frame carries the set; the function is deleted; `interaction/` asks once |
| 15 | `GanttShell` changes for selection reasons too | R4 | Six members move to `view/segment-selection.ts`; the file shrinks |
| 16 | `ContainerDomPorts` is flat | R3 | Five closures collapse into one `layout` member (§4) |
| 17 | Two names for one concept | R2 | One name is deleted, not renamed (§5) |
| #216 Q3 | The shared "what does this act on" seam | R4 | `SegmentSelection` publishes the pair `resolveActedOn` takes (§1.4, §7) |

---

## 3. The slices

### R0 — pin the behaviour before you move any of it

**Tests only. No production code in this commit.** Each test must pass on `f4c7492` unchanged.

Already pinned, verified at `f4c7492` — do not rewrite these, they are your net:

| Behaviour | Test |
|---|---|
| A Segment bar stands for its own Segment | `src/layout/frame-layout.test.ts:166` |
| A group or milestone bar stands for every Segment of its Entry | `src/layout/frame-layout.test.ts:176` |
| An Item no frame planned stands for nothing | `src/layout/frame-layout.test.ts:190` |
| A row stands for every Segment of every Entry it owns | `src/layout/frame-layout.test.ts:198` |
| A whole-span bar paints when any Segment of its Entry is selected | `src/render/dom/index.test.ts:922` |
| One selected bar paints alone; the Entry paints whole when every Segment is in | `src/render/dom/index.test.ts:955` |
| A remounted bar restamps from the live Selection | `src/render/dom/index.test.ts:989`, `:1026` |
| A freshly mounted row is stamped from the current Selection | `src/render/dom/index.test.ts:1094` |
| A row click selects every Segment of every selectable Entry the row owns | `src/interaction/entry-gestures.test.ts:433`, `:443`, `:493` |
| An incapable row Entry never reaches `interaction/` | `src/interaction/entry-gestures.test.ts:507`, `:518` |
| `targetUnder` names the Segments a bar and a row stand for | `src/view/gantt-dom.test.ts:106-107` |
| `selectedEntryIds` orders by row rank and is stable | `src/view/gantt-shell.test.ts:693` |
| The sole-selection read costs O(selection) | `src/view/gantt-shell.test.ts:885` |
| The prune reads the `ChangeSet` and nothing else | `src/view/gantt-shell.test.ts:927` |
| `entriesForRow` answers every selectable Entry a packed row owns | `src/view/gantt-shell.test.ts:1060` |
| An assignment runs `beforeSelectionChange` → `selectionChange` | `src/api/gantt.test.ts:2745` |
| A `beforeSelectionChange` veto leaves the Selection alone | `src/api/gantt.test.ts:2772` |

Write these, because nothing pins them today:

- [x] **A row that owns several Entries paints selected from its *second* Entry's Segment.**
  `src/render/dom/index.test.ts:852` covers a row with one Entry only. R5 rewrites this exact code
  path, and a one-Entry row cannot tell the two readings apart. Use a custom row source, the same
  shape `src/layout/frame-layout.test.ts:198` builds.
- [x] **A grouping header row stands for no Segment, on both paths.** Assert
  `FrameLayout.segmentIdsForRow(headerRowId)` is empty and the frame's own `FrameRow` for that row
  reports no Entry. A grouping header carries `entryIds: []` (`src/layout/rows/group-source.ts:35`),
  so this passes today. R5 must not change it.
- [x] **`freegantt.selectNextSegment` and `freegantt.selectPreviousSegment` step within a row and
  clamp at both ends.** `src/api/gantt.test.ts:2963` already drives `#stepSegmentSelection` through
  the `Mod+Arrow` chord, and pins the high-end clamp. It never runs the two commands themselves, and
  it covers neither the low-end clamp nor a row that draws one bar. `src/view/core-commands.test.ts:25-26`
  stubs both ports with `vi.fn()`, so the registration is covered and the behaviour is not.
  `#stepSegmentSelection` (`src/view/gantt-shell.ts:1112`) moves in R4, so pin it first.

**Visible at the end:** `pnpm test:node` and `pnpm test:dom` both green, with four more tests, and
no production file touched.

### R1 — `FrameMemory` resolves the Segment sets where it produces the Items

Finding 14, first half. This slice adds the answer and changes no reader.

- [x] Move the rule's body out of `src/layout/items/segment-ids-an-item-stands-for.ts` into
  `src/layout/frame-memory.ts` as a private function. Name it
  `segmentIdsEachItemStandsFor(items, entryById)`. It returns
  `ReadonlyMap<ItemId, readonly SegmentId[]>`. The call reads "the Segment ids each Item stands
  for", which is true: it answers for a whole row at once. Keep the `NO_SEGMENT_IDS` frozen
  constant, so an Item that stands for nothing still allocates nothing (I5).
- [x] Declare `RowMemory` in `frame-memory.ts`:

  ```ts
  /** What this memory remembers about one row (#212, ADR 0010). One record, so the Items, their
   *  lanes and the Segments they stand for can never fall out of step. */
  export interface RowMemory extends PackedRow {
    /** Which Segments each produced Item stands for. */
    readonly segmentIdsByItem: ReadonlyMap<ItemId, readonly SegmentId[]>;
    /** Every Segment of every Entry this row owns, in row order. */
    readonly segmentIds: readonly SegmentId[];
  }
  ```

  `FrameMemory.packedRow(id)` returns `RowMemory`. Existing callers read `.items` and `.packing`
  only, so they keep compiling untouched.
- [x] Fill both members inside `packedRow`, right after `produceItemsForRow`
  (`src/layout/frame-memory.ts:88`). Compute `segmentIds` from `row.entryIds` with **no header
  filter**, so it matches `FrameLayout.segmentIdsForRow`'s current answer exactly. Use `#entryById`
  for both — that is the one Entry source.
- [x] Point `FrameLayout.segmentIdsForItem` (`src/layout/frame-layout.ts:111`) and
  `segmentIdsForRow` (`:125`) at the new record. Both become O(1) map or array reads. Delete the
  `segmentIdsAnItemStandsFor` import at `frame-layout.ts:15`.
- [x] Delete `FrameMemory.entry(id)` (`src/layout/frame-memory.ts:100`) once its two callers are
  gone. It is the seam that let a caller pull the frame's Entry out and apply its own rule.
- [ ] Delete `src/layout/items/segment-ids-an-item-stands-for.ts` and its export from
  `src/layout/index.ts:16-18`. **Do this only after R2**, because `render/dom` still imports it.
  Until then, keep the file and have it delegate to nothing — see R2's own box.
- [x] Add a `frame-memory.test.ts` case: two `packedRow` calls for an unchanged row return the same
  `segmentIdsByItem` reference. That is the allocation guard (I5).

**Verify:** `src/layout/frame-layout.test.ts:166-212` passes unchanged. That is the point of R0.

**Visible at the end:** `FrameLayout` answers both Segment questions with no Entry lookup of its own.

**R1 landed — `49bf804`, with one deliberate deviation.** `segmentIdsForRow` does **not** read
`RowMemory.segmentIds`. `FrameMemory`'s row map is built from the post-collapse plan, while
`FrameLayout.#entryIdsOfRow` is built from the open rows, so a row hidden under a collapsed parent
answers `entryIdsForRow` today and would have stopped answering `segmentIdsForRow` — a silent
narrowing, in the slice that promises to change no reader. Verified by running it before changing
it. That accessor's own doc ties the pair together ("Unfiltered, exactly like `entryIdsForRow`"), so
it now reads a new `FrameMemory.segmentIdsOfEntries(ids)`, which keeps them in agreement and still
leaves no Entry rule inside `FrameLayout`. `RowMemory.segmentIds` is unchanged from this plan and
still waits for R5, which fills `FrameRow` from it — a hidden row never reaches `placeFrame`.
`src/layout/frame-layout.test.ts` pins the hidden-row pair.

The rule keeps one body: `segment-ids-an-item-stands-for.ts` is unchanged and `frame-memory.ts`
calls it. R2 deletes the file and inlines the body into the private function, rather than R1 copying
it and the two drifting for a slice.

### R2 — the frame carries the set, and `render/dom` reads it

**Not started. Every box below is open.** Finding 14, second half, and finding 17. **This is the risky slice — see §6.**

- [ ] Add `segmentIds: readonly SegmentId[]` to `FrameBar` (`src/layout/frame.ts:87`). Required, not
  optional. `placeFrame` is the only producer of a `FrameBar`, so a required member costs a plugin
  author nothing. Document it as "every Segment this bar stands for" and keep `segmentId` as
  "the one Segment this bar draws". Two names, two facts, and the doc says which is which.
- [ ] Fill it in `placeFrame`'s bar loop (`src/layout/frame.ts:395-410`) from the packed row's
  `segmentIdsByItem`. It is a reference copy. Nothing allocates per frame.
- [ ] `src/render/dom/index.ts:911` `indexBarBySegment` reads `bar.segmentIds`. Delete the
  `segmentIdsAnItemStandsFor` import at `src/render/dom/index.ts:25`.
- [ ] Now delete `src/layout/items/segment-ids-an-item-stands-for.ts` and its `layout/index.ts`
  export. `git grep segmentIdsAnItemStandsFor` must return nothing.
- [ ] Update `CONTEXT.md`'s **Item** entry (line 194). Today it says the layout is the one answer
  through `FrameLayout.segmentIdsForItem`. It must now say the frame states it
  (`FrameBar.segmentIds`), and the layout answers the same fact for a lookup by id. Keep the
  _Avoid_ line about `data-segment-id` — it is still true and still load-bearing.
- [ ] Update `plans/01` §4's `GeometryFrame` sketch (line 409). It lists neither `segmentId` nor
  `segmentIds` on a bar today, so it is already behind `frame.ts`. Add both.
- [ ] Run `pnpm api-report`. `FrameBar` is public (`etc/freegantt.api.md:850`). Commit the churn.

**Behaviour note, and the one real change in this plan.** Before R2, `render/dom` resolved a
whole-span bar's Segment set from the **live Dataset**. After R2 it resolves it from the **frame**.
The two agree whenever `syncBars` runs inside `render()`, which is every real path. They can differ
only if a caller drives `backend.sync(frame)` with a frame built from a stale Entry snapshot.
ADR 0010 line 99 already says the layout is the source, so this makes the code match the ADR.
Write a test that states it: build a frame, change the Dataset's Segments **without** rendering, and
assert the bar still stands for what the frame drew. That test fails before R2 and passes after.
It is the fix's own test, not a characterization test. Label it `[#230-14]`.

**Visible at the end:** `git grep -n "entryById" src/render/dom/index.ts` returns two hits, both
handing a consumer's renderer its Entry.

### R3 — `ContainerDomPorts` becomes one member per collaborator

Finding 16. Depends on nothing in R1/R2, but land it after them so the port count is final.

- [ ] Export a read surface from `src/layout/frame-layout.ts`:

  ```ts
  /** What a reader asks the current frame about what it drew (#185, #199, #212). `FrameLayout`
   *  satisfies it; a test hands a literal. It is the read half of `FrameLayout`, the same split
   *  `EntryStoreView` makes over `EntryStore`. */
  export interface FrameLayoutView {
    itemIdsForEntry(id: EntryId): readonly ItemId[];
    entryIdsForRow(id: RowId): readonly EntryId[];
    segmentIdsForItem(id: ItemId): readonly SegmentId[];
    segmentIdsForRow(id: RowId): readonly SegmentId[];
    readonly frameRevision: number;
  }
  ```

  `FrameLayout` declares `implements FrameLayoutView`. Its `frameRevision` getter satisfies the
  `readonly` property with no change.
- [ ] `ContainerDomPorts` (`src/view/gantt-dom.ts:135`) becomes four members:
  `container`, `paneLayout`, `entryById`, `layout: FrameLayoutView`. `entryById` stays its own
  member on purpose: `DomTarget.entry` is the node's **subject**, and a tooltip must read the live
  Entry, not the frame's copy.
- [ ] `ContainerDom` reads `this.#ports.layout.segmentIdsForItem(id)`,
  `…segmentIdsForRow(id)`, `…itemIdsForEntry(id)`, `…entryIdsForRow(id)` and
  `this.#ports.layout.frameRevision`.
- [ ] `GanttShell`'s construction (`src/view/gantt-shell.ts:484-493`) passes `layout: this.#layout`.
  Five wrapper closures go. That is five lines off `gantt-shell.ts` and one adapter at a real seam.
- [ ] `src/view/gantt-dom.test.ts:106-107` hands `layout` instead of two closures. The test already
  builds a real `FrameLayout`, so it passes the instance.
- [ ] `src/view/gantt-dom.ts` is in the `sentence-length` scope
  (`scripts/check-sentence-length.mjs`). Keep every new comment sentence at 25 words or fewer.

**Why a member and not a second port bag.** A second interface would need a name for a bag with no
job of its own. `FrameLayout` is the collaborator, and it already exists. Naming its read half is
one name; a `ContainerFramePorts` would be one name plus one adapter that forwards. The deletion
test settles it: delete `FrameLayoutView` and the five closures come back, so it earns its keep;
delete a port bag and nothing comes back, so it does not.

**Visible at the end:** `ContainerDomPorts` has four members, one per collaborator, and the shell
passes the layout by reference.

### R4 — the Selection moves out of the shell

Finding 15, and #216 Q3's input. **This is the largest slice. Do it alone.**

Create `src/view/segment-selection.ts`. One class, `SegmentSelection`. One sentence:
*what is selected, and what would this land select?*

Members that move out of `src/view/gantt-shell.ts`:

| Shell member | Line | Becomes |
|---|---|---|
| `#selection: readonly SegmentId[]` | 378 | private field of `SegmentSelection` |
| `get selection` / `set selection` | 1028, 1034 | shell delegates to `.segmentIds` and `.propose(...)` |
| `get selectedEntryIds` | 1045 | `SegmentSelection.entryIds` |
| `#rowRankByEntryId()` | 1059 | private to `SegmentSelection` |
| `#soleSelectedEntry()` | 1068 | `SegmentSelection.soleEntry()` |
| `#forgetSegmentsTheDatasetDropped(changeSet)` | 1084 | `SegmentSelection.forgetSegmentsTheDatasetDropped(changeSet)` |
| `#proposeSelection(next)` | 1097 | `SegmentSelection.propose(next)` |
| `#stepSegmentSelection(direction)` | 1112 | `SegmentSelection.step(direction)` |
| `#selectableSegmentsInRowOrder()` | 998 | `SegmentSelection.selectableSegmentsInRowOrder()` |
| `#selectableEntriesOfRow(id)` | 977 | private to `SegmentSelection` |
| `#selectableEntriesInRowOrder()` | 983 | `SegmentSelection.selectableEntriesInRowOrder()` |

Members that **stay** in the shell, and why:

| Shell member | Line | Why it stays |
|---|---|---|
| `#refreshAffordances()` | 1426 | It is hover plus capability plus the backend. It reads `soleEntry()`, it does not own it. |
| `#interactionState` | 375 | The backend's own long-lived object. One writer, the shell. |
| `#canGesture(capability, id)` | 1411 | The one capability resolution (I14). The Selection takes it as a port. |
| `#buildCommandContext()` | 1207 | It composes a `CommandContext`, not a Selection. It reads the pair. |
| `reveal(id)` / `#revealSpan(...)` | 1611, 1621 | Geometry and scroll, not selection. |
| `#entryFor(item)` | 1441 | One line over the Dataset. Moving it buys nothing. |

New member on the class, and the pane rule's new home:

- [ ] `selectableSegmentsOf(hit: EntryHit): readonly SegmentId[]` — the body of
  `src/interaction/entry-gestures.ts:241`, moved. A row hit reads
  `#selectableEntriesOfRow(hit.rowId)` then the Dataset's `segmentIdsOfEntries`. A bar hit reads
  the layout's `segmentIdsForItem`, gated on `can('select', entry)`.
- [ ] `EntryGestureContext` (`src/view/entry-gesture-context.ts:58`) gains
  `selectableSegmentsOf(hit)` and loses `entriesForRow`. Keep `segmentsForItem` and
  `segmentsOfEntries` — §1.5 says why.
- [ ] `src/interaction/entry-gestures.ts` deletes its local `selectableSegmentsOf` and calls
  `ctx.selectableSegmentsOf(hit)` at line 212. `interaction/` then branches on `hit.kind` in two
  places only, and neither one is about Segments: `missesEveryEntry` (line 234) and
  `onPointerMove`'s hover (line 295).

Ports the class takes, in the `TreeCollapse`/`ColumnChrome` style (`#segmentSelectionPorts()` on the
shell, beside `#columnChromePorts()` at `src/view/gantt-shell.ts:1276`):

| Port | Answers | Shell wires it to |
|---|---|---|
| `entries()` | the Dataset's entry view | `this.#options.dataset.entries` |
| `plannedRows()` | the resolved row plan | `this.#layout.plannedRows()` |
| `rowIdForEntry(id)` | which row shows an Entry | `this.#layout.rowIdForEntry(id)` |
| `segmentIdsForItem(id)` | what a bar stands for | `this.#layout.segmentIdsForItem(id)` |
| `canGesture(capability, id)` | the one capability resolution | `this.#canGesture(...)` |
| `confirm(change, apply)` | the cancelable `before*` → apply → `*` pair | `this.#proposeChange('beforeSelectionChange', 'selectionChange', …)` |
| `announce(change)` | the past-tense event alone, for the prune | `this.#events.emit('selectionChange', change)` |
| `paint(segmentIds)` | write the backend state and refresh affordances | sets `#interactionState.selectedSegmentIds`, then `#refreshAffordances()` |

`confirm` follows `TreeCollapse`'s own precedent (`src/view/gantt-shell.ts:692`), so the generic
`#proposeChange` stays in the shell and the Selection never names an event map.

- [ ] The class publishes `segmentIds` and `entryIds` as two getters on one object. That object is
  structurally an `ActedOn`. `#buildCommandContext` (`src/view/gantt-shell.ts:1208-1209`) reads it
  once instead of twice. **This is the #216 Q3 carry.**
- [ ] Every call site in the shell moves to the new object: lines 690-691, 705-706, 731-737, 1113,
  1246-1255, 1427.
- [ ] `src/view/gantt-shell.ts` is in the `sentence-length` scope. Every comment you move must still
  pass. Moving a sentence into `segment-selection.ts` takes it out of scope; that is a loss, so add
  `src/view/segment-selection.ts` to `SCOPED_FILES` in `scripts/check-sentence-length.mjs` and run
  the pass over it.
- [ ] Count the lines. `gantt-shell.ts` is 1,874 lines at `f4c7492`. It must be smaller after R4.
  Put the before and after numbers in the commit message.

**Naming, `SegmentSelection`.** `Selection` alone fails check 4: `lib.dom` already declares a global
`Selection`, and `view/` is a DOM layer. One word, two concepts, is the #7 failure. `SelectionModel`
fails too: `Model` in this codebase means a bound, shareable object (`TimeScaleModel`,
`ScrollModel`), and the Selection is never shared between two Gantts (I2). `SegmentSelection` passes
all five: ADR 0010's own words are "the Selection holds Segments"; the call
`this.#selection.propose(next)` reads "propose the Selection's next Segments"; a search for
`SegmentSelection` gives the concept; no other concept uses the pair; no category word.

**Visible at the end:** `interaction/entry-gestures.ts` asks one question about Segments, and
`gantt-shell.ts` is shorter.

### R5 — the row paint reads the frame too

Finding 14's last live-Dataset read. Optional relative to R1–R4, and it is what makes §1.2's
`git grep` end state true.

- [ ] Add `segmentIds: readonly SegmentId[]` to `FrameRow` (`src/layout/frame-row.ts` /
  `src/layout/frame.ts:375-389`). Fill it in `placeFrame` from the packed row's `segmentIds`,
  with the same header rule `entryIds` already uses:
  `isPlannedHeaderRow(planned) ? NO_SEGMENT_IDS : packed.segmentIds`. Reference copy, no allocation.
- [ ] `src/render/dom/index.ts` replaces `rowEntryIds` (line 341) with `rowSegmentIds`, written at
  line 781, read at line 1166, cleared at line 1271. `entryHasSelectedSegment` (line 657) is
  deleted. The create-time restamp at line 799 reads `row.segmentIds` instead.
- [ ] Run the R0 test "a row that owns several Entries paints selected from its second Entry's
  Segment". It must still pass.
- [ ] Run `pnpm api-report`. `FrameRow` is public (`etc/freegantt.api.md:895`). Commit the churn.

**Visible at the end:** the row selection diff runs over Segment ids, and `render/dom` reads no Entry
to decide what paints.

---

## 4. The `ContainerDomPorts` decision, stated once

**Split it, and split it by collaborator, not by question.** Four members: the container, the panes,
the Dataset, the layout. `entryById` stays separate because a subject Entry must be live. The five
layout closures collapse because `FrameLayout` is already the adapter and only needed a named read
surface. The decision depends on where finding 14 landed: because the frame now answers all four
layout questions from one cached record, one member can carry all four with no risk that two of
them describe different frames. R3 is therefore ordered after R1.

---

## 5. The rename, decided from the call site (finding 17)

**The rename resolves by deletion.** After R2 there is one name, not two, so nothing is renamed.

`segmentIdsAnItemStandsFor` goes. Its two call sites go with it: `render/dom` reads
`bar.segmentIds`, and `FrameLayout` reads the cached map. Its body survives as the private
`segmentIdsEachItemStandsFor(items, entryById)` in `frame-memory.ts`, whose call reads "the Segment
ids each Item stands for" — true, and plural because it answers for a whole row.

`FrameLayout.segmentIdsForItem` **keeps its name**. The five checks:

| Check | Result |
|---|---|
| 1. Glossary term | `CONTEXT.md`'s **Item** entry names the concept "which Segments an Item stands for". The name carries both terms, `segmentIds` and `Item`. |
| 2. Call site | `this.#ports.layout.segmentIdsForItem(id)` reads "the layout's Segment ids for this Item". True. It is the same sentence shape as `entryIdsForRow(rowId)` and `itemIdsForEntry(entryId)`, which a reader of this class already knows means "the set this thing stands for". |
| 3. Search | `git grep segmentIdsFor` gives the two frame lookups and nothing else. |
| 4. One meaning | The competing concept is *which Segment a bar draws*. This codebase names that `segmentId` — singular, a property, never a lookup. Plural plus `For` is the set. |
| 5. Category word | None. |

The review's other half of finding 17 — "the call site passes a `FrameBar`, not an `Item`" — dies
with the free function. Nothing takes a structural `Pick<Item, …>` any more.

New names this plan introduces, each checked the same way:

| Name | Call site | Why it passes |
|---|---|---|
| `FrameBar.segmentIds` | `for (const id of bar.segmentIds)` | Same word `DomTarget.segmentIds` already uses for the same fact. Sits beside `segmentId`, the narrower fact, and the doc says which is which. |
| `FrameRow.segmentIds` | `row.segmentIds.some(...)` | Same, one level up. Pairs with `FrameRow.entryIds`. |
| `RowMemory` | `const remembered: RowMemory = mem.packedRow(id)` | `FrameMemory` is "what one pass remembers"; this is what it remembers about one row. Category word `Memory` follows a domain term. |
| `FrameLayoutView` | `layout: FrameLayoutView` | `EntryStoreView` sets the `XView` = read half convention (`src/model/dataset.ts`). |
| `SegmentSelection` | `this.#selection.propose(next)` | See R4. |
| `selectableSegmentsOf(hit)` | `ctx.selectableSegmentsOf(hit)` | "The selectable Segments of this hit". `selectable` already means capability-filtered here (`selectableSegmentsInRowOrder`). |

---

## 6. Ordering, and which step is risky

R0 → R1 → R2 → R3 → R4 → R5. R3 and R4 touch different files and could run in parallel on separate
branches; R3 is small, so serial is simpler and cheaper.

**R2 is the risky step.** It is the only slice that changes a source of truth. Before it, a
whole-span bar's Segment set comes from the live Dataset; after it, from the frame. Every path a
test drives runs `syncBars` inside `render()`, where the two agree, so the suite cannot tell them
apart — which is exactly why it is risky. Mitigations, all required:

1. Land R1 first, so the frame's answer is already proven correct by
   `src/layout/frame-layout.test.ts:166-212`.
2. Write the `[#230-14]` test named in R2 before the reader changes. Watch it fail, then pass.
3. Run the e2e suite (`e2e/selection.spec.ts`, `e2e/hierarchy.spec.ts`) on R2 alone, not batched
   with R3–R5. `hierarchy.spec.ts` is the only place overlapping Segments are exercised
   (`fixtures/hierarchy-dataset.ts`), and a covered Segment is where a set-versus-drawn confusion
   shows first.

**R4 is the largest step,** not the riskiest. It moves eleven members and rewires roughly twenty
call sites. It is mechanical, and R0 plus the existing `gantt-shell.test.ts` and
`entry-gestures.test.ts` suites cover it. Split it into two commits if the diff gets hard to read:
first the class with the shell delegating, then the `EntryGestureContext` change.

---

## 7. What #216 contributes, and what it still owes

The coordinator's answer of 2026-09-06 is settled input to this plan:

- **Q1 is "no".** A gesture is not a Command. The discriminator is lifecycle, not trigger. This plan
  designs no merge of the two, and adds no session lifecycle to `CommandOf`.
- **Q3's seam is `ActedOn` + `resolveActedOn`.** This plan agrees, and §1.4 argues that the function
  itself must not change. It produces the input that the seam is missing.

**Did that answer change the finding-14 shape? No.** Question A's owner is the frame either way,
because `render/` can reach `layout/` and nothing else. What the answer changed is §1.3's
justification: the new `view/` module is no longer only "the place the pane rule goes so
`gantt-shell.ts` does not grow". It is the producer of one of the two `ActedOn` pairs
`resolveActedOn` compares, which is why it must publish `segmentIds` and `entryIds` on **one**
object rather than two separate getters on the shell.

**What #216 still owes, and this plan does not answer:**

1. Does a **focused** thing count as a "clicked" thing? If yes, `GanttShell#buildCommandContext`
   can call `resolveActedOn` and stop being the third route. That needs #137 F6's focus model, and
   it is a behaviour decision, not a refactor.
2. Do `EntryHit` and `DomTarget` become one resolution? #216's own plan-of-action sequences that
   after #215 and #217, because a lane rule changes what a pointer hit resolves to. This plan
   deliberately leaves both shapes standing. It makes that merge **smaller**, because after R4
   `interaction/` asks one question instead of assembling an answer from three.
3. #223 (`CommandRegistry.available()` needs a hand-built context) is the same gap from consumer
   code. It is not blocked by this plan and is not helped much by it: after R4 the shell composes
   its context from one object instead of two, which is one line of the fix #223 asks for. File no
   dependency between them.

---

## 8. What this plan will not do

- **It will not put `segmentIds` on `Item` or `ItemProducer`.** `Item` is public
  (`etc/freegantt.api.md:1265`) and a plugin author writes producers against it
  (`ctx.layout.registerItemProducer`). A required `segmentIds` would make an author compute a rule
  they should never have to know, and that is how a fourth reading of the rule gets born. The layout
  fills the set after the producer returns, and the producer contract does not change.
- **It will not extend `resolveActedOn` to derive a set.** §1.4 gives the three reasons. Its purity
  is the property that makes it the shared seam in the first place.
- **It will not merge `EntryHit` with `DomTarget`,** and it will not move the capability filter into
  `targetUnder`. `DomTarget` states a DOM fact, unfiltered, on purpose
  (`src/layout/frame-layout.ts:121`, `src/view/gantt-dom.ts:65`). That merge is #216's call and is
  sequenced after #215 and #217.
- **It will not grow `src/view/gantt-shell.ts`.** Every slice here shrinks it or leaves it alone.
  R3 takes five lines. R4 takes about a hundred and thirty.
- **It will not tidy `harness/`.** If a harness file restates something this refactor moves, that is
  an API gap: close it in `src/` and let the harness follow (CLAUDE.md's stop rule).
- **It will not re-litigate #212's settled rules.** The pane picks the unit. The operation reads the
  set it needs. `CommandTarget` carries both id sets. `Item.id` keeps its
  `${entryId}:${segmentIndex}` convention.
- **It will not add a runtime dependency.** `plans/04` §1 budgets two, both confined.
- **It will not fold in #215, #217 or #219.** They are filed and deferred on purpose.

---

## 9. Public surface

| Change | Public? | Check |
|---|---|---|
| `FrameBar.segmentIds` added | **Yes** — `etc/freegantt.api.md:850` | `pnpm api-report` after R2 |
| `FrameRow.segmentIds` added | **Yes** — `etc/freegantt.api.md:895` | `pnpm api-report` after R5 |
| `segmentIdsAnItemStandsFor` deleted | No — internal to `layout/`, absent from the report | Confirmed by grep at `f4c7492` |
| `FrameLayoutView` added | No, unless `api/index.ts` re-exports it. **Do not re-export it.** | `pnpm api-report` after R3 |
| `RowMemory` added | No — `frame-memory.ts` is internal | — |
| `SegmentSelection` added | No — `view/` is internal | — |
| `EntryGestureContext` loses `entriesForRow`, gains `selectableSegmentsOf` | **No** — absent from `etc/freegantt.api.md`, so it is internal | `pnpm api-report` after R4 confirms no churn |
| `Item`, `ItemProducer`, `wholeEntryItem` | Unchanged, deliberately | — |
| `Gantt.selectedSegmentIds`, `Gantt.selectedEntryIds`, `gantt.selection` | Unchanged behaviour, new owner behind them | `src/api/gantt.test.ts` |

No consumer-visible behaviour changes, with one exception: R2's source-of-truth change, stated in
full in R2's own note. It is unobservable through the public surface on every real path.

---

## 10. Spec and doc edits this plan carries

| Edit | Slice | Where |
|---|---|---|
| The frame states what a bar stands for; the layout answers the lookup | R2 | `CONTEXT.md` **Item** entry (line 194) |
| `GeometryFrame`'s bar carries `segmentId` and `segmentIds` | R2 | `plans/01` §4 (line 409) |
| `GeometryFrame`'s row carries `segmentIds` | R5 | `plans/01` §4 |
| `DomTarget`'s sets come from one `FrameLayoutView` | R3 | `CONTEXT.md` **DomTarget** entry (line 614) |
| The Selection's owner is `view/segment-selection.ts` | R4 | `plans/01` §8, and ADR 0010's "One layer answers" paragraph (line 98) |
| ~~`EntryGestureContext`'s changed members~~ | — | Not needed: the type is internal, not in the api report |

**Coordination note.** Another agent is changing `src/data/build-commit-change-set.ts`,
`src/data/entry-reader.ts`, `src/data/entry-store.ts` and `plans/01`/`plans/02` at the time of
writing. This plan touches none of those source files. It reads
`EntryStore.segmentIdsOfEntries` and `entryIdsOfSegments` only through their published contract
(`src/model/dataset.ts:45-54`), which already promises dedup, so that agent's dedup work is
compatible either way. The `plans/01` overlap is §4 here against §6 there. Rebase, do not merge by
hand.

---

## 11. Open questions a later agent must answer

Each of these is a real gap in this plan. Do not guess.

Four of the five open questions from the first draft are now closed, with the evidence recorded
above: `FrameRow` is public (`etc/freegantt.api.md:895`); `EntryGestureContext` is not in the
report; no test drives `freegantt.selectNextSegment`; `src/api/gantt.test.ts:2745` and `:2772`
already pin the selection propose and veto paths.

One question stays open. Do not guess it.

1. **`plans/01` §8 and ADR 0010 wording for R4.** §10 lists the edit and this plan does not draft
   the sentences, because they depend on the member names R4 lands. Draft them inside the R4 commit,
   not before. ADR 0010's "One layer answers 'which Segments does this stand for'" paragraph
   (line 98) must end up naming the frame as the source and `SegmentSelection` as the pane rule's
   home. Its current sentence names `FrameLayout.segmentIdsForItem` alone, which stays true and
   stops being the whole truth.

**One judgement I could not fully verify, flagged as a risk rather than a question.** I read
`FrameMemory.sync` (`src/layout/frame-memory.ts:46-72`) and `FrameLayout.invalidateForChange`
(`src/layout/frame-layout.ts:160`) and satisfied myself that a Segment change always invalidates the
packed rows the shell renders from, because the shell passes `datasetRevision`
(`src/view/gantt-shell.ts:1828`). I did not exhaustively test a caller that omits `datasetRevision`
and keeps the row count stable. R1's design makes that case safe by construction — the Items and
their Segment sets come from one cached record — but if you find a test that depends on the current,
looser behaviour, stop and report it before you change it.
