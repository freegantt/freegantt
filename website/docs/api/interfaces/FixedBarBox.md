# Interface: FixedBarBox

Defined in: layout/items/item.ts:20

A painted box the time scale does not size (ADR 0022) — `Item.box`'s own shape, named so
 `layout/frame.ts` and a producer both read one type instead of repeating the object literal
 (F12). `widthPx` is the box's width in content pixels. Frozen and shared across every Item one
 producer call builds (`fixedWidthItem`, F16): nothing in `layout/` or `render/` ever writes
 through an Item's `box` after production, so one immutable instance per producer costs nothing
 and the `readonly` members hold a consumer to that same contract at the type level.

## Properties

### anchor

> `readonly` **anchor**: [`BarAnchor`](../type-aliases/BarAnchor.md)

Defined in: layout/items/item.ts:22

***

### widthPx

> `readonly` **widthPx**: `number`

Defined in: layout/items/item.ts:21
