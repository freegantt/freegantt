# Brief G: make the S6 gate checkable, and record the waiver

Read `common-rules.md` (same folder) first. Slice name for your progress file: `g-s6-gate`.

## Target

- `scripts/slice-gate.mjs`
- `plans/03-slices.md` § S6 acceptance rows and § S7 opening text
- `plans/00-overview.md` §4, the `S6 → S7` gate row
- `plans/s6-scale-and-sync/README.md` §5.4 only
- test titles that prove S6 rows R3, R4 and R5

## Change

`plans/s6-scale-and-sync/README.md` §5.4 says `pnpm gate` reports nothing for S6, and that looks like a pass. Fix that.

1. Mint `[S6-A1]`–`[S6-A5]` on the five S6 acceptance rows in `plans/03-slices.md` (R1–R5 in that order).
2. Put the id in the title of the test that proves each ticked row (R3, R4, R5). Look at how `[S5-A*]` ids are placed.
3. Add the `S6 → S7` entry to `scripts/slice-gate.mjs`. An id with no matching test must fail loudly, not pass.
4. R1 and R2 have no proof yet. The gate must report them as open, by id.
5. Record the waiver. In the `plans/00` §4 `S6 → S7` row and at the top of `plans/03` § S7, add one sentence: "Waived by the owner on 2026-11-02 so S7 work can start. S6 rows R1 and R2 stay open and still gate 1.0." Use this text or a shorter STE version of it.
6. In S6 README §5.4, state that the ids exist and the gate checks them.

## Constraints

- Do not tick R1 or R2. Do not change their scope.
- Do not edit S6 README §R1/§R2 (worker R2 owns them).

## Ownership

You own the targets above. Do not edit `src/`, `harness/`, or `plans/s7-dependencies-and-scheduling/`.

## Observable acceptance

- `pnpm gate` names `[S6-A1]`–`[S6-A5]`, passes A3–A5, and reports A1 and A2 as open.
- A test of the gate script, if one exists for other slices, covers S6 the same way.
