# Interface: ProposedSpan

Defined in: view/event-bus.ts:94

S3.3, D-S3-22: what one entry's drag proposes for an entry that spans. Public — a
 `beforeEntryMove` handler reads `start`/`end` to veto or clamp a specific placement (U5).

 Both dates are required here. A bar is what the user grabs, and an entry draws a bar only when it
 spans (ADR 0012), so the grabbed entry holds both (Q9's ruling).

## Extends

- [`ProposedDates`](ProposedDates.md)

## Extended by

- [`EntryGestureEvent`](EntryGestureEvent.md)

## Properties

### end

> `readonly` **end**: [`Instant`](../type-aliases/Instant.md)

Defined in: view/event-bus.ts:96

#### Overrides

[`ProposedDates`](ProposedDates.md).[`end`](ProposedDates.md#end)

***

### entry

> `readonly` **entry**: [`EntryId`](../type-aliases/EntryId.md)

Defined in: view/event-bus.ts:84

#### Inherited from

[`ProposedDates`](ProposedDates.md).[`entry`](ProposedDates.md#entry)

***

### start

> `readonly` **start**: [`Instant`](../type-aliases/Instant.md)

Defined in: view/event-bus.ts:95

#### Overrides

[`ProposedDates`](ProposedDates.md).[`start`](ProposedDates.md#start)
