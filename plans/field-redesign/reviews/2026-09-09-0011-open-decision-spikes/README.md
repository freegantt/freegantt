# ADR 0011 spikes — open write-door decisions

**Next ADR in landing order.** [0011](../../0011-consumer-values-in-props/README.md) still has three open decisions. They are one family: what a consumer's write looks like. This review probes the recommendations before the build.

**Score.** A clean, friendly public API. An option that is smaller inside and larger outside lost.

Throwaway code lives on three branches. This file is the verdict. Open a branch when you need the tests. Do not close the decisions in the ADR files. A spike reports. The author rules.

| Branch | Question | Tests | Commit |
|---|---|---|---|
| [`spike/0011-undeclared-props-patch`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0011-undeclared-props-patch) | May an undeclared key travel in a `props` patch? | 34 passed | `ab616f3` |
| [`spike/0011-write-shorthand`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0011-write-shorthand) | Nest, or declared-key shorthand? | 34 passed | `ff88cdf` |
| [`spike/0011-proposed-edit-brand`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0011-proposed-edit-brand) | Brand `ProposedEdit`, or diff? | 24 passed | `53fdb12` |

Parent re-ran the three suites on 2026-09-09 after the agents landed: **92 passed** (34 + 34 + 24).

---

## Verdict in one page

**Decision 1's recommendation holds.** Records carry. Patches name. No cleaner option won on the call site.

**Decision 11 has no numbered rec.** Declared-key shorthand won the call site. Nest lost on a true sentence: `update('t1', { cost })` when `cost` is declared.

**Brand holds for decision 22.** The legal extra is the same object `update()` takes. Diff kept the false spread writable.

The build is not one-line. After the `meta` Field dies, today's `update()` loop throws `UnknownFieldError('props')` on every nested write. Exempt the namespace, and still walk **inside** `props` for declared keys. `"Skip a–c"` is not "do not look inside." Land per-key merge on `mergeEntryEdits` and `mergeStoredEdits` with the type. A wrapper-only brand is a subtype and does not refuse the spread.

---

## 1. Undeclared keys in a `props` patch

**Recommendation holds.** Branch `spike/0011-undeclared-props-patch`. Notes: `plans/field-redesign/0011-consumer-values-in-props/spikes/undeclared-props-patch/NOTES.md`.

| Option | Rules to learn | Call that names an undeclared key | Result |
|---|---|---|---|
| **Records carry, patches name (rec)** | 3 | `update({ props: { phase } })` throws; ingest keeps it | Winner. Message names `{ key: 'phase' }`, or write at ingest |
| Atomic bag (HEAD) | 3 | `update({ props: { cost: 7 } })` drops `owner` | Reads like a merge. Is a replace. The bug 0011 exists to close |
| Declared fields | 3 | ingest drops `phase` | `add({ props: { phase } })` reads false. Forces a Field for a renderer-only key |
| Namespaced setter | 4 | `setProp('t1', 'cost', 7)` | True English. Extra verb. No undo. FullCalendar can pay that. This store cannot |
| Merging patch (opposite) | 4 | undeclared `update` succeeds | Pays (a–c), rows with no `equals`, and a `fieldValue` that no longer means Field |

Nobody ships per-key merge over an undeclared space inside a transactional store. The claim held.

### Lesson for the build

The first `Object.keys(edit)` loop must treat `props` as the namespace, not as a Field. Keeping HEAD's loop blocks every consumer patch.

Walk inside `props` for **declared** keys even when decision 1 throws. Skip a–c only for undeclared names in the seed. Without the inner walk, a declared `cost` patch emits no row.

HEAD `UnknownFieldError` still says put the value in `meta`. Rewrite the message. Reuse would send the author into the bag this ADR deletes.

`update({ props: {} })` is a real call. Replace wipes. Merge names no keys and is a no-op.

Use `'cost' in patch`, not `!== undefined`. HEAD's date drop bites a props removal the same way.

`{ ...base, ...extra }` on two `props` bags drops one key. The commit path then emits `{ field: 'cost', from: 3, to: undefined }`. A wrong row is worse than a dropped write. Per-key merge inside `props` is not optional.

#267 stays open. The type says yes where the runtime says no. The error names the fix.

---

## 11. Nest vs declared-key shorthand

**Shorthand won the call site.** There is no numbered recommendation. Branch `spike/0011-write-shorthand`. Notes: `plans/field-redesign/0011-consumer-values-in-props/spikes/write-shorthand/NOTES.md`.

This spike assumed decision 1's recommendation. Open-flat is already rejected. `fields` is not live. Cross-instance does not pick a winner: nested `props: { cost }` throws on Dataset B too.

| Option | Rules to learn | Call a person reads | Result |
|---|---|---|---|
| **Declared-key shorthand** | 4 | `update('t1', { start, cost })` | Winner. Two Fields. Top level stays closed (`strat` still throws) |
| Nest | 3 | `update('t1', { start, props: { cost } })` | Names a container. `update({ cost })` is true and throws |
| HEAD control | 4 | flat merge beside whole-`meta` replace | Control, not a candidate. Replace is the destructive door |

### Lesson for the build

Nest cannot reuse `registry.has`. When `cost` is declared, HEAD's loop would accept `update({ cost })` on a nest-only door. Nest changes the predicate from *declared Field* to *envelope key*.

Shorthand still needs the inner `proposedKeys` seed and the per-Field `props` merge. The long form `{ props: { cost } }` hits the same `mergeEntryEdits` hole. A flat `{ cost }` beside `{ owner }` survives today's shallow spread. Do not treat shorthand as a merge fix.

HEAD `add({ cost })` does not write `cost` (#208). The control store proves it. If shorthand lands, `add({ cost })` must fold too, or add and update disagree.

What remains is a mixed top level. A person cannot see which keys are core from `{ start, cost }` alone. They already know the Gantt words. Storage stays nested. Every comparable write door in `evidence.md` keeps that mix.

If decision 1 lands the other way (undeclared keys writable), nest and shorthand collide. See `collision.md` on that branch. Do not take that branch unless 1's rec falls.

---

## 22. Brand `ProposedEdit`, or diff an extender's keys?

**Brand holds.** Branch `spike/0011-proposed-edit-brand`. Notes: `plans/field-redesign/0011-consumer-values-in-props/spikes/proposed-edit-brand/NOTES.md`.

The remainder is a spread that reads as *keep everything and add one*. The patch already merges. The spread is never needed.

| Option | Rules (app / plugin) | Spread of `proposed.props` | Result |
|---|---|---|---|
| **Brand** | 0 / 2 | Not an `EntryEdit` | Winner. Legal extra is `{ props: { risk: 'high' } }` |
| Diff against pre-state | 0 / 1 (behaviour) | Stays legal | Same-value write stops being a proposal. The lie stays writable |
| Comment-only | 0 / a comment | Compiles | Failing control. The comment does not hold |

### Lesson for the build

A wrapper-only brand is a subtype, so it still assigns to `EntryEdit`. The refuse lives on complete `props` plus `__brand?: never` on the patch, because the spread copies the brand. Unwrap: `completePropsOf(proposed).owner`. Unwrap-then-spread still stamps every key under presence. That is a speed bump, not a lock after unwrap.

`toEditReading` seeds `Object.keys(edit)` at the **top level**. After nested `props` that set is `['props']`. The inner-key spread is inert until the merging patch seeds from inside. Decision 22 and that inner seed are one enforcement.

Brand makes the one-key extra the legal write. That is the write `{ ...base, ...extra }` drops. Land those merges with the type. Brand is not a merge fix.

0014 decision 16 waits on the **ruling**, not on this spike's code. Design 16 against a branded `ProposedEdit` that is not the hook return.

---

## What the spikes did not re-open

- **0012.** Dates iff Segments. `durationOf` returns `Duration | undefined`. Skip dateless rows in `fitDataset`. Model `start` / `end` as already optional. The un-date verb is already true. Do not rebuild envelope reconciliation.
- **#267.** Declared-key inference from a `fields` literal. Out of scope. Decision 1's error message names the fix.
- **0014** decisions 9, 12, 13, 16. 16 waits on 22's ruling.
- **0015** write-door refusals.
- **0013** derivation / rolling-up parent `props` exception.
- A UI to date a dateless row (0012 known hole).
- Harness workarounds. No spike needed the harness.

**0012 leftover, docs only.** [`shared/refuted.md`](../../shared/refuted.md) item 10 said the shipped weighted mean poisons on NaN. Shipped `isFiniteNumber` already skips NaN. The loud HEAD failure is the `"NaN d"` cell. Guard `durationOf` anyway. Do not spend a branch on that.

---

## How to re-run

Root `vitest.workspace.ts` does not include `plans/`. Each spike owns a tiny workspace file. Use the local binary:

```
./node_modules/.bin/vitest run --config vitest.config.ts --workspace plans/field-redesign/0011-consumer-values-in-props/spikes/<name>/vitest.workspace.ts plans/field-redesign/0011-consumer-values-in-props/spikes/<name>
```

Names: `undeclared-props-patch`, `write-shorthand`, `proposed-edit-brand`.

Re-run on 2026-09-09 after the agents landed: **92 passed** (34 + 34 + 24).
