# Interface: EntryGestureEvent

Defined in: view/event-bus.ts:110

S3.3/S3.4, D-S3-19/D-S3-22: the grabbed entry's own proposed span, plus every entry the gesture
 moves or resizes with it — a multi-selection gesture reports one event, not one per row. Extender
 extras are never in `entries` (S3.6): a handler sees only what the user actually grabbed. Shared
 by `EntryMove` and `EntryResize` — resize is not a subtype of move, both extend this instead
 (D-S3-22).

 `entries` is what the gesture **writes**, grabbed first. A parent bar is the one gesture where the
 grabbed entry is not in that list (ADR 0013): a parent's dates roll up from its children, so
 dragging it translates the dated descendants below it, and `entries` holds those descendants. The
 parent's own envelope follows from the Rollup, and this payload's own `start`/`end` say where it
 lands.

## Extends

- [`ProposedSpan`](ProposedSpan.md)

## Extended by

- [`EntryResize`](EntryResize.md)

## Properties

### end

> `readonly` **end**: [`Instant`](../type-aliases/Instant.md)

Defined in: view/event-bus.ts:96

#### Inherited from

[`ProposedSpan`](ProposedSpan.md).[`end`](ProposedSpan.md#end)

***

### entries

> `readonly` **entries**: readonly [`ProposedDates`](ProposedDates.md)[]

Defined in: view/event-bus.ts:111

***

### entry

> `readonly` **entry**: [`EntryId`](../type-aliases/EntryId.md)

Defined in: view/event-bus.ts:84

#### Inherited from

[`ProposedSpan`](ProposedSpan.md).[`entry`](ProposedSpan.md#entry)

***

### start

> `readonly` **start**: [`Instant`](../type-aliases/Instant.md)

Defined in: view/event-bus.ts:95

#### Inherited from

[`ProposedSpan`](ProposedSpan.md).[`start`](ProposedSpan.md#start)
