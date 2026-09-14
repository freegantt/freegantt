# Type Alias: WriteRule

> **WriteRule** = `boolean` \| ((`entry`, `field`) => `boolean` \| `undefined`)

Defined in: model/interactions.ts:35

#256: the write rule takes the cell, because a write names one. Call:
 `interactions: { edit: (entry, field) => (entry.id === 'fixed' && field === 'end' ? false : undefined) }`.

 `undefined` means "no opinion about this cell". The rules in `view/capability.ts` then answer it,
 and a roll-up parent's derived cell stays refused. A predicate names one cell out of every
 (Entry × Field) pair on the page. So no opinion is the answer it gives most of the time.

 A bare `boolean` over that whole space made a consumer restate every library rule to lock one
 cell. The harness's own first call site opened every derived cell by accident.

 `undefined` reads the same way an `Aggregator`'s does (`model/field.ts`). A `before*` handler's
 reads that way too. A boolean pins every cell, with no fall-through.
