# ADR 0014 — the plugin-author surface

**The decision:** [`docs/adr/0014-…`](../../../docs/adr/0014-the-plugin-author-surface.md)

Where a plugin's own Field values live, whether a Field key carries a namespace marker, what the read doors are called, and what an extender returns.

## Where it stands

**No decision is open.** Six numbered decisions are closed — 7, 9, 12, **13**, 14, and **16**. Q12b closed 2026-09-10 (grill).

**Nothing blocks the storage rename on this ADR, and it blocks nothing there.** That is the point of splitting it out. It was the heaviest gate on the old [ADR 0011](../0011-consumer-values-in-props/README.md), and it was never a real one.

Decision 16 closed against the branded `ProposedEdit` (0011 decision 22). Decision 13 does **not** wait on [0012](../0012-optional-dates/README.md): `durationOf` is deleted, not widened.

## Why it does not gate the storage rename

[0011](../0011-consumer-values-in-props/README.md) ships HEAD's posture under a new name, and **this ADR widens it additively** to `Readonly<Partial<TProps & PluginEntryProps>>`, with plugin keys prefixed. Additive, so the rename does not wait ([the pairwise check](../README.md#where-the-decisions-could-walk-over-each-other-and-why-they-do-not)).

**Deciding late costs no file rewrite.** HEAD holds plugin values as bare keys. This ADR prefixes plugin-**declared** keys at runtime — not 0011's 267-occurrence `StoredEdit` rename (BUILD-SPEC V3). [ADR 0016](../../../docs/adr/0016-the-library-holds-no-save-format.md) deleted the Document, so there is no schema 8. The prefix still lands because two writers share one bag.

## 9 and 12 closed together

Answered together because the answers would cancel if taken apart. The closed ruling is below.

**13 closed after 9, as required.** They share `props` under a prefix, so routing is by key, not by bag. The by-key door is `read` on both surfaces.

## One file, three ADRs, no decision collision on the merge

`data/edit-extension.ts` is touched by [0011](../0011-consumer-values-in-props/README.md) (the shallow-spread fix at `:35`, and decision 22's brand on the edit type) and by decision 16 here (the extender's signature and who owns composition). The spread fix and the signature are **different symbols** — expect a merge conflict, not a contradiction. **Both 22 and 16 are closed.** The return is a branded extra, or nothing.

---

# Open decisions

**None.** Q12b closed 2026-09-10 (grill) and is below with 9 and 12.

---

# Closed decisions

## 13 — the by-key door is `read`; duration is a compute Field

**Closed 2026-09-10. Ruled by the author.** Was: *`read` and `fieldValue` are one job under two names — and there are four doors, not two.*

**The ruling.** One resolver, one name: `read`. `dataset.entries.read(id, key)` is the app-author door. `ctx.read(entry, key)` is the plugin door. `entry.props.k` is storage, not a resolver. Rename `fieldValue` → `read`. **Delete `FieldContext.durationOf`.** Duration is the shipped compute Field it already was (`core-fields.ts:115-123`). You read it through `read`.

```ts
entry.props.owner
dataset.entries.read('t1', 'owner')
dataset.entries.read('t1', 'duration')   // Duration | undefined after 0012
ctx.read(entry, 'duration')
```

**Why `read`, not `getValue`.** The plugin surface already says `ctx.read`. Aligning the app-author door to that name is one rename, not two. `entries.get(id)` stays "get the Entry". `entries.read(id, key)` stays "read a Field". Two verbs, two jobs. The call `dataset.entries.read('t1', 'owner')` reads as English.

**Duration is not a fourth door.** `model/field.ts:19` already declares `duration: Duration` on `CoreFieldValues`, so both by-key doors type it. `durationOf` was the compute arm published as a convenience beside the Field it implements. It also answered in **two units**: `field-access.ts:92` in milliseconds, `inline-editing.ts:113` in whole days ([#274](https://github.com/Pawel-IT/FreeGantt/issues/274)). One compute arm, one unit — millisecond. The arm computes from `start` / `end` through `time/` (I10) and returns `undefined` when either date is absent ([0012](../0012-optional-dates/README.md) guards that calculation). It must **not** call `ctx.read(entry, 'duration')`. Aggregators read `ctx.read(entry, 'duration')`.

**`fieldValue` leaves the surface too — 13a, ruled 2026-09-10.** The first ruling kept it as the renderer payload. The author overruled that the same day: a word that names no door is a word with one orphaned meaning, and `({ value, fieldValue })` never says which one is the string. The pair becomes `text` and `value`.

```ts
gridColumns: [
  { field: 'cost', cellRenderer: ({ text, value }) => ({
      tag: 'span',
      class: { 'over-budget': (value as number) > 10_000 },
      text,                                    // the string the library painted
    }) },
]
```

`formatValue(value, ctx)` already takes the Field value and returns the text (`core-fields.ts`), so the context now speaks its producer's vocabulary: **value in, text out.** `value` is what `entries.read` answers, on one word. The flip of `value` from string to Field value cannot pass silently — `text: unknown` does not satisfy `ElementDescription.text`, so every stale renderer is a compile error.

Both context types carry the pair and both change: `ColumnCellRendererContext` (`model/field.ts:56-64`) and the Gantt-wide `CellRendererContext` (`layout/renderer.ts:45-56`). `#fieldValueForCell` (`view/gantt-shell.ts:1551`) becomes `#cellValueFor`.

**[#274](https://github.com/Pawel-IT/FreeGantt/issues/274) closes with the door.** One Field cannot supply two units. The inline editor's whole-day approximation dies with `durationOf`.

**The `src/` rename does not wait on 0012.** This ADR deletes `durationOf`; it does not widen it. If 0012 lands first, keep `durationOf` as a thin wrapper around the guarded helper until this ADR removes it.

**What lost.** `fieldValue` as the app-author name. `durationOf` on `FieldContext`. Binding `FieldContext` to one row (decision 14) stays an issue, not a rename.

---

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

**Decision 7 is confirmed:** a consumer's `progress` and a plugin's `scheduling:progress` are different keys.

**Decision 16, closed the same day, names what happens when two plugins write one Field.**

## Q12b — app code writes the prefixed key

**Closed 2026-09-10 (grill).** Was: *how does app code write a plugin Field?* Options were (a) prefix at every `add` / `update` door, plugin exports a const; (b) a bare name until the app declares that key; (c) not through `add` / `update`.

**The ruling is (a).** `add()` and `update()` name the prefixed key. The plugin **exports that string as a const**. No bare alias. No plugin-only write API. Per-key merge stays: writing one key does not replace the bag.

```ts
export const SCHEDULING_PROGRESS = 'scheduling:progress'
dataset.entries.update('t1', { [SCHEDULING_PROGRESS]: 60 })
dataset.entries.add({ id: 't2', name: 'Cutover', [SCHEDULING_PROGRESS]: 0 })
```

**What lost.** A bare `progress` until the app declares it — two names for one Field, and a collision with a consumer `progress`. A second write door beside `add` / `update` — two callers, two surfaces already split app from plugin; the app author already has the write.

## 7 — what an S7 plugin does with a `progress` value it did not write

**Closed 2026-09-09 as not independent.** Its entire body was *"Downstream of 9."*

A required plugin prefix on the Field key makes a consumer's `progress` and a plugin's `progress` different keys, which closes this at no cost. A shared bare key space leaves it open, and the answer is then an install-time duplicate-declaration error rather than a silent overwrite. **Both answers were decided by 9 and 12.** Listing it separately inflated the count of what was open.

## 14 — should `FieldContext` bind to the row?

**Closed 2026-09-09 as out of scope.** Was: *`compute(entry, ctx)` hands the row to a context that takes it back — `ctx.read(entry, 'cost')`.*

Its own recommendation was *"measure before deciding"*, which is work, not a ruling. Nothing in groups A–D gates on it, and the current unbound shape has a recorded reason: the context is built once per `resolveColumns` and reused for every cell, which is why `formatValue` gained a third `entry` parameter instead (#240).

**It is an issue, not a blocking decision.** Decision 13 closed the names and deleted `durationOf`. Binding the context to one row is still a later measure. The current unbound shape has a recorded reason: the context is built once per `resolveColumns` and reused for every cell (#240).

---

# The work

## The build — `read`, and duration is a compute Field

- Rename `entries.fieldValue` → `entries.read`. Same signature, same `FieldValue<TProps, K>` return. `UnknownFieldError` still names the door.
- Delete `FieldContext.durationOf`. Two stubs drop that key (`field-types.test.ts`, `layout/rows/filter.test.ts`). Rewrite `field-access.test.ts:75` — it is a test **name**, not a stub. Leave `layout/rows/sort.test.ts` alone: its `durationOf` is a local helper (**V6**).
- The `duration` core Field's compute arm calls the guarded helper in `field-access.ts` (0012's guard, millisecond unit). It does not call `ctx.read(entry, 'duration')`.
- `weightedMeanByDuration` (`aggregators.ts:14`) reads `ctx.read(entry, 'duration')`. Skip a child whose duration is `undefined`.
- `inline-editing.ts:108-117`'s `fieldContextFor` stops supplying `durationOf`. Its `read` already forwards to `entries.read`. The whole-day approximation goes with the method. That is [#274](https://github.com/Pawel-IT/FreeGantt/issues/274).
- `etc/freegantt.api.md` drops `durationOf` and `fieldValue`. I11 gates the report.
- Rename the renderer payload: `fieldValue` → `value`, and the old `value` → `text`, on both `ColumnCellRendererContext` and `CellRendererContext`. Do the `value` → `text` rename **first**, or the two names collide mid-rename.
- After the rename, `grep -rn '\bfieldValue\b' src/ harness/ e2e/ etc/` returns **0**. That is 13's gate.
- App `add` / `update` of a plugin Field uses the prefixed key. The plugin exports that string as a const (Q12b). No bare alias.


