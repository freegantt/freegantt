# Type Alias: DecorationInput

> **DecorationInput** = \{ `class?`: `string`; `end`: [`Instant`](Instant.md); `kind`: `"rangeBand"`; `start`: [`Instant`](Instant.md); \} \| \{ `class?`: `string`; `kind`: `"rowStripe"`; `rowId`: [`RowId`](RowId.md); \}

Defined in: layout/decoration.ts:39

What a provider states — time, not pixels. `layout/decorations.ts` converts through the bound
 `TimeScale` (I12); a provider that computed pixels itself would break the moment the axis is
 shared (D9).
