# Brief S7.5f: resize handles and connect ports follow a drag preview

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-5f-handles-follow-drag`. Port: 5319. This blocks the 0.2.0 release.

## Why

The owner dragged a bar. The bar and its lines move (S7.5d), but the two resize handles and the two connect ports stay at the committed place. Measured on the "Dependencies" page, mid-drag: the bar is at x=683, while its handles stay at 529/588 and its ports at 509/596.

Cause: `applyBarPreview` in `src/render/dom/index.ts` offsets only the bar node. The shared handle pair (`paintResizeHandles`, `paintedHandleBars`) and the ports (`src/render/dom/connect-affordance.ts`, `paint(hoveredBarId, draft)`) read committed geometry only.

## Change

1. **Failing tests first** (DOM test): mid-preview, each handle sits on its bar's preview edge (move: `dx`; resize: `dx` + `dWidth`; row move: `dy`), and each visible port sits on its bar's preview edge. After the preview clears, both go back to the committed place.
2. **Handles:** when a previewed bar holds a handle, move that handle by the same preview offsets on the hot path. Use no frame recompute and create no node (I5). Restore the handle in the same place that `restoreBarTransform` restores the bar.
3. **Ports:** the ports follow the same offsets as the bar during a move or a resize preview. Read the offsets from the same preview map, and copy no geometry rule.
4. **E2e** on the "Dependencies" page: mid-drag, the end handle and the end port sit at the bar's preview right edge (±1 px). After Escape, they sit at the committed edge.
5. `CHANGELOG.md` line under `### Fixed` in `[0.2.0]` (not yet published).

## Constraints

- Do not touch `src/layout/connectors/` (S7.5e works there) or `src/interaction/connect.ts`.
- No harness workaround. If core does not give you what you need, `ask`.
