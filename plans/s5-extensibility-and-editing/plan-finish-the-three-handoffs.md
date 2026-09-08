# Plan — finishing the three S5 handoffs on `s5-start`

**Written:** 2026-09-05 · **Coordinator:** one session in the shared clone · **Base:** `ddbae73`

Three sessions handed off work that overlapped. This is how the remainder gets finished without them
colliding again. The three handoffs stay authoritative on *what* each job is; this file is only about
*who does which, in what order, and where they are not allowed to write.*

- [`handoff-s5.12-error-reporting.md`](./handoff-s5.12-error-reporting.md)
- [`handoff-post-163-review.md`](./handoff-post-163-review.md)
- [`handoff-selection-and-drag.md`](./handoff-selection-and-drag.md)

## 1. The eight items

| | Item | Size | Where its worklist lives |
|---|---|---|---|
| 1 | #159 / S5.12 error reporting | large | [`s5.12-error-reporting.md`](./s5.12-error-reporting.md) §4 |
| 2 | #199 a row target names one Entry | medium | [`worklist-199-row-target.md`](./worklist-199-row-target.md) |
| 3 | #197 the unexported composition `merge` | small, `critical` | [`worklist-compose-and-sweep.md`](./worklist-compose-and-sweep.md) §1 |
| 4 | #198 `canSelect` guesses an Item id | quickie | same file §2 |
| 5 | #202 the harness teaches a retired install form | small | same file §3 |
| 6 | #201 no way to validate a time unit | small | wave 2 |
| 7 | #204 audit the six `isDevMode()` sites | record | wave 2 |
| 8 | #203 the pre-commit hook widens commits | **done**, `ddbae73` | — |

## 2. What made them collide, and the rule that follows

Only two files are wanted by more than one job:

- **`etc/freegantt.api.md`** is generated, and items 1, 3 and 6 each add exports.
- **`src/api/index.ts`** takes four new exports from item 1 and one from item 3.

**No agent commits `etc/freegantt.api.md`.** The coordinator regenerates it in the shared clone after
each merge — `pnpm build` then `pnpm api-report` — and commits it there. A generated file is never
merged by hand. On `src/api/index.ts` each agent adds its own export line and reformats nothing, so
the conflict stays one hunk.

Everything else is disjoint by construction, and each worklist ends with the file list its owner must
not open.

## 3. Isolation

Each agent takes its **own git worktree outside `upper-crab/`** (handoff-post-163 §1):

```
git -C .../upper-crab worktree add /home/pawel/.polyscope/clones/d8643765/<name> -b <name> s5-start
cd .../<name> && pnpm install --frozen-lockfile
```

Nested inside `upper-crab/` a worktree shows as untracked files in a peer's `git status` and gets
swept by lint. The shared clone stays the coordinator's, for merging only.

## 4. Waves

**Wave 1, three agents in parallel.**

| Agent | Branch | Owns |
|---|---|---|
| errors | `s5-errors` | item 1, in full, including the `harness/editing.ts` toast |
| row target | `s5-row-target` | item 2 |
| compose and sweep | `s5-compose` | items 3, 4, 5 — three separate commits |

Agent *errors* is about the size of the other two together, which is why the split falls here.

**Merge, by the coordinator, `s5-compose` → `s5-row-target` → `s5-errors`.** Smallest first. After
each merge: regenerate the API report, `pnpm verify`, `pnpm test:e2e`, then `git show --stat`.

**Wave 2:** item 6 (#201, which grew a hang — see the issue), item 7 (#204), and a label sweep over
#163, #185, #200, #158, all of which sit at `fixed needs review` with their work landed. Item 6 waits
because it rewrites `harness/main.ts` and adds exports, and it should not race three API-report
rewrites.

## 5. Ticking

Every worklist box is ticked **in the commit that earns it**, never in a batch at the end, so
`git log` and the worklist cannot disagree about what is done.

## 5.1 What #201 turned out to be, before wave 2 starts

Investigated on request. The cast the issue names is the small half.

`TimeUnit` (`src/model/time.ts:6`) is a plain string-literal union, not a brand, and
`SUPPORTED_TIME_UNITS` (`src/time/zone.ts:160`) already exists — derived from the same `UNITS` table
that `stepBy` and `startOf` dispatch through, so the two can never disagree. The validator the issue
asks for is a few lines over a set that is already the single source of truth. It is simply not
exported.

**The defect is one line below, and it is not in the issue.** `snapInstant` (`src/time/snap.ts:19`)
walks forward from the unit floor until it passes the cursor. With `increment: 0`, `stepBy` returns
the same instant, so the loop never advances:

```ts
gantt.snap = { unit: 'day', increment: 0 };  // accepted, stored, no error
```

`set snap` (`src/view/gantt-shell.ts:1080`) stores the value raw and validates nothing. The next drag
then freezes the tab. `stepsBetween` (`src/time/snap.ts:36`) has the same shape and the same hole, and
a negative increment walks backwards forever.

**Measured, not reasoned.** A vitest case calling `snapInstant('UTC', at, { unit: 'day', increment: 0 })`
did not fail. It hung the worker until an external 120-second timeout killed the process. Vitest's own
three-second test timeout could not interrupt it, because a synchronous loop yields nothing to
interrupt. The same file's other cases return in 3ms.

`harness/main.ts:181` already writes `Math.max(1, ...)` around that increment. Our own first consumer
had worked around it, which is exactly what CLAUDE.md's stop rule now forbids.

So #201 ships three things, not one: the widened setter (shape A), the predicate (shape B), and a
positive-integer guard rejected at the setter so the throw names the assignment and not a drag two
seconds later. Both loops in `src/time/snap.ts` get a guard, because `time/` is reachable from
`layout/` and must not trust its caller. The issue is relabelled `bug`.

## 6. Answered by the repo owner

| Question | Answer |
|---|---|
| The `.githooks/pre-commit` fix (#203) | **Go.** Landed as `ddbae73`, with a scratch-repo test of both paths. |
| Who owns the uncommitted `plans/00-overview.md` gate line? | The owner committed it — `11f8ac2`, on its own, citing #197. The file is clean again. |
| A kind label for #198 | **`smell`** — *nothing misbehaves; the code teaches something false and will mislead the next reader.* Created and applied. |
| #201's shape | A + B, plus a positive-integer guard. See §5.1 — it grew a hang. |

**When to reach for `smell`.** Ask whether anything is observably wrong right now. If yes, it is a
`bug`. If the code is correct and the *lesson it teaches* is wrong, it is a `smell` — a dead
conversion, a comment describing a mechanism the code no longer uses, a name that outlived the
concept it named. It is not a synonym for tidying: file a `smell` because leaving it costs the next
reader, not because it offends the current one.

Nothing is now blocked on a person.
