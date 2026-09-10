# ADR 0012 spikes — optional dates

**Settled since this page was written.** [0012](../../0012-optional-dates/README.md) carries no open decision. This page is the evidence, never the answer.

**First ADR in landing order.** [0012](../../0012-optional-dates/README.md) has no open decision. This review probes the closed rule and the published consequences, before the build.

**Score.** A clean, friendly public API. An option that is smaller inside and larger outside lost.

Throwaway code lives on three branches. This file is the verdict. Open a branch when you need the tests.

**Status — the evidence is not accepted.** The author runs one combined spike of 0011 and 0012 before any decision moves. A second review on 2026-09-10 re-ran the six suites and opened every file this report cites. One claim was wrong. Two lessons were narrower than the plan they point at. The corrections sit in the section they belong to, and the [Review, 2026-09-10](#review-2026-09-10) section lists them together. Read that section before you cite anything here.

| Branch | Question | Tests | Commit |
|---|---|---|---|
| [`spike/0012-dates-iff-segments`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0012-dates-iff-segments) | Dates iff Segments? | 36 passed | `d074b1f` |
| [`spike/0012-duration-of-dateless`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0012-duration-of-dateless) | What does `durationOf` return? | 22 passed | `be40cef` |
| [`spike/0012-dateless-range-and-sort`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0012-dateless-range-and-sort) | How do fit and sort treat a hole? | 14 passed | `cea3a70` |

Decision **15** needed no spike. `MS` is already public.

---

## Verdict in one page

**The recommendations hold.** No alternative won on the API score.

Keep the biconditional. Guard `durationOf` and return `Duration | undefined`. Skip dateless rows in `fitDataset`. Sort last needs no new consumer knob.

The build is not one-line. HEAD silently drops the un-date verb. Three overlay steps must change together. `durationMs` must read `duration?.value` or it throws. `fitDataset` must skip dateless rows or the first one poisons the axis.

**Sort last needs a rule, and this report first said it did not.** A hole sorts last on `asc` only. `sort.ts` multiplies by the direction, so `desc` puts the hole **first**. §3 carries the correction and the probe.

---

## 1. Write door — dates iff Segments

**Recommendation holds.** Branch `spike/0012-dates-iff-segments`. Notes: `plans/field-redesign/0012-optional-dates/spikes/dates-iff-segments/NOTES.md`.

| Option | Rules to learn | Call that un-dates | Result |
|---|---|---|---|
| **Biconditional (rec)** | 3 | `update(id, { start: undefined, end: undefined })` | Winner. Speaks dates. App author never names Segments |
| Empty Segments are dateless | 4 | `update(id, { segments: [] })` | Same invariant, worse verb. Consumer must know Segments |
| Three states | 5 | two knobs | Fewest internal branches. Envelope becomes a lie. Ball of mud |
| Kind-gated | 4 | works on `group`, throws on `span` | Refuses "add now, date later" for a span |

`segments: []` stays `EmptySegmentsError` (#212). Omit is dateless. `[]` is illegal. That is cheaper than a second un-date verb.

### Lesson for the build

HEAD cannot land `update(id, { start: undefined, end: undefined })` today. The verb is a silent no-op. Confirm all three, together:

1. `toEditReading` must keep explicit `undefined` (`'start' in edit`, not `!== undefined`).
2. `start` and `end` must join `isOptionalEntryKey`, so `entryAfterEdit` can delete them.
3. `reconcileEnvelope` must treat the cleared pair as an envelope write that clears Segments.

(1) and (2) without (3) drop dates and leave Segments. That breaks the biconditional.

`authoredEnvelopeKeysOf` uses `!== undefined` too. Fix it with the reader.

---

## 2. `durationOf` — plugin-author surface

**Recommendation holds.** Branch `spike/0012-duration-of-dateless`. Notes: `plans/field-redesign/0012-optional-dates/spikes/duration-of-dateless/NOTES.md`.

Read the call aloud: `ctx.durationOf(entry)`. One question, two answers: a length, or none.

| Option | Dateless answer | Cell | Why it lost |
|---|---|---|---|
| **Return `undefined` (rec)** | `undefined` | blank | Winner. Formatter and sort already handle a hole |
| Throw | throws | never runs | Every plugin catches and rebuilds `undefined` |
| Return `{ value: 0 }` | `0` | `"0 d"` | Collides with a legal milestone (`start === end`) |
| Unguarded (HEAD) | `{ value: NaN }` | `"NaN d"` | Plugin does not see a hole |

Zero cannot mean dateless. A zero-length span stays legal (D-S5-46).

### Lesson for the build

Land `duration?.value` in `aggregators.ts` with the signature change. HEAD `durationMs` does `duration.value` with no optional check. `undefined` throws.

**`aggregators.ts` is one site of six. Do not read this lesson as the whole job.** The plan already publishes the audit — [`0012/README.md` §The build](../../0012-optional-dates/README.md) names `field-access.ts:92` (the canonical implementation, and the guard goes there first), `core-fields.ts:118`, `aggregators.ts:14`, `inline-editing.ts:113` (a provider, not a caller), `etc/freegantt.api.md`, and four test stubs. That table says *"do not rebuild it"*. The spike opened `aggregators.ts` and `core-fields.ts` only, so this section reports two sites, not six. Build from the plan's table.

Item 10 in [`refuted.md`](../../shared/refuted.md) is slightly wide. Shipped `isFiniteNumber` already skips NaN, so the shipped mean does **not** poison. The loud HEAD failure is the `"NaN d"` cell. Guard `durationOf` anyway. The cell is enough.

Decision 15 stands. Publish `duration.value / MS.DAY`. Do not publish `86_400_000`.

---

## 3. Fit and sort

**Recommendation holds.** Branch `spike/0012-dateless-range-and-sort`. Notes: `plans/field-redesign/0012-optional-dates/spikes/dateless-range-and-sort/NOTES.md`.

The consumer sets no flag. `range: 'fitDataset'` still means one thing: the envelope of dated entries, or the empty-dataset range when nothing is dated.

### Lesson for the build

HEAD `#resolve` in `time-scale-model.ts` has no dateless skip. A dateless **first** entry seeds `{ start: undefined, end: undefined }`. Later `undefined < n` is false, so the axis stays poisoned. A dateless entry **after** a dated one is ignored. Mixed order is load-bearing. That is mud. Skip missing start or end. Do not treat missing as `0`. `0` is a legal Instant.

**Correction, 2026-09-10. Sort-last does not fall out of HEAD. It holds on `asc` and it fails on `desc`.** This report first said the fallback already delivered it. Open the two files:

- `view/grid-columns.ts:30` — `defaultCompareStored` answers `1` for a hole. That answer never reads the direction.
- `layout/rows/sort.ts:25` — `comparerFor` returns `direction * order`. `desc` is `-1`, so the hole's `1` becomes `-1`.

A hole therefore sorts **first** on `desc`. Probed on the real path — `resolveFieldCompares(CORE_FIELDS)` into `applySort`, three rows, one with no value. `asc` gave `a, b, hole`. `desc` gave `hole, b, a`. The probe used `name`, because `start` cannot hold `undefined` until this ADR lands. `start` takes the identical path: it declares no `compare` (`core-fields.ts:70-79`), so it uses the same fallback.

`compareDuration` (`core-fields.ts:51`) has the same shape and the same failure. A blank Duration cell leads on `desc`.

**The plan publishes "A dateless Entry sorts last" with no direction attached** (`0012/README.md`, the build list). Sort-last is a **rule to write**, not a behaviour to inherit. An explicit Instant compare must answer the hole the same way in both directions, which the `direction * order` multiply cannot do from a comparator alone.

The spike did not catch this. `sort-last.ts` and `sort-first.ts` are direction-free toys, and neither models the multiply in `sort.ts`. **A combined spike must sort `asc` and `desc` in one test.**

Two claims in this paragraph still hold: `applySort` has no dateless rule, and `start` declares no `compare`. One reason for an explicit compare does **not** hold: `defaultCompareStored` already answers `0` when both sides are missing, through `Object.is(a, b)`. Direction is the reason to write one.

Do not add a `datelessPosition` config.

---

## What the spikes did not re-open

- **Decision 4** still holds. One date without the other throws. Neither is now legal.
- **Decision 15** still holds. Docs only.
- **Known hole** still holds. A dateless row cannot be dated through the UI. Dating from the timeline is its own gesture. Do not invent it here.
- **Gesture inert** still holds. No bar, no grip. Not probed in code.

---

## Review, 2026-09-10

A second reader re-ran the suites and opened every file this report cites. **The verdict survives. One claim did not.**

### What the re-run proved

- The three branches sit on origin at the commits in the table.
- The counts reproduce exactly: 36 + 22 + 14 = **72 passed**.
- Every HEAD quote is accurate. Checked one by one: `entry-reader.ts:484-489` (`!== undefined` drops an explicit `undefined`), `entry-reader.ts:76-79` (`authoredEnvelopeKeysOf`, same test), `field-access.ts:26` (`isOptionalEntryKey` omits `start` and `end`), `entry-reader.ts:495` (`EmptySegmentsError`), `time-scale-model.ts:218-225` (no dateless skip, and a dateless **first** entry poisons the axis), `aggregators.ts:14-15` (`duration.value` with no optional check), `core-fields.ts:43-48` (`formatDuration` blanks `undefined`, so `NaN` renders `"NaN d"`), `api/index.ts:365` (`MS` is public).
- The `refuted.md` item 10 correction is right. `aggregators.ts:15` calls `isFiniteNumber(duration.value)`, so a `NaN` duration skips the child and the mean does not poison.

### What changed

1. **§3 sort — wrong, now corrected.** Sort-last fails on `desc`. See the correction in that section.
2. **§2 `durationOf` — narrower than the plan.** This report named one call site. The plan's audit names six. See the note in that section.

### What the combined spike must still answer

- **Sort a hole on `asc` and `desc` in one test.** Model `direction * order`, not a bare comparator.
- **Does the biconditional survive [0013](../../0013-what-decides-derivation/README.md)?** 0013 omits a rolling-up parent's dates from the Document. At HEAD the commit path pairs a Segment onto an envelope write (`build-commit-change-set.ts:176` calls `reconcileEnvelope`), so *dates iff Segments* holds for a parent today. 0012 lands first and 0013 must live with the rule. This wave declined the question, and it is the largest open risk to a closed rule.
- **Rollup over dateless children.** `start` rolls up `min` and `end` rolls up `max`. Every child skipped answers `undefined`, and `undefined` means *keep the stored value*. A parent whose children all lose their dates then keeps a stale envelope. No spike touched this.

---

## How to re-run

Root `vitest.workspace.ts` does not include `plans/`. Each spike owns a tiny workspace file. `pnpm exec` may refuse a worktree `node_modules` symlink. Use the local binary:

```
./node_modules/.bin/vitest run --config vitest.config.ts --workspace plans/field-redesign/0012-optional-dates/spikes/<name>/workspace.json plans/field-redesign/0012-optional-dates/spikes/<name>
```

The dates-iff-segments spike names its workspace `vitest.workspace.ts` in the same folder.

Re-run on 2026-09-09 after the agents landed: **72 passed** (36 + 22 + 14).

Re-run on 2026-09-10 by the review: **72 passed** (36 + 22 + 14). The three worktrees under `/tmp/FreeGantt-spikes/` still hold their own `node_modules`, so each suite runs there with no install.
