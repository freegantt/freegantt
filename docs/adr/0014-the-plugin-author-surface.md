---
status: proposed — a draft, not a decision. Split out of ADR 0011 on 2026-09-09.
decided: plugin Field values share `props`; plugin keys carry a required prefix (9 and 12, 2026-09-10). Two plugins' extras merge per key; a contested Field is dropped and warned (16, 2026-09-10). Two earlier numbers closed as downstream or out of scope — 7 and 14.
open: 13. The working material is in `plans/field-redesign/0014-plugin-author-surface/`.
---

# The plugin-author surface

**This ADR blocks nothing on the storage rename**, and the storage rename does not wait on it. One later answer still serializes with work that already shipped:

- **Decision 16 is closed.** [0011](0011-consumer-values-live-in-props.md) decision 22 branded `ProposedEdit`. The runtime owns composition, merging, and branding. Non-overlapping keys combine. A contested Field is dropped and warned — the same posture as [0013](0013-what-decides-that-a-row-derives-its-values.md) decision 5.
- **Decision 13 waits on [0012](0012-dates-are-optional-on-every-kind.md).** 0012 changes `durationOf` to `Duration | undefined`. Do not merge or rename that door until the signature has landed.

The working material is [`plans/field-redesign/0014-plugin-author-surface/`](../../plans/field-redesign/0014-plugin-author-surface/README.md).

## Context

A plugin's Field values already sit in `Entry.meta` beside the consumer's — `field-registry.ts:148` states it in `authored`'s own comment, and `Entry.meta?: TMeta` (`model/entry.ts:39`) is consumer-typed, so the arrangement is undeclared rather than chosen.

[ADR 0011](0011-consumer-values-live-in-props.md) renames that bag to `props` and ships `Readonly<Partial<TProps>>` — **HEAD's exact posture under a new name**. It inherits the arrangement. This ADR decides it.

ADR 0005 deferred a separate consumer store on the grounds that *"a consumer declaring their own key in their own `meta` has nobody to collide with"*. **With plugins installed, they do.** The registry already refuses a duplicate *declaration*. It does not refuse a *value* the consumer wrote before the plugin existed.

## Open decisions

One, weighed in the working folder. **9 and 12 closed together on 2026-09-10.** **16 closed on 2026-09-10.** **13 waits on [0012](0012-dates-are-optional-on-every-kind.md).** `durationOf` becomes `Duration | undefined` in 0012 — do not rename or merge that door until the signature has landed.

| # | Question |
|---|---|
| **13** | `read` and `fieldValue` are one job under two names — and there are four doors, not two |

## Closed here — 9, 12, and 16

Plugin Field values share `props`. Plugin keys carry a required prefix (`scheduling:progress`). Core and consumer keys stay bare. The write door is `PropsEdit<TProps & PluginEntryProps>` (flat at `update()`, decision 11). **A for one storage home, not for the typed dot.** This ADR writes **schema 8**.

**16.** The runtime owns composition, merging, and branding. The author returns extras or nothing. Non-overlapping keys on one Entry combine. The same Field on the same Entry is a collision: neither plugin's value is applied, one warning, same posture as [0013](0013-what-decides-that-a-row-derives-its-values.md) decision 5. Per Entry, not per Field globally.

## The price of deciding late

Decisions 9 and 12 closed on a required plugin prefix. The Document written by ADR 0011 holds `props: { progress: 60 }` and this ADR rewrites it to `props: { 'scheduling:progress': 60 }`. That is **schema 8** and a rename of plugin-**declared** keys — not ADR 0011's 184-occurrence `StoredEdit` rename. Decision 3 prices a pre-release schema number at zero, and the library has never shipped. **That price is why this ADR is not a gate on the rename.**

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
| [#214](https://github.com/Pawel-IT/FreeGantt/issues/214) | `FieldContext` cannot reach a second Entry, so a `compute` Field cannot depend on the tree. Decision 13's read doors inherit that limit |
