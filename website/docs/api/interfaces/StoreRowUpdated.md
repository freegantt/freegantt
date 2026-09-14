# Interface: StoreRowUpdated

Defined in: model/change-set.ts:41

One plugin-store row's net change (D-S5-24). A store row is whole-value data the plugin owns, not
 a Field, so it carries no `field` key — `store` is what tells the two rows apart. `undefined` on
 the `from` side means the entry had no row; on the `to` side it means this transaction removed it.

## Properties

### from

> **from**: `unknown`

Defined in: model/change-set.ts:44

***

### id

> **id**: [`EntryId`](../type-aliases/EntryId.md)

Defined in: model/change-set.ts:43

***

### store

> **store**: `` `plugin:${string}` ``

Defined in: model/change-set.ts:42

***

### to

> **to**: `unknown`

Defined in: model/change-set.ts:45
