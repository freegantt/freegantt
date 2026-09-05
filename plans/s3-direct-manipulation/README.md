# S3 — Direct manipulation

**Slice:** S3 (`plans/03` §S3) · **Position:** after S1.13, before S4 · **Status:** done — S3.8 gate green; continue at **S4**
**Form:** same settled-spec shape as [`plans/s2-data-core/README.md`](../s2-data-core/README.md) — this file is the tracker and shared context; each step file holds the work and its TODO boxes.
**Handoff:** [`HANDOFF.md`](./HANDOFF.md) — session notes for whoever continues.
**Review:** [`plans/reviews/2026-08-29-s3-direct-manipulation.html`](../reviews/2026-08-29-s3-direct-manipulation.html) (2026-08-29 standards/spec pass).

**Builds on:** S2 data core, S1.12 viewport (`zoomBy`, `panToInstant`), S1.13 date-line seam, `view/splitter.ts`.
**Closes:** D10 pointer half, `plans/01` §9, I5, I6, I14, D-S1.12-17, D-S1.13-9 / issue #99 gap 5.

> **What this slice is not.** No `Dependency`, no `linkCreate`, no `schedule()` — S7. No inline cell editing, tooltips, or context menu — S5. No row reorder, reparenting, or `progress` handle — §9. `interaction/` never imports `scheduling/`.

---

## Prerequisites

All closed. Kept here as the record of what blocked what.

| Id | Question | Status | Blocks |
|---|---|---|---|
| **P1** | Where does the extender-ghost **demo** live? | **Closed** — option (a): demo moves to S5; S3 proves extender preview in `dom` tests via internal `DatasetStateOptions.editExtender` (D-S2-6) | S3.6 harness visibility only |
| **P2** | S1.13 must land before cursor line | **Closed** (2026-08-30) — `DateLineSpec`/`DateLine`, `.fg-date-line` | S3.8 |
| **P3** | `interaction/` needs `INT --> MODEL` (type-only) | **Closed** (2026-08-30, landed S3.1) | S3.2+ |
| **P3b** | `view/` cannot import `interaction/` | **Closed** — `API --> INT`; `GanttShell` takes `attachEntryGestures` by constructor injection from `api/gantt.ts` | any shell wiring |

**S3 publishes no install API** for `EditExtender` — D-S2-6 puts that in S5. Tests inject through the internal option.

---

## User stories

Acceptance lives in the step files and the boxes below. Each story names its step.

| Story | Step |
|---|---|
| U1 — drag bar sideways, snap, one undo | S3.3 |
| U2 — Escape mid-drag, no commit | S3.3 |
| U3 — resize right edge only | S3.4 |
| U4 — `interactions: { resize: … }` gates pointer and keyboard | S3.2, S3.5 |
| U5 — `beforeEntryMove` sync veto | S3.3 |
| U6 — async veto, pending ghost | S3.5 |
| U7 — extender ghosts two bars | S3.6 |
| U8 — shift-click multi-select, one transaction drag | S3.1, S3.3 |
| U9 — keyboard nudge, one transaction per press | S3.5 |
| U10 — ctrl+wheel zoom, no dataset write | S3.7 |
| U11 — cursor date hairline while dragging | S3.8 |
| U12 — hover allocates nothing | S3.2 |

---

## Step map

Eight steps, in order. Riskiest seam (hot path) before data writes. Open the step file for decisions, files, tests, and checkboxes.

| Step | Plan | Status | Ends with |
|---|---|---|---|
| S3.1 | [`s3.1-selection.md`](./s3.1-selection.md) | done | click-to-select in harness |
| S3.2 | [`s3.2-hot-path-and-capabilities.md`](./s3.2-hot-path-and-capabilities.md) | done | handles + grab cursor in tests |
| S3.3 | [`s3.3-drag-move.md`](./s3.3-drag-move.md) | done | drag, snap, commit, undo |
| S3.4 | [`s3.4-resize.md`](./s3.4-resize.md) | done | independent edge drag |
| — | [`gesture-host-refactor.md`](./gesture-host-refactor.md) | done | closes review C1–C5: gesture host + affordance projector, one `EntryGestureContext` home |
| S3.5 | [`s3.5-keyboard-parity-and-async-veto.md`](./s3.5-keyboard-parity-and-async-veto.md) | done | keyboard nudge + async veto; pending ghost at the commit draft |
| S3.6 | [`s3.6-extender-preview.md`](./s3.6-extender-preview.md) | done | extender ghost in `dom` test |
| S3.7 | [`s3.7-viewport-gestures.md`](./s3.7-viewport-gestures.md) | done | wheel zoom/pan, no writes |
| S3.8 | [`s3.8-cursor-line-harness-gate.md`](./s3.8-cursor-line-harness-gate.md) | done | editing harness, e2e, gate green |

---

## Agent gotchas

Read these before touching `src/`.

1. **`view/` must not import `interaction/`.** Wire new gesture pieces through constructor injection on `GanttShell`, same as `attachEntryGestures`. `depcruise` catches a direct import; the DI pattern is the fix.
2. **`interaction/` may import `model/` (types) and `view/` (`Interactions`) only** — not `layout/`, `time/`, or `render/`. Gesture math lives in `layout/gesture-draft.ts`; the shell hands results through `EntryGestureContext`.
3. **`EntrySelectionContext` in S3.1 is intentional** — grows into full `EntryGestureContext` in S3.3; do not replace `entry-gestures.ts`, extend it on one pointer stream.
4. **Add `InteractionState` fields incrementally** — S3.1 added selection; S3.2 added hover/handles; preview/cursor/pending come later.
5. **Selection is Gantt state, not Dataset** — `[S3-A1]` covers move/resize/nudge only; selection has its own event pair and opens no transaction.
6. **Run the full check sequence** after each step: `pnpm vitest run`, `tsc --noEmit`, `eslint src harness`, `depcruise`, `node scripts/guard-red-test.mjs`.
7. **`.slice` bumps only at S3.8** — not before the gate is green.

---

## Acceptance ids

`plans/03` §S3 boxes are `[S3-A1]`–`[S3-A8]`.

| Id | Box | Primary tests |
|---|---|---|
| `[S3-A1]` | before-event → one transaction → after-event (move, resize, keyboard nudge); selection event pair, no `change` | `interaction/*.test.ts`, `api/gantt.test.ts` |
| `[S3-A2]` | Escape mid-drag restores store and paint | `entry-gestures.test.ts` |
| `[S3-A3]` | hover allocates nothing, no frame rebuild | `api/gantt.test.ts` |
| `[S3-A4]` | extender preview ghosts extra entries | `extender-preview.test.ts` |
| `[S3-A5]` | capability gates pointer and keyboard affordances | `api/gantt.test.ts`, `keyboard-editing.test.ts` |
| `[S3-A6]` | gesture + extender extras undo atomically | `history.property.test.ts` |
| `[S3-A7]` | viewport gestures write nothing | `api/gantt.test.ts` |
| `[S3-A8]` | cursor line during drag | `e2e/direct-manipulation.spec.ts` |

**`[S3-A1]` scope:** selection is excluded from the "one transaction" assertion — it is not a data gesture.

---

## Public surface (app author)

Two live properties and six events — no hooks, no extender, no `overscan`:

```ts
const gantt = new Gantt({
  container, dataset,
  interactions: { resize: (entry) => entry.kind !== 'group' },
  selection: ['t1'],
});
gantt.on('beforeEntryMove', ({ entry, start }) => start < mobilization ? false : undefined);
gantt.selectedIds = ['t1', 't2'];
```

| Export | Step |
|---|---|
| `Gantt.interactions`, `Interactions`, `CapabilityRule` | S3.2 |
| `Gantt.viewportGestures`, `ViewportGestures`, `ViewportGestureFlags` | S3.7 |
| `Gantt.selectedIds`, `Gantt.selectedEntries` | S3.1 |
| `beforeEntryMove`/`entryMove`, `beforeEntryResize`/`entryResize` | S3.3, S3.4 |
| `beforeSelectionChange`/`selectionChange`, `SelectionChange` | S3.1 |
| `ProposedSpan`, `EntryMove`, `EntryResize` | S3.3, S3.4 |
| `GanttEventHandler<K>`, `AsyncCancelableEvent` — `beforeEntryMove`/`beforeEntryResize` handlers may return a `Promise<void \| false>` (D-S3-17); every other event stays sync-only | S3.5 |
| Parts: `fg-bar-handle`, `fg-cursor-line`, `fg-cursor-line-label` | S3.2, S3.8 |
| Tokens: `--fg-selection-color`, `--fg-ghost-opacity`, `--fg-pending-opacity` | S3.2, S3.5, S3.6 |
| `data-state` on `.fg-bar` (`hovered`, `selected`, `pending`) | S3.2+ |

**Not public:** `EntryEdits`, `StoredEdit`, `ItemPreview`, `EntryGesture`, `EntryGestureContext` — internal write/gesture shapes.

Full module map (which file owns what) is split across step files §2. Cross-cutting snap rule:

### D-S3-12 — Snap defaults to preset tick; Alt suspends

Unset `ViewPreset.snap` reads as `'tick'`. `snapInstant(zone, at, snap)` in `time/`; `layout/gesture-draft.ts` is its caller. The live preview always tracks the pointer at full pixel resolution (`suspendSnap: true`) so the bar never lags the cursor between tick crossings — snap and Alt both apply only to the value written on commit (4105b08).

### D-S3-24 — `gantt.snap` is the Gantt's own snap, above the preset's (#195, added in S5)

D-S3-12 put snap on the ViewPreset, and left no other place to state it. So a consumer changing the snap alone wrote `gantt.preset = { ...gantt.preset, snap }` — the getter returns a resolved `ViewPreset`, the setter takes a `PresetRef`, and the round trip built a one-off copy of a shipped preset. `harness/main.ts` wrote exactly that. Two things were wrong with it. The next `zoomIn()` replaced that copy with the next rung of `zoomPresets` and threw the snap away. And a Gantt sharing a `TimeScaleModel` (D9) shares its preset, so one page's snap choice reached the other Gantt.

**`gantt.snap` is a Gantt-level setting, over whatever preset is showing.**

```ts
gantt.snap = { unit: 'day', increment: 2 };  // survives a zoom, and is this Gantt's alone
gantt.snap = 'tick';                          // one tick of whatever preset is showing
gantt.snap = undefined;                       // the preset decides again
gantt.snap;                                   // 'tick' — what is in effect right now
```

`SnapSetting` (`TickStep | 'tick' | 'none'`) is what a caller states; `SnapUnit` stays what a gesture resolved it to. `ViewPreset.snap` keeps its meaning as the preset's own default, and both now name the same type.

The getter answers with what is in effect — this Gantt's setting, else the showing preset's, else `'tick'` — the same asymmetry `gridWidth` already ships: loose on the way in, resolved on the way out. It never resolves `'tick'` into a unit, because only a gesture knows which preset is measuring it. `GesturePipeline` reads one dep, `snap()`, and no longer reads `preset.snap` at all: one resolution, in `GanttShell`.

Snap changes no paint, so it is a plain field, not a frame setting, and it raises no event. It is reconfiguration, like `minGridWidth` (`plans/02` §3).

---

## Decisions index

Full prose for each decision lives in the step file that implements it. Use this table to find it.

| Decision | Topic | Step file |
|---|---|---|
| D-S3-1 | Position, `[S3-A7]`/`[S3-A8]` | S3.8 |
| D-S3-2 | Draft = `EntryEdits` | S3.3 |
| D-S3-3 | Calendar delta, not pixel | S3.3 |
| D-S3-4 | `layout/gesture-draft.ts`, `ItemPreview`, `cursorLabelForX` | S3.3, S3.4, S3.8 |
| D-S3-5 | `EntryGestureContext`, `SplitterContext` | S3.3 |
| D-S3-6 | `InteractionState`, one per shell | S3.1, S3.2, S3.3 |
| D-S3-7 | `data-state` tokens | S3.1, S3.2, S3.6 |
| D-S3-8 | Shared handle pair | S3.2 |
| D-S3-9 | `view/capability.ts` | S3.2, S3.5 |
| D-S3-10 | Selection on Gantt | S3.1 |
| D-S3-11 | Horizontal drag only | S3.3 |
| D-S3-12 | Snap / Alt | README above; impl S3.3 |
| D-S3-13 | Keyboard map | S3.5 |
| D-S3-14 | Viewport in `view/` | S3.7 |
| D-S3-15 | Cursor line Part | S3.8 |
| D-S3-16 | One transaction, veto order | S3.3 |
| D-S3-17 | Async pending | S3.5 |
| D-S3-18 | rAF extender preview | S3.3, S3.6 |
| D-S3-19 | Multi-selection move/resize | S3.3, S3.4 |
| D-S3-20 | Hover perf test fixture | S3.2 |
| D-S3-21 | Touch long-press | S3.3 |
| D-S3-22 | Event payloads | S3.1, S3.3, S3.4 |
| D-S3-23 | Keyboard nudge reuses the pointer commit pipeline via `EntryGestureSession.nudge()`; async veto via `EventBus<TEvents, TAsyncKeys>` | S3.5 |
| D-S3-24 | `gantt.snap` states the snap for one Gantt, over the showing preset | README above; impl S5 (#195) |

---

## Foot-guns

| Foot-gun | Answer |
|---|---|
| Consumer mutates entry inside `beforeEntryMove` | `TxToken` + `MutationDuringNotificationError` |
| Dragging a `'group'` "works" then snaps back | `move` false for `derivedSpanKinds`; never arms |
| DST silently shifts bar | Calendar delta through `time/` (D-S3-3) |
| Async `beforeEntryMove` never resolves | Stays pending; no timeout that commits |
| Extender ghost for scrolled-out entry | No node to paint; commit unaffected |
| Ctrl+wheel zooms browser | `passive: false` + `preventDefault()` |
| Arrows pan when user meant nudge | Selection mode switch; Escape clears |
| Dense chart unscrollable on touch | `touch-action: none` on bars only; long-press arms |
| Ten nudges need ten undo | True — coalescing needs History merge policy (§9) |
| Two Gantts fight over selection | Selection is per-Gantt (D-S3-10) |
| Handler expects extender cascade in move payload | User edit only; cascade is `beforeChange` on Dataset |
| `gantt.selectedIds = ['t1']` type error | Setter accepts `EntryId \| string` |

---

## Tests (overview)

`pure` (Node) unless noted. Per-step detail in each step file §3.

| Area | Files |
|---|---|
| Layout / snap | `layout/gesture-draft.test.ts`, `time/snap.test.ts` |
| Capabilities | `view/capability.test.ts` |
| DOM paint | `render/dom/index.test.ts` |
| Gestures | `interaction/entry-gestures.test.ts`, `keyboard-editing.test.ts`, `extender-preview.test.ts` |
| Integration | `api/gantt.test.ts` |
| Undo + extender | `data/history.property.test.ts` |
| E2E | `e2e/direct-manipulation.spec.ts` |
| Guard | `scripts/guard-red-test.mjs` — `interaction/` must not import `layout/`/`time/`/`render/` |

---

## Deferred (§9)

| Deferred | Returns at | Needs |
|---|---|---|
| Row reorder and reparent by drag | when an authored order Field exists | That Field, plus a drop-target vocabulary (D-S4-31). S4 ships the data half: `update(id, { parentId })` |
| Moving a `'group'` moves subtree | S4 or S7 | Extension hook writes children |
| Undo coalescing for keyboard nudges | when asked | History merge policy |
| `progress` drag handle | S7 | Scheduling-plugin Field (ADR 0008) |
| Inline editing (`beforeEntryEdit`) | S5 | Editor + overlay host |
| Context menu, tooltips | S5 | Plugin `commands` / `overlay` |
| `linkCreate`, link ports | S7 | Plugin `Dependency` data; link emission seam design open at #136 |
| Full grid a11y, axe in CI | S5 | `plans/03` §S5 a11y block |
| Remappable keymap | S5 | `CommandRegistry`, `registerKeybinding` |
| Multi-Gantt gesture sync | when asked | Shared selection seam |
| Lock-style extender harness demo | S5 | Public install API (P1) |

---

## Spec edits

Landed incrementally except the batch at S3.8 — see [`s3.8-cursor-line-harness-gate.md`](./s3.8-cursor-line-harness-gate.md) §5 for the full list. Already landed with this spec (not waiting on code): P1 harness scope lines in `plans/03` §S3/§S5; prerequisite count; `dataset-state.ts` comment fix.
