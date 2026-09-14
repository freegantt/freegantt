# Interface: EntryVariant\<TProps\>

Defined in: layout/items/variants.ts:82

One variant, as one object. A consumer installs it through `GanttOptions.variants`; a plugin
 installs the same shape through `ctx.variants.add(variant)`. One type, two doors.

 ```ts
 variants: [{ name: 'milestone', when: { milestone: true }, paint: milestoneBar, can: { resize: false } }]
 ```

 Nothing here is stored on the Entry. A variant is a function of the row, resolved per Gantt, so
 two Gantts on one Dataset may paint the same row differently (I2).

## Type Parameters

### TProps

`TProps` = `Record`\<`string`, `unknown`\>

## Properties

### can?

> `optional` **can?**: [`Interactions`](Interactions.md)

Defined in: layout/items/variants.ts:99

What you can do to it. One level under the consumer's own `interactions`, one level over the
 library rule. Answer `undefined` from a predicate for "no opinion" (`J13`).

***

### css?

> `optional` **css?**: `string`

Defined in: layout/items/variants.ts:110

The rules this look needs, as CSS text — verbatim, no scoping done for you. A variant owns
 `items`, `paint` and `can` already; this is the fifth answer, the rules behind the class
 `paint` names (ADR 0022 §5, Q6). `view/` wraps every installed variant's `css` once in
 `@layer freegantt` and writes it after the base sheet, so a variant's own rule cancels
 `.fg-bar`'s background and state ring at equal specificity, and an unlayered consumer rule
 still beats it (ADR 0021).

 Not `rules` — `when` is already the rule (ADR 0018's title). Not `styles` — that is
 `ElementDescription.style`'s own word, and `view/styles.ts`'s. Not `stylesheet` — a variant
 carries one fragment, and the library holds one sheet.

***

### items?

> `optional` **items?**: [`ItemProducer`](../type-aliases/ItemProducer.md)

Defined in: layout/items/variants.ts:93

What shape it draws. Default: one Item per Segment, or one over the whole span when the Entry
 has none (`followSegments`, ADR 0023).

***

### name

> **name**: `string`

Defined in: layout/items/variants.ts:85

This variant's identity — the `data-variant` a consumer styles, and the registry key. It names
 a DOM identity, never a stored value.

***

### paint?

> `optional` **paint?**: [`BarRenderer`](../type-aliases/BarRenderer.md)

Defined in: layout/items/variants.ts:96

How it looks. A paint that names no content of its own — `class`, `style` or `attrs` alone —
 decorates the library's own bar and keeps its label (`J34`).

***

### when?

> `optional` **when?**: [`VariantRule`](../type-aliases/VariantRule.md)\<`TProps`\>

Defined in: layout/items/variants.ts:90

Which rows wear it. Omit it to write a last resort, which answers for every row **no rule
 claims** — core's own `leaf` is the shipped one, and omitting `when` is how a plugin re-skins
 it. A last resort never outranks a rule that states a claim, core's own `summary` included, so
 a variant that means "every row, whatever else claims it" says `when: () => true`.
