# Type Alias: GridColumnSizing

> **GridColumnSizing** = \{ `flex?`: `never`; `width?`: `number`; \} \| \{ `flex?`: `number`; `width?`: `never`; \}

Defined in: model/field.ts:77

A Grid column states a width or a flex, never both (#249): a column that names one answers "how
 wide" on its own, and a column naming neither is fixed-width by default (`view/grid-columns.ts`'s
 `DEFAULT_COLUMN_WIDTH_PX`). `exactOptionalPropertyTypes` is on, so `flex: undefined` alongside a
 named `width` is still rejected — only *omitting* the other key satisfies `?: never`.
