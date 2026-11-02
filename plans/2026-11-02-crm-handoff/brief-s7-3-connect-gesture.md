# Brief S7.3: the connect gesture

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-3-connect-gesture`. Port: 5304.

## Target

Read the S7.3 section of `plans/s7-dependencies-and-scheduling/README.md`, ADR 0041 (accepted; no keyboard connect), `plans/01-domain-architecture.md` §8 (interaction), `docs/agents/modules/rendering-view.md`, and `decisions.md`.

## Change

1. A core `Connect` controller in `src/interaction/`. It shares the pointer invariants of the other gestures (`createPointerGesture`: arm threshold, nothing written on pointer down, Escape cancels, pointer capture).
2. `ctx.view.onConnect(handler): Disposer`. The controller and the ports exist only while at least one handler is registered.
3. `'connect'` joins `GestureCapability` (`src/model/capabilities.ts`). One resolution gates the port and the gesture (I14). A read-only Entry shows no port.
4. Connector ports: a small handle at each bar edge, drawn by `render/` on hover or focus of a bar whose `'connect'` capability resolves true. During the drag, a preview line follows the pointer, and the target bar edge highlights.
5. Events `beforeConnect` and `connect` in `GanttEventMap`. `beforeConnect` joins the async-veto names in `view/event-bus.ts`. The payload is `{ from: ConnectorEnd, to: ConnectorEnd }`. It never names FS/SS/FF/SF. A drop on the same Entry's own edge, or on no bar, does nothing.
6. No keyboard connect (ADR 0041).
7. **Harness:** the "Related to" page (`harness/plugins/related-to.ts`) registers `onConnect` and adds a pair, so a drag draws a new connector. A veto handler that waits 600 ms shows the async hold. A read-only Entry shows no port. E2e for each. `entryDependencies()` (built in parallel by S7.2) wires its handler later; do not touch it.
8. `CHANGELOG.md` lines. Update the API report.

## Constraints

- Layer rules: `interaction/` imports `view/`, `data/`, `model/` only. Every date or pixel computation is a `layout/` function the shell hands back.
- **Not installed:** no handler, so no ports, no controller, no event. Prove it with a test.
- If the async-veto hold or the port affordance needs a choice the ADR does not cover, `ask`.

## Observable acceptance

- Unit tests for the controller (arm, cancel, veto, same-Entry drop).
- An event-order test: `beforeConnect` → handler → `connect`.
- The harness e2e.
