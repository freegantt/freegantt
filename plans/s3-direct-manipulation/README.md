# S3 — Direct manipulation

**Slice:** S3 (`plans/03` §S3) · **Position: after S1.13, before S4.** S1.12 landed and its gate
passes; S2 landed; S1.13 is **specified but not implemented** (`plans/s1.13-date-lines/README.md`,
§0 P2 below). `.slice` moves `S1.13` → `S3`; `scripts/slice-gate.mjs` gains an `S3 → S4` gate over
`[S3-A1]`–`[S3-A8]`.
**Status: settled except §0's P2 and P3.** P1 closed on 2026-08-29. Two prerequisites remain — one a
sequence, one a one-arrow diagram edit — and each blocks a single step. Every other question this
spec's own grill raised is answered in §2. §8 is the work list, cut into vertical steps S3.1–S3.8.
**Builds on:** S2's transaction/changeset/undo core (`plans/s2-data-core/`), S1.12's viewport surface
(`zoomBy`, `panToInstant`, `zoomPresets`), S1.13's Date line seam, and `view/splitter.ts` — the
pointer-drag-that-commits-nothing-itself precedent this slice generalises.
**Closes:** D10's pointer half ("pointer manipulation arrives in S3 in its own interaction module"),
`plans/01` §9, invariants I5, I6 and I14, D-S1.12-17 (wheel/keyboard viewport gestures) and
D-S1.13-9 / issue #99 gap 5 (cursor date hairline).

> **What this slice is not.** No `Dependency`, no `linkCreate`, no `schedule()` — S7. No inline cell
> editing, no tooltips, no context menu — S5. No row reorder, no reparenting, no `progress` handle —
> §9. `interaction/` never imports `scheduling/`, and nothing in this slice gives it a reason to.

---

## 0. Prerequisites — the questions this spec cannot answer for itself

Each blocks exactly one step in §8. Every other step can start without them.

### P1 — Where does the extender-ghost **demo** live? — **CLOSED (2026-08-29): option (a)**

Resolved at the user's direction: the demo moves to S5, `plans/03` §S3's harness scope line and §S5's
now say so, and the stale source comment is fixed. Kept here as the record of what was decided and
why. S3.6 is unblocked.

**Already decided, and not by this spec: S3 does not publish an install API.** D-S2-6
(`plans/s2-data-core/README.md`) is explicit — *"`DatasetOptions.plugins`, `DatasetPluginContext`,
`edits.setExtender`, `EditExtenderConflictError` … land in **S5** with the plugin runtime. The
first-party scheduler occupies the slot in **S7**. An option a consumer cannot fill is the dishonest
surface I11 exists to catch."* It also names the route S3's tests take: *"`DatasetStateOptions.editExtender`
is internal (`data/` is unreachable through the `exports` map). A test injects an extender…"*

So `[S3-A4]` and `[S3-A6]` are settled: they inject through the internal option, exactly as
`[S2-A1]` already does. **`src/data/dataset-state.ts`'s doc comment says the opposite** — *"a
plugin-facing install API is S3's own job (#15)"* — and it is stale: written 2026-08-27, one day
before the remap (`87af449`) moved the scheduling slice from S3 to S7 and made S3 direct
manipulation. Under the numbering that comment was written in, "S3" meant scheduling. Fixing that
comment is a line item in §8.

What is **not** settled is the one thing that needs a public seam: `plans/03` §S3's harness scope
line asks for *"a lock-style injected extender so extra ghosts are visible without the scheduling
plugin"* — a page a human can poke. `harness/` is a consumer and imports `../src/api/index.js`; there
is no public way for it to install an extender, and there will not be until S5.

| Option | Cost | Consequence |
|---|---|---|
| **(a)** Cut the harness demo; move it to S5's plugin-dogfood page. S3's on-screen result stays drag/resize/select, and `[S3-A4]` is proven in a `dom` test | A scope line edit in `plans/03` §S3 | Principle 7 still holds — S3 ends on screen, just not with *this* behaviour on it |
| **(b)** Let `harness/editing.ts` import `src/data/` directly, clearly labelled as a pre-1.0 internal peek | None mechanically — the layer rules key on `^src/`, so `harness/` is not covered | Breaks CLAUDE.md's harness rule ("code there that breaks a library rule is an API gap"), and hides the gap instead of recording it |
| **(c)** Pull S5's install API forward into S3 | Pulls plugin-contract design (#15) out of S5 | Reverses D-S2-6 on the grounds it was decided against, and pre-commits a shape S5's dogfooding gate is supposed to test |

**Chosen: (a).** It is the only one that leaves both D-S2-6 and the harness rule intact, and the
behaviour it defers is the one behaviour that has no consumer-facing surface until the slice that
builds that surface. Landed with this spec: `plans/03` §S3's harness line now defers the demo and
says why, §S5's harness line receives it, and `src/data/dataset-state.ts`'s comment names S5.

### P2 — S1.13 must land before S3.8 (blocks **S3.8**)

Not a question, a sequence. `plans/s1.13-date-lines/README.md` is a settled spec with no code behind
it: `src/layout/date-line.ts` still exports `DateLineInput { id, instant, label }` and
`src/render/dom/date-line.ts` still paints `.fg-today-line`. S3.8's cursor line (D-S3-15) reuses that
step's `--fg-date-line-color` token and its "a marker is a stroke plus an optional caption" shape.
Starting S3.8 first would build the cursor line against a Part vocabulary that is about to be renamed.
Steps S3.1–S3.7 touch none of it and can proceed in parallel with S1.13.

### P3 — `interaction/` needs one new import edge (blocks **S3.2**)

`plans/01` §1 draws `INT --> VIEW` and `INT --> DATA` and nothing else;
`.dependency-cruiser.cjs`'s `interaction-boundary` transcribes it literally. A gesture controller
cannot name an `EntryId`, an `ItemId` or an `Entry` under that rule, because all three live in
`model/`.

**Recommendation: add `INT --> MODEL`, type-only, with the same one-line justification `view/` already
carries** ("Entry types flow through view as type-only params"), and **nothing else** — no `time/`, no
`layout/`, no `render/`. D-S3-4 and D-S3-5 are built to keep it at exactly one arrow: every piece of
arithmetic a gesture needs is a pure `layout/` function the shell hands over pre-wired, so
`interaction/` stays plumbing. This edits a `plans/01` diagram, so it wants an explicit yes before the
code lands.

---

## 1. User stories

- **U1.** I drag a bar sideways. It follows my pointer, snapped to the preset's tick; on release it commits once, and one Ctrl+Z puts it back.
- **U2.** I drag a bar and change my mind. Escape mid-drag leaves the chart exactly as it was — no event, no transaction, no leftover ghost.
- **U3.** I grab a bar's right edge and drag. Only `end` moves; `start` stays put.
- **U4.** I write `interactions: { resize: e => e.kind !== 'group' }`. Group bars grow no handles and refuse the gesture from pointer *and* keyboard — one rule, both halves.
- **U5.** I subscribe to `beforeEntryMove` and return `false` for a drop before mobilization. The bar snaps back and nothing commits; my `change` handler never fires.
- **U6.** My `beforeEntryMove` handler returns a promise. The bar holds its dropped position in a visible pending state until my dialog resolves; it never commits optimistically.
- **U7.** I install an extender that locks two entries together. Dragging one ghosts both, live; releasing commits both in one changeset and one undo step; Escape discards both ghosts.
- **U8.** I click a bar, then shift-click another. Both are selected; dragging either moves both, in one transaction.
- **U9.** I tab into the Gantt and press ↓ ↓ to reach a bar, then → → to nudge it two days. No pointer involved, same events, same single transaction per press.
- **U10.** I hold ctrl and scroll over the timeline. It zooms around the date under my pointer; shift+scroll pans sideways; neither writes anything to the dataset, so neither is undoable.
- **U11.** While I drag, a thin vertical line follows my pointer with the snapped date beside it, so I can see where the bar will land.
- **U12.** I hover across a dense chart. Nothing re-lays out, nothing allocates, and the profiler shows no frame rebuilds.

---

## 2. Decisions

### D-S3-1 — Position, scope, and the two acceptance boxes `plans/03` is missing

S3 runs after S1.13 (P2) and before S4. `plans/03` §S3's scope already carries two items with no
acceptance box: the viewport gestures deferred here by D-S1.12-17, and the cursor date hairline
deferred here by D-S1.13-9. This step adds `[S3-A7]` and `[S3-A8]` for them (§6), so the `S3 → S4`
gate covers everything the slice claims.

### D-S3-2 — A Draft **is** `EntryEdits`. There is no new draft type

CLAUDE.md's "one write shape, one knob": extra field writes use `EntryEdit`, the same object
`update()` takes. A gesture in progress holds exactly one thing — the edit it would commit — so it
holds `EntryEdits` (`ReadonlyMap<EntryId, StoredEdit>`, `data/edit-extension.ts`), the map the
extension hook already speaks:

```ts
const draft = draftForMove({ entries: selected, byPx: dx, scale, snap });  // EntryEdits
const extras = previewExtender({ entries: committed, proposed: draft });   // EntryEdits
// commit:
dataset.transaction(() => { for (const [id, edit] of draft) dataset.entries.update(id, edit); });
```

Preview, extender call and commit all take the same shape, so nothing converts between them and there
is no `DragRequest` / `MovePatch` / `GestureIntent` type to name. **Draft** joins the glossary as a
word for the *state a gesture is in*, not as a type.

`StoredEdit` (Instants) rather than the public `EntryEdit` (loose `InstantInput`) because a gesture's
dates come out of the `TimeScale` already resolved — there is nothing loose left to read.

### D-S3-3 — A gesture's delta is a **calendar** delta, not a pixel delta

The naive implementation converts the pointer's dx to milliseconds and adds it to `start` and `end`.
That is wrong across a DST transition in the dataset zone: a bar dragged from before a spring-forward
to after it keeps its absolute duration and loses an hour of wall clock, so a "09:00–17:00" shift
becomes "08:00–16:00".

So the gesture's model is: **snap the pointer to a whole number of snap units, then step both ends by
that many units through `time/`'s zone-aware `stepBy`.** Wall clock is preserved at both ends and the
bar's calendar duration survives the transition. With `snap: 'none'` there are no units to count and
the delta falls back to milliseconds — the documented, opted-into exception.

This is why D-S3-4 puts the arithmetic in `layout/`: it is zone-aware date arithmetic, and I10
confines that to `time/`, which only `layout/`, `data/` and `scheduling/` may reach.

### D-S3-4 — The gesture math is pure, lives in `layout/`, and is unit-tested in Node

New file `src/layout/gesture-draft.ts`, in the `xForInstant` / `widthForDuration` / `barSpan` naming
tradition already in `layout/` — an `X-for-Y` name that says what comes out and what goes in:

```ts
export interface DraftInput {
  entries: readonly Entry[];        // the entries the gesture moves (one, or the selection)
  byPx: number;                     // pointer displacement along x, in content px
  scale: TimeScale;                 // the bound scale — every px⇄time conversion goes through it (I12)
  snap: SnapSpec;                   // resolved from the preset (D-S3-12)
}

export function draftForMove(input: DraftInput): EntryEdits;
export function draftForResize(input: DraftInput & { edge: 'start' | 'end' }): EntryEdits;

/** Committed geometry + a draft → the per-item px offsets `applyState` paints. */
export function previewOffsets(
  draft: EntryEdits, entries: readonly Entry[], scale: TimeScale,
): readonly ItemPreview[];
```

`interaction/` performs no arithmetic of its own, ever: it hands the shell a pixel displacement and
receives a draft back through the context (D-S3-5). Every DST, snapping, zero-length and
inverted-span case is therefore a plain Node test against plain objects, with no pointer simulation —
the same trade `barSpan` already bought.

`EntryEdits` is `data/`'s type and `layout/` may not import `data/`. It moves to `model/` in this step
(`model/entry.ts`, beside `EntryEdit`), which is where a shape three layers speak belongs; `data/`
re-exports it so no existing import path breaks.

### D-S3-5 — Controllers get a context, not a reach; `interaction/` imports `model/` types only

`view/splitter.ts` already has the shape: the attachment reads and proposes through a small object of
callbacks the shell supplies, and knows nothing about what is on the other side. Gestures use the
same seam, one layer up:

```ts
// src/interaction/entry-gesture-context.ts
export interface EntryGestureContext {
  /** The entry under an item id, or undefined if it left the store mid-gesture. */
  entryFor(itemId: ItemId): Entry | undefined;
  /** One resolution, shared with affordance painting (I14, D-S3-9). */
  canMove(entry: Entry): boolean;
  canResize(entry: Entry): boolean;
  canSelect(entry: Entry): boolean;
  /** Entries this gesture applies to: the selection when the grabbed entry is in it, else just it. */
  entriesForGesture(grabbed: Entry): readonly Entry[];
  /** px → draft. The shell wires this straight to `layout/`'s `draftForMove`/`draftForResize`. */
  draftMove(entries: readonly Entry[], byPx: number): EntryEdits;
  draftResize(entries: readonly Entry[], byPx: number, edge: 'start' | 'end'): EntryEdits;
  /** Paint a draft plus whatever the extension hook adds. At most one call per frame (D-S3-18). */
  previewDraft(draft: EntryEdits | undefined): void;
  /** before-event → one transaction → after-event. Resolves false when vetoed (D-S3-17). */
  commitMove(draft: EntryEdits): Promise<boolean>;
  commitResize(draft: EntryEdits, edge: 'start' | 'end'): Promise<boolean>;
  /** Hot-path writes; the shell owns the state object (D-S3-6). */
  hover(itemId: ItemId | undefined): void;
  cursorAt(x: number | undefined): void;
  selection: { get(): readonly EntryId[]; propose(next: readonly EntryId[]): void };
}
```

Everything the controller names is a `model/` type. That, and only that, is why P3 asks for one new
arrow. `interaction/` may not import `layout/`, `time/`, or `render/` after this step either.

**One name per concept:** `SplitterHooks` renames to `SplitterContext` in the same step. "Hook" already
means the extension hook (D4, `CONTEXT.md`), and CLAUDE.md's #7 lesson is that a word covering two
concepts is a bug, not a style nit. One file, one test, mechanical.

### D-S3-6 — One `InteractionState` per Gantt, mutated in place

`applyState(state)` is called on every pointer move. Building a fresh state object per call allocates
per move, which is exactly what I5 forbids. So `GanttShell` owns **one** long-lived, mutable
`InteractionState` for its lifetime; controllers write it through the context; `applyState` reads it
and diffs against what it painted last. No module-level instance (I2) — one per shell, like every
other piece of shell state.

```ts
// src/render/backend.ts — widened
export interface ItemPreview { itemId: ItemId; dx: number; dWidth: number; }

export interface InteractionState {
  hoveredItemId?: ItemId;
  selectedItemIds?: readonly ItemId[];
  /** Non-empty only while a gesture previews. Includes the extension hook's extra writes. */
  preview?: readonly ItemPreview[];
  /** Content-px x of the cursor line, or undefined when no gesture is running (D-S3-15). */
  cursorX?: number;
  cursorLabel?: string;
  /** A gesture awaiting an async veto (D-S3-17). */
  pending?: boolean;
}
```

`ItemPreview` carries **offsets from committed geometry**, not absolute boxes: `render/dom` already
keeps each bar's committed `BarGeom`, so `applyState` writes
`translate(x + dx, y)` / `width: w + dWidth` and restores by dropping the preview — no second copy of
the frame, and cancel is structurally exact (`[S3-A2]`).

### D-S3-7 — Interaction state paints as one `data-state` attribute, generated from its own keys

`data-flag` set the pattern (D-S1.10-2): one space-joined attribute, tokens generated from the
carrier type's own keys, so a new key needs no `render/dom` edit. Interaction state joins it as
`data-state` on `.fg-bar`, with tokens `hovered selected dragging ghost pending`.

`CONTEXT.md`'s State attribute entry is explicit that there is no modifier-class convention here, so
`.fg-bar--dragging` is not an option. Level-2 CSS reads
`.fg-bar[data-state~="selected"] { outline: 2px solid var(--fg-selection-color); }`.

New Tokens: `--fg-selection-color`, `--fg-ghost-opacity`. Both join `plans/02` §4's table.

### D-S3-8 — Resize handles are **one shared pair of nodes**, not two per bar

Two handle children per bar is 2N nodes, N allocations per sync, and a reconciler scope widening for
something no frame describes. Instead: `mount()` creates exactly two handle nodes
(`.fg-bar-handle[data-edge="start"|"end"]`) once, and `applyState` moves them onto the hovered or
selected bar with a transform — or parks them (`display: none`) when the bar's `canResize` is false.

Zero per-bar cost, zero allocation on the hot path, and I14 falls out for free: the same
`canResize(entry)` call that refuses the gesture is what decides whether the handles are visible.
Cursor follows the same route — `applyState` writes `cursor: grab` on the hovered bar only when
`canMove` is true.

### D-S3-9 — Capabilities resolve once, in `view/`, over a per-kind default table

`view/capability.ts` — `view/`, not `interaction/`, because `interaction/ → view/` is a legal edge and
`view/ → interaction/` is not, and both sides need the same answer (I14).

```ts
export type CapabilityRule = boolean | ((entry: Entry) => boolean);
export interface Interactions { move?: CapabilityRule; resize?: CapabilityRule; select?: CapabilityRule; }
export function resolveCapabilities(interactions: Interactions | undefined): Capabilities;
```

Per-kind defaults, applied when `interactions` says nothing for that gesture:

| Kind | move | resize | select | Why |
|---|---|---|---|---|
| `'span'` | ✅ | ✅ | ✅ | the ordinary case |
| `'milestone'` | ✅ | ❌ | ✅ | zero-length by construction; there is no edge to drag |
| `'group'` (or any `derivedSpanKinds` kind) | ❌ | ❌ | ✅ | its span is the Rollup's output; a write would be overwritten on the same commit |
| consumer-defined | ✅ | ✅ | ✅ | same as `'span'` unless the consumer says otherwise |

The `'group'` row is the one worth spelling out: with the identity extender installed there is nothing
to move a group's children, so a group drag would commit, roll back on the Span rollup, and read as a
bug. Subtree move is a policy question that belongs to S4's hierarchy work — §9.

`linkCreate` and `edit` are **not** declared on `Interactions` in S3: I11 keeps unimplemented keys out
of the public `.d.ts`. They arrive with S7 and S5 respectively.

### D-S3-10 — Selection is a set of **Entry** ids on the **Gantt**; Items are what gets painted

An Entry with Segments produces several Items (`01` §2.4), and "this segment is selected but its
siblings are not" means nothing at this slice. So the authored concept is entries:

```ts
get selection(): readonly EntryId[];
set selection(ids: readonly EntryId[]);      // live, runs the same cancelable sequence a click runs
```

On the `Gantt`, not the `Dataset` — `plans/02` §3 already rules that pointer/gesture events fire on
the Gantt and data events on the Dataset, and two Gantt instances bound to one Dataset must be able to
have different selections. `InteractionState.selectedItemIds` stays item-keyed: it is paint.

Pointer semantics: plain click replaces; ctrl/⌘-click toggles; shift-click extends over the current
row order; a click on empty timeline clears; Escape clears. Selection is written on **pointerup**,
never pointerdown (`01` §9), and not at all if the gesture armed into a drag.

### D-S3-11 — Drag is horizontal only in S3

`Entry` has no ordering field. A vertical drag therefore has nowhere to commit: row order is the row
source's output, derived per frame, and reparenting writes `parentId` — a different gesture with
different events. So a drag's dy is ignored, and the bar never leaves its row.

Reorder and reparent land in S4 with the tree row source, and need an authored order field first —
§9 names it.

### D-S3-12 — Snap defaults to the preset's own tick; Alt suspends it

`ViewPreset.snap` exists and is unread by anything. No shipped preset sets it, and rather than adding
a snap column to the preset table this step reads an unset `snap` as `'tick'`: the day preset snaps
to days, the hour preset to hours. That is the behaviour a user expects from a preset that already
declares its own granularity, and it means zero preset-table edits.

`snap: 'none'` opts out per preset. Holding **Alt** during a gesture suspends snapping for that
gesture (fine placement, `plans/03` §S3's "modifier key for fine placement"). Alt rather than Ctrl or
Shift: Ctrl is the multi-select modifier (D-S3-10) and Shift the range one, and both must stay
readable while a drag is running.

Resolution lives in `time/`: `snapInstant(zone, at, snap)` beside the other zone-aware steppers, and
`layout/gesture-draft.ts` is its only caller.

### D-S3-13 — The keyboard map, and how arrow keys stop meaning two things

D-S1.12-17 deferred `PageUp`/`PageDown`/`Home`/`End`/arrows-for-pan to this slice. `plans/03` §S3 also
wants arrow-key nudge. Those collide, and the resolution is **selection is the mode switch**:

| Keys | Nothing selected | Something selected |
|---|---|---|
| `↑` / `↓` | pan vertically | move the selection to the previous / next row |
| `←` / `→` | pan horizontally | nudge the selected entries by one snap unit |
| `Shift`+`←`/`→` | — | resize: move the `end` edge by one snap unit |
| `Alt`+`←`/`→` | — | nudge without snapping |
| `PageUp` / `PageDown` / `Home` / `End` | pan | pan (never re-bound) |
| `Escape` | — | clear the selection (arrows go back to panning) |
| `Enter` | — | reserved; no-op in S3 (the editor is S5) |

Every row of the pointer's capability set has a keyboard row, which is what `plans/03`'s "every S3
pointer capability has a keyboard path" asks for. Rejected: requiring a modifier for every nudge —
it makes the primary editing gesture the hardest one to find, and Escape already gives an
unambiguous, discoverable way back to panning.

Keyboard nudge is one gesture per keypress, so it is one transaction per keypress (I6). Coalescing
ten presses into one undo step needs a History merge policy S2 did not ship — §9.

### D-S3-14 — Viewport gestures live in `view/`, not `interaction/`

`view/splitter.ts` states the rule in its own header: *"Lives in `view/`, not `interaction/`:
`interaction/` owns **data** gestures over drafts and transactions, and a splitter mutates no data."*
Wheel zoom, wheel pan and keyboard pan mutate no data either. They are `view/` attachments:
`attachWheelNavigation(pane, ctx)` and `attachKeyboardNavigation(container, ctx)`, both writing
through `Viewport` — every px⇄time conversion through the bound `TimeScale`, every scroll through the
bound `ScrollModel` (I12).

They are exempt from the arm-threshold, escape-cancel and one-transaction-per-gesture invariants,
because those invariants are about *writes* and these gestures perform none — `plans/03` §S3 already
says so. They do need `passive: false` on the wheel listener plus `preventDefault()`, or ctrl+wheel
becomes browser page zoom.

`attachKeyboardEditing` (the nudge half of D-S3-13) does write data, so it lives in `interaction/`.
The two keyboard attachments share the container's one `keydown` listener through the shell, which
consults the selection to decide which one gets the event — one listener, one place the mode switch
is implemented.

### D-S3-15 — The cursor line is a hot-path Part of its own, never a frame decoration

Issue #99 gap 5 waited for S3 because the obvious implementation is wrong: adding a `DateLine`
decoration per pointer move means a `computeFrame` per pointer move, which is exactly the cold-path
rebuild I5 forbids. So the cursor line is a node created once at `mount()` and moved by `applyState`
via `InteractionState.cursorX` — the same mechanism as the shared resize handles.

New Parts: `.fg-cursor-line` and `.fg-cursor-line-label`, structurally the stroke-plus-caption pair
S1.13 builds for `.fg-date-line`, reusing `--fg-date-line-color`. Not a `data-state` variant of
`.fg-date-line`: that Part is painted from `frame.decorations` and this one is never in a frame.
Glossary term **Cursor line**; "hairline" describes a stroke width, not a concept.

The label is the snapped instant, formatted through `time/`'s `formatDate` in the Gantt's locale and
the Dataset's zone — composed in `view/` (which has the zone and the locale) and handed over as a
string, the same division `FrameBar.a11yLabel` already uses.

### D-S3-16 — One explicit transaction per gesture, and what a data-layer veto does to it

The commit is one `dataset.transaction(() => …)` wrapping one `update()` per draft row — explicit,
not the auto-wrap, because a multi-entry draft (D-S3-19) must be one changeset and one undo step
(I6, I7).

Two vetoes can refuse a gesture, in this order:

1. `beforeEntryMove` / `beforeEntryResize` on the **Gantt** — the gesture's own veto, may be async
   (D-S3-17). Refused: nothing is called on `data/` at all.
2. `beforeChange` on the **Dataset** — sync only (`plans/02` §3), and it refuses the whole changeset
   by throwing `MutationCancelledError` out of `transaction()`.

The controller catches `MutationCancelledError`, drops the preview and restores — a vetoed gesture is
silent (`plans/02` §3: "a vetoed gesture is silent, the way `beforeGridWidthChange` already is"). Any
*other* throw out of the transaction propagates: a bug in a consumer's `change` handler must not look
like a cancelled drag.

### D-S3-17 — Async veto: what "pending" is, and what it locks

`plans/02` §3 promises an async veto that "suspends the gesture with a visible pending state — it
never commits optimistically". Concretely: on pointerup the controller emits the before-event and, if
the handler returned a promise, sets `InteractionState.pending = true` and keeps the preview painted
at the dropped position. `.fg-bar[data-state~="pending"]` is the level-2 selector; the base
stylesheet's default is a reduced opacity, overridable like any other Part rule.

While pending: no new gesture arms on that Gantt, keyboard editing is refused, and the pointer is not
captured (the gesture is over — only its resolution is outstanding). Resolution paints either the
committed frame (accept) or the pre-gesture state (veto). A promise that rejects is treated as a veto,
and the rejection is re-thrown asynchronously so it reaches the consumer's error reporting rather than
vanishing.

### D-S3-18 — The extender preview runs at most once per animation frame, on the shell's existing rAF

`FrameScheduler` is already the single rAF owner (B10, D-S2-15). Pointer moves write the draft into
the gesture's own state and request a preview; the shell coalesces to one call per frame:

```
pointermove (n per frame)  →  draft (last one wins)
rAF                        →  extender({ entries: committed, proposed: draft })
                           →  previewOffsets(draft + extras)  →  applyState
```

The extender is called with the same `EditRequest` a commit builds — same function, same shape, so a
preview can never disagree with what commit will do. Its `entries` is the **committed** snapshot, not
a mutated copy: `schedule()` never mutates its input (I4) and neither does a preview.

**Allocation, honestly stated:** hover and selection allocate nothing (I5, `[S3-A3]`). A *drag* frame
allocates a draft map and a preview array, bounded by the number of entries the gesture and the
extender touch — an extender that returns a fresh map cannot be made allocation-free from this side.
The buffers are reused across frames where the shape is stable. I5's claim is about the hover path,
which is what its perf test measures.

### D-S3-19 — A drag moves every selected, capable entry

Dragging a bar that is part of the selection moves the whole selection; dragging one outside the
selection moves only it (and does not change the selection). Entries in the selection whose
`canMove` is false are silently skipped rather than blocking the gesture — the capability is
per-entry, so a mixed selection is a legal thing to have.

This costs one loop, because D-S3-3 made the delta a single calendar quantity applied to N entries
rather than N independent pixel computations. One draft, one transaction, one undo step, one
before-event carrying all affected entries.

### D-S3-20 — "Allocates nothing" is proven by named proxies

`plans/03` §S3's acceptance says hover "allocates nothing and rebuilds no frame". A literal GC
assertion is not portable across Node and browsers and would be flaky in CI, so `[S3-A3]` asserts the
three properties that actually matter and are observable:

1. `FrameLayout.computeFrame` is not called (spy) — no cold path.
2. No nodes are created or removed during the hover run (MutationObserver record count is zero except
   for attribute mutations) — no reconciliation.
3. `applyState`'s own work is O(changed items): exactly two bars change `data-state` per hover step.

**Also settled here:** the acceptance's "1,000 visible bars" is not reachable under S1's
virtualization — a 32px row in a normal pane windows to ~25 visible rows. The test fixture is 1,000
entries with the window widened (`overscan`) so ≥200 bars are mounted, and hovers across all of them.
`plans/03` §S3's wording is corrected to "1,000-entry fixture, hovering every mounted bar" (§7).

### D-S3-21 — Touch arms on long-press; only bars opt out of native touch scrolling

`touch-action: none` on the timeline pane would kill touch scrolling for the whole chart. It goes on
`.fg-bar` and `.fg-bar-handle` only, so a drag that starts on a bar takes over while a drag that
starts anywhere else still pans the pane natively.

On a coarse pointer (`event.pointerType !== 'mouse'`), the gesture arms on a **400ms long-press**
rather than the 14px slack threshold, so a finger that starts on a bar can still flick-scroll the
chart. Rejected alternative: arming immediately on touch, which makes a dense chart unscrollable
anywhere a bar happens to be.

### D-S3-22 — The events S3 declares, and the ones it does not

Added to `GanttEventMap`: `beforeEntryMove`/`entryMove`, `beforeEntryResize`/`entryResize`,
`beforeSelectionChange`/`selectionChange`. `beforeEntryEdit`/`entryEdit` (S5's editor) and
`beforeLinkCreate`/`linkCreate` (S7) stay out — I11 keeps the public `.d.ts` free of anything
unimplemented, and `view/event-bus.ts`'s existing comment ("Declared events fire (I11)") is the
standing rule.

```ts
export interface EntryMove   { readonly entries: readonly Entry[]; readonly edits: EntryEdits; }
export interface EntryResize extends EntryMove { readonly edge: 'start' | 'end'; }
export interface SelectionChange { readonly from: readonly EntryId[]; readonly to: readonly EntryId[]; }
```

`edits` is the draft — `{ start, end }` per entry — so a handler reads the proposed values without
recomputing them, and `plans/02` §3's example (`({ entry, start, end }) => …`) generalises to the
multi-entry case rather than being contradicted by it.

---

## 3. API

### 3.1 `src/api/gantt.ts`

```ts
interface GanttOptionsBase {
  // …unchanged keys…
  /** Live. Per-gesture, boolean or per-entry predicate, over per-kind defaults (D-S3-9). */
  interactions?: Interactions;
  /** Live. Entry ids; assignment runs the same cancelable sequence a click runs (D-S3-10). */
  selection?: readonly EntryId[];
}

export class Gantt {
  get interactions(): Interactions;     set interactions(i: Interactions);
  get selection(): readonly EntryId[];  set selection(ids: readonly EntryId[]);
}
```

`GanttEventMap` gains the six names in D-S3-22. No new methods: a gesture is not something a consumer
invokes.

### 3.2 `src/interaction/`

| File | Exports | Job |
|---|---|---|
| `pointer-gesture.ts` | `attachPointerGesture` | The base: arm threshold, long-press on coarse pointers, pointer capture, Escape, teardown. Knows nothing about entries |
| `entry-gestures.ts` | `attachEntryGestures` | The one pointer stream over the bar layer; decides select vs. move vs. resize from the hit target; drives preview and commit |
| `keyboard-editing.ts` | `attachKeyboardEditing` | D-S3-13's editing half |
| `entry-gesture-context.ts` | `EntryGestureContext` | D-S3-5's seam type |

One pointer stream, not three attachments racing for it: a pointerdown that becomes a drag must not
also change the selection, and that is only expressible where both outcomes are decided in one place.

### 3.3 `src/view/`

`capability.ts` (`resolveCapabilities`, `Interactions`, `CapabilityRule` — D-S3-9);
`wheel-navigation.ts` (`attachWheelNavigation`); `keyboard-navigation.ts`
(`attachKeyboardNavigation`); `splitter.ts` (`SplitterHooks` → `SplitterContext`, D-S3-5).
`GanttShell` owns the `InteractionState`, the capability resolution, the selection, and the wiring of
every context above — the composition root's existing job, one more set of attachments.

### 3.4 `src/layout/`

`gesture-draft.ts` (`draftForMove`, `draftForResize`, `previewOffsets`, `ItemPreview` — D-S3-4).

### 3.5 `src/time/`

`snapInstant(zone, at, snap)` beside the existing steppers (D-S3-12).

### 3.6 `src/model/`

`EntryEdits` moves here from `data/edit-extension.ts` (D-S3-4), re-exported from `data/` so no import
path breaks. `StoredEdit` moves with it — it is the same shape's other half.

### 3.7 `src/render/dom/`

`applyState` becomes real: `data-state` tokens, preview transforms, the shared handle pair, the cursor
line, the hovered bar's cursor. `mount()` creates the four singleton nodes (two handles, cursor line,
cursor label). The reconciler's scope is untouched — none of this is keyed-children work.

### 3.8 `harness/`

`editing.html` / `editing.ts`, linked from the index the way `zoom.html` is: a playground with a veto
demo (a boundary date that toasts and refuses), a selection readout, a changeset log, and — behind
P1 — a lock-style extender showing a second bar ghosting.

---

## 4. Public surface

`api/index.ts` gains: `Interactions`, `CapabilityRule`, `Gantt.interactions`, `Gantt.selection`, and
the six event names of D-S3-22 with their payload types. **Nothing extender-shaped becomes public**
— D-S2-6 puts the install API in S5 and I11 forbids an option a consumer cannot fill (P1).
`EntryEdits`/`StoredEdit` move to `model/` (D-S3-4) but stay unexported from `api/index.ts`.

New Parts: `fg-bar-handle`, `fg-cursor-line`, `fg-cursor-line-label`. New State attribute:
`data-state` on `.fg-bar`. New Tokens: `--fg-selection-color`, `--fg-ghost-opacity`.

**Unchanged:** every S1.12/S1.13 key, and every S2 data surface. Nothing in this slice changes an
existing signature except `SplitterHooks`, which is internal.

---

## 5. Foot-guns and their automatic answers

| Foot-gun | Answer |
|---|---|
| A consumer mutates the entry inside a `beforeEntryMove` handler | The handler gets the committed `Entry` and the draft `edits`; mutating a store outside a transaction does not typecheck (`TxToken`), and a nested `transaction()` during notification throws `MutationDuringNotificationError` (D-S2-9) |
| Dragging a `'group'` "works" and then snaps back | It never arms: `canMove` is false for every `derivedSpanKinds` kind, and the handles/cursor never appear (D-S3-9) |
| A drag across a DST boundary silently shifts the bar by an hour | It cannot: the delta is a calendar delta stepped through `time/` (D-S3-3), and the DST case is a plain Node test |
| An async `beforeEntryMove` never resolves | The gesture stays visibly pending and no further gesture arms on that Gantt. It is the consumer's promise; the library will not invent a timeout that silently commits |
| The extender's ghost points at an entry scrolled out of the window | No node exists to transform, so no ghost paints. The commit is unaffected — the draft is data, the ghost is paint |
| Ctrl+wheel zooms the browser page instead of the chart | The listener is `passive: false` and calls `preventDefault()` (D-S3-14) |
| Arrow keys pan when the user meant to nudge | Selection is the mode switch, and Escape is the always-available way back (D-S3-13) |
| A dense chart cannot be scrolled by touch | `touch-action: none` is on `.fg-bar` only, and touch drags arm on long-press (D-S3-21) |
| Ten arrow presses need ten Ctrl+Z presses | True, and named: undo coalescing needs a History merge policy S2 did not ship (§9) |
| Two Gantt instances on one Dataset fight over the selection | They cannot: selection is Gantt state, not Dataset state (D-S3-10) |

---

## 6. Tests

`pure` (Node, no DOM) except where noted.

- **`layout/gesture-draft.test.ts` (new, pure)** — snap to tick, `snap: 'none'`, Alt-suspended snapping; a move across a spring-forward and a fall-back boundary keeps both wall-clock ends (D-S3-3); resize clamps at zero length rather than inverting; a multi-entry draft applies one delta to N entries; `previewOffsets` against known committed geometry.
- **`time/snap.test.ts` (new, pure)** — `snapInstant` at each `TimeUnit`, including across a DST transition and at a week start in a non-UTC zone.
- **`view/capability.test.ts` (new, pure)** — the D-S3-9 default table per kind; a boolean rule; a predicate rule; a consumer-defined kind; `interactions` reassignment re-resolves live.
- **`interaction/entry-gestures.test.ts` (new, dom)** — `[S3-A1]` before-event → exactly one transaction → after-event, asserted as an ordered log for move, resize and selection; nothing is written on pointerdown; `[S3-A2]` Escape mid-drag leaves store, `data-state` and transforms exactly as they were.
- **`interaction/keyboard-editing.test.ts` (new, dom)** — the D-S3-13 map, both modes; `[S3-A5]`'s keyboard half.
- **`api/gantt.test.ts` (extended, dom)** — `[S3-A5]` a `resize`-incapable entry renders no handle and refuses pointer and keyboard resize; `[S3-A3]` hover across every mounted bar of a 1,000-entry fixture calls no `computeFrame` and creates/removes no nodes (D-S3-20); `[S3-A7]` ctrl+wheel zooms anchored, shift+wheel pans, Page/Home/End pan, and `dataset.on('change')` never fires for any of them.
- **`interaction/extender-preview.test.ts` (new, dom)** — `[S3-A4]` with the identity extender only the dragged bar carries a preview; with an extender injected through `DatasetStateOptions` (D-S2-6's sanctioned route) that writes a second entry's `start`, that bar carries one too; Escape discards both; a static-import assertion proves no `scheduling/` import reaches `interaction/`.
- **`data/history.property.test.ts` (extended, pure)** — `[S3-A6]` a gesture's changeset (user edit + extender extras) inverts to the exact pre-gesture state, folded into the existing `[S2-A1]` property test rather than given a second one.
- **e2e `e2e/direct-manipulation.spec.ts` (new)** — `[S3-A8]` the cursor line follows the pointer during a drag, reports the snapped date, and is gone on release; a real drag moves a bar and a real Ctrl+Z puts it back; the veto demo refuses a drop and leaves nothing behind.
- **Guard** — `scripts/guard-red-test.mjs` gains a fixture proving `interaction/` importing `layout/`, `time/` or `render/` still fails the build after P3's one-arrow widening.

---

## 7. Spec edits — landed **with** this step

- `plans/03` §S3 — acceptance boxes `[S3-A1]`–`[S3-A8]`, replacing the six untagged ones; the "1,000 visible bars" wording corrected per D-S3-20; a pointer to this spec.
- `plans/00` §4 — the `S3 → S4` gate restated over the acceptance ids; the `S1.13 → S3` gate marked discharged.
- `plans/01` §1 — the `INT --> MODEL` arrow and its one-line justification (**P3**); §9 updated to name the attachments this step actually ships rather than the `Drag`/`Resize`/`Select`/`Keyboard` controller sketch.
- `plans/02` §3 — the three event pairs with their payload types; §4 token table gains `--fg-selection-color` and `--fg-ghost-opacity`; the Part vocabulary gains `fg-bar-handle`, `fg-cursor-line`, `fg-cursor-line-label`; §4.1's `interactions` example drops `linkCreate` until S7.
- `plans/04` §1 — nothing (no new runtime dependency).

Already landed **with this spec**, not waiting for the step: `plans/03` §S3's and §S5's harness scope
lines (P1, option (a)), and `src/data/dataset-state.ts`'s stale `editExtender` comment — a pre-remap
reference, not a live decision.
- `CONTEXT.md` — new entries **Gesture**, **Draft**, **Ghost**, **Cursor line**, **Interaction state**, **Nudge**; **Capability** updated with the per-kind default table's existence; **Part** and **State attribute** updated with the new members.
- `.dependency-cruiser.cjs` — `interaction-boundary` widened to `['view', 'data', 'model']` (**P3**), with the red-test fixture.
- `.slice` → `S3`; `scripts/slice-gate.mjs` gains the `S3 → S4` gate.
- Issue #99 gap 5 — closed by `[S3-A8]`; issue #100's gesture half — closed by `[S3-A7]`, its period-view half stays open.

---

## 8. TODO — the vertical steps

Each step ends with something visible in `harness/`. Ordered so the riskiest seam (the hot path) is
proven before anything writes data, and so the two steps with an open prerequisite (S3.2, S3.8) are
reachable without holding up the rest.

### S3.1 — Selection *(no prerequisite)*
- [ ] `Gantt.selection` get/set; `beforeSelectionChange`/`selectionChange` on `GanttEventMap`
- [ ] `InteractionState.selectedItemIds` written by the shell; entry ids in, item ids out (D-S3-10)
- [ ] `applyState` paints `data-state~="selected"`; `--fg-selection-color` in both palettes
- [ ] `attachEntryGestures`, first outcome only: pointerup selects; click-empty and Escape clear; ctrl/⌘ toggles; shift extends
- [ ] **Visible:** clicking bars in `harness/index.html` highlights them; a readout shows the selection

### S3.2 — The hot path and capabilities *(blocked on **P3**)*
- [ ] `plans/01` §1 arrow + `.dependency-cruiser.cjs` widening + red-test fixture
- [ ] `view/capability.ts` with the D-S3-9 default table; `Gantt.interactions`, live
- [ ] `applyState` real: `data-state` from the state's own keys (D-S3-7), hover, cursor
- [ ] Shared `.fg-bar-handle` pair, positioned by `applyState`, gated by `canResize` (D-S3-8)
- [ ] `[S3-A3]`, `[S3-A5]`'s pointer half
- [ ] **Visible:** handles and a grab cursor appear on capable bars only; groups show neither

### S3.3 — Drag-move *(no prerequisite)*
- [ ] `time/snapInstant`; `layout/gesture-draft.ts`'s `draftForMove` + `previewOffsets`; `EntryEdits`/`StoredEdit` move to `model/`
- [ ] `attachPointerGesture`: threshold, capture, Escape, long-press (D-S3-21); `SplitterHooks` → `SplitterContext`
- [ ] `EntryGestureContext`; preview through the shell's rAF (D-S3-18, extender not yet called)
- [ ] `beforeEntryMove` → one `dataset.transaction()` → `entryMove`; `MutationCancelledError` restores (D-S3-16)
- [ ] Multi-entry draft from the selection (D-S3-19); `[S3-A1]`'s move half, `[S3-A2]`, `[S3-A6]`
- [ ] **Visible:** bars drag, snap, commit, and Ctrl+Z reverts them

### S3.4 — Resize *(no prerequisite)*
- [ ] `draftForResize`; edge detection from the handle that was grabbed
- [ ] `beforeEntryResize`/`entryResize`; zero-length clamp; milestone and derived-span refusal
- [ ] `[S3-A1]`'s resize half
- [ ] **Visible:** edges drag independently; a group's edges refuse

### S3.5 — Keyboard parity and the async veto *(no prerequisite)*
- [ ] `attachKeyboardEditing` + the shell's one `keydown` listener and the D-S3-13 mode switch
- [ ] Async `before*`: `pending` state, gesture lock, resolution both ways (D-S3-17)
- [ ] Screen-reader announcement of the committed span on nudge (the bar's a11y label already carries it)
- [ ] `[S3-A5]`'s keyboard half
- [ ] **Visible:** a bar nudges by keyboard; the veto demo's async path holds a pending ghost

### S3.6 — Extender preview *(no prerequisite — P1 closed)*
- [ ] The rAF preview calls the extender with the draft; extras join `previewOffsets`
- [ ] `[S3-A4]` and `[S3-A6]` inject through the internal `DatasetStateOptions.editExtender`, as `[S2-A1]` already does (D-S2-6)
- [ ] The no-`scheduling/`-import assertion
- [ ] ~~`src/data/dataset-state.ts`'s stale "S3's own job (#15)" comment~~ — corrected with this spec
- [ ] ~~`plans/03` §S3/§S5 harness scope lines~~ — moved with this spec (P1, option (a))
- [ ] **Visible:** a dragged bar ghosts under an extender in a `dom` test now; on a harness page at S5

### S3.7 — Viewport gestures *(no prerequisite)*
- [ ] `attachWheelNavigation`: ctrl/⌘+wheel → `zoomBy(factor, offsetX)`; shift+wheel → pan; `passive: false`
- [ ] `attachKeyboardNavigation`: Page/Home/End and the unselected arrow mode
- [ ] `[S3-A7]`
- [ ] **Visible:** the chart zooms and pans under the wheel with nothing written to the dataset

### S3.8 — Cursor line, harness, gate *(blocked on **P2**)*
- [ ] `.fg-cursor-line` / `.fg-cursor-line-label` singletons; `cursorX`/`cursorLabel` in `InteractionState`
- [ ] `harness/editing.html` + `editing.ts`; index link; `harness/main.ts` reviewed against CLAUDE.md's harness rule
- [ ] `e2e/direct-manipulation.spec.ts`; `[S3-A8]`
- [ ] The §7 spec edits, landed with this step
- [ ] `S3 → S4` gate green; `.slice` bumped

---

## 9. Deferred, with the caller that brings it back

| Deferred | Returns at | Needs |
|---|---|---|
| Row reorder and reparent by drag | S4 | An authored ordering field on `Entry`, and the tree row source (D-S3-11) |
| Moving a `'group'` moves its subtree | S4, or a scheduling policy at S7 | Something in the extension hook to write the children; the identity extender cannot (D-S3-9) |
| Undo coalescing for a run of keyboard nudges | when a caller asks | A History merge policy S2 did not ship (D-S3-13) |
| `progress` drag handle | S5 | A second per-bar affordance and a `progress` capability |
| Inline cell/label editing (`beforeEntryEdit`) | S5 | The editor feature and the overlay host (`01` §10) |
| Context menu, tooltips | S5 | The plugin contract's `commands` and `overlay` |
| `linkCreate` gesture, link ports | S7 | Plugin-owned `Dependency` data (ADR 0002) |
| Roving tabindex, full grid a11y pattern, axe in CI | S5 | `plans/03` §S5's a11y completion block, which already owns it |
| Multi-Gantt gesture sync (drag in one, ghost in another) | when a caller asks | Selection is per-Gantt by design (D-S3-10); a shared selection object would be a D9-shaped seam, not a core change |
