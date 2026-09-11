# Build 1 — ADR 0012, dates are optional

**The one question it answers.** May an Entry hold no dates? Yes.

**Read first.** [`docs/adr/0012`](../../../docs/adr/0012-dates-are-optional-on-every-kind.md). Then [`README.md`](README.md) in this folder.

**Lands after.** Build 0. `src/data/serialization/` is gone by then, so this build has no reader arm to add.

**Tick each box as you finish it.** Do not batch the ticks.

---

## Target state

**The rule, once.** An Entry **spans** if and only if `start` and `end` are both present. It holds a Segment, and draws a bar, if and only if it spans.

```ts
interface Entry {
  start?: Instant;
  end?: Instant;                  // exclusive
  segments: readonly Segment[];   // empty when the Entry does not span
}
```

**Defaults.** `gridColumns` defaults to `['name', 'start', 'end']`.

**Errors.** No new error. `EmptySegmentsError` keeps its one job — `segments: []` is illegal, absent is dateless. `InvalidInstantError` refuses an unreadable date and nothing else.

**Not changed.** A zero-length span stays legal. Core does not paint a diamond. A zero-width bar is what it draws.

---

## Work

- [ ] Make `Entry.start` (`src/model/entry.ts:31`) and `Entry.end` (`:33`) optional, independently.
- [ ] Guard the duration calculation at `src/data/fields/field-access.ts:92` **first**.
- [ ] Keep `durationOf` as a thin wrapper around the guarded helper. Build 4 deletes it.
- [ ] Delete the `referenceDate` fill at `src/data/entry-reader.ts:170`. It is written down under **D-S2-10** and **D-S2-22** — name both halves, or a reader retires the wrong sentence.
- [ ] Add `start` and `end` to `isOptionalEntryKey` (`src/data/fields/field-access.ts:26`).
- [ ] Give `src/data/entry-reader.ts` a `length === 0` arm for Segments.
- [ ] Mint a Segment when the second date arrives. Drop it when one date of the pair is cleared.
- [ ] Stop `Entry.segments` being *never empty*.
- [ ] Change `DEFAULT_GRID_COLUMNS` to `['name', 'start', 'end']` (`src/view/grid-columns.ts:11`).
- [ ] Skip bar geometry for a row that does not span.
- [ ] Sort a row with neither date **last** on `asc` **and** on `desc`.
- [ ] Include a one-date instant in `range: 'fitDataset'`.
- [ ] Open the date editor on a blank cell. Stop refusing with `no-date-value` (`src/extensions/features/inline-editing.ts:764`).
- [ ] Make `removeSegments` of the last Segment keep the Entry and clear both dates.
- [ ] Bind grid-row Delete on the name cell to `remove(id)`, not `removeSegments`.
- [ ] Correct the duration test-stub list before you edit tests. See *The stub list* below.
- [ ] Close the build — see [`README.md#close-every-build`](README.md).

**Slices it touches.** S2 (the Segment invariant), S3 (a bar with no grip), S4 (sort comparators, the dateless parent), S5 (the date editor). **Re-run the S2, S3, S4 and S5 slice gates.**

---

## The stub list

An earlier draft named four test stubs. Two of the four are wrong. This is the corrected list.

| File | What is there | What to do |
|---|---|---|
| `src/data/fields/field-types.test.ts:10` | A `FieldContext` stub with a `durationOf` key | Drop the key |
| `src/layout/rows/filter.test.ts:78` | A `FieldContext` stub with a `durationOf` key | Drop the key |
| `src/data/fields/field-access.test.ts:75` | A **test name**, not a stub key | Rewrite the test against the guarded helper |
| `src/layout/rows/sort.test.ts:28` | A **local helper function** named `durationOf` | Leave it alone. It is not a `FieldContext` key |

---

## Do not

- **Do not skip the duration guard.** `diffMs` is `a - b`, so an absent date yields `NaN` and never throws. Guard `field-access.ts:92` first.
- **Do not inherit `direction * order` in the comparators.** That puts the dateless row first on `desc`.
- **Do not invent a placeholder** for the blank duration cell. No em dash. Assert an empty string.
- **Do not re-derive the duration call-site list.** It is in [`../0012-optional-dates/README.md#the-work`](../0012-optional-dates/README.md), corrected by the table above.
- **Do not rewrite D-S5-46.** A zero-length span stays legal.

---

## Gate

```bash
pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log
```

Each assertion below gets a named test:

- `add({})` stores no dates and no Segments.
- `add({ start })` stores one date, mints no Segment, and draws no bar.
- `update(id, { start: undefined, end: undefined })` clears both dates and the Segments.
- `update(id, { segments: [] })` still throws `EmptySegmentsError`.
- The `duration` cell on a dateless row is **blank**, not `"NaN d"`.
- A row with neither date sorts last on `asc` **and** on `desc`.
- `removeSegments` of the last Segment keeps the Entry and clears both dates.

---

## Issues

| Issue | What this build does to it |
|---|---|
| [#242](https://github.com/Pawel-IT/FreeGantt/issues/242) | This build lands **before** #242's own fix, because optional dates change what the error guards. The class split stays owed. Do not close it. |
| [#212](https://github.com/Pawel-IT/FreeGantt/issues/212) | ADR 0012 revises *never empty*. It does not re-open the issue. |
