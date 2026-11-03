---
status: accepted — ruled 2026-11-02 by the owner, amended the same day (drop on the bar body). Follows [ADR 0040](0040-a-plugin-states-a-connectors-two-ends-and-core-routes-it.md). Design in `plans/s7-dependencies-and-scheduling/README.md`.
decided: core owns a `Connect` controller in `interaction/`, a `'connect'` capability, and the events `beforeConnect` and `connect`. The controller is active only when a plugin registers a handler with `ctx.view.onConnect`. The payload names two `{ entryId, edge }` ends. The plugin maps the edges to a meaning.
open: none.
---

# Core owns the connect gesture, and a plugin owns its meaning

## Context

A user joins two bars with a pointer drag or a key sequence. `entryDependencies()` turns that act into a Dependency. A "related to" plugin turns the same act into a different record.

Three facts bound the design:

- `GestureCapability` has no connect key. `PluginContextParts` has no controller registration. A plugin cannot own a controller today.
- One capability resolution must gate both the port affordance and the gesture (I14).
- Core must not know dependency types. A Dataset with no scheduling plugin has none of them (ADR 0002).

## Decision

**Core owns the gesture. A plugin owns what it means.**

### What core owns

- A `Connect` controller in `interaction/`. It shares the pointer invariants of the other controllers: arm threshold, nothing written on pointer down, Escape cancels, pointer capture.
- A `'connect'` member of `GestureCapability`. One resolution gates the connector port and the gesture.
- Two events in `GanttEventMap`: `beforeConnect` and `connect`. `beforeConnect` joins the async-veto names, so a handler can hold the gesture in a pending state.

### How a keyboard user connects

Core has no keyboard connect. A keyboard user adds a Dependency in the Entry edit form. The consumer owns that form, and the form writes through the `entryDependencies()` host API. The pointer drag is a shortcut, not the only path.

### When the gesture exists

The controller exists only when a plugin registers a handler with `ctx.view.onConnect`. With no handler, no port draws and no event fires.

Amended 2026-11-02 by the owner: a drop on the target bar body connects to the nearer edge of that bar. A drop on a port picks that port's edge. A drop on the source bar or on no bar does nothing.

### What the payload says

The payload names two ends, `{ entryId, edge }`. It never names `FS`, `SS`, `FF` or `SF`. The plugin maps an edge pair to its own meaning and writes its own data.

```ts
ctx.view.onConnect(({ from, to }) => {
  dependencies.add({ id: newId(), fromId: from.entryId, toId: to.entryId, type: typeOf(from.edge, to.edge), lag: zeroLag });
});
```

## Rejected alternatives

- **The whole gesture in the plugin.** No controller seam exists for plugins. Capabilities are core (I14), so a plugin cannot gate its own port. Each plugin would copy the pointer invariants.
- **A payload that carries the dependency type.** Core would learn `FS`, `SS`, `FF` and `SF`. A "related to" plugin would then map to types it does not use.

## Consequences

- `interaction/` gains a `Connect` controller. `view/event-bus.ts` gains two names. `view/plugin-ports.ts` gains `view.onConnect`.
- `plans/02` §3 lists `beforeConnect` and `connect` in place of `beforeLinkCreate` and `linkCreate`.
- The keyboard path to a new Dependency is the Entry edit form, not a key sequence in the timeline.
- Connector selection and the remove event stay in the plugin. `beforeDependencyRemove` and `dependencyRemove` are plugin events, not core events. The Selection holds Entries only (ADR 0025).
