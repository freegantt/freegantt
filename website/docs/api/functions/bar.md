# Function: bar()

> **bar**(`overrides?`): [`EntryVariant`](../interfaces/EntryVariant.md)

Defined in: layout/items/variants.ts:303

`bar()` — core's plain look, and the shipped floor every unclaimed row wears. Carries
 `followSegments` — the same producer a variant with no `items` key gets from the registry.
 `bar()`'s own shape and the default shape always agree (ADR 0023).

 Carries no `css`. Its look **is** `.fg-bar`, the element class every look wears — diamonds
 included — so that stays structure, in the always-shipped base sheet, not one look's own rule.

 Every key on `overrides` wins, `name` included: `bar({ name: 'phase', when: myRule })` keeps
 `followSegments` and answers for the rows `myRule` claims instead of every row nothing else
 claimed.

 **`bar` and `summary` keep their plain names (F13).** `import { bar } from 'freegantt'` reads as
 a generic word at a package's top level, and a `*Variant` suffix would read further from a call
 site: `variants: [bar(), summary(), diamond()]` reads as one family, and `barVariant()` names the
 pipeline that builds the answer, not the job an author is doing (`CLAUDE.md`'s call-site-first
 rule). The collision risk is accepted for that reason, not overlooked.

## Parameters

### overrides?

`Partial`\<[`EntryVariant`](../interfaces/EntryVariant.md)\> = `{}`

## Returns

[`EntryVariant`](../interfaces/EntryVariant.md)
