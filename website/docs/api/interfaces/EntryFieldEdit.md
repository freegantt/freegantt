# Interface: EntryFieldEdit

Defined in: view/event-bus.ts:62

S5.8, D-S5-19: what `beforeEntryEdit`/`entryEdit` carry — named `EntryFieldEdit`, not `EntryEdit`
 (`EntryEdit` is already the write shape `update()` takes, `plans/02` §1 "one write shape", one
 name one concept). `beforeEntryEdit` fires **before the editor opens**, not before the write, so
 no candidate value exists yet at that point — `from` and `to` are both the entry's current stored
 value for that field. `entryEdit` fires after the commit, with `to` the value actually written.

## Properties

### entry

> `readonly` **entry**: [`Entry`](Entry.md)

Defined in: view/event-bus.ts:63

***

### field

> `readonly` **field**: [`FieldKey`](../type-aliases/FieldKey.md)

Defined in: view/event-bus.ts:64

***

### from

> `readonly` **from**: `unknown`

Defined in: view/event-bus.ts:65

***

### to

> `readonly` **to**: `unknown`

Defined in: view/event-bus.ts:66
