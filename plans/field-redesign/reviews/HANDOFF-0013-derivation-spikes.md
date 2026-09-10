# Handoff — spike ADR 0013's open decision

Give this file to the next session. It is the job, the constraints, and the lessons from the 0011 and 0012 spikes.

**You coordinate. Subagents do the work.** Do not spawn a `work-coordinator` unless the user asks for one.

---

## Model — do not use Sonnet. Use Grok 4.6 high

**Every `implementer` dispatch must set `model: cursor-grok-4.6-high`.**

Do **not** use `inherit`. Do **not** use Sonnet. Do **not** use `claude-sonnet` or any Sonnet slug.

The 0011 wave launched three `inherit` agents first. All three died in seconds on a Sonnet usage limit. The retry with `cursor-grok-4.6-high` did the work. Do not pay that round-trip again.

If `cursor-grok-4.6-high` is unavailable, stop and tell the user. Do not silently fall back to Sonnet. Do not skip the wave.

---

## The job (same instructions as the 0011 and 0012 waves)

1. Look at the first decisions that still need a ruling on the next ADR.
2. Create spikes that test the options and the recommendations.
3. Write the least amount of code that can still fail.
4. Put each spike on a **new branch** we can reopen later.
5. Hunt for issues and lessons. See whether the recommendation holds, or whether a cleaner way exists. Decision 26 has **no numbered rec**. Pick from the call site.
6. Create a **new review dir** under `plans/field-redesign/reviews/` and write the report there.
7. **Test** the spikes until they are green.
8. **Push** the spike branches for later review.
9. Do the work in **subagents**. Coordinate from the parent session.

**Product goal (do not drop this).** A clean, friendly, easy-to-use public API, without an internal ball of mud. Score every option on the call site a person reads aloud, not on how few `if`s the store grew. An option that is smaller inside and larger outside lost on 0012 and 0011. It will lose here too.

Talk in ASD-STE100: active voice, short sentences, one meaning per word.

---

## Which ADR — do not guess 0014 or 0015

Landing order is in `plans/field-redesign/README.md`.

| ADR | Open | Spike now? |
|---|---|---|
| **0012** optional dates | none | **Done.** Recs held. |
| **0011** a consumer value has a home | 1, 11, 22 | **Spiked.** Recs / call-site winners below. Author has **not** ruled. Do not re-spike. Do not close the ADR files. |
| **0013** derivation | **26** (branches 8, 20, 21, 24) | **Yes. This wave.** |
| 0014 plugin-author surface | 9, 12, 13, 16 | No. 16 waits on 22's **ruling**, not on this spike. Not a gate on the rename. |
| 0015 write door | 18, 19, 23 | No. Prefers 0013 first (shrinks 18's `kind` row). |

**0013 is the next ADR that still has a decision to make.** It is one head question: what are the inputs to the derivation predicate, and which of them are stored? Four numbers that used to stand as peers are its branches. At most two branches survive any answer.

Do **not** implement derivation in `src/`. Do **not** omit derived keys from `toJSON` in production. Do **not** add demotion to `hierarchy.ts`. These are throwaway probes of the *open* question.

0013 **code** still waits on 0012 **code** and 0011 **code**. That does not block this spike wave. Spikes do not edit `src/`.

---

## Do not revisit 0012 or 0011

Both spike waves are on origin. Assume their verdicts. Do not re-open them unless a 0013 option needs a different date rule or a different `props` write. It does not.

### 0012 — held

- Report: `plans/field-redesign/reviews/2026-09-09-0012-optional-dates-spikes/README.md`
- Branches: `spike/0012-dates-iff-segments`, `spike/0012-duration-of-dateless`, `spike/0012-dateless-range-and-sort`
- Keep the biconditional. Guard `durationOf` → `Duration | undefined`. Skip dateless rows in `fitDataset`.
- Model `start` / `end` as already optional. Model the un-date verb as already true. Demotion is a **normal Entry with no dates**. Do not rebuild envelope reconciliation.
- Copy one rule, not the store: detect a removal with `'start' in edit`, not `edit.start !== undefined`.

### 0011 — spiked, not ruled

- Report: `plans/field-redesign/reviews/2026-09-09-0011-open-decision-spikes/README.md`
- Branches: `spike/0011-undeclared-props-patch`, `spike/0011-write-shorthand`, `spike/0011-proposed-edit-brand`
- **Decision 1 rec holds.** Records carry, patches name. `add` / JSON keep an undeclared key. `update()` naming one throws. Message names `{ key: 'phase' }`, or write it at ingest.
- **Decision 11:** no numbered rec. Declared-key shorthand won the call site. `update('t1', { start, cost })` is true. Nest lost.
- **Decision 22:** brand holds. Legal extra is `{ props: { risk: 'high' } }`. A wrapper-only brand is a subtype and does not refuse the spread.
- Model `props` as nested storage that **merges**. Do not rebuild replace-vs-merge. Do not rebuild the shorthand debate. Consumer values in the spike may be numbers on the Entry or inside `props` — pick one and stay consistent. The derivation question does not care.
- After the `meta` Field dies, HEAD's `update()` loop throws `UnknownFieldError('props')`. Exempt the namespace if you nest. Still walk inside `props` for declared keys. `"Skip a–c"` is not "do not look inside."
- `{ ...base, ...extra }` on two `props` bags drops one key. Per-key merge is not this wave's question. Do not spend a branch on it.

**Do not start from the 0011 or 0012 spike branches or copy their stores.** Branch from current field-redesign HEAD. Reuse the process (tiny store, own Vitest workspace, API score, `NOTES.md` with HEAD quotes).

---

## The one decision, and its four branches

Read, do not rewrite:

- `docs/adr/0013-what-decides-that-a-row-derives-its-values.md`
- `plans/field-redesign/0013-what-decides-derivation/README.md` (26 and branches 8, 20, 21, 24)
- `plans/field-redesign/shared/refuted.md` **before** you "fix" a type — items 8, 11, 12
- `plans/field-redesign/shared/evidence.md` (promotion without demotion; per-entry pin)
- `plans/field-redesign/shared/rulings.md` (schema counter — 0013 writes **7**)
- Closed 5 and 6 in the 0013 README. **Do not reopen them.** 24 is a follow-up of 6, not a reopen.

A recommendation is not a ruling. 26, 20 and 21 have **no numbered rec**. Probe the three answers. Pick from the call site.

### 26 — what are the inputs, and which of them are stored?

The predicate is two lines in `src/data/rollup.ts`:

```
if (kinds.has(entry.kind)) parents.add(entry.id);   // ~69 and ~75
if (!childIds || childIds.length === 0) continue;   // ~184
```

Two stored inputs and one structural one. `entry.kind` is stored. `kinds` is `rollUpKinds`. Having children is structure.

| | Where derivation comes from | What it costs |
|---|---|---|
| **(a)** | Stored `kind` × `rollUpKinds` — today | Two inputs. A config flip has no ChangeSet row (24). Demotion has to write *some* kind (8) |
| **(b)** | Structure — derives when it has children. `kind` becomes calculated | Deletes 8 and 24. Takes `kind` away from the renderer registry |
| **(c)** | A stored per-entry flag | Ordinary Field row, so undo reverses flag and values. Presupposes an opt-in unless it is a tri-state. Layer answers to ADR 0002 (21) |

**At most two branches survive any answer.** That is why they are not four peer spikes.

| Branch | Question | Survives under |
|---|---|---|
| **8** | What kind does demotion write? | **(a)** and **(c)**. Under (b) there is no target kind |
| **20** | Is `kind` authored at all? | This is the head's first half. Rendering half does not fold in |
| **21** | Which layer owns the per-entry flag? | **(c)** only. ADR 0002 |
| **24** | How does undo reverse a `rollUpKinds` flip? | **(a)** and **(b)**. Under (c)-in-core this dissolves |

Closed, do not reopen:

- **5** — cascade write to a derived cell is dropped, with a warning. Unify the proposed-Field predicate (`refuted.md` item 8) before the build deletes `body`/`merged`. Model that unify if a store needs it. Do not land it in `src/`.
- **6** — an Entry that starts rolling up **drops** authored values and the Rollup recalculates, at all three doors, no error. History is never cleared.

### 8 — what kind does demotion write? (lives on branch (a))

Dates on demotion are settled: a normal Entry with no dates. The **target kind** is open.

- Return every childless rolling-up Entry to `'span'` — overwrites a group a consumer **authored** childless.
- Remember that *we* promoted — a stored marker, a fourth Document thing.
- Stop storing parent-ness — takes `'group'` out of `EntryKind`. That is 20's narrow form. If 20 lands calculated, 8 dissolves.

HEAD: `hierarchy.test.ts:116` *"removing every child demotes nothing."* This ADR overrules promote-only in `plans/01` §2.5.

### 20 — should `kind` be authored? (the head's first half)

No recommendation. Three parts: calculated from structure? Then is a milestone a custom column? That assumes a column can change bar appearance. **Part 3's premise fails at HEAD:** bars are keyed by `kind` (`bar:${kind}`), not by a column. `plans/01` §2.5 says kind is authored; default-on `autoGroup` already contradicts that.

0012 shrinks the rendering half: a demoted Entry is dateless, so it draws no bar.

### 21 — which layer owns the flag? (lives on branch (c))

No recommendation. Core (`data/`, `rollUpKinds` is a DatasetOptions key) vs plugin (ADR 0002 pulled the pin flag out of the record). **The two flags may be one flag. Answer that before the layer.** A core flag must be a Field — `entryAfterEdit` walks `CORE_FIELDS` as an allow-list. An opt-out presupposes an opt-in; a replacement of the axis is a tri-state, not a boolean.

### 24 — undo of a `rollUpKinds` flip (lives on branch (a), dissolves under (c)-in-core)

`ChangeSet.updated` is `FieldUpdated | StoreRowUpdated`. Neither holds a config key. `setRollUpKinds` (~289–293) swaps two references. Two ways out: undo reverses the config beside the values, or the flip's drops stay out of history and the docs say so. Decision 21 would close this at no cost.

---

## Spike split (three branches, three agents)

One answer per branch. Each branch carries the surviving sub-questions. Do not have two agents write the same file.

| Branch | Folder | Question |
|---|---|---|
| `spike/0013-kind-times-config` | `plans/field-redesign/0013-what-decides-derivation/spikes/kind-times-config/` | **(a)** plus 8 and 24 |
| `spike/0013-structure-derives` | `plans/field-redesign/0013-what-decides-derivation/spikes/structure-derives/` | **(b)** plus 20's calculated-kind half |
| `spike/0013-per-entry-flag` | `plans/field-redesign/0013-what-decides-derivation/spikes/per-entry-flag/` | **(c)** plus 21 |

Review dir (parent session writes this **after** the agents report):

`plans/field-redesign/reviews/2026-09-10-0013-derivation-spikes/`

(Use today's date if you run later.)

The three answers can run in parallel. Different folders. The parent synthesizes which answer won on the call site, and which branches die with it.

**(a)** must score demotion's kind (8) and the flip's undo (24) as prices of keeping today's axis, not as separate winners.

**(b)** must score `kind` disappearing from the renderer registry. "Dateless draws no bar" shrinks that cost. It does not delete it for a *dated* parent that still has children.

**(c)** must score core vs plugin, and whether pin + derive-off are one flag, before it scores the call site.

---

## HEAD traps — open the file. A plan's account is a claim.

Quote the real lines in each `NOTES.md`.

**Predicate (all three branches)**

- `src/data/rollup.ts` ~69, ~75 — `if (kinds.has(entry.kind)) parents.add(entry.id)`
- `src/data/rollup.ts` ~79–81 — filtered again with `kinds.has(entry.kind)`
- `src/data/rollup.ts` ~184 — `if (!childIds \|\| childIds.length === 0) continue` — structure already gates the pass
- `src/data/rollup.ts` ~196 — `editProposesField(body.get(parentId), field)` — `body`, not `merged`. `refuted.md` item 8. Unify before the build deletes the split.
- `src/view/capability.ts` ~119 — `if (isRollUpKind(entry.kind) && rollsUp(field)) return DERIVED` — view already uses kind × config. `entries.update()` does not.

**Demotion / kind (a) and (b)**

- `src/data/hierarchy.test.ts:116` — `[S4-A9] removing every child demotes nothing`. Quote the pin. This ADR overrules it.
- `src/view/renderer-registry.ts` ~32–35 — `bar:${kind}`. Calculated `kind` loses the authored bar slot.
- `plans/01` §2.5 — kind is authored, never derived from having children. Default-on `autoGroup` already contradicts. This ADR overrules promote-only.

**Config flip (a) and (b); dissolves under (c)**

- `src/data/dataset-state.ts` ~289–293 — `setRollUpKinds` swaps two references. No ChangeSet.
- `src/model/change-set.ts` ~30–50 — `UpdatedRow = FieldUpdated | StoreRowUpdated`. Neither is a config key.
- `src/api/dataset.ts` ~217 — public `rollUpKinds` setter.

**Flag (c)**

- `src/data/fields/field-access.ts` ~163–169 — `entryAfterEdit` walks `CORE_FIELDS`. An undeclared `Entry` key never survives an overlay. A core flag must be a Field.
- ADR 0002 — the pin flag left `model/` on purpose. A second per-Entry "do not compute" flag is the #7 failure unless they are one flag.

**Omission (closed 0013 rule, needed as fixture)**

- Today's `toJSON` writes a parent's derived `start` / `end` / `cost`. `reportCorrectedRollUps` compares `start` and `end` only. A stale `cost` imports in silence. Model omission if a store round-trips JSON. Do not spend the spike on the report's shape.

**Do not stub the whole Dataset.** Numbers or plain objects as values. No Temporal. No `src/` imports. Types must allow explicit `undefined` under `exactOptionalPropertyTypes` (`key?: T | undefined`).

Each option store: tens of lines, not hundreds. One test file per option is fine.

---

## API score (copy onto every dispatch)

For each option:

1. Write the real call. Read it aloud. Keep it only if the sentence is true.
2. Count the rules a consumer must learn.
3. Count internal special cases (for honesty, not for winning).
4. Do `add`, `update`, and a JSON round-trip answer the same question the same way?
5. Two callers, two surfaces: does an app author meet a hook, a brand, a flag, or `proposedKeys` to get the default?
6. Depth: does complexity hide, or leak as extra verbs, extra errors, extra Document keys, or a comment that says "undo does not reverse this"?

Calls to read aloud (adapt per option):

- `add({ id: 'c', parentId: 'p' })` — p starts deriving. Decision 6 drops p's authored cost. True?
- `remove('c')` when c was the last child — p becomes a normal Entry with no dates. What **kind** is p?
- `dataset.rollUpKinds = ['group', 'milestone']` — then undo. Do the values and the config both reverse?
- `update('p', { cost: 999 })` on a parent that already derives — throws `DerivedFieldNotWritableError`. Closed. Not this spike's to reopen.
- `entry.kind` on a parent — is that a word the author wrote, or a word the library calculated?

A config key whose edits are not undoable is the remainder on 24. Ask whether a person can undo "make this a parent axis".

A calculated `kind` is the remainder on (b). Ask whether `barRenderer: { group: …, mymilestone: … }` still has a key to name.

A second per-Entry flag beside pin is the remainder on (c). Ask whether a person can tell which flag they set.

---

## Mechanics that bit the 0011 and 0012 waves — do these

### Worktrees

From repo root (`adr-0011-field-redesign` or current field-redesign HEAD):

```
git worktree add -b spike/0013-kind-times-config /tmp/FreeGantt-spikes/kind-times-config HEAD
git worktree add -b spike/0013-structure-derives /tmp/FreeGantt-spikes/structure-derives HEAD
git worktree add -b spike/0013-per-entry-flag /tmp/FreeGantt-spikes/per-entry-flag HEAD
```

**Do not symlink `node_modules`.** `pnpm exec` then tries to reinstall into the link and dies. `pnpm install` in each worktree, or run `./node_modules/.bin/vitest` after a copy. 0012 used a symlink and had to skip the pre-commit hook. Do not skip hooks (`--no-verify`) unless the user says so.

Agents work **only** in their worktree. They must not touch `/home/pawel/code/FreeGantt`.

### Tests

Root `vitest.workspace.ts` does **not** include `plans/`. Do **not** edit it. Each spike owns a tiny workspace TS that includes its folder. Copy:

`git show spike/0012-dates-iff-segments:plans/field-redesign/0012-optional-dates/spikes/dates-iff-segments/vitest.workspace.ts`

Run:

```
./node_modules/.bin/vitest run --config vitest.config.ts --workspace plans/field-redesign/0013-what-decides-derivation/spikes/<name>/vitest.workspace.ts plans/field-redesign/0013-what-decides-derivation/spikes/<name>
```

Do not run `pnpm verify` or `verify:full` inside a spike. The parent re-runs the spike tests, then pushes.

`tsconfig.json` `include` has no `plans/`. That is intended. Throwaway code stays out of `pnpm typecheck`.

### Subagents

- Agent: `implementer`.
- **Model: `cursor-grok-4.6-high` on every dispatch.** Not `inherit`. Not Sonnet. See the top of this file.
- Start **one** context watcher in the same turn as the three dispatches:

```
.agents/skills/subagents/watch-agent-context.sh
```

The watcher looks at Claude project transcripts (`*/subagents/agent-*.jsonl`). Cursor Task agents may not write there. Start it anyway. If it times out after 7200s with `stopped after Ns`, that says nothing about the agents — the 0011 watcher did that after the agents had already finished. Do not treat a timeout as a crash. Do not start a second watcher while one is running.

Exit code 1 from the watcher means an agent crossed 200k. Read the printed name. Tell that agent to land a handoff. Do not treat it as a crash.

Put this budget in every dispatch:

> Keep your context under 300k tokens. Report your context usage with each progress update and in your final report. When you pass 200k, stop at the next clean point and write a handoff instead of starting new work. You have until 250k to finish that handoff, so land it properly — do not cut it short.

Each dispatch names: goal, boundary, entry-point files, completion test, worktree path, commit message.

### Git

- Commit **on the spike branch only**.
- Do not amend. Do not force-push. Do not edit `src/`, `docs/adr`, or locked specs.
- Parent session writes the review report on `adr-0011-field-redesign` (or current field-redesign branch).
- Push the three `spike/0013-*` branches with `-u`. **Pre-push runs `pnpm verify:full` (~70s, e2e included).** Push from the field-redesign checkout, not from a worktree whose extra files you do not want prettier to see — unless those files are already formatted.
- Last line of `verify:full` is the answer. Capture with a redirect, not a pipe to `tail`.
- Push the field-redesign branch too if it carries the synthesis report and this handoff. The 0011 wave left two review commits local until the next session asked.

### Review report

Mirror `plans/field-redesign/reviews/2026-09-09-0011-open-decision-spikes/README.md`:

- One-page verdict.
- Table of branches, test counts, commits.
- Per answer (a) (b) (c): won? lost on which call? which branches (8, 20, 21, 24) die with it?
- HEAD trap that the ADR under-named.
- How to re-run.
- What you did **not** reopen (0012, 0011, #267, 5, 6, 0014, 0015).

Vendor product names are legal under `plans/field-redesign/**` (ruled 2026-09-09). They are not legal in `src/**` or `plans/00`–`04`.

---

## Out of scope (stop if a subagent reaches for these)

- Implementing ADR 0013 in `src/`.
- Implementing ADR 0011 or 0012 in `src/`.
- Deleting `FieldSource`, renaming `meta` → `props` in production.
- Closing 0011 decisions 1, 11, 22 in the ADR files. A spike reports. The author rules.
- Closing #267.
- 0014 decisions 9, 12, 13, 16.
- 0015 decisions 18, 19, 23. 18 prefers 0013 first. Do not shrink its table here by rewriting 0015.
- Reopening 5 or 6.
- A UI to date a dateless row (0012 known hole).
- Unifying the proposed-Field predicate in `src/` (independent fix, land on `main` first — `plans/field-redesign/README.md`). Model it in a spike if you need the behaviour.
- Harness workarounds. If a spike "needs" the harness to paper over core, **stop** and report the gap.

---

## Done when

- Three spike branches exist on origin, tests green (parent re-ran them).
- Each branch has `NOTES.md` with HEAD quotes, API scores, and a verdict.
- Review dir on the field-redesign branch has the synthesis report.
- You can say, for 26: **this answer won, and why the others lost on the call site**, and which of 8, 20, 21, 24 die with it.

Do not close the decisions in the ADR files. A spike reports. The author rules.
