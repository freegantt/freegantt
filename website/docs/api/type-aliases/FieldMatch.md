# Type Alias: FieldMatch\<TProps\>

> **FieldMatch**\<`TProps`\> = `Partial`\<[`CoreFieldValues`](../interfaces/CoreFieldValues.md)\> & `{ [K in keyof TProps]?: TProps[K] }` & `object`

Defined in: layout/items/variants.ts:64

Every named Field equals the value beside it, and several keys are AND (`J6`).

 **A match is equality, never "has a value".** `{ 'demo:phaseId': true }` claims the rows whose
 `demo:phaseId` **is** `true` — not the rows that carry a phase id. Ask that with a predicate:
 `(entry) => entry.read('demo:phaseId') !== undefined`.

 **A key no Field declares matches no row.** The match reads through the Field registry, so a
 typo claims nothing rather than taking the layout pass down. A plugin that matches on its own
 key declares that key from its `data` half (`ctx.fields.register`).

 Each key reads through `entry.read(key)` and compares with that Field's own `equals`
 (`model/field.ts`), so `{ start: someInstant }` and `{ status: 'blocked' }` compare the way a
 Grid comparison does. With no `equals` declared, the comparison is `Object.is`.

## Type Parameters

### TProps

`TProps` = `Record`\<`string`, `unknown`\>
