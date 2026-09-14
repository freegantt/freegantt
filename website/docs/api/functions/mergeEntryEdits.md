# Function: mergeEntryEdits()

> **mergeEntryEdits**(`base`, `extra`): [`EntryEdits`](../type-aliases/EntryEdits.md)

Defined in: data/edit-extension.ts:47

Merges two sets of extra writes, keyed by Entry — the composition an `ExtenderWrapper` needs
(D-S5-23).

```ts
ctx.edits.setExtender((next) => (request) => mergeEntryEdits(next(request), mine(request)));
```

Object spread and `new Map([...a, ...b])` are not legal merges: two extenders that write the same
Entry lose the earlier edit outright (#197). `extra` wins per Field key, and every other key of
both edits survives, at any composition depth (#238).

It lives beside the hook, not beside the Field code: a loose edit states the Fields it writes by
the keys it holds, so merging two of them needs no Field knowledge at all. Core derives the
proposed keys later, once, when it reads the composed result (`toEditsReading`).

## Parameters

### base

[`EntryEdits`](../type-aliases/EntryEdits.md)

### extra

[`EntryEdits`](../type-aliases/EntryEdits.md)

## Returns

[`EntryEdits`](../type-aliases/EntryEdits.md)
