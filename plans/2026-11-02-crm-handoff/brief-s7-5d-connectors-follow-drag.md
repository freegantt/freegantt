# Brief S7.5d: connectors follow a drag preview

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-5d-connectors-follow-drag`. Port: 5317. This blocks the 0.2.0 release.

## Why

The owner moved a bar with lines attached. During the drag, the dragged bar and the successors that `scheduling()` pushes show at their preview places. Every connector stays at the committed places, so lines point at empty space. On release, the lines jump. Reproduce it on the harness "Dependencies" page: drag "Foundation 1" right.

Cause: `src/layout/connectors/connector-router.ts` routes from the Dataset (`datasetRevision`, `plan`, `memory`). It never reads the gesture draft (`src/layout/gesture-draft.ts`) that `frame.ts` paints the bars from.

## Change

1. **Failing test first:** a frame with a move draft gives a connector whose end anchors match the draft bar box, for the dragged Entry and for each Entry the draft moves through the edit extension (the pushed successors). A resize draft does the same.
2. **Route from the painted boxes.** The router takes the same bar places that `frame.ts` paints, draft included. Do not copy the draft rule into the router: ask `frame.ts` for it, as `barBox` does now.
3. **Cost.** A preview frame reroutes only the connectors that have an end on an Entry the draft moves. Every other connector keeps its cached route. Bar avoidance on a preview frame may use the committed bar index. Say in `worker_done` what you chose. Add a timed test: 10 000 connectors, a draft that moves one Entry with 5 links, gives a preview frame under 4 ms in Node (report the measured time). The drag preview allocates nothing per unmoved connector.
4. **End of the gesture.** On commit, the routes come from the new Dataset, with no jump. On Escape, the routes go back to the committed places.
5. **E2e** on the "Dependencies" page: mid-drag, the line from the dragged bar starts at the bar's preview edge, and the line into a pushed successor ends at that successor's preview edge. After Escape, both go back.
6. `CHANGELOG.md` line under `### Fixed` in the `[0.2.0]` section (the release is not published yet).

## Constraints

- Do not change the route rules in `route-connector.ts`, the port styles, or `src/interaction/connect.ts`.
- No harness workaround. If core does not give you what you need, `ask`.
