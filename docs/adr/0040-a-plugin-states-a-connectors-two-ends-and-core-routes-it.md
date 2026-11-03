---
status: accepted — ruled 2026-11-02 by the owner, amended the same day (`refreshConnectors`). Closes issue [#136](https://github.com/freegantt/freegantt/issues/136). Design in `plans/s7-dependencies-and-scheduling/README.md`.
decided: a Gantt-side plugin registers a connector provider with `ctx.view.registerConnector`. The provider returns `ConnectorInput` values. Each value names two ends, `{ entryId, edge }`. `layout/` routes, culls and clips the connector. The plugin never sees pixels or the window.
open: none.
---

# A plugin states a connector's two ends, and core routes it

## Context

A Gantt-side plugin paints connectors between bars. The rows that say which connectors exist live in a Dataset-side plugin store. `entryDependencies()` owns one such store. `scheduling()` must flag connectors that this store owns.

Three rules bound the design:

- `layout/` imports `model/` and `time/` only. It never names a plugin type.
- A plugin with no dependencies must draw "related to" arrows through the same seam.
- A connector may cross the window edge. One end may sit in a culled row or a collapsed group.

`dataset.pluginStore(id)` already ships on the public `Dataset` (ADR 0016). A Gantt-side plugin can read any plugin store today. A plugin store row belongs to one Entry, so the seam cannot rely on a free connector id as a store key.

## Decision

**The plugin states the two ends. Core routes.**

```ts
view(ctx) {
  ctx.view.registerConnector(() => connectorInputsFrom(ctx.dataset.pluginStore(id)));
}
```

```ts
// layout/connector-input.ts — imports model/ only
export interface ConnectorEnd { entryId: EntryId; edge: 'start' | 'end' }
export interface ConnectorInput {
  id: string;
  from: ConnectorEnd;
  to: ConnectorEnd;
  flags: ConnectorFlags;
  class?: string;
  label?: string;
}
export type ConnectorProvider = () => readonly ConnectorInput[];
```

### Names

- The line core draws between two bars is a **Connector**.
- `ConnectorInput` is the value a plugin returns. It pairs with `DecorationInput`.
- The frame holds `GeometryFrame.connectors`. Each member is a `FrameConnector`. Its flags are `ConnectorFlags`.
- "Link" and "LinkSpec" retire. **Dependency** stays the word for the stored rule.

### What core does

- `LayoutInput.connectorProviders` mirrors `decorationProviders`.
- `layout/` finds both end bars for any Entry, culled or not. It routes the connector, then clips the path to the window.
- `layout/` memoizes inputs by `datasetRevision`. It memoizes paths by revision, scale and row set. A scroll only filters paths.
- An end in a collapsed group attaches to its nearest visible ancestor.

### How a plugin reads its rows

A Gantt-side plugin reads a plugin store through the existing `ctx.dataset.pluginStore(id)`. No `ctx.store.read` door arrives.

### Two providers, one id

The first provider in registration order owns the input. A later provider with the same id adds its `true` flags and changes nothing else. `scheduling()` emits `{ id, flags: { cycle: true } }` and never restates ends or labels.

## Rejected alternatives

- **Option 1: the plugin returns finished paths** through a `registerConnectorEmitter` seam. Every plugin would route orthogonal paths itself and handle culled ends. `barsForEntry` would become public plugin API.
- **Option 2: option 1 with a new `ctx.store.read` door.** It adds a second door for a read that `ctx.dataset.pluginStore(id)` already answers. This breaks "one domain per word".
- **Option 4: the `data` half contributes connectors to the Dataset.** A chrome-only plugin could not contribute. `data/` would learn a rendering concept. Core would keep a registry current on every Dataset, even with no Gantt bound.

## Consequences

- `layout/` gains `connector-input.ts` and the `connectors/` folder (routing, clipping and the frame type). `view/plugin-ports.ts` gains `view.registerConnector`. `api/` re-exports `ConnectorInput`.
- A plugin cannot draw its own path shape. Routing options live in `layout/`. A later amendment can let an input carry an explicit path.
- A provider that holds data keeps its rows in a plugin store, as `timeShading()` documents for its covers. A Dataset change then refreshes `layout/`.
- Amended 2026-11-02 by the owner: a provider whose state is screen state only, for example a selected connector, calls `ctx.view.refreshConnectors()` after that state changes. Core then asks every provider again. Screen state stays out of the Dataset, undo and sync.
- `plans/01` §4 and `plans/03` § S7 drop the `registerLinkEmitter` and `ctx.store.read` text.
