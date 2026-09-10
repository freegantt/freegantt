# ADR 0014 — the plugin-author surface

**The decision:** [`docs/adr/0014-…`](../../../docs/adr/0014-the-plugin-author-surface.md)

Where a plugin's own Field values live, whether a Field key carries a namespace marker, what the read doors are called, and what an extender returns.

## Where it stands

**One decision is open — 13.** Five are closed — 7, 9, 12, 14, and **16**. 16 closed on 2026-09-10. 13 still waits on [0012](../0012-optional-dates/README.md).

**Nothing blocks the storage rename on this ADR, and it blocks nothing there.** That is the point of splitting it out. It was the heaviest gate on the old [ADR 0011](../0011-consumer-values-in-props/README.md), and it was never a real one.

**One answer still serializes with work that already shipped.** Decision 13 waits on [0012](../0012-optional-dates/README.md) — `durationOf` becomes `Duration | undefined` there. Close 0012 first. Decision 16 closed against the branded `ProposedEdit` (0011 decision 22).

## Why it does not gate the storage rename

`Entry.meta?: TMeta` is consumer-typed today (`model/entry.ts:39`), and a plugin's Field values already sit in that bag beside the consumer's — `field-registry.ts:148` says so in `authored`'s own comment. So [0011](../0011-consumer-values-in-props/README.md) ships `props: Readonly<Partial<TProps>>`, which is **HEAD's exact posture under a new name**. It inherits the arrangement; it does not choose it.

This ADR then **widens** the type to `Readonly<Partial<TProps & PluginEntryProps>>` — additive, plugin keys prefixed. Decisions 9 and 12 closed that way. The rename does not wait on it.

**The price of deciding late is now a number this ADR spends.** Decisions 9 and 12 closed on a required plugin prefix. The Document written by 0011 holds `props: { progress: 60 }` and this ADR rewrites it to `props: { 'scheduling:progress': 60 }`. That is **schema 8** and a rename of plugin-**declared** keys — not the 184-occurrence `StoredEdit` rename. Decision 3 prices a pre-release schema number at zero, and the library has never shipped.

## 9 and 12 closed together

Answered together because the answers would cancel if taken apart. The closed ruling is below.

**Settle 13 after 9, and after [0012](../0012-optional-dates/README.md)** — whether the by-key doors merge or only share a name depends on whether a plugin's values need routing, and `durationOf`'s return type lands in 0012. 9 is closed: they share `props` under a prefix, so routing is by key, not by bag.

## One file, three ADRs, no decision collision on the merge

`data/edit-extension.ts` is touched by [0011](../0011-consumer-values-in-props/README.md) (the shallow-spread fix at `:35`, and decision 22's brand on the edit type) and by decision 16 here (the extender's signature and who owns composition). The spread fix and the signature are **different symbols** — expect a merge conflict, not a contradiction. **Both 22 and 16 are closed.** The return is a branded extra, or nothing.

---

# Open decisions

**One — 13.** 16 closed on 2026-09-10 and is below.

## 13. `read` and `fieldValue` are one job under two names

`FieldContext.read(entry, key)` and `entries.fieldValue(id, key)` answer the same question on two surfaces. `plans/02` requires one name per concept; two names for one job is the failure #7 records. Every comparable library uses a verb here — `getValue`, `getCellValue`, `getDataValue`, `record.get`. `fieldValue` is a noun, so the call reads as a property access spelled as a call.

**There are four doors, not two.** `entry.props.k` is the stored bag. `entries.fieldValue(id, k)` resolves any Field key. `ctx.read(entry, k)` answers the same question on the plugin surface. `ctx.durationOf(entry)` answers it for one Field, by name. Widen this decision to all four before renaming anything.

**Two corrections, both checked against the code.** `durationOf` does **not** exist because `duration` owns no `Entry` key — `model/field.ts:19` declares `duration: Duration` on `CoreFieldValues` by hand, so both by-key doors are fully typed. What `durationOf` actually is, is the **implementation** of the `duration` core Field, published as a convenience beside the door it implements. One of the four doors is built out of another. Second, it answers in **two different units** depending on which builder made the context, which is [#274](https://github.com/Pawel-IT/FreeGantt/issues/274). **Settle 13 against that issue**, not against the assumption that `durationOf` earns its place.

**Recommendation: align the names across all four.** Decisions 9 and 12 closed: plugin values share `props` under a prefix, so routing is by key, not by bag. **Land [0012](../0012-optional-dates/README.md) first** — `durationOf` becomes `Duration | undefined` there. Renaming a published door is not a decision to take in passing.

---

# Closed decisions

## 16 — two plugins write one Field: non-overlapping keys merge; a contested key is dropped and warned

**Closed 2026-09-10. Ruled by the author.** Was: *two plugins write one field: what happens?* Held for the merge to be named. The author accepted that naming.

**The ruling.** The runtime owns composition, merging, and branding. The author returns extra writes, or nothing.

```ts
extendEdits(request) {
  const moved = request.proposed.get('t1');          // plain string, no branding
  if (!moved) return;                                // nothing means nothing
  return new Map([['phase-1', { start: moved.start, risk: 'high' }]]);
}
```

Returned extras are flat after decision 11: `{ start, risk: 'high' }`, not `{ props: { risk: 'high' } }`. The extra is not a `ProposedEdit` — decision 22 brands that type so a spread of `proposed` is a type error.

**Keep the `Map`.** An object keyed by Entry id is the wrong container — [`refuted.md`](../shared/refuted.md) item 9. An array of `[id, edit]` pairs is the other safe shape.

**What merge means.** Non-overlapping Field keys on one Entry combine. Plugin A writes `owner: 'Sam'` on `t1`. Plugin B writes `risk: 'high'` on `t1`. Both writes survive. That is the merge. It is per-key, the same as `mergeEntryEdits`.

**The same Field on the same Entry is a collision, not a merge of values.** Plugin A writes `cost: 10`. Plugin B writes `cost: 15`. There is no result `12.5`. Last-win is what this decision exists to stop. If the two writes name the same value, that is one write, not a collision.

**Per Entry, not per Field globally.** Two plugins that write `owner` on *different* entries are not a collision. Do not key a writers map by Field name alone. The combined spike did; do not copy that.

**Severity follows [0013](../0013-what-decides-derivation/README.md) decision 5.** A plugin write the library refuses is dropped, and the library raises one warning at `severity: 'warning'`. Do not throw. Two plugins a consumer installed, both correct on their own, must not kill the app. Install order must not pick a winner.

On a contested Field: neither plugin's value is applied. Keep the user's proposed value if the user wrote that Field; otherwise keep the stored value. The warning names both plugins and the Field.

**What lost.** The spike's `PluginWriteCollisionError`. A throw here and a warning on decision 5 would be two postures for one surface.

**What the author no longer writes.** `new Map()` to say nothing. `entryId('t1')` by hand. `ctx.edits.wrap` to compose and merge. **#197 exists because hand-rolled composition already lost edits once.** A returned value keeps the purity story a mutable collector would blur.

## 9 and 12 — share `props`; plugin keys carry a prefix

**Closed 2026-09-10. Ruled by the author.** Answered together because the answers would cancel if taken apart.

**The ruling.** Plugin Field values share `props` — one storage home, so the grid, undo, and `update()` all write one place. They are not shared so that `entry.props.progress` is a typed dot. Plugin keys carry a required prefix naming the plugin (`scheduling:progress`). Core keys stay bare and become a published reserved list. Consumer keys stay bare. The write door is `PropsEdit<TProps & PluginEntryProps>` (and, after decision 11, the same keys flat at `update()`). `PluginStores` stays for plugin state that is not a per-Entry Field — dependencies, baselines, caches.

**The honest sentence.** A for one storage home, not for the typed dot. A prefixed key is not an identifier:

```ts
gantt.gridColumns = ['name', 'scheduling:progress'];
dataset.entries.update('t1', { 'scheduling:progress': 60 });
entry.props['scheduling:progress'];
```

That is the price of prevention. Detection at construction (registry + the registration lock) was weighed and lost: a prefix makes a consumer `progress` and a plugin `progress` impossible to collide, rather than a boot-time throw the consumer cannot avoid.

**May a consumer hold a key that shadows a core key?** No, at the *declaration*. The reserved list is the guarantee. A `props` *value* naming a core key stays a warning (0011).

**This ADR writes schema 8** — a rename of plugin-declared keys. Decision 3 prices a pre-release number at zero. 0011 still writes **6**.

**Decision 7 is confirmed:** a consumer's `progress` and a plugin's `scheduling:progress` are different keys.

**Decision 16, closed the same day, names what happens when two plugins write one Field.**

## 7 — what an S7 plugin does with a `progress` value it did not write

**Closed 2026-09-09 as not independent.** Its entire body was *"Downstream of 9."*

A required plugin prefix on the Field key makes a consumer's `progress` and a plugin's `progress` different keys, which closes this at no cost. A shared bare key space leaves it open, and the answer is then an install-time duplicate-declaration error rather than a silent overwrite. **Both answers were decided by 9 and 12.** Listing it separately inflated the count of what was open.

## 14 — should `FieldContext` bind to the row?

**Closed 2026-09-09 as out of scope.** Was: *`compute(entry, ctx)` hands the row to a context that takes it back — `ctx.read(entry, 'cost')`.*

Its own recommendation was *"measure before deciding"*, which is work, not a ruling. Nothing in groups A–D gates on it, and the current unbound shape has a recorded reason: the context is built once per `resolveColumns` and reused for every cell, which is why `formatValue` gained a third `entry` parameter instead (#240).

**It is an issue, not a blocking decision.** The question survives, folded into decision 13, which now covers all four read doors. Measure there.

