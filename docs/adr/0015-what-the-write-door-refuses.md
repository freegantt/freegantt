---
status: proposed — a draft, not a decision. Split out of ADR 0011 on 2026-09-09.
decided: `editable: false` refuses `entries.update()` — one rule at two doors, not two rules.
open: 18, 19, 23. The working material is in `plans/field-redesign/0015-write-door/`.
---

# What the write door refuses

**This ADR blocks nothing.** It changes the default posture of a public door, which is why it deserves its own decision rather than a bullet inside a storage rename. The working material is [`plans/field-redesign/0015-write-door/`](../../plans/field-redesign/0015-write-door/README.md).

## Context

`Field.editable` is read at exactly one place in `src/` — `view/capability.ts:120` — and nothing in `data/` consults it. So *"may this value change"* has one answer at the grid and another at `entries.update()`, which is the split I14 exists to close.

Beside it sits `#mergeCoreFieldOverride` (`field-registry.ts:211-225`), which lets `{ key: 'start', editable: false }` merge onto a core Field. It merges `editable` and **nothing else** — it never reads `source` — so [ADR 0011](0011-consumer-values-live-in-props.md) deletes `FieldSource` cleanly around it and leaves it standing for this ADR to rule on.

## Decision

**`editable: false` refuses `entries.update()` too, and that is the same rule.** Ruled 2026-09-09. The error is `FieldNotEditableError`.

**What an *absent* `editable` does is decision 18. What replaces the deleted override is decision 19. Whether a consumer declaration on a core key throws is decision 23.** None of the three follows from the ruling, and all three change the default posture of a public door.

### This ADR owns the resolver's editable arm, and only that arm

[ADR 0011](0011-consumer-values-live-in-props.md) moves the write resolver into `data/` with HEAD's policies unchanged. [ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) changes the derived arm. **This ADR changes the editable arm.** One function, three owners, one at a time.

## Open decisions

| # | Question | Note |
|---|---|---|
| **19** | What replaces `{ key: 'start', editable: false }` at the data door? | **Answer this first.** Probe `beforeChange` before designing anything |
| **23** | Does a consumer *declaration* on a core key throw? | Answered by 19 if 19 keeps the override |
| **18** | Does an *absent* `editable` also refuse `entries.update()`? | No recommendation. The choice is a posture, not a deduction |

**Decision 18's cost table may shrink before this lands.** It names three structural calls that would start throwing — `update(id, { parentId })`, `update(id, { segments })`, `update(id, { kind })`. [ADR 0013](0013-what-decides-that-a-row-derives-its-values.md)'s decision 26 can delete the third row: if `kind` becomes calculated, `update(id, { kind: 'milestone' })` stops existing. Land 0013 first and 18 is argued against a two-row table. **An ordering preference, not a block.**

## Consequences

- **`parentId` and `segments` keep their declarations.** Three mechanisms read them out of the registry: `entryAfterEdit` iterates `CORE_FIELDS` as an allow-list, `widenSegmentsToEnvelope` gates on `registry.get('segments')`, and `segmentsEqual` supplies the equality rule ([#212](https://github.com/Pawel-IT/FreeGantt/issues/212), ADR 0010). Undeclaring them is not an available option.
- **A `props` *value* naming a core key is a warning, and the core definition wins** — that half is [ADR 0011](0011-consumer-values-live-in-props.md)'s and is already closed. Decision 23 is the *declaration* half, and the two may not land the same way without a stated reason.
- **`ComputedFieldCannotBeWrittenError` fires at two doors under one name**, and the resolver checks `compute` before `editable`. See [`plans/field-redesign/shared/rulings.md`](../../plans/field-redesign/shared/rulings.md).

## Issues this ADR depends on

| Issue | What this ADR needs from it |
|---|---|
| [#256](https://github.com/Pawel-IT/FreeGantt/issues/256) | This ADR extends *"may this value change"* to `entries.update()` |
