# Handoff — #244 s5-start review remediation

Written 2026-09-07 after a verification pass over #244–#252. Branch `s5-start`, base `8efe40f`.

## Where the work is

`#244` is the tracker. `#245`–`#252` are eight slices holding 24 todos. **Read #244 first** — it carries
the working agreement (one todo = one commit, verify green per commit, tick boxes as they land) and the
cross-slice file table. Do not re-plan; the slices are verified and current.

Source: `plans/reviews/2026-09-07-s5-start-api-architecture-gpt5-6.html` — it holds the finding ids
(`T1-*`, `A*`, `R*`) the issues cite, and all its findings are real. **The issues supersede its proposed
fixes**, several of which did not survive verification. Read it for background on a finding id, never for
what to do. Its companion remediation plan is deleted.

## What a verification pass changed, so you do not re-derive it

All 19 findings are real. These *fixes* were corrected:

- **#245 S1-2 was rewritten.** The old version ("make `datasetRevision` required so the compiler names
  every caller") was unimplementable: it contradicted S1-1, and its premise that `render()` already
  always passes the key was false (`gantt-shell.ts:1775` is a conditional spread). S1-2 is now
  *retire the optional port* — measured at 3 production sites and 112 fixture sites.
- **#245 S1-3 grew a seam change.** `core-fields.ts:36` cannot supply a `TimeSpan`, because
  `Field.formatValue` receives no Entry. The Entry arrives as a **third parameter**; this costs consumers
  nothing (proven — a `(value) => …` formatter still assigns).
- **#249's "split brain" does not exist.** Every layer treats `{width, flex}` as fixed;
  `[data-fixed] { flex: 0 0 auto; }` wins. The fix still lands, for the unrepresentable-combination rule,
  and it now also covers `model/field.ts:147` and `view/grid-columns.ts:61-66`.
- **#246 S2-3 must not assert the absent-`datasetRevision` case.** S1-2 deletes that case.
- **#248 S4-2 is not S4-1 in a second file.** `dateLines`/`todayLine` already resolve on the way in;
  `rowSource` resolves nowhere, so S4-2 *adds* a resolution step and must say where it runs.
- **#247 S3-2** must declare `RegisterKeyHandler`; it did not exist.
- **#252's** line map had one wrong range and undercounted the cluster.

**#240 is display-only and the chain is measured.** Snap runs before the clamp
(`gesture-draft.ts:115-123`, `:226`), so the drag commits a legal zero-length span — correct data. Only
`formatEndInclusive` under `DATE_TIME_FORMAT` is wrong. S1-3 closes it.

## Parallelism — what can actually run at once

**The clone is shared. Peers edit this working tree.** Parallel agents in one tree will collide. Give
each agent its own `git worktree`, or sequence them. `git fetch` before any push.

Order: **S2-1 first, alone.** `src/data/plugin-store.ts` contains raw NULs, so `grep` returns nothing
for it — read it with `tr -d '\000'`. S2-1 unblocks #247 S3-3 and makes the file reviewable at all.

Then Slice 1 and Slice 2 may run beside each other. Slices 3–8 wait for Slice 1 green, and run in order.

Inside a slice, these are genuinely independent — different files, no shared state:

| Parallel group | Todos | Files |
|---|---|---|
| S1 fan-out | S1-3, S1-4, S1-5, S1-6 | `time/format.ts`+`model/field.ts`, `view/styles.ts`, `view/gesture-pipeline.ts`, `harness/data.ts` |
| S2 fan-out | S2-2, S2-3, S2-4 | three new test files |

These are **strictly sequential**: S1-1 → S1-2 (same two files, and S1-2 supersedes S1-1's condition);
S6-1 → S6-2 (S6-1 adds the `WeakMap` S6-2's rule must accept).

Cross-slice file collisions are in #244's table. The ones that bite: `model/field.ts`,
`view/grid-columns.ts` and `layout/frame.ts` are all touched by **S1-3 and S5-1** — S5-1 rebases onto
S1-3, never parallel. `tooltips.ts` by S1-3 (`:31`) and S3-2 (`:66`). `gantt-shell.ts` by S1-2, S2-3
(test only) and S8-1.

## Traps

- **Capture verify's exit code.** `pnpm verify > /tmp/v.log 2>&1; echo "EXIT: $?"` — its tail reads as
  success while it exits 1.
- **A plan's account of the code is a claim.** Open the file before acting on it, including this
  handoff and the issues. Probe with a throwaway test, delete the probe, then pin with a real test.
- **Never patch `harness/` to cover a library gap** (CLAUDE.md stop rule). Report it on the slice issue.
  Review `harness/main.ts` on every commit, changed or not.
- **Any public signature change** needs `pnpm build`, then `pnpm exec api-extractor run --local`, then
  `etc/freegantt.api.md` committed in the same commit. #246 and #252 must leave it **untouched**.
- **Minting a decision id:** highest live is `D-S5-50`. `D-S5-43` is retired and must never be reused.
- Browser tests are required after S1-4, S1-6, S4-3 and S8-1.

## Open, needs the repo owner

Two test files (`render/dom/index.test.ts`, `layout/frame.test.ts`) build ~104 layout inputs as inline
literals with no fixture factory. That is why S1-2's 3-site change costs a 112-line diff. **Do not
extract a factory inside S1-2** — it would hide the change. It is a clean standalone cleanup, unfiled,
and needs the owner's go-ahead before anyone opens an issue for it.

`#252` (S8) is explicitly droppable. If the branch must close, stop after Slice 7.
