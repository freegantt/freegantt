# ADR 0013 spikes — what decides that a row derives its values

**Ruled since this page was written, and the author went further.** Decision **26** closed on 2026-09-10: an Entry derives when it has children, `kind` leaves the record, and **no `followChildren` ships**. Read [0013's closed decisions](../../0013-what-decides-derivation/README.md#closed-decisions). This page is the evidence, never the answer.

**Next ADR in landing order.** [0013](../../0013-what-decides-derivation/README.md) has one open decision: **26**, the inputs to the derivation predicate. Branches **8, 20, 21 and 24** hang off it. This review probes the three answers before the build.

**Score.** A clean, friendly public API. An option that is smaller inside and larger outside lost.

Throwaway code lives on three branches. This file is the verdict. Open a branch when you need the tests. Do not close the decisions in the ADR files. A spike reports. The author rules.

| Branch | Question | Tests | Commit |
|---|---|---|---|
| [`spike/0013-kind-times-config`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0013-kind-times-config) | **(a)** stored `kind` × `rollUpKinds`, plus 8 and 24 as prices | 20 passed | `280d6b0` |
| [`spike/0013-structure-derives`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0013-structure-derives) | **(b)** derives when it has children, plus 20's calculated-kind half | 25 passed | `fe7354d` |
| [`spike/0013-per-entry-flag`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0013-per-entry-flag) | **(c)** stored per-entry flag, plus 21 | 33 passed | `5216d04` |

Parent re-ran the three suites on 2026-09-10 after the agents landed: **78 passed** (20 + 25 + 33).

**Status — the evidence is not accepted.** The author runs one combined spike before any decision moves. A second review on 2026-09-10 re-ran the three suites and opened every file this report cites. Every HEAD quote held, and the correction to the plan's branch table is right. **The winner's price list is larger than this page says.** Two published config keys lose their job under it, and neither is named. See [Review, 2026-09-10](#review-2026-09-10) before you rule.

---

## Verdict in one page

**Decision 26 has no numbered rec.** The call site winner is **structure: a row derives when it has children. `kind` stays authored.**

That is unbundled (b), not the README's (b). The README bundled a second change: make `kind` calculated. Calculated `kind` loses on `barRenderer: { group: fn, mymilestone: fn }`. Structure-only keeps that key and still uses "has children" as the predicate.

**(a) holds today's sentence** — kind is stored, config is per Dataset, `add({ parentId })` drops cost, `update` throws. It does not dissolve 8 or 24. It also ships two predicates that disagree about a childless `'group'`. Unifying the write rule with children leans toward (b). That is (a)'s own fork.

**(c) does not win the head.** Derivation still comes from an axis. Pin and derive-off are two flags. Core owns a boolean opt-out Field; the plugin keeps pin. That overlay sits on (a), not in place of 26. Replacement of the axis loses `add({ parentId })`.

**Branches that die with the call-site winner:**

| Branch | Under structure-only (winner) |
|---|---|
| **8** target kind on demotion | **Dies.** Demotion writes no kind. Kind stays the author's word. Dates go (0012). |
| **20** calculated `kind` | **Loses.** Kind stays authored. Renderer registry keeps `bar:${kind}`. |
| **21** layer of a derive flag | **Does not gate 26.** Optional later overlay. If it ships: core boolean Field, not pin. |
| **24** undo of a `rollUpKinds` flip | **Dies.** The predicate does not read `rollUpKinds`. A leftover setter that still filters who derives is (a) in disguise. |

The README table that keeps 24 alive under (b) is wrong. 24 survives only while `rollUpKinds` feeds the predicate.

**Two published config keys die with those branches, and this page first did not count them.** `rollUpKinds` and `hierarchy.autoGroup` both lose their job under structure-only. Both are live setters today. One of them is a Document key, and dropping it changes what an old file means. Read [Review, 2026-09-10](#review-2026-09-10) with this table. The branches are not the whole price.

---

## (a) Kind × `rollUpKinds`

**Holds as a description of HEAD. Loses as the axis to keep.** Branch `spike/0013-kind-times-config`. Notes: `plans/field-redesign/0013-what-decides-derivation/spikes/kind-times-config/NOTES.md`.

| Option | Call a person reads | Result |
|---|---|---|
| **(a) axis** | `add({ id: 'c', parentId: 'p' })` drops cost. `entry.kind` is stored | True for "does this row derive?" Pays 8 and 24. Two predicates leak |
| **8.1 write `'span'`** | `remove('c')` → p is a span, no dates | Smaller surface. Worse sentence: kind is no longer the author's `'group'` |
| **8.2 remember promotion** | Promoted → span; authored group stays group | Fourth Document key. Leftover group is not a normal Entry (`capability.ts:119`) |
| **8.3 stop storing parent-ness** | Named only | That is (b). Not built here |
| **24.1 reverse config** | setter then `undo()` restores set and cost | True. HEAD `UpdatedRow` cannot carry a config key |
| **24.2 out of history** | setter then `undo()` does not reverse the axis | What ships today. A person cannot undo "make this a parent axis" |

Rules to learn on the (a) axis: **4**. Doors do not agree: `update` uses kind only; JSON omits only when children exist.

### Lesson for the build

Do not keep (a) in order to save a ChangeSet row. The row is the price, not the reason.

If the author still picks (a), 8.1 is the smaller surface and the worse English. 8.2 keeps the author's kind and fails "normal Entry with no dates". Unifying `capability.ts:119` with `rollup.ts:184` (require children) makes the leftover group writable. Then (a) has three inputs and becomes (b) with a leftover config.

---

## (b) Structure derives

**The predicate holds. Calculated `kind` does not.** Branch `spike/0013-structure-derives`. Notes: `plans/field-redesign/0013-what-decides-derivation/spikes/structure-derives/NOTES.md`.

The README named (b) as one object. A person reads two calls. The spike unbundled them.

| Option | Call a person reads | Rules | Result |
|---|---|---|---|
| HEAD control | "Add c under p" derives only for a rolling-up kind | 3 | Control. 8 and 24 leak |
| **Structure-only** | "Add c under p" derives. `barRenderer.mymilestone` still names a key | 2 | **Winner.** Kind stays authored. 8 dies. 24 dies |
| Calculated kind | "p's kind" is `'group'` with no write. `mymilestone` names nothing | 3 | Lost. Smaller inside, larger outside |

`add({ id: 'c', parentId: 'p' })` is true. Decision 6 drops p's cost. Last-child `remove` writes no kind. `rollUpKinds` is not an input. `update('p', { cost: 999 })` still throws.

`barRenderer: { group: fn, mymilestone: fn }` still has a key under structure-only. Under calculated kind, `add({ kind: 'milestone' })` becomes `'span'`. A dated parent still paints at `bar:group`. 0012 quiets only the demoted dateless row.

That is what `plans/01` §2.5 already said: `parentId` and `kind` are orthogonal. Default-on `autoGroup` already contradicts the authored-kind sentence. Structure-only ends that fight without deleting the renderer key.

### Lesson for the build

Capability at `capability.ts:119` moves from kind × config to "has children". That change does not need a calculated `kind`.

Delete `rollUpKinds` as a derivation input, or give the setter a different job in a later ADR. Keeping it as a filter on who derives is (a).

**"Delete the input" is not the whole sentence. Two published keys stop meaning anything.**

- **`rollUpKinds: 'none'` is how a consumer says "my parents keep what I authored".** `plans/01` §2.5 — *"`'none'` or `[]` keeps authored parent values"*. `plans/02` — *"Document `rollUpKinds: []` keeps stored parents and does not maintain them"*. Structure-only removes that sentence from the API, and ships no replacement. `structure-only.test.ts:32-41` asserts the loss and reads it as a win.
- **`hierarchy.autoGroup` has no job left.** A parent derives whether or not anything wrote `'group'`. The spike's store promotes no kind at all (`structure-only.test.ts:9-17` keeps `kind: 'span'` after a child arrives). The key is public, live, and defaults to `true` (`api/dataset.ts:86-88`).

**The old Document is the sharp end.** A file that carries `rollUpKinds: []` today means *keep these parents as I saved them*. Read it under structure-only and every parent with children starts deriving. Closed decision 6 then **drops** the authored values, and `toJSON` omits them, so the next save is permanent. A report is raised at the ingest door, and a consumer can do nothing with it, because the winner ships no opt-out.

**The (c) overlay is the only replacement, and this page calls it optional.** If the core boolean opt-out is what a `rollUpKinds: 'none'` consumer migrates to, then decision 21 is part of 26's cost, not a later overlay. **Weigh that before ruling 26.**

**An empty group is `plans/01` §2.5's own story.** *"An empty group is legal and renders as one (that is how 'add a phase, then fill it' works)."* At HEAD `capability.ts:119` locks that phase's cost cell. Under structure-only the cell is writable, and the first child drops what a person typed. The flip is arguably the fix that the two-predicate disagreement asks for. **Show that call site before you rule**, because §2.5 wrote its rule around it.

Do not invent a column-to-bar seam to rescue calculated kind. Decision 20 part 3's premise fails at HEAD: bars are keyed by `kind`, not by a column.

---

## (c) Per-entry flag

**Does not win 26 as the head. Wins only as an escape hatch.** Branch `spike/0013-per-entry-flag`. Notes: `plans/field-redesign/0013-what-decides-derivation/spikes/per-entry-flag/NOTES.md`.

Order of the probe: one flag or two, then layer, then boolean vs tri-state.

| Option | Call a person reads | Result |
|---|---|---|
| One flag (pin = derive-off) | `pin('p')` | Lost. False sentence about cost. No plugin → no opt-out |
| Two flags, plugin boolean | `setFollowChildren('p', false)` | Lost. App author meets a plugin to stop a core pass |
| Core tri-state overlay | `update('p', { followChildren: true })` | Lost. Third state duplicates custom kind × `rollUpKinds` |
| Replacement tri-state | `add({ parentId })` then a flag write | Lost. Decision 6's `add({ parentId })` is false |
| **Core boolean opt-out** | `update('p', { followChildren: false })` | **Best of (c).** Overlay on an axis, not the head |

**Pin and derive-off are two flags.** `pin('p')` means the scheduler must not move p. It does not mean "stop summing cost". A comparable product bundles "manually scheduled" with summary-off. That bundle is a scheduling product. FreeGantt's Rollup is core `data/`. Do not copy the bundle.

**That sentence names no product, so a reader cannot check it.** [`evidence.md`](../../shared/evidence.md) opens by ruling the opposite for this folder: name the product, link the source, and *"do not anonymize these back to a comparable Gantt"*. Its own escape-hatch section breaks that rule, and this report inherited the anonymous form. **Name the product in `evidence.md`, or drop the sentence from this verdict.** The bundle claim is load-bearing for "pin is not derive-off".

**Core owns derive-off.** Rollup is a `data/` commit step. A Gantt with no plugin still rolls up. The flag must be a Field (`entryAfterEdit` allow-list). Pin stays in the scheduling plugin (ADR 0002).

**Boolean opt-out, not tri-state.** Default still follows an axis, gated by children. `add({ parentId })` starts deriving with no flag. A third state duplicates a custom kind. A replacement axis makes `add({ parentId })` false.

`rulings.md` already refused `derivesValues`. The word *derived* also names a `compute` Field. The spike's name `followChildren` is a candidate, not a ruling. A glossary entry is owed if the author ships the overlay.

### Lesson for the build

Do not pick (c) to close 24 for free. The README says 24 dissolves under (c)-in-core. That is true for a **flag flip**. It is false for a `rollUpKinds` flip while the overlay keeps that config. 24 dissolves only if the flag **replaces** the axis. Replacement loses `add({ parentId })`.

If the author later wants an escape hatch, ship the core boolean Field on top of the 26 winner, not as the 26 winner.

---

## HEAD trap that the ADR under-named

All three spikes opened `capability.ts:119`. The plan quotes `rollup.ts:69` and `:184` as one predicate with a structure gate. **The write rule is a second predicate. It does not ask about children.**

```
  if (isRollUpKind(entry.kind) && rollsUp(field)) return DERIVED;
```

A childless `'group'` is DERIVED for writes. The Rollup never writes it. `add` / `update` / JSON therefore do not answer one question.

That disagreement is why 8.2 cannot reach "a normal Entry with no dates" without changing the write rule. It is why (c) says 8 shrinks if capability uses the live predicate. It is why (b) can move the write door to "has children" without calculating `kind`.

`rollup.ts:196` (`body`, not `merged`) is real (`refuted.md` item 8). No spike unified it. Do not land that fix in this ADR's first commit. Unify on `main` first, as the field-redesign README already says.

---

## What the spikes did not re-open

- **0012.** Dates iff Segments. `durationOf` returns `Duration | undefined`. Skip dateless rows in `fitDataset`. Demotion is a normal Entry with no dates. No UI to date a dateless row.
- **0011.** Decisions 1, 11, 22. Author has not ruled. Consumer values in these stores are numbers on the Entry or inside `props`. The derivation question does not care.
- **#267.** Out of scope.
- **Closed 5 and 6.** Cascade write dropped with a warning. An Entry that starts rolling up drops authored values. History is never cleared. 24 is a follow-up of 6, not a reopen.
- **0014** decisions 9, 12, 13, 16. 16 waits on 22's ruling.
- **0015** decisions 18, 19, 23. 18 prefers 0013 first. This wave does not shrink 18's table by rewriting 0015.
- Unifying the proposed-Field predicate in `src/`.
- Implementing 0013 in `src/`. No demotion in `hierarchy.ts`. No production `toJSON` omission.
- Harness workarounds. No spike needed the harness.

---

## Review, 2026-09-10

A second reader re-ran the suites and opened every file this report cites. **No HEAD quote was wrong. The correction to the plan's branch table is right. The winner's price list was short.**

### What the re-run proved

- The three branches sit on origin at the commits in the table.
- The counts reproduce exactly: 20 + 25 + 33 = **78 passed**.
- **The HEAD trap is real, and the quote is exact.** `view/capability.ts:119` is `if (isRollUpKind(entry.kind) && rollsUp(field)) return DERIVED;`, inside `libraryWriteRule`. It asks nothing about children. `rollup.ts:184` skips a childless parent. A childless `'group'` is therefore DERIVED for writes and never written by the pass. The plan quotes `rollup.ts` and cites `capability.ts:119` as *"already true"*, and never says the two disagree.
- Every other quote checks out: `rollup.ts:69` and `:75` (the kind filter), `rollup.ts:196` (`editProposesField(body.get(parentId), field)` — `body`, not `merged`, exactly as [`refuted.md`](../../shared/refuted.md) item 8 says), `view/renderer-registry.ts:35` (`bar:${kind}`), `fields/field-access.ts:163` (`entryAfterEdit` walks `CORE_FIELDS` as an allow-list), `dataset-state.ts:289-293` (`setRollUpKinds` swaps two references), `hierarchy.autoGroup` defaults to `true`, and [`rulings.md`](../../shared/rulings.md) did refuse `derivesValues`.
- **24 does die under (b).** `plans/01` §2.5 does say `parentId` and `kind` are orthogonal. Both corrections hold.

### What changed

1. **§(b) — the winner retires two published config keys.** `rollUpKinds` and `hierarchy.autoGroup`. The old-Document path is the sharp end. See the lesson in that section.
2. **§(b) — the empty-group call site is now on the page.** §2.5 wrote *"add a phase, then fill it"* around exactly the row this predicate changes.
3. **§(c) — the bundle claim names no product**, against `evidence.md`'s own opening rule.

### What the combined spike must still answer

- **Read an old Document under structure-only.** This ADR writes schema **7**. `rollUpKinds` sits in a fixed key-order contract (`plans/02`), and schema 1's `derivedSpanKinds` already migrates onto it. No spike touched the reader.
- **What replaces `rollUpKinds: 'none'`?** If the answer is (c)'s core boolean opt-out, decision 21 belongs inside 26's cost.
- **What happens to `hierarchy.autoGroup`?** Deleted, or given a job. A live config key that changes nothing is worse than either.
- **Does an empty group's cost cell open?** Type in it, add a child, and watch the value go. Decide whether that is the fix or the price.
- **Unify `capability.ts:119` with `rollup.ts:184` on `main` first.** Every option in this wave leans on that disagreement, and [`refuted.md`](../../shared/refuted.md) item 8 already orders the fix ahead of this ADR.

---

## How to re-run

Root `vitest.workspace.ts` does not include `plans/`. Each spike owns a tiny workspace file. Use the local binary, from a worktree that has `node_modules` (do not symlink it):

```
./node_modules/.bin/vitest run --config vitest.config.ts --workspace plans/field-redesign/0013-what-decides-derivation/spikes/<name>/vitest.workspace.ts plans/field-redesign/0013-what-decides-derivation/spikes/<name>
```

Names: `kind-times-config`, `structure-derives`, `per-entry-flag`.

Parent re-ran on 2026-09-10 after the agents landed: **78 passed** (20 + 25 + 33).

Re-run on 2026-09-10 by the review: **78 passed** (20 + 25 + 33). The three worktrees under `/tmp/FreeGantt-spikes/` still hold their own `node_modules`, so each suite runs there with no install.
