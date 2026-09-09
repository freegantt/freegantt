# Sweep log — ADR 0011

Four sweeps ran on 2026-09-09 against commit `35b3d73`, which moved every open decision into the ADR and reversed several older plan claims. Where this folder disagreed with it, the later text won.

**Every conflict those sweeps found is now resolved, and each row is deleted.** The rulings live in [`closed-decisions.md`](closed-decisions.md), the open questions in [`open-decisions.md`](open-decisions.md), and the approaches that were tried and refused in [`refuted.md`](refuted.md). Nothing was lost: everything the sweeps deleted is recoverable from `35b3d73`.

**Delete a row from this file the moment its conflict is resolved.** A log of settled disagreements is a second, staler copy of the decision.

## What the sweeps found, in one line each

| Sweep | What it did |
|---|---|
| Plan sweep | Aligned seven plan claims with the ADR. Deleted four pointer files |
| Post-sweep fix | Restored four items applied incompletely, two of them lost with a deleted file |
| Closure sweep | Closed eight decisions. Found the open count had been wrong in both directions |
| Consistency pass | Found nine defects by reading the ADR against itself and against `plans/01` §2.5 |

## Three lessons, and they are the only durable part

**A pointer file deletes safely. A file holding findings does not.** `reviews/2026-09-09.md` held both, and only its pointer half was checked before it went. Two audit findings went with it — the `durationOf` call-site list and the `EditOf` warning — and both had to be restored rather than re-derived. Both now sit in [`refuted.md`](refuted.md) and [`work-plan.md`](work-plan.md), which are durable homes.

**A decision that recommends itself off the list is not open.** Neither is one whose whole body points at another decision. Counting them as open hid how much was actually undecided: the frontmatter said sixteen, the list held fifteen, and five of those were already answered.

**A recommendation is not a ruling.** The sweeps twice read a recommendation in the ADR as a settled question and wrote the consequence into a plan file. Both times the decision was still open.
