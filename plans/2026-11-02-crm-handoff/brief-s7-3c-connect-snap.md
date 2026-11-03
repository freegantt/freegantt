# Brief S7.3c: make connecting easy

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-3c-connect-snap`. Port: 5311.

## Why

The owner tried the connect drag: the port is too small, and connecting is hard (ruling D15).

## Target

`src/interaction/connect.ts`, `src/render/dom/connect-affordance.ts` (`PORT_WIDTH_PX = 14`, an 8 px dot), the port styles in `src/view/styles.ts`, ADR 0041, and the S7.3 e2e on the "Related to" and "Dependencies" pages.

## Change

1. **Snap on drop:** a drop anywhere on a target bar connects to that bar's nearer edge (left half → `start`, right half → `end`). A drop on a port still picks that port's edge. A drop on the source bar itself, or on no bar, does nothing.
2. **Show the target while dragging:** the hovered target bar highlights, and the edge it will snap to shows its port as active, so the user sees the result before release.
3. **Bigger port:** the hit area is at least 20 px wide and the full bar height, centered on the bar edge. The visible dot grows to about 10 px. On a coarse pointer (`@media (pointer: coarse)`), the hit area is at least 32 px. Keep the dot outside the bar body so it does not cover the bar's resize handle; check that resize still arms from its own handle (test it).
4. Ports show on hover of the bar or the port, and stay visible for the whole drag on every connectable bar.
5. E2e: a drop on the body of the target bar creates the link on the nearer edge (one case per half); a drop on a port still works; resize still works next to a port.
6. `CHANGELOG.md` line.

## Constraints

- Do not touch `src/layout/connectors/` (the router is under research) or `src/extensions/features/scheduling*`.
- Pointer invariants stay: arm threshold, nothing written on pointer down, Escape cancels.
