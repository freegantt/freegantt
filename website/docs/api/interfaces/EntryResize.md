# Interface: EntryResize

Defined in: view/event-bus.ts:118

S3.4, D-S3-22: which edge was dragged — a `beforeEntryResize` handler reads this alongside the
 proposed span to veto or clamp a specific edge placement.

## Extends

- [`EntryGestureEvent`](EntryGestureEvent.md)

## Properties

### edge

> `readonly` **edge**: `"start"` \| `"end"`

Defined in: view/event-bus.ts:119

***

### end

> `readonly` **end**: [`Instant`](../type-aliases/Instant.md)

Defined in: view/event-bus.ts:96

#### Inherited from

[`EntryGestureEvent`](EntryGestureEvent.md).[`end`](EntryGestureEvent.md#end)

***

### entries

> `readonly` **entries**: readonly [`ProposedDates`](ProposedDates.md)[]

Defined in: view/event-bus.ts:111

#### Inherited from

[`EntryGestureEvent`](EntryGestureEvent.md).[`entries`](EntryGestureEvent.md#entries)

***

### entry

> `readonly` **entry**: [`EntryId`](../type-aliases/EntryId.md)

Defined in: view/event-bus.ts:84

#### Inherited from

[`EntryGestureEvent`](EntryGestureEvent.md).[`entry`](EntryGestureEvent.md#entry)

***

### start

> `readonly` **start**: [`Instant`](../type-aliases/Instant.md)

Defined in: view/event-bus.ts:95

#### Inherited from

[`EntryGestureEvent`](EntryGestureEvent.md).[`start`](EntryGestureEvent.md#start)
