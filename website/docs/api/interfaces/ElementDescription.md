# Interface: ElementDescription

Defined in: model/render.ts:11

Plain data, never a live node (`plans/02` §4) — a virtualized bar or a recycled popup content node
 must be able to rebuild from this every time. `text` is the only text channel and is set as
 `textContent`, never parsed as markup (I13); `html` is the explicit, separate opt-in for raw
 markup and is never combined with `text`. A child with no `key` is keyed by its index.

## Properties

### attrs?

> `optional` **attrs?**: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: model/render.ts:16

***

### children?

> `optional` **children?**: readonly `ElementDescription` & `object`[]

Defined in: model/render.ts:19

***

### class?

> `optional` **class?**: `Readonly`\<`Record`\<`string`, `boolean`\>\>

Defined in: model/render.ts:14

***

### html?

> `optional` **html?**: `string`

Defined in: model/render.ts:18

***

### style?

> `optional` **style?**: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: model/render.ts:15

***

### tag?

> `optional` **tag?**: `string`

Defined in: model/render.ts:13

Default `'div'`.

***

### text?

> `optional` **text?**: `string`

Defined in: model/render.ts:17
