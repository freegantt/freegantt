# Interface: ResolvedVariant

Defined in: layout/items/variants.ts:36

*Not generic over `TProps` (F18).** `Gantt<TProps>.variants` keeps the consumer's prop typing on
 `when`, but `paint`'s type, `BarRenderer`, takes a plain `Entry` regardless of `TProps` — the same
 gap `GanttOptionsBase.barRenderer` and `EntryVariant.paint` already carry, not one this type
 introduces. A `ResolvedVariant<TProps>` would add a type parameter nothing inside actually reads,
 which is a lie generic (CLAUDE.md). Typing `paint`/`can` over `TProps` needs `BarRenderer` and
 `Interactions` to become generic first — a wider surface change, owed separately.

## Extends

- `DrawnVariant`

## Properties

### can

> `readonly` **can**: [`Interactions`](Interactions.md) \| `undefined`

Defined in: layout/items/variants.ts:40

What you can do to it, or `undefined` for no opinion at this level.

***

### css

> `readonly` **css**: `string` \| `undefined`

Defined in: layout/items/variants.ts:44

The rules this look needs, as CSS text, or `undefined` for none (ADR 0022 §5). The same string
 the variant's own `css` carried at registration — copied here so every seam answers `items` /
 `paint` / `can` / `css` off this one object, and never looks the name up a second time (`F1`).

***

### items

> `readonly` **items**: [`ItemProducer`](../type-aliases/ItemProducer.md)

Defined in: layout/items/item.ts:71

What it draws — its own `items`, or `followSegments` bound at registration (ADR 0023).

#### Inherited from

`DrawnVariant.items`

***

### name

> `readonly` **name**: `string`

Defined in: layout/items/item.ts:69

The `data-variant` a consumer styles, and the word a command's `when` reads.

#### Inherited from

`DrawnVariant.name`

***

### paint

> `readonly` **paint**: [`BarRenderer`](../type-aliases/BarRenderer.md) \| `undefined`

Defined in: layout/items/variants.ts:38

How it looks, or `undefined` for the library's own bar.
