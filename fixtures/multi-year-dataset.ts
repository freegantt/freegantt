// Deterministic entry inputs for the S1.12 density-floor demo (plans/s1.12-timeline-navigation/README.md
// D-S1.12-16): a dataset wide enough that the day preset's `minTickWidthPx` floor (D-S1.12-2) is
// visible — the pane scrolls instead of squishing ticks to sub-pixel width. `harness/e2e/zoom.html`
// switches between this and `sampleEntryInputs` so the floor's effect is a side-by-side comparison.
//
// Same seeded-LCG shape as `fixtures/seeded-dataset.ts` — deterministic, no `Math.random` — but with
// wider gaps and durations so ~60 entries spread across ~3 years instead of clustering into a few
// months.

import type { EntryInput } from 'freegantt';

const LCG_MULTIPLIER = 1103515245;
const LCG_INCREMENT = 12345;
const LCG_MODULUS = 2 ** 31;

/** A tiny linear congruential generator — deterministic, no `Math.random`. Returns a float in [0, 1). */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
    return state / LCG_MODULUS;
  };
}

const MS_PER_DAY = 86_400_000;
const ENTRY_COUNT = 60;
const MIN_DURATION_DAYS = 3;
const MAX_DURATION_DAYS = 21;
const MIN_START_OFFSET_DAYS = 5;
const MAX_START_OFFSET_DAYS = 20;

/** ~60 entries spread across ~3 years from `2025-01-01`, UTC-midnight aligned; the caller supplies
 *  the zone to `new Dataset(...)`, matching `sampleEntryInputs`. */
export const multiYearEntryInputs: EntryInput[] = (() => {
  const random = makeRandom(1);
  const originMs = Date.parse('2025-01-01T00:00:00.000Z');

  const entries: EntryInput[] = [];
  let cursorMs = originMs;
  for (let i = 0; i < ENTRY_COUNT; i += 1) {
    cursorMs +=
      (MIN_START_OFFSET_DAYS + Math.floor(random() * (MAX_START_OFFSET_DAYS - MIN_START_OFFSET_DAYS + 1))) *
      MS_PER_DAY;
    const durationDays =
      MIN_DURATION_DAYS + Math.floor(random() * (MAX_DURATION_DAYS - MIN_DURATION_DAYS + 1));
    const start = new Date(cursorMs);
    const end = new Date(cursorMs + durationDays * MS_PER_DAY);
    entries.push({ id: `multi-year-${i}`, name: `Multi-year entry ${i}`, start, end });
  }
  return entries;
})();
