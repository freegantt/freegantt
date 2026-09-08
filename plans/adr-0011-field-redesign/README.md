# ADR 0011 — the consumer Field redesign

**Governing decision:** [`docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md`](../../docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md) — status `proposed`, still a draft.

This directory holds the work the ADR calls for. It is deliberately short: the ADR carries the reasoning, and steps land here only once they are decided.

## Fix before the redesign

One live defect in `main`, in code the redesign keeps. It is independent of the ADR, so it does not wait for the ADR to be accepted.

### A Field's own `column` keys lose to its `type` bundle's

`src/data/fields/field-registry.ts:60` (`mergeColumn`):

```ts
const sizing = own.width !== undefined || own.flex !== undefined ? own : from;
return { ...fromRest, ...ownRest, ...sizing };
```

When the Field states no `width` and no `flex`, `sizing` is the bundle's **whole** `column` object, not its sizing pair. Spread last, it overwrites every key the Field declared.

Probed at HEAD:

| bundle `column` | field `column` | resolves to |
|---|---|---|
| `{ header: 'Bundle', align: 'end', width: 100 }` | `{ header: 'Own' }` | `{ header: 'Bundle', align: 'end', width: 100 }` |
| `{ header: 'Bundle', align: 'end' }` | `{ header: 'Own' }` | `{ header: 'Bundle', align: 'end' }` |

The Field's own header is gone in both. The trigger is **the bundle declaring any non-sizing key the Field also declares** — not the bundle declaring a `width`. The second row proves that.

The function's own comment at `:47-49` states the opposite as its reason for existing:

> A Field naming only `column: { header }` [must not] drop the type's whole `column` bundle.

Latent today only because the one shipped `FieldType` carries no header of its own — `percent.column` is `{ align: 'end' }` (`field-types.ts:38`). Any consumer `fieldTypes` bundle that names a header reaches it.

**Fix:** spread the sizing **pair** only, never the whole object. `#249`'s rule stands as written — a Field that sizes itself at all replaces the type's sizing whole — and only the extraction of that pair is wrong.

**Test:** `field-registry.test.ts` has no case for a bundle carrying both a header and a width. Add one, plus the no-width row above.
