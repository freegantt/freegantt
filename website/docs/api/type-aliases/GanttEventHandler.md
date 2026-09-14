# Type Alias: GanttEventHandler\<K\>

> **GanttEventHandler**\<`K`\> = (`payload`) => `void` \| `false` \| `K` *extends* [`AsyncCancelableEvent`](AsyncCancelableEvent.md) ? `Promise`\<`void` \| `false`\> : `never`

Defined in: view/event-bus.ts:173

The one handler shape `Gantt.on`/`Gantt.off` and `GanttShell.on`/`GanttShell.off` all share
 (D-S3-17) — declared once here rather than repeating the same conditional at each of those four
 call sites. `K extends AsyncCancelableEvent` is the only two names a handler may resolve async.

## Type Parameters

### K

`K` *extends* keyof [`GanttEventMap`](../interfaces/GanttEventMap.md)

## Parameters

### payload

[`GanttEventMap`](../interfaces/GanttEventMap.md)\[`K`\]

## Returns

`void` \| `false` \| `K` *extends* [`AsyncCancelableEvent`](AsyncCancelableEvent.md) ? `Promise`\<`void` \| `false`\> : `never`
