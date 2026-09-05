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

## 6. Open with the repo owner

| Question | Blocks | Asked on |
|---|---|---|
| Who owns the uncommitted `plans/00-overview.md` S6 → S7 gate line? | that one file; every agent is told to leave it | #197 |
| A code-health kind label for #198? | nothing | #198 |
| #201 ships A + B + a positive-integer guard | nothing; recorded for veto | #201 |

The hook question (#203) was answered — go — and is done.
