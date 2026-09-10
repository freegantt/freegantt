# The spike-wave playbook

**How the field redesign ran a spike wave.** Four waves used this: 0012, 0011, 0013 and 0015, plus one combined wave. It replaces three per-wave handoff files that repeated it with the wave number changed.

**Read this when you run a new wave.** The verdict of each wave that already ran is its own dir under [`.`](.). A wave's own decisions, traps and call list are **not** here — they go in the dispatch you write, because they go stale. This file holds only what did not change between waves.

**A spike reports. The author rules.** A spike never closes a decision in an ADR file, and never edits `src/`.

---

## The job

1. Read the ADR's open decisions in [`../README.md`](../README.md)'s landing order. Do not guess which ADR is next.
2. Create spikes that test the options and the recommendations.
3. Write the least amount of code that can still fail.
4. Put each spike on a **new branch** we can reopen later.
5. Hunt for issues and lessons. See whether the recommendation holds, or whether a cleaner way exists.
6. Create a **new review dir** under `plans/field-redesign/reviews/<date>-<adr>-<topic>/` and write the report there.
7. **Test** the spikes until they are green.
8. **Push** the spike branches for later review.
9. Do the work in **subagents**. Coordinate from the parent session. Do not spawn a `work-coordinator` unless the user asks for one.

**Product goal — do not drop this.** A clean, friendly, easy-to-use public API, without an internal ball of mud. Score every option on the call site a person reads aloud, not on how few `if`s the store grew. **An option that is smaller inside and larger outside lost on every wave.** It will lose on yours too.

Talk in ASD-STE100: active voice, short sentences, one meaning per word.

## Model — do not use Sonnet

**Every `implementer` dispatch sets `model: cursor-grok-4.6-high`.** Not `inherit`. Not any Sonnet slug.

The 0011 wave launched three `inherit` agents first. All three died in seconds on a Sonnet usage limit. The retry with `cursor-grok-4.6-high` did the work. Do not pay that round-trip again. If that model is unavailable, stop and tell the user. Do not fall back in silence. Do not skip the wave.

## The split — one decision per branch

One decision per branch, one folder per branch, one agent per branch. Two agents must never write one file. The branches run in parallel. The parent synthesizes.

| Piece | Where |
|---|---|
| branch | `spike/<adr>-<topic>` |
| spike folder | `plans/field-redesign/<adr-folder>/spikes/<topic>/` |
| review dir | `plans/field-redesign/reviews/<date>-<adr>-<topic>/` |

**Unbundle before you dispatch.** The 0013 wave found a README that named two changes as one object. Score each call on its own.

## Open the file — a plan's account is a claim

**Quote the real lines in each spike's `NOTES.md`.** Every wave found at least one line the ADR cited wrongly: a path that pointed at `src/` when the call lived in `harness/`, a comment that claimed an invariant the door does not honour. `CLAUDE.md` carries the rule. A wave that trusts the plan reports a claim, not a finding.

**Do not stub the whole Dataset.** Numbers or plain objects as values. No Temporal. No `src/` imports. Types must allow an explicit `undefined` under `exactOptionalPropertyTypes` (`key?: T | undefined`). Each option store is tens of lines, not hundreds. One test file per option is fine.

## API score — copy onto every dispatch

For each option:

1. Write the real call. Read it aloud. Keep it only if the sentence is true.
2. Count the rules a consumer must learn.
3. Count internal special cases — for honesty, not for winning.
4. Do `add`, `update`, and a JSON round-trip answer the same question the same way?
5. Two callers, two surfaces: does an app author meet a hook, a brand, a flag, or `proposedKeys` to get the default behaviour?
6. Depth: does complexity hide, or does it leak as extra verbs, extra errors, extra Document keys, or a comment that says *the API does not honour this*?

Then name each option's **remainder** — the one sentence a person still has to accept if that option wins. An option with no stated remainder was not scored.

## Mechanics

### Worktrees

The parent session creates these **before** dispatch, from the repo root at the current field-redesign HEAD. Then run `pnpm install` in each.

```
git worktree add -b spike/<adr>-<topic> /tmp/FreeGantt-spikes/<topic> HEAD
```

Worktrees from earlier waves stay. Do not reuse them. Do not write into them.

**Do not symlink `node_modules`.** `pnpm exec` then tries to reinstall into the link and dies. `pnpm install` in each worktree costs about a second, because of the store. The 0012 wave used a symlink and had to skip the pre-commit hook. Do not skip hooks (`--no-verify`) unless the user says so.

Agents work **only** in their worktree. They never touch the main checkout. They may *read* HEAD sources from the worktree.

### Tests

Root `vitest.workspace.ts` does **not** include `plans/`, and `tsconfig.json` `include` has no `plans/`. **That is by design — throwaway code stays out of `pnpm typecheck` and out of CI.** Do not edit either file. Each spike owns a tiny workspace file that includes its own folder.

```
./node_modules/.bin/vitest run --config vitest.config.ts \
  --workspace plans/field-redesign/<adr-folder>/spikes/<topic>/vitest.workspace.ts \
  plans/field-redesign/<adr-folder>/spikes/<topic>
```

Run it from the repo root, so a `tsc` probe finds `node_modules/.bin/tsc`. Do not run `pnpm verify` or `verify:full` inside a spike. The parent re-runs the spike tests, then pushes.

**Spike evidence rots invisibly, because nothing in CI runs it.** [`../shared/prose-sweep.md`](../shared/prose-sweep.md)'s spike gate is what ends that: at acceptance, the evidence is green or it is deleted.

### Subagents

- Agent: `implementer`. Model: `cursor-grok-4.6-high` on every dispatch.
- Each dispatch names: goal, boundary, entry-point files, completion test, worktree path, commit message.
- Start **one** context watcher in the same turn as the dispatches:

```
.agents/skills/subagents/watch-agent-context.sh /home/pawel/.cursor/projects/home-pawel-code-FreeGantt
```

The watcher reads `*/subagents/agent-*.jsonl`. Cursor Task agents may not write there. Start it anyway. A timeout that prints `stopped after Ns` says nothing about the agents — two waves saw that after the agents had already finished. **Do not read a timeout as a crash.** Do not start a second watcher while one runs. Exit code 1 means an agent crossed 200k; read the printed name and tell that agent to land a handoff.

Put this budget in every dispatch:

> Keep your context under 300k tokens. Report your context usage with each progress update and in your final report. When you pass 200k, stop at the next clean point and write a handoff instead of starting new work. You have until 250k to finish that handoff, so land it properly — do not cut it short.

### Git

- Commit **on the spike branch only**. Do not amend. Do not force-push.
- Never edit `src/`, `docs/adr/`, or the locked specs from a spike.
- The parent session writes the review report on the field-redesign branch, not in a worktree.
- Push the spike branches **and** the branch carrying the synthesis in one `git push -u origin …`. Pre-push runs `pnpm verify:full` once, e2e included.
- Do not stage another session's dirty files.

### The review report

- One-page verdict at the top.
- A table of branches, test counts and commit SHAs.
- Per decision: won, or lost on which call?
- The HEAD trap the ADR under-named.
- How to re-run.
- What you did **not** reopen.

Vendor product names are legal under `plans/field-redesign/**` (ruled 2026-09-09). They stay illegal in `src/**` and `plans/00`–`04`.

## Out of scope — stop if a subagent reaches for one

- Implementing any of these ADRs in `src/`. A spike is throwaway.
- Closing a decision in an ADR file, or in `docs/adr/`.
- Reopening a closed decision. [`../shared/refuted.md`](../shared/refuted.md) holds what is already refused. **Check it before you spike an idea.**
- Harness workarounds. If a spike "needs" the harness to paper over core, **stop and report the gap** — `CLAUDE.md`'s stop rule.

## Done when

- The spike branches are on origin, and the parent re-ran their tests green.
- Each branch has a `NOTES.md` with HEAD quotes, API scores and a verdict.
- The review dir on the field-redesign branch has the synthesis report.
- You can say, for each decision: which answer won, and on which call site it won.
