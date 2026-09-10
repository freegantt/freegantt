# Handoff — spike ADR 0011's open decisions

Give this file to the next session. It is the job, the constraints, and the lessons from the 0012 spikes.

**You coordinate. Subagents do the work.** Do not spawn a `work-coordinator` unless the user asks for one.

---

## The job (same instructions as the 0012 wave)

1. Look at the first decisions that still need a ruling on the next ADR.
2. Create spikes that test the options and the recommendations.
3. Write the least amount of code that can still fail.
4. Put each spike on a **new branch** we can reopen later.
5. Hunt for issues and lessons. See whether the recommendation holds, or whether a cleaner way exists.
6. Create a **new review dir** under `plans/field-redesign/reviews/` and write the report there.
7. **Test** the spikes until they are green.
8. **Push** the spike branches for later review.
9. Do the work in **subagents**. Coordinate from the parent session.

**Product goal (do not drop this).** A clean, friendly, easy-to-use public API, without an internal ball of mud. Score every option on the call site a person reads aloud, not on how few `if`s the store grew. An option that is smaller inside and larger outside lost on 0012. It will lose here too.

Talk in ASD-STE100: active voice, short sentences, one meaning per word.

---

## Which ADR — do not guess 0013

Landing order is in `plans/field-redesign/README.md`.

| ADR | Open | Spike now? |
|---|---|---|
| **0012** optional dates | none | **Done.** Recommendations held. See below. |
| **0011** a consumer value has a home | **1, 11, 22** | **Yes. This wave.** |
| 0013 derivation | 26 | No. Waits on 0012 *and* 0011. |
| 0014 plugin-author surface | 9, 12, 13, 16 | No. 16 waits on **22**. Not a gate on the rename. |
| 0015 write door | 18, 19, 23 | No. Prefers 0013 first. |

**0011 is the next ADR that still has decisions to make.** It is the ADR that simplifies the API. The three open decisions are one family: what a consumer's write looks like.

Do **not** implement the storage rename. Do **not** delete `FieldSource`. These are throwaway probes of the *open* questions.

---

## Do not revisit 0012's rulings

The 0012 spikes are on origin. The recommendations held.

- Report: `plans/field-redesign/reviews/2026-09-09-0012-optional-dates-spikes/README.md` (may still be **uncommitted** on `adr-0011-field-redesign` — commit it if the working tree still shows `?? plans/field-redesign/reviews/`).
- Branches: `spike/0012-dates-iff-segments`, `spike/0012-duration-of-dateless`, `spike/0012-dateless-range-and-sort`.

**Do not re-spike 0012** unless a 0011 option needs a different date rule. It does not. Model `start`/`end` as already optional. Model the un-date verb as already true. Do not rebuild envelope reconciliation.

**Do not start from the 0012 spike branches or copy their stores.** Those modules answer dates iff Segments, `durationOf`, and `fitDataset`. Decisions 1, 11 and 22 ask what a `props` write looks like. Branch from current field-redesign HEAD, same as 0012 did. Reuse the process (tiny store, own Vitest workspace, API score, `NOTES.md` with HEAD quotes). Leave `biconditional.ts` and the duration/fit files alone.

If an 0011 store also models `update()` with optional core keys, copy one rule, not the store: detect a removal with `'start' in edit`, not `edit.start !== undefined`. HEAD drops `{ start: undefined, end: undefined }` in silence. That is the only 0012 finding that can bite a `props` patch.

0012 **code** still has to land before 0011 **code**. That does not block this spike wave. Spikes do not edit `src/`.

One 0012 leftover is a **docs nit**, not a spike: [`shared/refuted.md`](../shared/refuted.md) item 10 said the shipped weighted mean poisons on NaN. Shipped `isFiniteNumber` already skips NaN. The loud failure is the `"NaN d"` cell. Do not spend a branch on that. One sentence in the 0011 report is enough if you notice it.

---

## The three decisions

Read, do not rewrite:

- `docs/adr/0011-consumer-values-live-in-props.md`
- `plans/field-redesign/0011-consumer-values-in-props/README.md` (open decisions)
- `plans/field-redesign/0011-consumer-values-in-props/types.md` (decision 22 trap)
- `plans/field-redesign/0011-consumer-values-in-props/api.md` (call sites)
- `plans/field-redesign/shared/refuted.md` **before** you "fix" a type
- `plans/field-redesign/shared/evidence.md` (the three patterns, FullCalendar)
- `plans/field-redesign/shared/rulings.md` (registration lock — `fields` is **not** live)

A recommendation is not a ruling. Probe it.

### Decision 1 — may an undeclared key travel in a `props` patch?

**Blocks the merging patch.** Settled yes, then re-opened.

| Pattern | Behaviour |
|---|---|
| Atomic bag (HEAD `meta`) | Undeclared, untyped, **replaced whole** |
| Declared fields | Per-key merge, declaration required |
| Namespaced bag + per-key setter | Undeclared keys kept; one-key setter; **no ChangeSet** |

**Recommendation:** records **carry**, patches **name**. `add` / constructor / `fromJSON` keep an undeclared key. `update()` naming one still throws `UnknownFieldError`. Then merging-patch edits a–c are not needed.

Costs to probe, both real:

- A plugin that writes a key it never registered throws after registration closes.
- `TProps` membership and Field declaration disagree. `update({ props: { phase } })` can type-check and throw. That gap is #267. **Out of scope to close.** The error message should name the fix.

**Claim to keep exact:** nobody ships per-key merge over an undeclared space *inside a transactional store*. FullCalendar writes one undeclared key and pays no undo.

### Decision 11 — does *common case is a shorthand* survive?

Today: `update('t1', { start, cost })`. Nested rec: `update('t1', { start, props: { cost } })`. **Locked spec either way.**

Options to weigh (open-flat is already rejected):

1. **Nest.** Consumer keys only inside `props`.
2. **Declared-key shorthand.** `update('t1', { start, cost })` legal iff `cost` is declared. `props: {}` is the long form. Top level stays closed (`strat` still throws).

**Settle 1 first only if 1 lands "undeclared keys writable".** If 1 stays on the recommendation, 11 does not collide with it. Default 11's spike to 1's recommendation. Add a collision matrix only as a side case.

The first pass charged a live `fields` config. **False.** Registration closes in the constructor. Cross-instance (`cost` legal here, throw there) survives, and it does **not** separate nest vs shorthand, because nested `props: { cost }` throws on the same second Dataset under 1's rec. Weigh what is left: a top level that holds core keys and consumer keys side by side.

### Decision 22 — brand `ProposedEdit`, or diff an extender's keys?

**Gates ADR 0011's `ProposedEdit` type.** Close it with the type, not after. A doc comment is not a third option. 0014 decision 16 waits on this.

The trap: a complete `props` and a `props` patch are the same shape.

```ts
return new Map([[id, { props: { ...request.proposed.get(id)?.props, risk: 'high' } }]]);
```

That spread proposes **every** stored key. The patch already merges, so the spread is never needed.

| Option | What it does | Price |
|---|---|---|
| Brand `ProposedEdit` | Not assignable to the hook return | Brand on a published plugin-author type; one unwrap to read a key |
| Diff against pre-state | Spread stays legal and harmless | A write of the same value stops being a proposal (hook behaviour change) |

---

## Spike split (three branches, three agents)

Same shape as 0012. One question per branch. Do not have two agents write the same file.

| Branch | Folder | Question |
|---|---|---|
| `spike/0011-undeclared-props-patch` | `plans/field-redesign/0011-consumer-values-in-props/spikes/undeclared-props-patch/` | Decision 1 |
| `spike/0011-write-shorthand` | `plans/field-redesign/0011-consumer-values-in-props/spikes/write-shorthand/` | Decision 11 |
| `spike/0011-proposed-edit-brand` | `plans/field-redesign/0011-consumer-values-in-props/spikes/proposed-edit-brand/` | Decision 22 |

Review dir (parent session writes this **after** the agents report):

`plans/field-redesign/reviews/2026-09-09-0011-open-decision-spikes/`

(Use today's date if you run later.)

**Decision 22 can run in parallel with 1.** Different seam. **Decision 11's agent assumes 1's recommendation** unless you serialize them.

---

## HEAD traps — open the file. A plan's account is a claim.

Quote the real lines in each `NOTES.md`.

**Decision 1 / 11**

- `src/data/entry-store.ts:357-359` — `update()` throws `UnknownFieldError` for every top-level key the registry does not have. Today `cost` is top-level. After 0011 the top-level key is `props`. If the inner keys are not checked, `update({ props: { undeclared: 1 } })` compiles and writes.
- `src/data/entry-store.ts:190-195` — `fieldValue` throws `UnknownFieldError` for an undeclared key. Merging-patch (c) would have to stop that.
- `src/data/entry-reader.ts` `toEditReading` — walks `Object.keys(edit)` into `proposed`. A nested `props` bag is one key unless you seed from inside.
- Current `meta` **replaces**. `update({ meta: { cost: 7 } })` drops `owner`. That is the hazard 0011's merge exists to kill. Prove replace vs merge on a two-key bag.
- `src/data/edit-extension.ts:38` `mergeEntryEdits` — `{ ...base, ...extra }`. Once consumer keys live inside `props`, two extenders writing different `props` keys lose one (#197 one level down).
- `src/data/fields/field-access.ts:49` `mergeStoredEdits` — same hole on the commit path. A wrong ChangeSet row is worse than a dropped write.

**Decision 22**

- `src/model/entry.ts:108-110` — `StoredEdit = Partial<Omit<Entry, 'id'>> & { proposedKeys? }`. After the rename, complete `props` and a patch are the same shape. Today's `Instant` vs `InstantInput` asymmetry does **not** cover `props`.
- Seed of `proposedKeys` is key presence (`Object.keys`, `withProposedKeys`), not a value diff.
- `identityExtender` returns an empty `Map`. A tiny extender that spreads `proposed.props` is the fixture.

**Do not stub the whole Dataset.** Numbers or plain objects as values. No Temporal. No `src/` imports. Types must allow explicit `undefined` under `exactOptionalPropertyTypes` (`key?: T | undefined`).

Each option store: tens of lines, not hundreds. One test file per option is fine.

---

## API score (copy onto every dispatch)

For each option:

1. Write the real call. Read it aloud. Keep it only if the sentence is true.
2. Count the rules a consumer must learn.
3. Count internal special cases (for honesty, not for winning).
4. Do `add`, `update`, and a JSON round-trip answer the same question the same way?
5. Two callers, two surfaces: does an app author meet a hook, a brand, or `proposedKeys` to get the default?
6. Depth: does complexity hide, or leak as extra verbs, extra errors, or a comment that says "do not spread"?

A namespace you may fill and never change is the objection on 1. Answer it at the call site: declare `{ key: 'phase' }`, or write it at ingest.

A top level that mixes `start` and `cost` is the remainder on 11. Ask whether a person can see which keys are core.

A spread that reads as *keep everything and add one* is the remainder on 22. If the type lets it through, the comment will not hold it.

---

## Mechanics that bit the 0012 wave — do these

### Worktrees

From repo root (`adr-0011-field-redesign` or current field-redesign HEAD):

```
git worktree add -b spike/0011-undeclared-props-patch /tmp/FreeGantt-spikes/undeclared-props-patch HEAD
git worktree add -b spike/0011-write-shorthand /tmp/FreeGantt-spikes/write-shorthand HEAD
git worktree add -b spike/0011-proposed-edit-brand /tmp/FreeGantt-spikes/proposed-edit-brand HEAD
```

**Do not symlink `node_modules`.** `pnpm exec` then tries to reinstall into the link and dies. `pnpm install` in each worktree, or run `./node_modules/.bin/vitest` after a copy. 0012 used a symlink and had to skip the pre-commit hook. Do not skip hooks (`--no-verify`) unless the user says so.

Agents work **only** in their worktree. They must not touch `/home/pawel/code/FreeGantt`.

### Tests

Root `vitest.workspace.ts` does **not** include `plans/`. Do **not** edit it. Each spike owns a tiny workspace JSON/TS that includes its folder. Run:

```
./node_modules/.bin/vitest run --config vitest.config.ts --workspace plans/field-redesign/0011-consumer-values-in-props/spikes/<name>/workspace.json plans/field-redesign/0011-consumer-values-in-props/spikes/<name>
```

Do not run `pnpm verify` or `verify:full` inside a spike. The parent re-runs the spike tests, then pushes.

`tsconfig.json` `include` has no `plans/`. That is intended. Throwaway code stays out of `pnpm typecheck`.

### Subagents

- Agent: `implementer`.
- If `inherit` hits a Sonnet quota error, retry with `cursor-grok-4.6-high` (or another listed model that works). Do not silently skip the wave.
- Start **one** context watcher in the same turn as the three dispatches:

```
.agents/skills/subagents/watch-agent-context.sh
```

Exit code 1 from the watcher means an agent crossed 200k. Read the printed name. Tell that agent to land a handoff. Do not treat it as a crash.

Put this budget in every dispatch:

> Keep your context under 300k tokens. Report your context usage with each progress update and in your final report. When you pass 200k, stop at the next clean point and write a handoff instead of starting new work. You have until 250k to finish that handoff, so land it properly — do not cut it short.

Each dispatch names: goal, boundary, entry-point files, completion test, worktree path, commit message.

### Git

- Commit **on the spike branch only**.
- Do not amend. Do not force-push. Do not edit `src/`, `docs/adr`, or locked specs.
- Parent session writes the review report on `adr-0011-field-redesign` (or current field-redesign branch).
- Push the three `spike/0011-*` branches with `-u`. **Pre-push runs `pnpm verify:full` (~70s, e2e included).** Push from the field-redesign checkout, not from a worktree whose extra files you do not want prettier to see — unless those files are already formatted.
- Last line of `verify:full` is the answer. Capture with a redirect, not a pipe to `tail`.

### Review report

Mirror `plans/field-redesign/reviews/2026-09-09-0012-optional-dates-spikes/README.md`:

- One-page verdict.
- Table of branches, test counts, commits.
- Per decision: recommendation hold? cleaner option? HEAD trap that the ADR under-named?
- How to re-run.
- What you did **not** reopen (0012, #267, 0014/0015).

Vendor product names are legal under `plans/field-redesign/**` (ruled 2026-09-09). They are not legal in `src/**` or `plans/00`–`04`.

---

## Out of scope (stop if a subagent reaches for these)

- Implementing ADR 0011 in `src/`.
- Deleting `FieldSource`, renaming `meta` → `props` in production.
- Closing #267 (declared-key inference from a `fields` literal).
- 0014 decisions 9, 12, 13, 16 (16 waits on 22's *ruling*, not on this spike's code).
- 0015 write-door refusals.
- 0013 derivation / rolling-up parent `props` exception.
- A UI to date a dateless row (0012 known hole).
- Harness workarounds. If a spike "needs" the harness to paper over core, **stop** and report the gap.

---

## Done when

- Three spike branches exist on origin, tests green (parent re-ran them).
- Each branch has `NOTES.md` with HEAD quotes, API scores, and a verdict.
- Review dir on the field-redesign branch has the synthesis report.
- You can say, for 1, 11, and 22: **the recommendation holds**, or **this option won, and why the rec lost on the call site**.

Do not close the decisions in the ADR files. A spike reports. The author rules.
