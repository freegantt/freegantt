# Interface: ScrollState

Defined in: layout/viewport/scroll-model.ts:36

The resolved state — both halves of it, so there is one path to the resolution and one thing
to notify about.

## Properties

### max

> `readonly` **max**: [`Point`](Point.md)

Defined in: layout/viewport/scroll-model.ts:41

How far a `panTo` may ask: the loosest bound any bound Gantt needs (D-S1.5-1).
Not a claim about any one chart's scroller — each clamps its own.

***

### position

> `readonly` **position**: [`Point`](Point.md)

Defined in: layout/viewport/scroll-model.ts:38

Where the caller asked to be. May exceed `max` after a shrink — see D-S1.5-2.
