# Interface: GanttEvents

Defined in: view/event-bus.ts:182

S5.1, D-S5-1: `PluginContext.events` is this pair, so a plugin author's autocomplete reads the
 same as a consumer's own `gantt.on(...)` (one name, one concept — CLAUDE.md) rather than a second,
 differently-shaped events surface. `GanttShell`'s own `on`/`off` below already satisfy this shape;
 a plugin gets a plain object built from them, not the shell itself (no back-door to its other
 public methods).

## Methods

### off()

> **off**\<`K`\>(`name`, `handler`): `void`

Defined in: view/event-bus.ts:184

#### Type Parameters

##### K

`K` *extends* keyof [`GanttEventMap`](GanttEventMap.md)

#### Parameters

##### name

`K`

##### handler

[`GanttEventHandler`](../type-aliases/GanttEventHandler.md)\<`K`\>

#### Returns

`void`

***

### on()

> **on**\<`K`\>(`name`, `handler`): `void`

Defined in: view/event-bus.ts:183

#### Type Parameters

##### K

`K` *extends* keyof [`GanttEventMap`](GanttEventMap.md)

#### Parameters

##### name

`K`

##### handler

[`GanttEventHandler`](../type-aliases/GanttEventHandler.md)\<`K`\>

#### Returns

`void`
