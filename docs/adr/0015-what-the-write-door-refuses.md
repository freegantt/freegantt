---
status: proposed — a draft, not a decision. Split out of ADR 0011 on 2026-09-09.
decided: `editable: false` refuses `entries.update()` — one rule at two doors, not two rules. Keep `{ key: 'start', editable: false }` and serialize it (19). Three declaration shapes (23). `editable` is `'never' | 'api' | 'anywhere'`, default `'anywhere'` (18, grill 2026-09-10). After setup, only `editable` may change; no new Field keys. Live call is `dataset.fields.override({ key, editable })` (Q16, grill 2026-09-10, from AG Grid).
open: none. The working material is in `plans/field-redesign/0015-write-door/`.
---

# What the write door refuses

**This ADR blocks nothing.** It changes the default posture of a public door, which is why it deserves its own decision rather than a bullet inside a storage rename. The working material is [`plans/field-redesign/0015-write-door/`](../../plans/field-redesign/0015-write-door/README.md).

## Context

`Field.editable` is read at exactly one place in `src/` — `view/capability.ts:120` — and nothing in `data/` consults it. So *"may this value change"* has one answer at the grid and another at `entries.update()`, which is the split I14 exists to close.

Beside it sits `#mergeCoreFieldOverride` (`field-registry.ts:211-225`), which lets `{ key: 'start', editable: false }` merge onto a core Field. It merges `editable` and **nothing else** — it never reads `source` — so [ADR 0011](0011-consumer-values-live-in-props.md) deletes `FieldSource` cleanly around it and leaves it standing for this ADR to rule on.

## Decision

**`editable: false` refuses `entries.update()` too, and that is the same rule.** Ruled 2026-09-09. The error is `FieldNotEditableError`. This ADR declares it and throws it. [ADR 0011](0011-consumer-values-live-in-props.md) does not.

**Decision 18, closed 2026-09-10, default overruled 2026-09-10 (grill).** `editable` is `'never' | 'api' | 'anywhere'`. Default `'anywhere'`. `true` / `false` are input aliases for `'anywhere'` / `'never'`. The grid is writable iff `'anywhere'`. `update()` is writable iff not `'never'`. `'api'` remains an opt-out: grid dead, `update()` allowed. Keep `{ key: 'start', editable: false }` and serialize it as `"never"` — decision 19. Three declaration shapes — decision 23.

**Grill 2026-09-10.** No new Field keys after construction. Hide/show columns stay live. After setup, only `editable` may change on a Field. Keep `CORE_FIELD_OVERRIDABLE_KEYS`. Fields are the schema, not a product hole.

**Q16, closed 2026-09-10 (grill), from AG Grid.** AG Grid has no `setColumnEditable`. `editable` lives on the column definition; after init you change that property and assign the list again. Evidence: [`plans/field-redesign/shared/evidence.md`](../../plans/field-redesign/shared/evidence.md). The call here is the same object as construction:

```ts
dataset.fields.override({ key: 'start', editable: false })
```

Not `setFieldEditable`. Not a second `dataset.editable` map. Extra keys throw (decision 23). The call does not add Field keys. Per-row stays `interactions.edit`.

This ADR writes **schema 9**.

### This ADR owns the resolver's editable arm, and only that arm

[ADR 0011](0011-consumer-values-live-in-props.md) moves the write resolver into `data/` with HEAD's policies unchanged — `view/capability.ts` calls it; `entries.update()` still throws `UnknownFieldError` only, plus 0013's derived arm once that ADR has landed. [ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) filled the derived arm. **This ADR fills the editable arm and wires `entries.update()` to it.** One function, three owners, one at a time.

**Claim I14 when this ADR lands, not after 0013.** 0013 closes the derived half. This ADR closes the editable half. Gestures ask `canWrite` (grid threshold). `update()` asks the same key against the API threshold. `e2e/write-refusal.spec.ts` must call `entries.update()`.

## Closed here — 18, 19, 23, and Q16

**18.** One key, three named states. Absent is `'anywhere'` (grill 2026-09-10; was `'api'`). Copying the view rule lost. A three-way boolean lost. Do not special-case “has `column`”.

**19.** Keep `{ key: 'start', editable: false }`. Create, ingest, and replay still write. `update()` and the grid refuse change. Un-date is a change. The lock serializes as `"never"`. `beforeChange` does not replace this.

**23.** `{ key: 'start', editable: false }` constructs. `{ key: 'start' }` is a no-op. `{ key: 'start', column }` throws.

**Q16.** `dataset.fields.override({ key: 'start', editable: false })`. Same object as construction. Copy the Field; replace `FieldRegistry.all`'s identity (#187). Extra keys throw. Does not add keys.

[ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) deleted `kind`. `update(id, { kind })` does not exist.

## Consequences

- **`parentId` and `segments` keep their declarations.** They have no column, so `'anywhere'` does not put them in the grid. `update()` stays legal. Three mechanisms read them out of the registry: `entryAfterEdit` iterates `CORE_FIELDS` as an allow-list, `widenSegmentsToEnvelope` gates on `registry.get('segments')`, and `segmentsEqual` supplies the equality rule ([#212](https://github.com/Pawel-IT/FreeGantt/issues/212), ADR 0010). Undeclaring them is not an available option.
- **A `props` *value* naming a core key is a warning, and the core definition wins** — that half is [ADR 0011](0011-consumer-values-live-in-props.md)'s and is already closed. Decision 23 is the *declaration* half, closed 2026-09-10: the lock is legal; extra keys throw.
- **`ComputedFieldCannotBeWrittenError` fires at two doors under one name**, and the resolver checks `compute` before `editable`. See [`plans/field-redesign/shared/rulings.md`](../../plans/field-redesign/shared/rulings.md).

## Issues this ADR depends on

| Issue | What this ADR needs from it |
|---|---|
| [#256](https://github.com/Pawel-IT/FreeGantt/issues/256) | This ADR extends *"may this value change"* to `entries.update()` |
