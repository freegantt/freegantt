---
status: proposed — a draft, not a decision. Split out of ADR 0011 on 2026-09-09.
decided: nothing yet. Four decisions are open — 9, 12, 13 and 16 — and two are closed, 7 and 14.
open: 9, 12, 13, 16. The working material is in `plans/field-redesign/0014-plugin-author-surface/`.
---

# The plugin-author surface

**This ADR blocks nothing on the storage rename**, and the storage rename does not wait on it. Two later answers still serialize with work that already shipped:

- **Decision 16 waits on [0011](0011-consumer-values-live-in-props.md) decision 22.** Both edit the extender seam. 22 brands `ProposedEdit` or diffs proposed keys; 16 changes the return. Close 22 first, or 16 designs against an unbranded `StoredEdit`.
- **Decision 13 waits on [0012](0012-dates-are-optional-on-every-kind.md).** 0012 changes `durationOf` to `Duration | undefined`. Do not merge or rename that door until the signature has landed.

The working material is [`plans/field-redesign/0014-plugin-author-surface/`](../../plans/field-redesign/0014-plugin-author-surface/README.md).

## Context

A plugin's Field values already sit in `Entry.meta` beside the consumer's — `field-registry.ts:148` states it in `authored`'s own comment, and `Entry.meta?: TMeta` (`model/entry.ts:39`) is consumer-typed, so the arrangement is undeclared rather than chosen.

[ADR 0011](0011-consumer-values-live-in-props.md) renames that bag to `props` and ships `Readonly<Partial<TProps>>` — **HEAD's exact posture under a new name**. It inherits the arrangement. This ADR decides it.

ADR 0005 deferred a separate consumer store on the grounds that *"a consumer declaring their own key in their own `meta` has nobody to collide with"*. **With plugins installed, they do.** The registry already refuses a duplicate *declaration*. It does not refuse a *value* the consumer wrote before the plugin existed.

## Open decisions

Four, weighed in the working folder. **9 and 12 are one decision** — answer them together or the answers cancel, because 9's case for sharing `props` rests on `entry.props.progress` reading as a typed dot access, and 12's plugin prefix takes the dot away. **13 waits on 9, and on [0012](0012-dates-are-optional-on-every-kind.md).** Whether the by-key doors merge or only share a name depends on whether a plugin's values need routing. `durationOf` becomes `Duration | undefined` in 0012 — do not rename or merge that door until the signature has landed. **16 waits on [0011](0011-consumer-values-live-in-props.md) decision 22.** Both edit the extender seam. **16 is held open at the author's request.**

| # | Question |
|---|---|
| **9** | Where does a plugin's own Field value live? |
| **12** | Do consumer and plugin Field keys need a namespace marker? |
| **13** | `read` and `fieldValue` are one job under two names — and there are four doors, not two |
| **16** | Two plugins write one field: what happens? |

## The price of deciding late

If 12 lands on a required plugin prefix, the Document written by ADR 0011 holds `props: { progress: 60 }` and this ADR rewrites it to `props: { 'scheduling:progress': 60 }`. That is **schema 8** and a rename of plugin-**declared** keys — not ADR 0011's 184-occurrence `StoredEdit` rename. Decision 3 prices a pre-release schema number at zero, and the library has never shipped. **That price is why this ADR is not a gate on the rename.**

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
