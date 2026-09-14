# Function: diamond()

> **diamond**(`overrides?`): [`EntryVariant`](../interfaces/EntryVariant.md)

Defined in: layout/items/variants.ts:347

`diamond()` — core's marker, for a row with no duration. Its default `when` reads `start`/`end`
 directly rather than `entry.duration()`: this runs on the hover path (I5, `VariantPredicate`'s
 own "keep it cheap"), and `entry.duration()` allocates a fresh `{ value, unit }` on every call
 (`measureEntryDuration`) — one object per row per resolve for what is otherwise a plain equality
 check. The trade: this spelling answers by structure, never a stored word (ADR 0013's "core does
 not ship a diamond" is narrowed by this factory, not spent), but it ignores
 `measureDuration: 'segments'` — a row with `start === end` and Segments that net to zero total
 time still claims here. An author whose rows need the Segments-aware zero passes their own
 `when: (entry) => entry.duration()?.value === 0`.

 **Not in `CORE_VARIANTS`.** No row wears `diamond()` until an author installs it — this
 factory's own default rule, or a consumer's own `{ items: fixedWidthItem(...) }`.

 **What you can do to it: no resize.** A resize commits a real duration, and this factory's own
 `when` stops matching the moment `start !== end` — the row would turn into a bar under the
 pointer that dragged it. `diamond({ can: { resize: true } })` opts back in for an author who
 wants that.

## Parameters

### overrides?

`Partial`\<[`EntryVariant`](../interfaces/EntryVariant.md)\> = `{}`

## Returns

[`EntryVariant`](../interfaces/EntryVariant.md)
