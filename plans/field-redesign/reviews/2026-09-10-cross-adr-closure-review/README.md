# Cross-ADR closure review — 0011 to 0015

**Acted on.** Every number this page called ready to rule has since closed. **13** closed on `read` (duration is a compute Field). **18** closed on the `'never' | 'api' | 'anywhere'` enum. Nothing in this folder is open.

**Not a spike. A reading of all five ADRs, all five verdict reports, and the code behind both.** The question asked: which decisions can close on the evidence that now exists, was a better API available, and would a sixth spike help.

**Answer in one line.** Nine of the eleven open numbers are ready to rule. **18 is not, and the reason is that four locked-spec sentences already answer it.** A sixth broad spike would re-derive; one thirty-line probe and a four-item reading pass would not.

---

## What reproduced

Re-ran the five combined suites: **31 + 1 + 1 + 2 + 3 = 38 passed.** All thirteen per-ADR spike commits sit on `origin` at the SHAs the reports name. `src/` carries no spike code.

Every load-bearing HEAD quote in all five reports held. Opened one by one: `capability.ts:119` (no children test), `rollup.ts:184` (childless skip), `entry-store.ts:357-359` (exists arm only), `entry-reader.ts:484-489` (`!== undefined`, so un-date is a silent no-op), `entry-reader.ts:513` (whole-`meta` replace), `time-scale-model.ts:214-225` (no dateless skip, first entry poisons), `sort.ts:26` (`direction * order`), `grid-columns.ts:26-35` (`defaultCompareStored` answers `1` for a hole), `aggregators.ts:13-17` (`isFiniteNumber` already guards NaN, and `duration.value` throws once the return is optional), `field-registry.ts:97` / `:150` / `:211-225`, `hierarchy.ts` at 58 lines writing `{ kind: 'group' }` at `:55`, `core-fields.ts` (`kind` has a column; `parentId` and `segments` do not), `errors.ts:331` (still says *put the value in `meta`*), `change-set.ts:138-140` (`fieldRowsOf` filters `updated`, so it never sees `add`). `TProps` appears nowhere in `src/`.

---

## Three things no report got right

### 1. The "unify the proposed-Field predicate" order was a misread

[`refuted.md`](../../shared/refuted.md) item 8 and the folder README both said *two call sites answer "did anyone propose this Field?" from two different edit sets*, and ordered a unification ahead of [0013](../../0013-what-decides-derivation/README.md).

`editProposesField` has **one** call site in `src/`: `rollup.ts:196`. `build-commit-change-set.ts:301` is the argument binding. The `body`/`merged` split is declared and explained at `rollup.ts:23-26` as D-S2-22 — two questions, two sets. **There is nothing to unify.**

**What is actually missing is decision 5's warning.** The cascade write is dropped today, in silence: it reaches `merged` and never `body`, so `:196` does not yield and the pass overwrites it. `rollup.ts` imports `AggregatorFailedError` and raises nothing else. `reportCorrectedRollUps` is not it — that is a `fromJSON` reconciliation report (`'rollup-corrected'`, `serialization/index.ts:86`) that never sees a cascade.

**Both documents corrected.** The order is withdrawn; the warning is now a 0013 build bullet.

### 2. Four locked-spec sentences already rule decision 18

The [0015 review](../2026-09-10-0015-write-door-spikes/README.md) scores *split absent from `false`* the winner and quotes none of these:

| Where | What it says |
|---|---|
| `plans/02:477` | *"one answer gates every writer (I14), so a consumer states it once"*; *"Default is `false`."* |
| `plans/01:283` | *"the Field half of one write answer … (I14); default false"* |
| `plans/01:926` | the I14 row — *"every write asks one `canWrite` (#256)"* |
| `src/model/field.ts:125-127` | *"one home for 'may this value change,' asked by every gesture that writes it (I14)."* |

That is 18's **first** answer — copy the view rule — written into two locked specs, a public type's doc comment, and an invariant with a CI job. **So split is not the compatible answer and copy the breaking one. Both edit a locked spec.** Copy breaks three published calls; split retires *one answer gates every writer* and weakens I14.

**And I14's own enforcement is thinner than the claim.** `e2e/write-refusal.spec.ts` drives the cell editor and the bar handles. It never calls `entries.update()`. Claiming I14 at the data door needs a new assertion, whichever answer wins.

**This is the one decision where the evidence is materially incomplete.** Recorded in [0015](../../0015-write-door/README.md); rows added to [`prose-sweep.md`](../../shared/prose-sweep.md).

### 3. The two independent fixes are not on `main`

`624350d` (`sizingPairOf`) and `9c3f704` (the conversion rename) sit on `adr-0011-field-redesign` and on every spike branch. Neither is an ancestor of `main`. The folder README says *land these on `main` first*. **Unmet.** They reach `main` through a PR, never a direct push — so this one is the author's call, not an agent's.

**Smaller:** the flat shorthand lives at `plans/02:467`, not `:459`, and it is a worked example rather than a mention. [`evidence.md`](../../shared/evidence.md) still broke its own opening rule in three places — now named.

---

## Decisions ready to rule

| # | ADR | Close as | Why it is ready |
|---|---|---|---|
| **22** | 0011 | Brand the whole `ProposedEdit` | Two spikes agree, `tsc`-proved, and the refusal is load-bearing — delete `__brand` and `@ts-expect-error` goes unused. `PropsEdit` stays clean |
| **1** | 0011 | Records carry, patches name | Three waves, no cleaner option. **Close it with the `errors.ts:331` rewrite** — that message *is* the migration instruction |
| **11** | 0011 | A flat spelling, and there are two | Shorthand won both waves. **Improvement A is a fourth option, not a follow-up** — see below |
| **16** | 0014 | Runtime owns composition; return a value or nothing; keep the `Map` | Designable once 22 closes. **Its severity half collides with decision 5** — see below |
| **19** | 0015 | Keep the override; publish rule C | `beforeChange` lost on a checkable ground: `fieldRowsOf` filters `updated`, so it never sees `add` |
| **23** | 0015 | No change — 19 answers the lock row | Say the other two shapes keep today's behaviour, so *already answered* does not close them by accident |
| **26** | 0013 | Structure-only **plus** a core opt-out | Closes **8**, **20**, **24**; folds **21** in. Five numbers, one ruling. Two conditions in [0013](../../0013-what-decides-derivation/README.md) |
| **9 + 12** | 0014 | Share `props`; prefix plugin keys | First write probe. Two new findings inside the pick — see below |

**Not ready: 18** (above) and **13** (correctly parked on 9/12 and [#274](https://github.com/Pawel-IT/FreeGantt/issues/274)).

Ruling the eight takes open from **eleven to two**.

---

## Where a better API was available

Four options. Each is now recorded in the ADR that owns it.

**1. Improvement A was set aside on a reason that is contradicted.** The combined spike rejected flat-only `update()` because it *"splits the write door from the record door that decision 1 spent its whole table keeping together."* Decision 1's table weighs per-key merge against whole-bag replace over an undeclared key space, and says nothing about object shape. **Decision 1's own ruling already splits the two doors** — ingest carries an undeclared key, `update()` throws for it. A shape split is smaller than the split already ruled. A also deletes `FieldNamedAtTopAndInPropsError`, a brand-new refusal shorthand otherwise hands 0015.

**2. Decision 18's third shape was strawmanned.** *A second word* lost on `{ key: 'owner', editable: false, acceptsUpdate: true }` — rightly. The other spelling widens the one key: `editable: 'never' | 'api' | 'anywhere'`, with `true`/`false` as aliases. Split already creates exactly three states and spells them with two booleans and an absence; this spells them. **The cost, which I first omitted:** three states mean `canWrite` must know which door asks, so the primitive gains a door argument. That is a widening of I14's one resolution — the same objection, moved from the Field to the resolver.

**3. Decision 12's precedent does not transfer, and the counter is strong.** HTML, Kubernetes and OpenAPI prefix because their space is **open**. FreeGantt's closes at construction — that is the registration lock, ruled *after* 12's evidence was gathered — and `field-registry.ts:117` already maps key → `PluginId`. So the registry can name the plugin with no prefix. **But detection is not prevention:** a consumer who declared `{ key: 'progress' }` and then installs a scheduling plugin gets a throw at boot, and a prefix makes that impossible instead of detectable. Weigh it against the call site nobody read aloud — `gridColumns: ['name', 'scheduling:progress']`.

**4. Two plugin-write refusals, two severities, never compared.** Closed decision 5 **drops and warns**, because *a plugin author learns no rule and checks no predicate*. The 0014/16 spike **throws** `PluginWriteCollisionError`. Same surface, same kind of refusal, opposite severity — and a throw leaves the app dead rather than degraded over two plugins that are each correct. Pick one posture for *a plugin write the library refuses*.

---

## Would a sixth combined spike help?

**Not a broad one.** The combined spike did the composition job and found the real collisions — un-date against a locked `start`, `followChildren`'s home, the `autoGroup` no-op, the hardcoded plugin key. A sixth store would re-derive. **The evidence chain has passed its useful point:** five reports, three carrying *what the first pass got wrong* sections, and the last pass corrected reports rather than decisions. The bottleneck is rulings.

**One probe is still worth code.** Read an old Document under structure-only — 26's only untested path, with permanent data loss at the sharp end, and the reader already carries the schema-1 `derivedSpanKinds` → `rollUpKinds` migration (`serialization/read.ts:90-92`). Roughly thirty lines.

**Four items want reading, not code.** Decision 18 against the four locked sentences, with the three-state shape scored. Improvement A's rejection reason. The colon call site against a bare key. The two plugin-write severities on one page.

---

## What this review changed

| File | Change |
|---|---|
| [`shared/refuted.md`](../../shared/refuted.md) | Item 8 — the unify order withdrawn, with what is actually missing |
| [`README.md`](../../README.md) | Independent fix 2 withdrawn; both fixes recorded as off `main` |
| [`0013`](../../0013-what-decides-derivation/README.md) | Build bullet is decision 5's warning; 26's two closing conditions |
| [`0011`](../../0011-consumer-values-in-props/README.md) | `:467` citation; improvement A as decision 11's fourth option |
| [`0015`](../../0015-write-door/README.md) | The four locked sentences; the one-key three-state shape |
| [`0014`](../../0014-plugin-author-surface/README.md) | 12's registration-lock argument and colon call site; 16's severity clash |
| [`shared/evidence.md`](../../shared/evidence.md) | AG Grid and Bryntum named with sources; the unsourced third claim marked |
| [`shared/prose-sweep.md`](../../shared/prose-sweep.md) | Four F rows; **the spike gate for finalizing a spiked ADR** |

**Nothing ruled. No decision closed. No `src/` change.** A review reports; the author rules.
