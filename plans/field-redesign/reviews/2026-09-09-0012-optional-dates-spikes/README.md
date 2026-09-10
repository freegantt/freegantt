# ADR 0012 spikes — optional dates

**First ADR in landing order.** [0012](../../0012-optional-dates/README.md) has no open decision. This review probes the closed rule and the published consequences, before the build.

**Score.** A clean, friendly public API. An option that is smaller inside and larger outside lost.

Throwaway code lives on three branches. This file is the verdict. Open a branch when you need the tests.

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

Item 10 in [`refuted.md`](../../shared/refuted.md) is slightly wide. Shipped `isFiniteNumber` already skips NaN, so the shipped mean does **not** poison. The loud HEAD failure is the `"NaN d"` cell. Guard `durationOf` anyway. The cell is enough.

Decision 15 stands. Publish `duration.value / MS.DAY`. Do not publish `86_400_000`.

---

## 3. Fit and sort

**Recommendation holds.** Branch `spike/0012-dateless-range-and-sort`. Notes: `plans/field-redesign/0012-optional-dates/spikes/dateless-range-and-sort/NOTES.md`.

The consumer sets no flag. `range: 'fitDataset'` still means one thing: the envelope of dated entries, or the empty-dataset range when nothing is dated.

### Lesson for the build

HEAD `#resolve` in `time-scale-model.ts` has no dateless skip. A dateless **first** entry seeds `{ start: undefined, end: undefined }`. Later `undefined < n` is false, so the axis stays poisoned. A dateless entry **after** a dated one is ignored. Mixed order is load-bearing. That is mud. Skip missing start or end. Do not treat missing as `0`. `0` is a legal Instant.

Sort-last for `start` already falls out of `defaultCompareStored` in `view/grid-columns.ts` (undefined last). `applySort` has no dateless rule. `start` has no `compare`. Prefer an explicit Instant compare that returns `0` when both are missing, so start does not depend on the fallback.

Do not add a `datelessPosition` config.

---

## What the spikes did not re-open

- **Decision 4** still holds. One date without the other throws. Neither is now legal.
- **Decision 15** still holds. Docs only.
- **Known hole** still holds. A dateless row cannot be dated through the UI. Dating from the timeline is its own gesture. Do not invent it here.
- **Gesture inert** still holds. No bar, no grip. Not probed in code.

---

## How to re-run

Root `vitest.workspace.ts` does not include `plans/`. Each spike owns a tiny workspace file. `pnpm exec` may refuse a worktree `node_modules` symlink. Use the local binary:

```
./node_modules/.bin/vitest run --config vitest.config.ts --workspace plans/field-redesign/0012-optional-dates/spikes/<name>/workspace.json plans/field-redesign/0012-optional-dates/spikes/<name>
```

The dates-iff-segments spike names its workspace `vitest.workspace.ts` in the same folder.

Re-run on 2026-09-09 after the agents landed: **72 passed** (36 + 22 + 14).
