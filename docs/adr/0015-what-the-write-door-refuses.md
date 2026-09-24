---
status: amended by [0033](0033-an-api-field-takes-no-gesture.md) — the `capabilities.edit` ruling below (*The `capabilities.edit` ruling: narrow, never widen, against the data answer*) now covers `'api'` and a derived cell too, not only `'never'`. Verdict: `verify:full PASS — all 16 checks green, test:e2e included (71s).` (Build 5, 2026-09-11). The api report was reviewed and accepted in the same commit. Spike report: [reviews/2026-09-10-0015-write-door-spikes](../../plans/field-redesign/reviews/2026-09-10-0015-write-door-spikes/README.md). Split out of ADR 0011 on 2026-09-09.
decided: `editable: false` refuses `entries.update()` — one rule at every door, not one rule per door. Keep `{ key: 'start', editable: false }` (19). The serialize-as-`"never"` half has no Document after [ADR 0016](0016-the-library-holds-no-save-format.md); the lock itself stands. Three declaration shapes (23). `editable` is `'never' | 'api' | 'anywhere'`, default `'anywhere'` (18, grill 2026-09-10). After setup, only `editable` may change; no new Field keys. Live call is `dataset.setFieldEditable('start', 'never')` (Q16, grill 2026-09-10).
open: none. The working material is in `plans/field-redesign/0015-write-door/`.
---

# What the write door refuses

**This ADR blocks nothing.** It changes the default posture of a public door, which is why it deserves its own decision rather than a bullet inside a storage rename. The working material is [`plans/field-redesign/0015-write-door/`](../../plans/field-redesign/0015-write-door/README.md).

## Context

`Field.editable` is read at exactly one place in `src/` — `view/capability.ts:120` — and nothing in `data/` consults it. So *"may this value change"* has one answer at the grid and another at `entries.update()`, which is the split I14 exists to close.

Beside it sits `#mergeCoreFieldOverride` (`field-registry.ts:211-225`), which lets `{ key: 'start', editable: false }` merge onto a core Field. It merges `editable` and **nothing else** — it never reads `source` — so [ADR 0011](0011-consumer-values-live-in-props.md) deletes `FieldSource` cleanly around it and leaves it standing for this ADR to rule on.

## Decision

**`editable: false` refuses `entries.update()` too, and that is the same rule.** Ruled 2026-09-09. The error is `FieldNotEditableError`. This ADR declares it and throws it. [ADR 0011](0011-consumer-values-live-in-props.md) does not.

**Decision 18, closed 2026-09-10, default overruled 2026-09-10 (grill).** `editable` is `'never' | 'api' | 'anywhere'`. Default `'anywhere'`. `true` / `false` are input aliases for `'anywhere'` / `'never'`. The grid is writable iff `'anywhere'`. `update()` is writable iff not `'never'`. `'api'` remains an opt-out: grid dead, `update()` allowed. Keep `{ key: 'start', editable: false }` — decision 19. **Do not serialize it.** [ADR 0016](0016-the-library-holds-no-save-format.md) deleted the Document. The lock constructs, `fields.all` already reads the merge, and `update()` / the grid refuse the change. Three declaration shapes — decision 23.

**Grill 2026-09-10.** No new Field keys after construction. Hide/show columns stay live. After setup, only `editable` may change on a Field. Keep `CORE_FIELD_OVERRIDABLE_KEYS`. Fields are the schema, not a product hole.

**`CORE_FIELD_OVERRIDABLE_KEYS` grows by one key, `rollUp` ([#470](https://github.com/freegantt/freegantt/issues/470)).** A consumer may write `{ key: 'start', rollUp: 'none' }`, and the override runs the same `UnknownAggregatorError` check `#add` runs on a first declaration. The reason is uniformity: a core Field and a consumer Field take one merge path, one validation, one list. Dates are not a special case that skips it.

**Q16, closed 2026-09-10 (grill).** A verb writes one key (`plans/02` §2, #184 / #195), the same family as `gantt.hideGridColumn`. AG Grid's full `columnDefs` re-assign is survey, not the call ([`evidence.md`](../../plans/field-redesign/shared/evidence.md)).

```ts
dataset.setFieldEditable('start', 'never')
```

The verb copies the Field and replaces `FieldRegistry.all`'s identity (#187). It does not mutate the object `field()` returns. Extra keys are not a door. New Field keys stay refused. Per-row stays `interactions.edit`.

**No schema number.** [ADR 0016](0016-the-library-holds-no-save-format.md) deleted the Document. Do not encode `SerializedField`.

### This ADR owns the resolver's editable arm, and only that arm

[ADR 0011](0011-consumer-values-live-in-props.md) moves the write resolver into `data/` with HEAD's policies unchanged — `view/capability.ts` calls it; `entries.update()` still throws `UnknownFieldError` only, plus 0013's derived arm once that ADR has landed. [ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) filled the derived arm. **This ADR fills the editable arm and wires `entries.update()` to it.** One function, three owners, one at a time.

**Claim I14 when this ADR lands, not after 0013.** 0013 closes the derived half. This ADR closes the editable half. Gestures ask `canWrite` (grid threshold). `update()` asks the same key against the API threshold. `e2e/write-refusal.spec.ts` must call `entries.update()`.

### A third door: an `EditExtender`'s cascade ([#473](https://github.com/Pawel-IT/FreeGantt/issues/473))

**Decision, owner ruling 2026-09-22.** A cascade an `EditExtender` writes onto a `'never'` Field does not commit. `toEditsReading` (`data/entry-reader.ts`) asks `write-rule.ts`'s `assertFieldTakesWrite` before it writes — the same check `entries.update()` runs — and throws the same `FieldNotEditableError` for the whole changeset. A cascade onto an `'api'` Field is still admitted — only `'never'` was in question.

**Why.** The exceptions this ADR already names — construction, `entries.add()`, History replay — are all *setup* writes: they write a value where none exists yet. A cascade edits an existing value on a caller's behalf, so it is a caller-side write and meets the same lock a person at a keyboard meets. A lock a plugin can bypass is not a lock.

This closes the asymmetry the issue raised: after `dataset.setFieldEditable('cost', 'never')`, a consumer's own `update()` call refused, and a plugin's cascade did not. Both refuse now. The three doors — the grid (`view/capability.ts`), `entries.update()`, and an `EditExtender` cascade — all read the one key at `data/write-rule.ts` and must agree (I14).

### A per-entry lock rule, sharper than `Field.editable` ([#473](https://github.com/Pawel-IT/FreeGantt/issues/473))

**Decision.** `Field.editable` locks a Field for every Entry alike. A plugin that must open one locked Field on one Entry, or on a whole subtree — a phase manager reopening `cost` under one branch, say — needs an answer sharper than the Field. `model/field-lock.ts` declares the seam: `FieldLockQuery` (which Entry, and `isDescendantOf(ancestorId)` for the subtree question), `FieldLockRule` (a query and a Field key in, `FieldEditable | undefined` out — `undefined` is silence), and `FieldLockRuleWrapper`, installed through `ctx.edits.setLockRule` the same composing way `setExtender` and `setHierarchySource` install (D-S5-23). Core's own occupant, `identityFieldLockRule`, answers every cell with silence.

`data/write-rule.ts`'s `resolveFieldEditable(query, field, declared, lockRule)` is the one function that turns a rule's answer into the effective lock: the rule's own answer, or `Field.editable` when the rule has no opinion. `assertFieldTakesWrite` — the shared check `entries.update()` and an `EditExtender` cascade both run (#473's ocr finding folded two copies into one) — calls it after the existence and `compute` checks. This is not a second lock beside `Field.editable`; it is that rule's other input, so a plugin's per-entry unlock and the Field's own default answer through the one door every write already used (I14).

`Dataset.editableOf(id, field)` and `EditRequest.editableOf(id, field)` publish the same answer: a consumer asks what the grid asks, and an `EditExtender` asks what its own cascade will meet, before it writes.

### The `capabilities.edit` ruling: narrow, never widen, against the data answer

**Decision.** `view/capability.ts`'s `canWrite` reads the per-entry lock (`CapabilityInputs.editableOf`) **before** `capabilities.edit` or a variant's own `edit` default. A `'never'` cell refuses outright, with no consumer or variant override — `capabilities.edit: true` narrows what the data layer already allows; it does not widen it. Only when the data layer has not refused does `canWrite` fall through the existing consumer → variant → library ladder, unchanged.

**Why.** The alternative — let `capabilities.edit: true` open a cell the data layer refuses — opened the editor and then threw on commit, because `entries.update()` reads the same lock and has the last word regardless. A capability that opens a door the write door slams shut is not a capability; it is a bug wearing one. Narrowing against the data answer keeps `capabilities.edit` truthful: if it says a cell opens, a write there commits.

This ruling touches only the editable-lock (`'never'`) case. The derived/rollup trade-off — a consumer's `capabilities.edit` opening a bar-move gesture on a rolling-up cell so the move writes descendants instead of the cell itself ([#470](https://github.com/Pawel-IT/FreeGantt/issues/470)) — is untouched; that seam answers a different question (*where does this write land*, not *does this cell accept one*) and stays out of scope here.

## Closed here — 18, 19, 23, and Q16

**18.** One key, three named states. Absent is `'anywhere'` (grill 2026-09-10; was `'api'`). Copying the view rule lost. A three-way boolean lost. Do not special-case “has `column`”.

**19.** Keep `{ key: 'start', editable: false }`. Create, ingest, `load` (#496) and replay still write. `update()` and the grid refuse change. Un-date is a change. **Do not serialize the lock.** `fields.all` already reads the merge. `beforeChange` does not replace this.

**`entries.load()` ignores a `'never'` lock, and a derived parent cell re-rolls, the same as construction (#496, Q3).** `load` is a full fresh start, not a caller-side write — it sits beside Create and ingest above, not beside `update()`'s cascade rule. It runs no `EditExtender` cascade either, because construction runs none (step 1 of #496 pinned this as fact, not assumption).

**23.** `{ key: 'start', editable: false }` constructs. `{ key: 'start' }` is a no-op. `{ key: 'start', column }` throws.

**Q16.** `dataset.setFieldEditable('start', 'never')`. One Field, one value. Copy the Field; replace `FieldRegistry.all`'s identity (#187). Do not mutate `field()` in place.

[ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) deleted `kind`. `update(id, { kind })` does not exist.

## Consequences

- **`parentId` and `segments` keep their declarations.** They ship `editable: 'api'`, so a column object may show them and the cell stays dead. `update()` stays legal. Three mechanisms read them out of the registry: `entryAfterEdit` iterates `CORE_FIELDS` as an allow-list, `widenSegmentsToEnvelope` gates on `registry.get('segments')`, and `segmentsEqual` supplies the equality rule ([#212](https://github.com/Pawel-IT/FreeGantt/issues/212), ADR 0010). Undeclaring them is not an available option.
- **A `props` *value* naming a core key is a warning, and the core definition wins** — that half is [ADR 0011](0011-consumer-values-live-in-props.md)'s and is already closed. Decision 23 is the *declaration* half, closed 2026-09-10: the lock is legal; extra keys throw.
- **`ComputedFieldCannotBeWrittenError` fires at two doors under one name**, and the resolver checks `compute` before `editable`. See [`plans/field-redesign/shared/rulings.md`](../../plans/field-redesign/shared/rulings.md).

## Issues this ADR depends on

| Issue | What this ADR needs from it |
|---|---|
| [#256](https://github.com/Pawel-IT/FreeGantt/issues/256) | This ADR extends *"may this value change"* to `entries.update()` |
