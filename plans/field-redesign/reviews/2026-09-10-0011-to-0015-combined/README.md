# Combined spike — ADR 0011 to 0015

**Ruled since this page was written, and one recommendation was overruled.** Decision 26 shipped **no** `followChildren`, and `kind` left the record. Every ADR's own *Where it stands* is the live account. This page is the evidence, never the answer.

**One store. Five ADRs. The recommendations in one façade.**

Throwaway code lives on [`spike/0011-0015-combined`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0011-0015-combined). This file is the verdict. Open that branch when you need the tests. Do not close the decisions in the ADR files. A spike reports. The author rules.

**Score.** A clean, friendly public API. An option that is smaller inside and larger outside lost. Internals split by **seam**, not by ADR number.

**Status — the evidence is not accepted.** The author has not ruled. A second pass on 2026-09-10 opened every seam the first store wrote, re-ran the suites, and tried the composition bugs the first pass hid. Read [What the first pass got wrong](#what-the-first-pass-got-wrong) before you cite a file on this branch.

| Folder | Question | Tests |
|---|---|---|
| `combined-store/` | Recommended composition | 31 passed |
| `type-probes/` | Q1 compile vs runtime | 1 passed (+ tsc) |
| `brand-whole/` | Q2 brand placement, Q12 write types | 1 passed (+ tsc) |
| `update-flat/` | Improvement A — drop long form at `update()` | 2 passed |
| `plugin-write/` | Q12–14 plugin prefix and extender collision | 3 passed |

Parent re-ran after the second pass: **38 passed** (31 + 1 + 1 + 2 + 3).

---

## Verdict in one page

**The recommendations compose.** They do not compose for free. Three collisions only appear when the five ADRs share one store. The earlier per-ADR spikes could not have seen them.

**The public call still reads true:**

```ts
const store = new CombinedStore({
  fields: [
    { key: 'cost', rollUp: 'sum' },
    { key: 'owner' },
  ],
});
store.add({ id: 'p', name: 'Phase', cost: 500 });
store.add({ id: 'c', parentId: 'p', start: 0, end: 10, cost: 7 });
store.update('c', { cost: 9 });
store.update('c', { start: undefined, end: undefined });
```

`p` derives. `p.kind` stays `'span'`. `c` is dateless. `p` becomes dateless with it (improvement D). `update('p', { cost: 999 })` throws `DerivedFieldNotWritableError`.

**Do not put `{ key: 'start', editable: false }` on that same call.** Un-date is a change of `start`/`end`. Lock-doors C refuses a later change. The first store exempted envelope-clear so the demo stayed green. That exemption is mud. The recommended store throws `FieldNotEditableError`. Split the demo: lock and un-date are both true, not on one Field at once.

**0011 holds.** Records carry. Patches name. Declared-key shorthand. Per-key `props` merge through `mergeProps`. `FieldNamedAtTopAndInPropsError` on the double name. Brand the **whole** `ProposedEdit`.

**0012 holds.** Dates iff Segments. `durationOf` returns `Duration | undefined`. Skip dateless rows in `fitDataset`. Hole-last is a rule to write: `compareInstant` answers a hole the same way on `asc` and `desc`. HEAD `direction * order` does not.

**0013 leans structure-only.** A row derives when it has children. `kind` stays authored. `rollUpKinds` is not an input. `hierarchy.autoGroup` is **deleted**, not ignored. `followChildren: false` is part of 26's cost, and it lives on the **Entry**, not in `props`.

**0014 (never spiked before) probes.** Share `props` for one storage home, not for the typed dot. Plugin keys carry a prefix. `PropsEdit<TProps & PluginEntryProps>` at the write door. Collision error names the plugin. Runtime owns composition. Two plugins on one Field throw.

**0015 holds.** `{ key: 'start', editable: false }` constructs. Create, ingest, and `replay` still write. `update` refuses **change**. Three declaration shapes stay three objects. Absent `editable` means the API may write. Split cannot claim I14 for absent Fields.

---

## What composed cleanly

| Seam | File | Question it answers |
|---|---|---|
| Write resolver | `write-resolver.ts` | exists (partial) → compute → derived → editable. Grid shares compute/derived/editable. |
| Dates | `dates.ts` | Dates iff Segments. Presence, not `!== undefined`. |
| Props | `props.ts` + `merge.ts` | Shorthand. Namespace exempt. Per-key merge. Delete on `undefined`. |
| Derivation | `derivation.ts` | Has children, unless `followChildren === false`. Clear envelope when every child is dateless. |
| Fit / sort | `fit-sort.ts` | Skip dateless. Hole-last both directions. No `direction * order` multiply. |
| Extender | `extender.ts` | Whole-`ProposedEdit` brand. Compose. Contested Field reports. |
| Lock | `lock.ts` | Three shapes. Ingest vs change. |

One façade. Seven seams. That is not a ball of mud. Three leftovers still are — see [Remaining mud](#remaining-mud).

---

## Where a previous review was wrong, incomplete, or we did better

The earlier reviews asked this combined spike to answer a list. The list was right. The first combined store still hid four things those reviews already named.

### 0012 §3 — sort-last on `desc` (already corrected, now pinned)

The 0012 review said HEAD `direction * order` puts a hole **first** on `desc`. This store writes `compareInstant` and sorts both directions in **one** test: `asc` → `early, late, hole`; `desc` → `late, early, hole`. Improvement C wins. Do not inherit `defaultCompareStored`.

### 0012 — stale envelope (unprobed, now probed)

HEAD aggregators: every child skipped → `undefined` → keep the stored value. A parent whose children all lose their dates then **lies** about dates. Improvement D `clear-when-all-dateless` is the default. `keep-stale` is a named control so the HEAD failure stays visible. The call that reads true: "when no child has dates, the parent has no dates."

### 0012 × 0013 — biconditional after omit-dates

0013 omits a rolling-up parent's dates from the Document. This store omits **segments with them**. Reload has neither. Child rollup restores both. Dates iff Segments holds. Vacuous on the Document (neither present); restored in memory (both present). Do not omit dates and leave Segments. That is the rule that keeps both ADRs true.

### 0013 — `autoGroup` no-op is the worse option

The 0013 review said a live config key that changes nothing is worse than delete or a new job. The first combined store kept `autoGroup?: boolean` and ignored it, with a comment *"Do not ship this setter."* Shipping the no-op is the mistake. **Deleted from the façade.** Kind stays authored. A parent with children may keep `kind: 'span'`.

### 0013 — `followChildren` is not a `props` key

The 0013 review said a core flag must be a Field (`entryAfterEdit` walks `CORE_FIELDS`). The first store declared `{ key: 'followChildren' }` and stored it in `props`. That puts a core derivation switch in the consumer bag, against 0011's address rule. Second pass: `entry.followChildren`, written `update('p', { followChildren: false })`. Default is absent/true. `add({ parentId })` still derives. Pin stays a scheduling flag. **`CONTEXT.md` has no term.** `followChildren` is a candidate, not a ruling.

The old Document `rollUpKinds: []` still cannot be saved by a report alone. The consumer must write `followChildren: false` per parent. That is 26's cost. Decision 21 belongs inside 26.

### 0011 §11 — drop the long form at `update()`?

Tried. `FlatUpdateStore` wins the read: `update('t1', { cost })` only. The double-name throw disappears. `add` and the Document still nest. **That splits the write door from the record door.** Decision 1 spent its table keeping records-carry and patches-name on one object shape. Shorthand plus nest, plus `FieldNamedAtTopAndInPropsError`, stays the recommended store. A is optional. Do not fold it in.

### 0011 §22 — brand the whole `ProposedEdit`

The 0011 review verified inner-bag brand only, and asked this spike to price `__brand` on `PropsEdit`. Whole-edit brand refuses `{ ...proposed }` as an `EntryEdit` (`brand-whole/probes.test-d.ts`). The inner-bag probe on this branch casts the patch and does **not** re-prove the 0011 refusal. **Whole edit wins** because `PropsEdit` stays an app-author type with no `__brand`. The first store left inner-bag brand on the recommended extender. Second pass landed whole-edit brand there.

### 0011 — `strat` at compile time

The 0011 review said only runtime threw, and asked for `tsc`. CombinedStore `Write` is a closed key set. `{ strat: 1 }` is a compile error (`@ts-expect-error`). Production `EntryEdit<TProps>` will refuse a key that is not core and not in `TProps` the same way, if the argument is an object literal. A key that **is** on `TProps` but is not declared still compiles and throws — that is #267, unchanged.

### 0014 — write, not only read (never spiked before)

Recommendation A (`entry.props.progress` typed dot) and recommendation 12 (required prefix) **cancel**. `update('t1', { 'scheduling:progress': 60 })` writes. `update('t1', { props: { progress: 60 } })` throws `PluginFieldCollisionError` naming `scheduling`. Honest sentence: **A for one storage home, not for the typed dot.** `PropsEdit<TProps>` alone cannot type a plugin write. `PropsEdit<TProps & PluginEntryProps>` can.

### 0015 — un-date is a change

Not in the 0015 list. It only appears when 0012 and 0015 share a store. `{ key: 'start', editable: false }` then `update({ start: undefined, end: undefined })` **throws**. Create still writes. `replay` still writes. Child add that would widen a locked parent throws the **whole** add.

---

## Improvements — winners and losers

| ID | What | Result |
|---|---|---|
| **A** | Drop long form at `update()` | Optional. Cleaner call. Splits write door from record door. |
| **B** | Brand whole `ProposedEdit` | **Wins.** `PropsEdit` stays clean. |
| **C** | Explicit hole compare, both directions | **Wins.** Required for `desc`. |
| **D** | Clear envelope when every child is dateless | **Wins** over HEAD keep-stale. |
| **E** | Core boolean opt-out as 26's cost | **Wins.** Lives on the Entry. |
| **F** | Per-key merge in both merge functions | **Wins.** Must delete on `undefined`, not spread. |
| **G** | Plugin prefix + write door | **Wins** together. |
| **H** | One write resolver | **Wins**, exists arm still a sibling. |
| **I** | Un-date of locked `start` throws | **New.** First store hid it. |
| **J** | `followChildren` on the Entry | **New.** First store put it in `props`. |
| **K** | Delete `autoGroup` | **New.** First store left a no-op. |
| **L** | Whole-edit brand on the recommended extender | **New.** Probe won; façade lagged. |
| **M** | Collision from declared `plugin:suffix` | **New.** First store hardcoded `progress`. |
| **O** | `replay` writes locked `start` | **New.** Door existed; no method. |
| **P** | Child-add widen throws the whole add | **New.** Throw existed; no test. |

---

## Per-question result (1–17)

| # | Result |
|---|---|
| 1 | **Holds, with a compile win.** `phase` on `PropsEdit` compiles (#267). `strat` on `Write` does not. Un-date compiles. |
| 2 | **Whole `ProposedEdit` wins.** Inner bag works. Do not put `__brand` on `PropsEdit`. |
| 3 | **Optional.** Flat `update()` wins the read and loses decision 1's one-shape table. |
| 4 | **Holds.** `mergeProps` in both merges. Spread is not used. |
| 5 | **Holds.** One test, both directions. |
| 6 | **Holds.** Omit dates **and** Segments. Reload + rollup restores both. |
| 7 | **HEAD keep-stale is wrong.** Default is clear-when-all-dateless. |
| 8 | **Report cannot save the file.** `followChildren: false` per parent is the migration. |
| 9 | **Holds as 26's cost.** Envelope Field. `add({ parentId })` still derives. |
| 10 | **Deleted.** No leftover setter. |
| 11 | **The fix, not a silent price.** Empty group is writable. First child drops the typed cost. Two predicates finally agree. |
| 12 | **A needs the intersection at the write door.** |
| 13 | **A for storage home, not for the typed dot.** Error names the plugin. |
| 14 | **Runtime owns composition.** Return `undefined` for nothing. Contested Field throws. `Map` stays. |
| 15 | **Spike encodes the lock in `fields`.** `src/authored` still drops it. Harness comment stays false. Do not patch the harness. |
| 16 | **Three shapes.** Lock constructs. Bare `{ key: 'start' }` is a no-op. `{ key: 'start', column }` throws. |
| 17 | **Split.** API may write. Grid may not, for absent column Fields. Claim I14 with **change**. Unbundle `kind` (has a column) from `parentId` / `segments` (none). |

Decision 13 (four read doors): one note. `fieldValue` / `ctx.read` / `entry.props.k` / `durationOf`. Settle names after 9/12, with [#274](https://github.com/Pawel-IT/FreeGantt/issues/274). No store spent on a rename.

---

## What the first pass got wrong

A second reader opened every file the first store wrote. The recommendations still compose. These claims did not survive the open.

1. **`clearsEnvelope` skipped the lock.** `write-resolver.ts` returned before the editable arm when the write cleared dates. The public call used `{ key: 'start', editable: false }` and then un-dated. That is not lock-doors C. Removed. Un-date of a locked `start` throws.
2. **`autoGroup?: boolean` on the constructor.** Comment said do not ship it. The option was still there. Deleted.
3. **`followChildren` declared as a consumer Field.** Stored in `props`. Moved to the Entry.
4. **Recommended extender still branded the inner bag** after the probe picked whole-edit brand. Landed whole-edit brand on `extender.ts`.
5. **`#guardPluginCollision` hardcoded `'progress'`.** Now reads declared `plugin:suffix` keys.
6. **`mergeEntryEdits` used object spread inside `props`.** `{ cost: undefined }` left the key. Now `mergeProps` deletes.
7. **`toJSON` omitted only `cost`.** Now omits every rolling-up key.
8. **No test for child-add widen. No `replay` method.** Both added. Replay writes a locked `start`.
9. **Type probe invented `strat?: number` on a toy `Write`.** That made "does `strat` compile?" unanswerable. CombinedStore `Write` now refuses it.
10. **Public call mixed lock and un-date.** Split. Both remain true on different Fields.

None of these reopen a numbered recommendation. They are the price of composing them.

---

## Remaining mud

These are still true after the second pass. The build should not copy them.

- **Exists is a sibling of the resolver.** `assertTopLevelClosed` throws `UnknownFieldError`. `resolveWrite` returns in silence for an unknown key. Improvement H asked for one function. Compute, derived, and editable share it. Exists does not.
- **Grid column set is hardcoded.** `GRID_COLUMN_KEYS` is how the spike states 18's split. Production already has `field.column`. Do not ship a second list.
- **Spike `Write` hardcodes consumer keys.** `cost`, `owner`, `'scheduling:progress'`. Production is `EntryEdit<TProps>` plus declared-key shorthand. The toy list is not a type design.
- **`get()` re-applies rollup.** Production stores the rolled value on the Entry (D-S4-6). A read-time fold is a spike shortcut.

---

## HEAD traps the combined store opened

All of these are still true in `src/` today. The store pins them so the build does not re-learn them.

- `'start' in edit`, not `!== undefined`. HEAD `toEditReading` drops the un-date verb.
- A dateless **first** entry poisons `fitDataset` if you do not skip. `time-scale-model.ts:218-225`.
- Unguarded `duration.value` yields `NaN` / throws. Guard lives on `durationOf` first.
- `{ ...editA, ...editB }` drops nested `props` keys. `mergeEntryEdits` at `edit-extension.ts:38`.
- `Object.keys(edit)` at the top level makes a nested `props` patch inert until you walk inside.
- `add({ cost })` drops `cost` unless you fold with `update` (#208).
- `capability.ts:119` does not ask for children. `rollup.ts:184` does. Unify on `main` first (`refuted.md` item 8).
- `authored` drops a core override. Harness `data.ts:39-40` is false for `{ key: 'end', editable: false }`.

---

## What this spike did not re-open

- Closed 0012 decisions 4 and 15.
- Closed 0011 decisions 2, 10, 17, and the `props`-names-a-core-key warning.
- Closed 0013 decisions 5 and 6. History is never cleared.
- Closed 0014 decisions 7 and 14.
- The `editable: false` ruling. Modelled, not reopened.
- #267 declared-key inference from a `fields` literal. Out of scope. The error names the fix.
- A UI to date a dateless row (0012 known hole).
- Unifying the proposed-Field predicate in `src/` (`refuted.md` item 8). Still ordered on `main` first.
- Implementing any of this in `src/`. No production wiring.
- Harness workarounds. The lock-round-trip lie is recorded, not patched.

---

## How to re-run

Root `vitest.workspace.ts` does not include `plans/`. Each folder owns a tiny workspace file. Use the local binary, from the repo root:

```
./node_modules/.bin/vitest run --config vitest.config.ts \
  --workspace plans/field-redesign/combined/spikes/<name>/vitest.workspace.ts \
  plans/field-redesign/combined/spikes/<name>
```

Names: `combined-store`, `type-probes`, `brand-whole`, `update-flat`, `plugin-write`.

`tsc.test.ts` resolves `node_modules/.bin/tsc` from `process.cwd()`. Run from the worktree root, never from the spike folder.

Re-run on 2026-09-10 after the second pass: **38 passed** (31 + 1 + 1 + 2 + 3).

---

## Review of this review (2026-09-10)

A second reader re-ran the five suites and opened every file this report cites. **The test count reproduces: 38 passed.** `src/` is untouched. Traps I–P hold in the code.

**One spec miss, now closed.** The one-page verdict named `p` dateless and `update('p', { cost: 999 })` throws next to the headline call. Those expects lived in other tests. They now sit on `combined-store.test.ts` "matches the composed recommendation call".

**One wording miss, now closed.** "Inner-bag brand also refuses a complete `props` spread" over-read `brand-whole/probes.test-d.ts:12`, which assigns through a cast. The whole-edit refusal is the load-bearing probe.

**Judgement, left standing.** Exists still sits beside the resolver. Grid column keys are still a hardcoded set. Spike `Write` still hardcodes consumer keys. `get()` still re-applies rollup. The Remaining mud section already named all four.

Worst issue on Spec: headline test vs one-page claims — **fixed**. Worst issue on Standards: exists-arm silence in `resolveWrite` — **named, not dissolved**.

