# S3 implementation handoff

Status as of 2026-08-30: **S3 is done.** `.slice` is `S3`; the live gate is `S3 → S4`. Next slice is **S4**.

S3.8 landed the Cursor line, `harness/editing.html`, `[S3-A8]`, the §7 spec-edit batch, and the gate.

## What landed this session (S3.8)

D-S3-15: `.fg-cursor-line` / `.fg-cursor-line-label` are mount-time singletons, moved by
`applyState` via `InteractionState.cursorX` / `cursorLabel`. Never in `frame.decorations`.
`cursorLabelForX` in `layout/gesture-draft.ts` is `instantForX` → `snapInstant` → `formatDate`.

`interaction/` converts `clientX` to pane-local offset; `EntryGestureContext.contentXAtPaneOffset`
adds the bound `ScrollModel`'s x (I12). Preview still paints unsnapped; the label snaps.

Harness: `harness/editing.html` — veto toast, selection readout, changeset log, Ctrl+Z, live
`interactions` flip, snap select, mobilization Date line. Extender-ghost demo stays S5 (P1).
`harness/main.ts` still uses only public API (no restated `rowHeight`, no private `TimeScaleModel`).

## Gotchas (carried forward)

1. **Don't let `view/` import `interaction/` or `time/`.** Unchanged.
2. **A live drag preview is never synchronous** — still needs an rAF wait in DOM tests (S3.6).
3. **Wheel `offsetX` must not use `event.offsetX`.** Unchanged (S3.7).
4. **`.slice` is `S3`.** Do not bump it until the S4 gate is the one you mean to run.
