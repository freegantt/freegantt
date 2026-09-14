# Type Alias: ExtenderWrapper

> **ExtenderWrapper** = (`next`) => [`EditExtender`](EditExtender.md)

Defined in: model/plugin.ts:32

How installing an extender composes (D-S5-23). `next` is the hook's current occupant — the identity
function when nothing has claimed it yet.

```ts
ctx.edits.setExtender(() => myExtender);                                  // replace
ctx.edits.setExtender((next) => (request) => mergeEntryEdits(next(request), mine(request)));  // tap in
```

`mergeEntryEdits` is exported from the package (#197). A spread merges the two maps wrongly: two
extenders that write the same Entry lose the earlier write.

`data/` still holds one field and calls it at one site (D-S2-6). Wrapping order is the order
`requires` resolves, never the `plugins` array's own order (D-S5-31).

## Parameters

### next

[`EditExtender`](EditExtender.md)

## Returns

[`EditExtender`](EditExtender.md)
