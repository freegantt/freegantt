# ADR 0011 spikes — open write-door decisions

**Ruled since this page was written.** Decisions **1**, **11** and **22** all closed on 2026-09-10. Read [0011's closed decisions](../../0011-consumer-values-in-props/README.md#closed-decisions) for what the author ruled. This page is the evidence, never the answer.

**Next ADR in landing order.** [0011](../../0011-consumer-values-in-props/README.md) still has three open decisions. They are one family: what a consumer's write looks like. This review probes the recommendations before the build.

**Score.** A clean, friendly public API. An option that is smaller inside and larger outside lost.

Throwaway code lives on three branches. This file is the verdict. Open a branch when you need the tests. Do not close the decisions in the ADR files. A spike reports. The author rules.

**Status — the evidence is not accepted.** The author runs one combined spike of 0011 and 0012 before any decision moves. A second review on 2026-09-10 re-ran the six suites and opened every file this report cites. Every HEAD quote held. Three things this page withheld are now in the sections they belong to, and the [Review, 2026-09-10](#review-2026-09-10) section lists them together. Read that section before you cite anything here.

| Branch | Question | Tests | Commit |
|---|---|---|---|
| [`spike/0011-undeclared-props-patch`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0011-undeclared-props-patch) | May an undeclared key travel in a `props` patch? | 34 passed | `ab616f3` |
| [`spike/0011-write-shorthand`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0011-write-shorthand) | Nest, or declared-key shorthand? | 34 passed | `ff88cdf` |
| [`spike/0011-proposed-edit-brand`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0011-proposed-edit-brand) | Brand `ProposedEdit`, or diff? | 24 passed | `53fdb12` |

Parent re-ran the three suites on 2026-09-09 after the agents landed: **92 passed** (34 + 34 + 24).

---

## Verdict in one page

**Decision 1's recommendation holds.** Records carry. Patches name. No cleaner option won on the call site.

**Decision 11 has no numbered rec.** Declared-key shorthand won the call site.

Read the sentence nest loses on. A consumer declares `cost`, then writes `update('t1', { cost })`. That sentence is true English, and nest must refuse it. To refuse it, nest asks a new question — *is this key the envelope or the namespace?* — where shorthand asks the question the store already asks: *is this key declared?* §11 carries the predicate.

**Shorthand ships one new throw, and this page first left it out.** Two spellings reach one Field, so naming `cost` at the top **and** inside `props` throws. §11 carries it. The refusal belongs to [0015](../../0015-write-door/README.md), which still holds decisions 18, 19 and 23.

**Brand holds for decision 22.** The legal extra is the same object `update()` takes. Diff kept the false spread writable. The review re-proved the type twice — see §22.

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

**Nobody ships per-key merge over an undeclared space inside a transactional store.** The handoff asked for that claim word for word, and the spike kept it word for word.

**The spike did not test it, and it cannot.** Five toy stores say nothing about what another product ships. The claim is carried from [`evidence.md`](../../shared/evidence.md), unchanged and unchecked by this wave. Every other row in the table above **is** a probe result. Weigh this one as a survey, because it is the load-bearing argument against the merging patch.

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
| Nest | 3 | `update('t1', { start, props: { cost } })` | Names a container. Refusing flat `{ cost }` costs a new predicate |
| HEAD control | 4 | flat merge beside whole-`meta` replace | Control, not a candidate. Replace is the destructive door |

**The winner carries the higher count, and this page first did not say why.** The score counts rules a consumer learns, so a reader sees 4 beat 3 and no reason. The fourth rule is the throw below. Shorthand pays one rule to keep `plans/02`'s *common case is a shorthand*, and to keep one predicate in the store. Rule it on that trade, or rule it on the count. **Both readings are open. This spike did not settle which one wins.**

### The throw shorthand adds

Two spellings reach one Field. `update('t1', { cost: 7, props: { cost: 8 } })` names `cost` twice, and the store cannot rank them, so it throws (`shorthand.ts:82-84`, `"cost" is named at the top and inside props`).

**That is a new write-door refusal.** [0015](../../0015-write-door/README.md) owns what the write door refuses, and decisions 18, 19 and 23 are open there. Shorthand hands 0015 a fourth refusal to name, to type and to message.

The spike's `NOTES.md` names a follow-up: **drop the long form at `update()`**. One spelling then reaches `update()`, the throw disappears, and `props` stays on `add`, on the Document, and on `ProposedEdit`. That cut removes the fourth rule. It also splits the write door from the record door, which decision 1 spent its whole table keeping together. **Weigh it in the combined spike. Do not fold it in here.**

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
| **Brand** | 0 / 2, plus one visible member | Not an `EntryEdit` | Winner. Legal extra is `{ props: { risk: 'high' } }` |
| Diff against pre-state | 0 / 1 (behaviour) | Stays legal | Same-value write stops being a proposal. The lie stays writable |
| Comment-only | 0 / a comment | Compiles | Failing control. The comment does not hold |

### The brand is verified, and it costs one visible member

The review re-proved the type two ways on 2026-09-10.

- **The refusal is load-bearing.** Delete `__brand?: never` from the patch and `tsc` reports `TS2578: Unused '@ts-expect-error' directive` on both refusal tests. The type does the work. The tests do not pass by accident.
- **The refusal survives a generic `TProps`.** The spike's store is monomorphic. The shipped types are not — [`types.md`](../../0011-consumer-values-in-props/types.md) writes `PropsEdit<TProps>` and `EntryEdit<TProps>`. A generic probe refused the spread in a concrete instantiation **and** inside a generic plugin helper, and both refusals went away with the brand. **The mechanism is safe to build on.**

**Where the brand sits is a choice this page did not name.** `types.md` brands `ProposedEdit`, the whole edit. The spike brands the inner bag: `ProposedProps` on the read side, and `PropsEdit & { readonly __brand?: never }` on the patch (`brand.ts:11-19`). The spike's placement is what the two probes above verified.

**The patch is app-author surface, so `0` rules is not quite `0`.** `types.md` exports `PropsEdit` on purpose — *"a consumer who factors a helper over a props edit otherwise reaches for `Partial<TProps>`"*. Brand the patch and `__brand` reaches that export. It shows in an app author's autocomplete, and it lands in `etc/freegantt.api.md`. The member is unwritable, so it adds no rule. It is one meaningless word on a friendly type. **Price it before you rule.** Branding the whole `ProposedEdit` instead may keep the patch clean — **untested, and the combined spike should test it.**

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

## Review, 2026-09-10

A second reader re-ran the suites and opened every file this report cites. **The three verdicts survive. No HEAD quote was wrong.**

### What the re-run proved

- The three branches sit on origin at the commits in the table.
- The counts reproduce exactly: 34 + 34 + 24 = **92 passed**.
- Every HEAD quote is accurate. Checked one by one: `entry-store.ts:357-359` (the `registry.has` loop), `entry-store.ts:190-195` (`fieldValue` throws), `entry-reader.ts:481` (`proposed` seeds from the top level), `entry-reader.ts:514` (`meta` replaces), `edit-extension.ts:38` and `field-access.ts:49-50` (both shallow spreads), `field-access.ts:149-152` (`writeDeclaredMetaFields` walks the top level), `errors.ts:328-331` (the message still names `"meta"`), `model/entry.ts:99-110` (`StoredEdit`, and the `Instant`-against-`InstantInput` asymmetry).
- `toEntry` (`entry-reader.ts`) never calls `writeDeclaredMetaFields`, so **`add({ cost })` really does drop `cost`** ([#208](https://github.com/Pawel-IT/FreeGantt/issues/208)). §11's warning is real: fold `add` with `update`, or the two doors disagree.
- Every issue number resolves and matches its topic: #197, #208, #212, #238.

### What changed

1. **§11 — the double-name throw is now on the page.** Shorthand ships a refusal, and the verdict withheld it.
2. **§11 — the rule count now says why 4 beats 3.** It reads as a trade, and the trade is open.
3. **§22 — the brand is verified, and it costs one visible member on an app-author type.**
4. **§1 — the "nobody ships" row is marked as a survey**, not as a probe result.

### The type claims that no compiler checked

Only `spike/0011-proposed-edit-brand` owns a `tsconfig.json` and a `tsc.test.ts`. The other two branches prove every claim at runtime.

Two claims want a compiler, not a `throw`:

- **Decision 1's leftover.** *"`PropsEdit<PlannerProps>` accepts `{ phase: 3 }` and the runtime refuses it."* That is a statement about a type. No spike compiled it.
- **Decision 11's guard.** *"Top level stays closed — `strat` still throws."* At runtime it throws. Whether it also fails to compile decides whether a consumer meets a typo in the editor or in production.

The brand spike shows the technique in 16 lines. **The combined spike should carry one `tsc.test.ts` per store.**

### One filing nit

Both reports file the write-door type gap under [#267](https://github.com/Pawel-IT/FreeGantt/issues/267). That issue is the **read** side — *"A renderer reads a declared Field by casting `entry.meta`"*. The plan does the same, so this report inherited it. The build wants its own issue: *`PropsEdit` accepts a key the registry refuses.*

### What the combined spike must still answer

- **Type-check the two stores that only ran.** See above.
- **Brand the whole `ProposedEdit`, against branding the inner bag.** Decide where `__brand` lands before it reaches a published type.
- **Drop the long form at `update()`?** §11 carries the trade.
- **The two merge holes.** Every option in this wave needs per-key merge inside `props`, and no option fixes it. `mergeEntryEdits` and `mergeStoredEdits` must land with the type.
- **0012's `desc` correction touches nothing here**, but the two waves land in the same files. Read [the 0012 review](../2026-09-09-0012-optional-dates-spikes/README.md) first.

---

## How to re-run

Root `vitest.workspace.ts` does not include `plans/`. Each spike owns a tiny workspace file. Use the local binary:

```
./node_modules/.bin/vitest run --config vitest.config.ts --workspace plans/field-redesign/0011-consumer-values-in-props/spikes/<name>/vitest.workspace.ts plans/field-redesign/0011-consumer-values-in-props/spikes/<name>
```

Names: `undeclared-props-patch`, `write-shorthand`, `proposed-edit-brand`.

The brand spike also runs `tsc` from a test (`tsc.test.ts`). It resolves the binary from `process.cwd()`, so run it from a worktree root, never from the spike folder.

Re-run on 2026-09-09 after the agents landed: **92 passed** (34 + 34 + 24).

Re-run on 2026-09-10 by the review: **92 passed** (34 + 34 + 24). The three worktrees under `/tmp/FreeGantt-spikes/` still hold their own `node_modules`, so each suite runs there with no install.
