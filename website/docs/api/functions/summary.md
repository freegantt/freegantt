# Function: summary()

> **summary**(`overrides?`): [`EntryVariant`](../interfaces/EntryVariant.md)

Defined in: layout/items/variants.ts:319

`summary()` — core's rail for a row with children. Claims on structure
 (`entry.hasChildren`), never on a stored word (ADR 0013's own rule, narrowed by ADR 0022, not
 spent): a consumer who wants the rail on a different rule passes their own `when`.

 **States its own `items` explicitly.** A parent may author several Segments of its own
 (`src/data/rollup.ts` refused to reject one at ingest). The data-following default is not
 automatically safe here. `ignoreSegments` is the shape a summary needs whatever its Segments
 do — one rail. It says so, rather than trusting the registry's default to agree (ADR 0023).

## Parameters

### overrides?

`Partial`\<[`EntryVariant`](../interfaces/EntryVariant.md)\> = `{}`

## Returns

[`EntryVariant`](../interfaces/EntryVariant.md)
