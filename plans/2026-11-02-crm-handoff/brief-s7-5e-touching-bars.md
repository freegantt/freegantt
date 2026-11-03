# Brief S7.5e: a clean route when the successor starts at the predecessor's end

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-5e-touching-bars`. Port: 5318. Start only after S7.5d is merged into `Pawel-IT/Sscheduling-Work`.

## Why

The owner showed a finish-to-start link where the successor starts at (or just after) the predecessor's end. The two 12 px stubs overlap, so `routeConnector` takes the backward route: right, down, back left, down, right into the target. It is a zig-zag for a link that needs one bend. A fan-out from one bar to two such successors doubles it.

## Change

1. **Failing tests first** in `src/layout/connectors/connectors.test.ts`: FS where `to.x - from.x` is 0, 6 and 20 px, on the next row and three rows down; FS where the successor starts left of the predecessor end (true backward) keeps today's route; a fan-out of two touching successors shares one vertical.
2. **Rule:** for a finish-to-start (end → start) link to another row where the successor starts at or after the predecessor's end but within two stubs, draw an L that ends on the successor's top (going down) or bottom (going up) edge: from the end anchor, run right to `x = max(from.x + 6, to.x + 8)`, then a vertical to the successor bar's near horizontal edge. The arrowhead then points down (or up) into the bar. Same idea, mirrored, for start → end (SF). SS and FF keep their routes.
3. `ConnectorAnchor` needs the bar's top and bottom for this. Add `barTop` and `barBottom`, filled by `connector-router.ts` from the same bar box the frame paints (no copied height rule).
4. Bar avoidance applies to the new vertical as to any other.
5. E2e on the "Dependencies" page (add a touching pair to the fixture if none exists): the line ends on the successor's top edge, and the arrowhead points down.
6. `CHANGELOG.md` line under `### Changed` in `[0.2.0]` (not yet published).

## Constraints

- Do not touch `src/interaction/connect.ts`, the port styles, or the preview path from S7.5d except where an anchor gains the two fields.
- No harness workaround. If core does not give you what you need, `ask`.
