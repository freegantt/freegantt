# Brief S7.1: the connector seam

Read `common-rules.md` and `wave-2-rules.md` (same folder) first. Slice name for your progress file: `s7-1-connector-seam`.

## Target

Read the S7.1 section of the PR #667 README, and `decisions.md` rulings 1, 1a, 3, 9, 10a, 11.

- `src/layout/`: a new `connector-input.ts` (the `ConnectorInput` type and `ConnectorProvider`), a router (`connectors/route.ts` or a better name from the `naming` skill), `frame.ts` (`FrameLink` → `FrameConnector`, `links` → `connectors`, `LinkFlags` → `ConnectorFlags`), `LayoutInput` gains the providers the same way it holds decoration providers.
- `src/view/plugin-ports.ts`, `src/view/plugin-registrations.ts`: `ctx.view.registerConnector(provider): Disposer`.
- `src/render/dom/`: draw `GeometryFrame.connectors` as SVG, with `data-connector-id` and `data-flag` tokens.
- `src/api/`: export `ConnectorInput` and friends.
- `harness/`: a "related to" page.

## Change

```ts
ctx.view.registerConnector(() =>
  related.map((r) => ({
    id: `related:${r.id}`,
    from: { entryId: r.aId, edge: 'end' },
    to: { entryId: r.bId, edge: 'start' },
  })),
);
```

1. `ConnectorInput`: `{ id: string; from: ConnectorEnd; to: ConnectorEnd; flags?: ConnectorFlags; class?: string; label?: string }`, with `ConnectorEnd = { entryId: EntryId; edge: 'start' | 'end' }`. Run the `naming` skill on every new name; read each call site aloud.
2. `layout/` finds both end bars for any Entry, culled or not. It routes an orthogonal path from bar edge to bar edge. It clips the path to the window. A connector whose ends are both off-screen still draws when its path crosses the window.
3. An end inside a collapsed group attaches to its nearest visible ancestor. An end with no Entry draws nothing and raises no error.
4. Two providers that return one id: the first one owns the connector. A later one can only add `true` flags.
5. Memoize provider output by dataset revision. Memoize routed paths by revision, scale and row set. A scroll only filters paths.
6. Pre-compute flag tokens in `computeFrame` (the hot-path note in `plans/03` § S7). Do the same for bars if it is the same small change; otherwise leave bars alone.
7. `label` becomes the SVG node's accessible name. Core draws no label text.
8. Check ruling 10a: does one Entry draw one Bar on a segmented row? Report the answer. Do not add an `endpoints` key.
9. **Harness:** a "related to" page. A small harness plugin keeps its own relation list and draws connectors from it, with no dependency code. Scroll so one end leaves the window; the connector stays drawn. Use only the public API. If `src/` does not give you something, stop and `ask` (the Stop rule).

## Constraints

- `layout/` imports `time/` and `model/` only (dependency-cruiser). No plugin types in `layout/`.
- No connect gesture, no ports, no selection in this slice. That is S7.3 and S7.4.
- Not installed (no provider registered): `connectors` is `[]` and the SVG layer is empty. Prove it with a test.

## Observable acceptance

- Unit tests for routing, clipping, the collapsed-end rule, the duplicate-id rule.
- A property test: a connector with both ends off-screen appears when its path crosses the window.
- A render test: SVG nodes carry `data-connector-id`, flag tokens and the accessible name.
- An e2e on the "related to" page.
- Measure a 5,000-connector frame once and report the number in `worker_done`. Do not gate on it.
- `CHANGELOG.md` line.
