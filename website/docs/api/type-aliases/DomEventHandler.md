# Type Alias: DomEventHandler\<K\>

> **DomEventHandler**\<`K`\> = (`event`, `target`) => `void`

Defined in: view/plugin-ports.ts:62

What `ctx.view.onDomEvent` hands a plugin: the browser event, plus what the node it landed on
 stands for (review A4). `target` is `undefined` when the event landed inside this Gantt, but on
 none of the five things `targetUnder` names. A pane's own padding and an empty stretch of
 timeline are two such places. An event outside this Gantt never reaches the handler at all.

## Type Parameters

### K

`K` *extends* keyof `DocumentEventMap`

## Parameters

### event

`DocumentEventMap`\[`K`\]

### target

[`DomTarget`](../interfaces/DomTarget.md) \| `undefined`

## Returns

`void`
