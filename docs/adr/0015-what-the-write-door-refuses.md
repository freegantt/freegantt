---
status: proposed — a draft, not a decision. Split out of ADR 0011 on 2026-09-09.
decided: `editable: false` refuses `entries.update()` — one rule at two doors, not two rules. Keep `{ key: 'start', editable: false }` and serialize it (19). Three declaration shapes (23). Both 2026-09-10.
open: 18, held. The working material is in `plans/field-redesign/0015-write-door/`.
---

# What the write door refuses

**This ADR blocks nothing.** It changes the default posture of a public door, which is why it deserves its own decision rather than a bullet inside a storage rename. The working material is [`plans/field-redesign/0015-write-door/`](../../plans/field-redesign/0015-write-door/README.md).

## Context

`Field.editable` is read at exactly one place in `src/` — `view/capability.ts:120` — and nothing in `data/` consults it. So *"may this value change"* has one answer at the grid and another at `entries.update()`, which is the split I14 exists to close.

Beside it sits `#mergeCoreFieldOverride` (`field-registry.ts:211-225`), which lets `{ key: 'start', editable: false }` merge onto a core Field. It merges `editable` and **nothing else** — it never reads `source` — so [ADR 0011](0011-consumer-values-live-in-props.md) deletes `FieldSource` cleanly around it and leaves it standing for this ADR to rule on.

## Decision

**`editable: false` refuses `entries.update()` too, and that is the same rule.** Ruled 2026-09-09. The error is `FieldNotEditableError`. This ADR declares it and throws it. [ADR 0011](0011-consumer-values-live-in-props.md) does not.

**What an *absent* `editable` does is decision 18, and it is held.** Keep `{ key: 'start', editable: false }` and serialize it — decision 19, closed 2026-09-10. Three declaration shapes — decision 23, closed with 19.

### This ADR owns the resolver's editable arm, and only that arm

[ADR 0011](0011-consumer-values-live-in-props.md) moves the write resolver into `data/` with HEAD's policies unchanged — `view/capability.ts` calls it; `entries.update()` still throws `UnknownFieldError` only, plus 0013's derived arm once that ADR has landed. [ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) filled the derived arm. **This ADR fills the editable arm and wires `entries.update()` to it.** One function, three owners, one at a time.

**Claim I14 when this ADR lands, not after 0013.** 0013 closes the derived half. This ADR closes the editable half. Between them `update()` refuses a derived write and still accepts `editable: false`. That is HEAD's editable split, plus a derived refusal. Do not claim I14 for a half.

## Open decisions

| # | Question | Note |
|---|---|---|
| **18** | Does an *absent* `editable` also refuse `entries.update()`? | **Held.** The author does not want a boolean that means three things, one of them absence |

## Closed here — 19 and 23

**19.** Keep `{ key: 'start', editable: false }`. Create, ingest, and replay still write. `update()` and the grid refuse change. Un-date is a change. The lock serializes. `beforeChange` does not replace this.

**23.** `{ key: 'start', editable: false }` constructs. `{ key: 'start' }` is a no-op. `{ key: 'start', column }` throws.

**Decision 18's cost table is two rows.** [ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) deleted `kind`. `update(id, { kind })` does not exist. Argue 18 against `parentId` and `segments` only.

## Consequences

- **`parentId` and `segments` keep their declarations.** Three mechanisms read them out of the registry: `entryAfterEdit` iterates `CORE_FIELDS` as an allow-list, `widenSegmentsToEnvelope` gates on `registry.get('segments')`, and `segmentsEqual` supplies the equality rule ([#212](https://github.com/Pawel-IT/FreeGantt/issues/212), ADR 0010). Undeclaring them is not an available option.
- **A `props` *value* naming a core key is a warning, and the core definition wins** — that half is [ADR 0011](0011-consumer-values-live-in-props.md)'s and is already closed. Decision 23 is the *declaration* half, closed 2026-09-10: the lock is legal; extra keys throw.
- **`ComputedFieldCannotBeWrittenError` fires at two doors under one name**, and the resolver checks `compute` before `editable`. See [`plans/field-redesign/shared/rulings.md`](../../plans/field-redesign/shared/rulings.md).

## Issues this ADR depends on

| Issue | What this ADR needs from it |
|---|---|
| [#256](https://github.com/Pawel-IT/FreeGantt/issues/256) | This ADR extends *"may this value change"* to `entries.update()` |
