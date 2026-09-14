# Type Alias: AsyncCancelableEvent

> **AsyncCancelableEvent** = `"beforeEntryMove"` \| `"beforeEntryResize"` \| `"beforeEntryEdit"`

Defined in: view/event-bus.ts:127

S3.5, D-S3-17: the only two event names whose handler may veto asynchronously, by returning a
 `Promise<void | false>` instead of resolving `false` synchronously — `EventBus<GanttEventMap,
 AsyncCancelableEvent>` is what actually grants that return shape at `on`/`off`/`emit`'s call sites
 (`data/event-bus.ts`'s `TAsyncKeys`). Every other event (grid width, selection) stays sync-only:
 `plans/02` §3's async-veto path is scoped to a data gesture's own before-event, not every veto.
