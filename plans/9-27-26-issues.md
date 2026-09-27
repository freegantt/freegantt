# Issue triage — 2026-09-27

This file records the open-issue check of 2026-09-27. Agents read each issue body and
its comments. They did not trust labels alone.

23 issues were open. One already carried `ready for agent` (`#95`). None carried
`quickie`.

`#521` and `#579` were dispatched the same day into new Orca worktrees. The rest stay
here so a later session does not re-derive the buckets.

| Bucket | Count | Meaning |
|---|---|---|
| [Ready to implement](#ready-to-implement) | 5 | Scope is clear, or a plan is posted. |
| [Almost ready](#almost-ready--one-choice-left) | 1 | One pick remains, then the change is small. |
| [Has a plan, not next](#has-a-plan-but-do-not-start-it-as-next) | 6 | Design exists, but S7, owner work, or a later user blocks it. |
| [Not ready](#not-ready--open-questions-no-chosen-plan) | 11 | Open questions, research, or wishlist. |

## Ready to implement

**`#521` — Nightly failure report drops the describe path**
Small script bug. The issue already names the three steps: join the full Playwright
path, use it in the signature, add a collision test. No open question.
Dispatched 2026-09-27.

**`#579` — A consumer date input follows the dateOnlyEnd rule**
Small, scoped, split from `#577`. Chosen shape: `DateInput` gains `showsTimeOfDay`,
and `inlineEditing` applies the end-date rule to every control that shows no time.
Alternatives are listed and rejected. No leftover decision.
Dispatched 2026-09-27.

**`#130` — WBS system**
Finished plan: `plans/issues/open/130-wbs.md`. The grill is closed. `#528`
(`siblingIndex`) shipped. The two core gaps (`#213`, `#214`) are closed. Remaining
work is the `wbs()` plugin itself. Medium size, not a one-hour job.

**`#100` — Viewport navigation leftovers**
Wheel and pinch already shipped. What remains is named: period views,
`shiftNext` / `shiftPrevious`, and zoom-to-selected ids. The S1.12 deferred table
already says the last two are small `Viewport` methods.

**`#95` — Profile the large-dataset harness** (already `ready for agent`)
Scroll numbers are on `main`. Still open: a person reads the DevTools trace and
names the three largest costs; hover and bulk-edit measurements are not taken yet.
Half of this is human work.

## Almost ready — one choice left

**`#520` — Bundle-growth guard**
Two traps. The Vite cache fix is specified (`--cacheDir` / `VITE_CACHE_DIR` in the
base worktree). The ledger-row trap still needs a pick: match branch name or PR
number, or rewrite the row in `pnpm open-pr`. After that pick, it is a small
script change.

## Has a plan, but do not start it as next

| Issue | Why it is not next |
|---|---|
| `#136` | Full design in the 2026-09-02 comment. This is S7 (links + `entryDependencies()`). Multi-day. |
| `#222` | A 2026-09-06 comment settles commands vs inputs. Placement is still open: plugin vs `GanttOptions`, and which container. Still `needs grill`. |
| `#284` | Route is settled (empty interface merge). The issue says do not build it until the scheduling plugin declares a Field. |
| `#135` | Convenience helper. Waits until `entryDependencies()` and `scheduling()` exist. |
| `#460` | Owner posted a full build plan. Remaining ticks are secrets, DNS, Pages, and push. Code is local; an agent cannot finish it. |
| `#442` | npm release. Packaging landed. Several owner decisions are still open. |

## Not ready — open questions, no chosen plan

These need a grill or a design pick first:

- `#523` — lock rule cannot `read` Entry values (cascade: committed vs pending)
- `#525` — two API asymmetries, options listed, none chosen (`wishlist`)
- `#465` — window-scoped grid value; issue says no design is proposed
- `#425` — vertical drag to another row; capability vs default is open
- `#423` — one value per tick; five questions, marked later
- `#419` — write with no undo; still `needs grill` (`#517` covered sync; the generic door did not)
- `#426` — custom hierarchy `reads` declaration; nothing waits on it
- `#449` — compose bar decoration with variant paint (`wishlist`)
- `#457` — scheduling in a Web Worker (`needs grill`, after S7)
- `#94` — research only, not a build
- `#567` — a path to a sample file, not a task

## Suggested order after `#521` and `#579`

1. `#130` — best next feature with a finished plan.
2. `#520` — best next small script change after one ruling.
3. `#100` — remaining viewport helpers are named.
