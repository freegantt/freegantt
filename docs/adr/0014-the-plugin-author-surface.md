---
status: proposed — a draft, not a decision. Split out of ADR 0011 on 2026-09-09.
decided: plugin Field values share `props`; plugin keys carry a required prefix (9 and 12, 2026-09-10). App `add` / `update` name that prefixed key; the plugin exports the string as a const (Q12b, grill 2026-09-10). Two plugins' extras merge per key; a contested Field is dropped and warned (16, 2026-09-10). The by-key door is `read`; duration is a compute Field; a cell renderer reads `text` and `value` (13 and 13a, 2026-09-10). Two earlier numbers closed as downstream or out of scope — 7 and 14.
open: none. The working material is in `plans/field-redesign/0014-plugin-author-surface/`.
---

# The plugin-author surface

**This ADR blocks nothing on the storage rename**, and the storage rename does not wait on it.

- **Decision 16 is closed.** [0011](0011-consumer-values-live-in-props.md) decision 22 branded `ProposedEdit`. The runtime owns composition, merging, and branding. Non-overlapping keys combine. A contested Field is dropped and warned — the same posture as [0013](0013-what-decides-that-a-row-derives-its-values.md) decision 5.
- **Decision 13 is closed.** The by-key door is `read` on both surfaces. `FieldContext.durationOf` is deleted. Duration is a compute Field. The rename does not wait on [0012](0012-dates-are-optional-on-every-kind.md).
- **Q12b is closed.** App `add` / `update` name the prefixed key. The plugin exports that string as a const.

The working material is [`plans/field-redesign/0014-plugin-author-surface/`](../../plans/field-redesign/0014-plugin-author-surface/README.md).

## Context

A plugin's Field values already sit in `Entry.meta` beside the consumer's — `field-registry.ts:148` states it in `authored`'s own comment, and `Entry.meta?: TMeta` (`model/entry.ts:39`) is consumer-typed, so the arrangement is undeclared rather than chosen.

[ADR 0011](0011-consumer-values-live-in-props.md) renames that bag to `props` and ships `Readonly<Partial<TProps>>` — **HEAD's exact posture under a new name**. It inherits the arrangement. This ADR decides it.

ADR 0005 deferred a separate consumer store on the grounds that *"a consumer declaring their own key in their own `meta` has nobody to collide with"*. **With plugins installed, they do.** The registry already refuses a duplicate *declaration*. It does not refuse a *value* the consumer wrote before the plugin existed.

## Closed here — 9, 12, Q12b, 13, and 16

Plugin Field values share `props`. Plugin keys carry a required prefix (`scheduling:progress`). Core and consumer keys stay bare. The write door is `EntryEdit<TProps & PluginEntryProps>` (flat at `add()` and `update()`, decision 11 plus grill 2026-09-10).

**Q12b, closed 2026-09-10 (grill).** App `add` / `update` name the prefixed key. The plugin **exports that string as a const**. No bare alias. No plugin-only write API.

```ts
export const SCHEDULING_PROGRESS = 'scheduling:progress'
dataset.entries.update('t1', { [SCHEDULING_PROGRESS]: 60 })
```

This ADR writes **no schema number**. [ADR 0016](0016-the-library-holds-no-save-format.md) deleted the Document. The prefix keeps its reason: two writers still share one bag at runtime.

**13.** `dataset.entries.read(id, key)` and `ctx.read(entry, key)` are one job under one name. `entry.props.k` is storage. `fieldValue` is renamed to `read`. `durationOf` is deleted. Duration is the shipped compute Field; you read it through `read`. One unit — millisecond. [#274](https://github.com/Pawel-IT/FreeGantt/issues/274) closes with the door.

**13a, ruled 2026-09-10: `fieldValue` leaves the surface entirely.** A cell renderer's two readings become `text` (the string the library painted) and `value` (the Field value before formatting). The first ruling kept `fieldValue` as the payload name. It reads wrong beside a `read` door: `({ value, fieldValue })` never says which one is the string, and the word then names a door nobody can call. `formatValue(value, ctx)` already takes the Field value and returns the text, so the renderer context now speaks its producer's own vocabulary — value in, text out. The flip of `value` from string to Field value is a compile error, never a silent one: `text: unknown` does not satisfy `ElementDescription.text`.

**16.** The runtime owns composition, merging, and branding. The author returns extras or nothing. Non-overlapping keys on one Entry combine. The same Field on the same Entry is a collision: neither plugin's value is applied, one warning, same posture as [0013](0013-what-decides-that-a-row-derives-its-values.md) decision 5. Per Entry, not per Field globally.

## The price of deciding late

Decisions 9 and 12 closed on a required plugin prefix. HEAD holds plugin values as bare keys in `meta` / `props`. This ADR rewrites them to prefixed keys at runtime — a rename of plugin-**declared** keys, not ADR 0011's `StoredEdit` rename. **[ADR 0016](0016-the-library-holds-no-save-format.md) deleted the Document, so there is no schema 8 and no file rewrite.** The prefix still lands because two writers share one bag. **That is why this ADR is not a gate on the rename.**

## Consequences that hold whichever way it lands

- **An undeclared key is never written by the library, ever.** State this wherever `props` is documented. Without it, a plugin prefix looks like a complete mitigation, and it is not — a plugin is not the only second writer in the bag.
- **What sharing must gain, if it survives, is an error message that names the plugin.**
- **`PluginStores` keeps what it is good at** — plugin state that is not a per-Entry Field, such as dependencies, baselines and caches.

## Known hole

**[#192](https://github.com/Pawel-IT/FreeGantt/issues/192)'s hazard survives one level down**, and it is about declarations rather than storage. Install the S7 plugin on a Dataset whose `props` carries a legacy `progress`, and the plugin registers `progress` over values it did not write, with nothing recording who wrote them. `read.ts` already rules that an undeclared-provenance **row** is unrepairable and throws `PluginSetupError`. Values have no equivalent, and neither this ADR nor [0011](0011-consumer-values-live-in-props.md) gives them one.

## Issues this ADR depends on

| Issue | What this ADR needs from it |
|---|---|
| [#267](https://github.com/Pawel-IT/FreeGantt/issues/267) | A `compute` Field owns no `props` key, so it stays unreachable at paint. A Field-aware renderer read is still owed |
| [#214](https://github.com/Pawel-IT/FreeGantt/issues/214) | `FieldContext` cannot reach a second Entry, so a `compute` Field cannot depend on the tree. Decision 13's `read` doors inherit that limit |
| [#274](https://github.com/Pawel-IT/FreeGantt/issues/274) | **Closes here.** One duration Field, one unit. `durationOf` is deleted |
