# Interface: ContextMenuOptions

Defined in: extensions/features/context-menu.ts:31

## Methods

### items()?

> `optional` **items**(`ctx`): readonly [`MenuEntry`](../type-aliases/MenuEntry.md)[]

Defined in: extensions/features/context-menu.ts:34

Returns the final entry list; `defaults` is `commands.available(ctx)` mapped to items, in
 registration order. Append, remove, reorder or replace — the returned array is what renders.

#### Parameters

##### ctx

###### defaults

readonly [`MenuEntry`](../type-aliases/MenuEntry.md)[]

###### entry?

[`Entry`](Entry.md)\<`Record`\<`string`, `unknown`\>\>

#### Returns

readonly [`MenuEntry`](../type-aliases/MenuEntry.md)[]
