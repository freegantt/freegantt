# Handoff — spike ADR 0015's open decisions

Give this file to the next session. It is the job, the constraints, and the lessons from the 0012, 0011 and 0013 spikes.

**You coordinate. Subagents do the work.** Do not spawn a `work-coordinator` unless the user asks for one.

---

## Model — do not use Sonnet. Use Grok 4.6 high

**Every `implementer` dispatch must set `model: cursor-grok-4.6-high`.**

Do **not** use `inherit`. Do **not** use Sonnet. Do **not** use `claude-sonnet` or any Sonnet slug.

The 0011 wave launched three `inherit` agents first. All three died in seconds on a Sonnet usage limit. The retry with `cursor-grok-4.6-high` did the work. 0013 used it from the first dispatch. Do not pay that round-trip again.

If `cursor-grok-4.6-high` is unavailable, stop and tell the user. Do not silently fall back to Sonnet. Do not skip the wave.

---

## The job (same instructions as the 0011, 0012 and 0013 waves)

1. Look at the first decisions that still need a ruling on the next ADR.
2. Create spikes that test the options and the recommendations.
3. Write the least amount of code that can still fail.
4. Put each spike on a **new branch** we can reopen later.
5. Hunt for issues and lessons. See whether the recommendation holds, or whether a cleaner way exists. Decisions **18** and **23** have **no numbered rec**. Decision **19** has one: probe `beforeChange` first. Pick from the call site.
6. Create a **new review dir** under `plans/field-redesign/reviews/` and write the report there.
7. **Test** the spikes until they are green.
8. **Push** the spike branches for later review.
9. Do the work in **subagents**. Coordinate from the parent session.

**Product goal (do not drop this).** A clean, friendly, easy-to-use public API, without an internal ball of mud. Score every option on the call site a person reads aloud, not on how few `if`s the store grew. An option that is smaller inside and larger outside lost on 0012, 0011 and 0013. It will lose here too.

Talk in ASD-STE100: active voice, short sentences, one meaning per word.

---

## Which ADR — do not guess 0014

Landing order is in `plans/field-redesign/README.md`.

| ADR | Open | Spike now? |
|---|---|---|
| **0012** optional dates | none | **Done.** Recs held. |
| **0011** a consumer value has a home | 1, 11, 22 | **Spiked.** Recs / call-site winners below. Author has **not** ruled. Do not re-spike. Do not close the ADR files. |
| **0013** derivation | 26 (branches 8, 20, 21, 24) | **Spiked.** Call-site winner below. Author has **not** ruled. Do not re-spike. Do not close the ADR files. |
| 0014 plugin-author surface | 9, 12, 13, 16 | **No.** 16 waits on 22's **ruling**, not on a spike. 9 and 12 are one decision; do not split them off here. Not a gate on the rename. |
| **0015** write door | **18, 19, 23** | **Yes. This wave.** |

**0015 is the next ADR that still has decisions to make, and that 0013 unblocked.** It is one question: how strict is `entries.update()`? Three numbers. **Answer 19 first, then 23.** 18 is the posture of an absent `editable`.

The 0011 and 0012 reviews say the author runs one **combined** 0011+0012 spike before any of those decisions move. **That is not this wave.** If the author asks for it in the session, stop and do that instead. Do not start it on your own.

Do **not** implement the editable arm in `src/`. Do **not** wire `entries.update()` to `Field.editable` in production. Do **not** delete `CORE_FIELD_OVERRIDABLE_KEYS` in production. These are throwaway probes of the *open* questions.

0015 **code** still waits on 0011 **code** (the resolver move) and 0013 **code** (the derived arm). That does not block this spike wave. Spikes do not edit `src/`.

---

## Do not revisit 0012, 0011 or 0013

All three spike waves are on origin. Assume their verdicts. Do not re-open them unless a 0015 option needs a different date rule, a different `props` write, or a calculated `kind`. It does not.

### 0012 — held

- Report: `plans/field-redesign/reviews/2026-09-09-0012-optional-dates-spikes/README.md`
- Branches: `spike/0012-dates-iff-segments`, `spike/0012-duration-of-dateless`, `spike/0012-dateless-range-and-sort`
- Keep the biconditional. Guard `durationOf` → `Duration | undefined`. Skip dateless rows in `fitDataset`.
- Model `start` / `end` as already optional. Detect a removal with `'start' in edit`, not `edit.start !== undefined`.

### 0011 — spiked, not ruled

- Report: `plans/field-redesign/reviews/2026-09-09-0011-open-decision-spikes/README.md`
- Branches: `spike/0011-undeclared-props-patch`, `spike/0011-write-shorthand`, `spike/0011-proposed-edit-brand`
- **Decision 1 rec holds.** Records carry, patches name. `add` / JSON keep an undeclared key. `update()` naming one throws.
- **Decision 11:** declared-key shorthand won. `update('t1', { start, cost })` is true. Nest lost.
- **Shorthand ships a fourth write-door refusal.** `update('t1', { cost: 7, props: { cost: 8 } })` names `cost` twice and throws. **0015 owns that refusal** — name it, type it, message it. Do not reopen whether shorthand wins. Do not fold "drop the long form at `update()`" in here; the 0011 report parked that in the combined spike.
- **Decision 22:** brand holds. Legal extra is `{ props: { risk: 'high' } }`. 0014 decision 16 waits on the **ruling**.
- Model `props` as nested storage that **merges**. Consumer values may be numbers on the Entry or inside `props` — pick one and stay consistent.
- After the `meta` Field dies, HEAD's `update()` loop throws `UnknownFieldError('props')`. Exempt the namespace if you nest. Still walk inside `props` for declared keys.

### 0013 — spiked, not ruled. This is the finding 0015 was waiting for.

- Report: `plans/field-redesign/reviews/2026-09-10-0013-derivation-spikes/README.md`
- Branches: `spike/0013-kind-times-config`, `spike/0013-structure-derives`, `spike/0013-per-entry-flag`
- **Decision 26 call-site winner: a row derives when it has children. `kind` stays authored.** That is unbundled (b), not the README's (b). Calculated `kind` lost on `barRenderer: { group, mymilestone }`.
- **18's `kind` row does not shrink.** `update(id, { kind: 'milestone' })` still exists. Argue 18 against a **three-row** table, not two. The 0015 README's "may shrink" sentence is the preference that this spike already spent. Do not delete the row. Do not rewrite 0015's README.
- **Do not add a fourth `followChildren` row.** 0013 said 21 does not gate 26. A core boolean overlay is a later escape hatch. 18 does not grow it here.
- Derived writes still throw `DerivedFieldNotWritableError`. Closed on 0013. Model the throw. Do not reopen 5 or 6.
- HEAD trap 0013 named and 0015 inherits: `capability.ts:119` does not ask for children. A childless `'group'` is already `DERIVED` at the grid. `entries.update()` does not consult `editable` *or* derived today.

**Do not start from the 0011, 0012 or 0013 spike branches or copy their stores.** Branch from current field-redesign HEAD. Reuse the process (tiny store, own Vitest workspace, API score, `NOTES.md` with HEAD quotes).

---

## The three decisions

Read, do not rewrite:

- `docs/adr/0015-what-the-write-door-refuses.md`
- `plans/field-redesign/0015-write-door/README.md` (18, 19, 23)
- `plans/field-redesign/shared/rulings.md` — **`ComputedFieldCannotBeWrittenError`**: one name, two doors; check **`compute` before `editable`**. Decision 18 stays open. The ruling fixes the order, not the answer.
- `plans/field-redesign/shared/refuted.md` **before** you "fix" a type
- Closed: `editable: false` refuses `entries.update()`. New error: `FieldNotEditableError`. **Do not reopen that ruling.**

A recommendation is not a ruling. Probe it.

### 19 — what replaces `{ key: 'start', editable: false }` at the data door? **Answer first.**

**Recommendation: accept the loss, and check `beforeChange` first.** If `beforeChange` covers "this Dataset cannot write `start` through the API", 19 closes at no cost and the override deletion proceeds.

Three shapes:

1. **Keep the override for `editable` alone** — cheapest, and it keeps the silent window the deletion exists to close.
2. **A Dataset-level `readOnlyFields`** — a second way to say what `editable` says. Breaks *one name per concept*.
3. **Accept the loss (rec).** Core keys stay writable through `entries.update()`. A consumer who wants them locked vetoes in `beforeChange`.

`interactions.edit` is view-level. `data/` may not import it (`plans/01` §1). It cannot stand in for a data-level gate. `capability.ts:202-207` already lets `interactions.edit: true` open a locked Field **at the grid**. That is not this door.

**Probe `beforeChange` before you design (1) or (2).** The rec says so.

### 23 — does a consumer *declaration* on a core key throw? **After 19.**

The **value** case is closed on 0011: `props: { start: … }` is a warning, the value is ignored, the core definition wins. What is open is `fields: [{ key: 'start', editable: false }]`.

- **Throw.** A declaration is hand-written code. The warning ruling's reason (upstream data must not break the page) does not reach a `fields` array the consumer typed.
- **Warn.** One key, two doors, two answers is the split I14 exists to close. A generated `fields` array from the same upstream schema is back in the data case.

**If 19 keeps the override, 23 is already answered by it.** If 19 accepts the loss, this declaration has nothing left to express and a throw costs nothing. Probe **both** 19 answers. Do not wait for the 19 agent to finish — score the fork.

No recommendation. The author asked to be asked.

### 18 — does an *absent* `editable` also refuse `entries.update()`?

No recommendation. The choice is a posture, not a deduction.

`Field.editable` is `boolean | undefined`. `capability.ts:120` reads `field.editable === true ? WRITABLE : NOT_WRITABLE` — absent and `false` are one answer at the grid. The closed ruling says `editable: false` refuses `update()`. It does not say what **absent** does.

Three shapes:

1. **Copy the view rule.** `update()` refuses unless a Field declares `editable: true`. One rule, one resolver. The price: `update(id, { props: { owner: 'Sam' } })` starts throwing for every Field that did not opt in. And three **structural** calls that have nothing to do with a grid:

   | Call | Field | Today |
   |---|---|---|
   | `update(id, { parentId })` | `parentId` | no `editable`. Live at `harness/main.ts:181` and `harness/hierarchy.ts:254` |
   | `update(id, { segments: [...] })` | `segments` | no `editable`. #212, ADR 0010 |
   | `update(id, { kind: 'milestone' })` | `kind` | no `editable`. **Still a live call** — 0013 kept authored `kind` |

   Copying the view rule means declaring `editable: true` on `parentId` — a Field with **no column**. That is the tell that `editable` is being asked to do two jobs.

2. **Split absent from `false`.** Absent means the API may write; `false` means refused everywhere. Today's writes keep working. The price: `boolean | undefined` carries three meanings at one door and two at another.

3. **A second word on `Field` names the API.** `editable` stays the grid's answer. That is a new key. It needs a justification against *one config tree per job*.

`parentId` and `segments` **keep their declarations.** Three mechanisms read them out of the registry (`entryAfterEdit`, `widenSegmentsToEnvelope`, `segmentsEqual`). Undeclaring them is not an option.

---

## Spike split (three branches, three agents)

One decision per branch. 23 scores both answers to 19. Do not have two agents write the same file.

| Branch | Folder | Question |
|---|---|---|
| `spike/0015-beforechange-override` | `plans/field-redesign/0015-write-door/spikes/beforechange-override/` | **19** — probe `beforeChange` first, then the three shapes |
| `spike/0015-core-key-declaration` | `plans/field-redesign/0015-write-door/spikes/core-key-declaration/` | **23** — throw vs warn, against both 19 answers |
| `spike/0015-absent-editable` | `plans/field-redesign/0015-write-door/spikes/absent-editable/` | **18** — copy view / split absent / second word. Three-row table. Name the shorthand double-write too |

Review dir (parent session writes this **after** the agents report):

`plans/field-redesign/reviews/2026-09-10-0015-write-door-spikes/`

(Use today's date if you run later.)

The three can run in parallel. Different folders. The parent synthesizes. 23's report must say what happens if 19 keeps the override **and** what happens if 19 accepts the loss.

**19** must not design `readOnlyFields` until the `beforeChange` store has answered: can a person lock `start` through the API with the door that already exists?

**18** must score `update(id, { kind })` as a live call. 0013 did not delete it.

**23** must not reopen the 0011 **value** ruling (`props: { start }` is a warning).

---

## HEAD traps — open the file. A plan's account is a claim.

Quote the real lines in each `NOTES.md`.

**The plan cites `hierarchy.ts:254`. That path is wrong.**

- `src/data/hierarchy.ts` is 59 lines. It writes `{ kind: 'group' }` on promotion (`:55`). It does not call `entries.update({ parentId })`.
- The live app-author calls are `harness/main.ts:181` and **`harness/hierarchy.ts:254`**. Open those. Do not hunt line 254 in `src/data/hierarchy.ts`.

**`update()` does not read `editable`**

- `src/data/entry-store.ts:357-359` — `for (const field of Object.keys(edit)) { if (!this.#registry.has(field)) throw new UnknownFieldError(field, 'entries.update'); }` — exists arm only.
- `src/view/capability.ts:120` — `return field.editable === true ? WRITABLE : NOT_WRITABLE;` — the one place in `src/` that reads `Field.editable`.
- `src/model/field.ts:133` — `editable?: boolean;` Comment says default `false`, and claims I14. The API door does not honour it yet.

**Override**

- `src/data/fields/field-registry.ts:101` — `CORE_FIELD_OVERRIDABLE_KEYS = ['editable']`
- `:183-187` — a consumer declaration on a core key goes through `#mergeCoreFieldOverride`, not `DuplicateFieldKeyError`
- `:211-226` — merges `editable` only. Never reads `source`. 0011 deletes `FieldSource` around it.
- `src/data/fields/field-registry.test.ts:132` — `{ key: start, editable: false } merges onto the core Field`

**Which core Fields are `editable: true`**

- `src/data/fields/core-fields.ts:66` `name`, `:79` `start`, `:89` `end` — the only three.
- `:93-108` `kind`, `parentId`, `segments` — no `editable`. `meta` neither. `duration` is `compute`.

**`beforeChange`**

- `src/data/transaction.ts:188` — `data.bus.emit('beforeChange', { changeSet, refuse: note.refuse })`
- Returning `false` or calling `refuse(reason)` throws `MutationCancelledError` and raises a report. The store is unchanged. See `transaction.test.ts` veto cases ~430-570.

**`interactions.edit` is not a data gate**

- `src/view/capability.ts:202-207` — if `interactions.edit` answers, it **wins** over `libraryWriteRule`. `true` opens a Field the library locked. That is the grid. 19 must not reuse it at `update()`.

**Promotion writes `kind` without `entries.update()`**

- `src/data/hierarchy.ts:55` — `result.set(parentId, { kind: 'group' })`. If 18 copies the view rule, the public `update({ kind })` throws and autoGroup still writes `kind` internally. Score that split. Do not treat promotion as `entries.update()`.

**0011 leftover that 0015 names**

- After `meta` dies, `Object.keys(edit)` on `{ props: { cost } }` is `['props']`. HEAD throws `UnknownFieldError('props')`. Exempt the namespace. Still walk inside.

**Do not stub the whole Dataset.** Numbers or plain objects as values. No Temporal. No `src/` imports. Types must allow explicit `undefined` under `exactOptionalPropertyTypes` (`key?: T | undefined`).

Each option store: tens of lines, not hundreds. One test file per option is fine. Decision 19's `beforeChange` store may be the one that needs a tiny event bus. Keep it tiny.

---

## API score (copy onto every dispatch)

For each option:

1. Write the real call. Read it aloud. Keep it only if the sentence is true.
2. Count the rules a consumer must learn.
3. Count internal special cases (for honesty, not for winning).
4. Do `add`, `update`, and a JSON round-trip answer the same question the same way?
5. Two callers, two surfaces: does an app author meet a hook, a brand, a flag, or `proposedKeys` to get the default?
6. Depth: does complexity hide, or leak as extra verbs, extra errors, extra Document keys, or a comment that says "the API does not honour this"?

Calls to read aloud (adapt per option):

- `update('t1', { parentId: 'p' })` — reparent. True today. Still true?
- `update('t1', { segments: [...] })` — Segment write. #212. Still true?
- `update('t1', { kind: 'milestone' })` — **still a real call.** 0013 kept authored `kind`.
- `update('t1', { owner: 'Sam' })` or `update('t1', { props: { owner: 'Sam' } })` — declared Field, no `editable`. Grid says no. API says?
- `fields: [{ key: 'start', editable: false }]` then `update('t1', { start })` — closed ruling: throws `FieldNotEditableError`. Model it. Do not reopen it.
- `dataset.on('beforeChange', ({ changeSet }) => …)` — can this lock `start` for every write, including a bar drag that commits through `update()`? 19's rec lives or dies here.
- `fields: [{ key: 'start', editable: false }]` at construction — throw or warn? That is 23.
- `update('t1', { cost: 7, props: { cost: 8 } })` — shorthand's double-name throw. 0015 names it. Do not reopen 11.

A data library whose write door is closed by default is the remainder on 18's copy-the-view-rule. Ask whether `update({ parentId })` is a grid question.

A second word on `Field` is the remainder on 18's third shape. Ask whether a person can tell `editable` from the new key.

`beforeChange` that a person must write on every Dataset to lock `start` is the remainder on 19's rec. Ask whether that sentence is true for an app author, not only for a plugin author.

---

## Mechanics that bit the 0011, 0012 and 0013 waves — do these

### Worktrees

Parent session creates these **before** dispatch, from repo root (`adr-0011-field-redesign` or current field-redesign HEAD), then `pnpm install` in each. 0013 did this and the agents started clean.

```
git worktree add -b spike/0015-beforechange-override /tmp/FreeGantt-spikes/beforechange-override HEAD
git worktree add -b spike/0015-core-key-declaration /tmp/FreeGantt-spikes/core-key-declaration HEAD
git worktree add -b spike/0015-absent-editable /tmp/FreeGantt-spikes/absent-editable HEAD
```

Existing 0011 / 0012 / 0013 worktrees under `/tmp/FreeGantt-spikes/` stay. Do not reuse them. Do not write into them.

**Do not symlink `node_modules`.** `pnpm exec` then tries to reinstall into the link and dies. `pnpm install` in each worktree (the store makes this ~1s). 0012 used a symlink and had to skip the pre-commit hook. Do not skip hooks (`--no-verify`) unless the user says so.

Agents work **only** in their worktree. They must not touch `/home/pawel/code/FreeGantt`. They may *read* HEAD sources from the worktree.

### Tests

Root `vitest.workspace.ts` does **not** include `plans/`. Do **not** edit it. Each spike owns a tiny workspace TS that includes its folder. Copy:

`git show spike/0013-kind-times-config:plans/field-redesign/0013-what-decides-derivation/spikes/kind-times-config/vitest.workspace.ts`

Run:

```
./node_modules/.bin/vitest run --config vitest.config.ts --workspace plans/field-redesign/0015-write-door/spikes/<name>/vitest.workspace.ts plans/field-redesign/0015-write-door/spikes/<name>
```

Do not run `pnpm verify` or `verify:full` inside a spike. The parent re-runs the spike tests, then pushes.

`tsconfig.json` `include` has no `plans/`. That is intended. Throwaway code stays out of `pnpm typecheck`.

### Subagents

- Agent: `implementer`.
- **Model: `cursor-grok-4.6-high` on every dispatch.** Not `inherit`. Not Sonnet. See the top of this file.
- Start **one** context watcher in the same turn as the three dispatches:

```
.agents/skills/subagents/watch-agent-context.sh /home/pawel/.cursor/projects/home-pawel-code-FreeGantt
```

The watcher looks at `*/subagents/agent-*.jsonl`. Cursor Task agents may not write there. Start it anyway. If it times out after 7200s with `stopped after Ns`, that says nothing about the agents — the 0011 and 0013 watchers did that after the agents had already finished. Do not treat a timeout as a crash. Do not start a second watcher while one is running.

Exit code 1 from the watcher means an agent crossed 200k. Read the printed name. Tell that agent to land a handoff. Do not treat it as a crash.

Put this budget in every dispatch:

> Keep your context under 300k tokens. Report your context usage with each progress update and in your final report. When you pass 200k, stop at the next clean point and write a handoff instead of starting new work. You have until 250k to finish that handoff, so land it properly — do not cut it short.

Each dispatch names: goal, boundary, entry-point files, completion test, worktree path, commit message.

**0013 unbundled a README that named two changes as one object.** "Has children" and "kind becomes calculated" were two calls. Do the same here if an option bundles a grid rule with an API rule. Score each call.

### Git

- Commit **on the spike branch only**.
- Do not amend. Do not force-push. Do not edit `src/`, `docs/adr`, or locked specs.
- Parent session writes the review report on `adr-0011-field-redesign` (or current field-redesign branch).
- Push the three `spike/0015-*` branches **and** the field-redesign branch that carries the synthesis **in one** `git push -u origin …`. **Pre-push runs `pnpm verify:full` once (~72s on 2026-09-10, e2e included).** Push from the field-redesign checkout, not from a worktree.
- Last line of `verify:full` is the answer. Capture with a redirect, not a pipe to `tail`.
- Do **not** stage the dirty 0011 / 0012 review files if they are still modified on the working tree. Those are another session's "evidence is not accepted" pass. This wave only adds the 0015 review dir and this handoff.

### Review report

Mirror `plans/field-redesign/reviews/2026-09-10-0013-derivation-spikes/README.md`:

- One-page verdict.
- Table of branches, test counts, commits.
- Per decision 19, 23, 18: won? lost on which call?
- HEAD trap that the ADR under-named. Start with `hierarchy.ts:254` vs `harness/hierarchy.ts:254`.
- How to re-run.
- What you did **not** reopen (0012, 0011, 0013, #267, 5, 6, 0014, the `editable: false` ruling).

Vendor product names are legal under `plans/field-redesign/**` (ruled 2026-09-09). They are not legal in `src/**` or `plans/00`–`04`.

---

## Out of scope (stop if a subagent reaches for these)

- Implementing ADR 0015 in `src/`. Wiring `update()` to `editable`. Deleting the override in production.
- Implementing ADR 0011, 0012 or 0013 in `src/`.
- Deleting `FieldSource`, renaming `meta` → `props` in production.
- Closing 0011 decisions 1, 11, 22 in the ADR files. A spike reports. The author rules.
- Closing 0013 decision 26 in the ADR files. Same.
- Closing #267.
- 0014 decisions 9, 12, 13, 16. 16 waits on 22's ruling.
- The combined 0011+0012 spike (type-check the two stores, brand the whole `ProposedEdit`, drop the long form at `update()`, `desc` sort). Author-requested elsewhere. Not this wave.
- Reopening 5 or 6. Reopening `editable: false` refuses `update()`.
- A UI to date a dateless row (0012 known hole).
- Unifying the proposed-Field predicate in `src/` (independent fix, land on `main` first).
- Adding `followChildren` to 18's table.
- Harness workarounds. If a spike "needs" the harness to paper over core, **stop** and report the gap.

---

## Done when

- Three spike branches exist on origin, tests green (parent re-ran them).
- Each branch has `NOTES.md` with HEAD quotes, API scores, and a verdict.
- Review dir on the field-redesign branch has the synthesis report.
- You can say, for 19: **does `beforeChange` cover the lock, or does the override stay**; for 23: **throw or warn, and what 19 does to that answer**; for 18: **absent means refuse, or absent means the API may write**, and whether `update({ parentId })` / `update({ kind })` stayed true.

Do not close the decisions in the ADR files. A spike reports. The author rules.
