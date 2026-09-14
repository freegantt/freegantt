# Interface: TooltipColumn

Defined in: model/field.ts:91

One resolved Grid column's tooltip line: `header`, the column's header text, paired with
 `value`, an entry's formatted value for that column (D-S5-13). A `model/` type — the same
 reason `ElementDescription` lives here — because both `api/plugin-context.ts`'s public
 `resolveTooltipColumns` and `view/gantt-shell.ts`'s implementation need it, and `view/` may not
 import `api/` (view-boundary, plans/01 §1). `api/plugin-context.ts` re-exports it as plugin vocabulary.

## Properties

### header

> **header**: `string`

Defined in: model/field.ts:92

***

### value

> **value**: `string`

Defined in: model/field.ts:93
