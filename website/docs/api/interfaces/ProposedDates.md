# Interface: ProposedDates

Defined in: view/event-bus.ts:83

ADR 0013, Q9: where one entry the gesture moves lands. Both dates are optional, because a
 descendant of a dragged parent bar may hold only one of them: a child with a `start` and no `end`
 shows in the grid, draws no bar, and still travels with its parent. The date it holds moves, and
 the date it lacks stays absent.

 `ProposedSpan` below is the stricter reading, and the bar the user grabbed always gets that one.

## Extended by

- [`ProposedSpan`](ProposedSpan.md)

## Properties

### end?

> `readonly` `optional` **end?**: [`Instant`](../type-aliases/Instant.md)

Defined in: view/event-bus.ts:86

***

### entry

> `readonly` **entry**: [`EntryId`](../type-aliases/EntryId.md)

Defined in: view/event-bus.ts:84

***

### start?

> `readonly` `optional` **start?**: [`Instant`](../type-aliases/Instant.md)

Defined in: view/event-bus.ts:85
