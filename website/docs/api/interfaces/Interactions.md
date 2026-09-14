# Interface: Interactions

Defined in: model/interactions.ts:46

Live (S3/S5, D-S3-9). `linkCreate` stays off this type until S7 (I11: no unimplemented public
 key).

 **Two levels read one type** (ADR 0018). `GanttOptions.interactions` is the consumer's own
 answer; `EntryVariant.can` is the variant's, one level under it.

## Properties

### edit?

> `optional` **edit?**: [`WriteRule`](../type-aliases/WriteRule.md)

Defined in: model/interactions.ts:56

#256, S5.8, D-S5-19: the consumer's own answer to "may this cell's value change". It is the
 one override above `Field.editable`, and the only per-entry axis that key has.

 It gates the inline cell editor, the bar's resize handles and the bar move alike. All three
 write a cell (I14). `Field.editable` states which Fields are writable at all. This states which
 of them are writable *here*. Answer `undefined` for a cell this rule says nothing about.

***

### move?

> `optional` **move?**: [`CapabilityRule`](../type-aliases/CapabilityRule.md)

Defined in: model/interactions.ts:47

***

### resize?

> `optional` **resize?**: [`CapabilityRule`](../type-aliases/CapabilityRule.md)

Defined in: model/interactions.ts:48

***

### select?

> `optional` **select?**: [`CapabilityRule`](../type-aliases/CapabilityRule.md)

Defined in: model/interactions.ts:49
