// Deterministic entry inputs for the 10,000-entry acceptance page (plans/s1.11-close-the-gate/README.md
// §3.1, D-S1.11-2) and the S7 perf spike. "seeded" names the generator; `harness/e2e/large-dataset.html`
// is the demo page it feeds — the two are deliberately different names for two different things.
//
// A seeded LCG, never `Math.random`: the same seed is the same 10,000 entries forever, so a snapshot
// or a perf spike taken today still reproduces tomorrow. A fixed default start instant, never `now()`
// — a fixture that drifts with the clock is not a fixture.
//
// Dates are UTC-midnight aligned through `Date.UTC`, the same thing `fixtures/sample-dataset.ts`
// already does; the caller supplies its own `timeZone` to `new Dataset(...)` (entries carry no zone).

import type { EntryInput } from 'freegantt';

export interface SeededEntryOptions {
  /** How many entries. */
  count: number;
  /** First entry's start, as a bare UTC calendar date (`Date.UTC`-parseable). Default `'2026-01-01'`. */
  startDate?: string;
  /** Seeded LCG seed. Default `1`. Same seed, same entries, forever. */
  seed?: number;
}

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
const MIN_DURATION_DAYS = 1;
const MAX_DURATION_DAYS = 10;
const MAX_START_OFFSET_DAYS = 3;

/** Deterministic entry inputs for the 10,000-entry acceptance page and the S7 perf spike. Dates are
 *  UTC-midnight aligned; the caller supplies the zone to `new Dataset(...)`. */
export function seededEntryInputs(options: SeededEntryOptions): EntryInput[] {
  const { count, startDate = '2026-01-01', seed = 1 } = options;
  const random = makeRandom(seed);
  const originMs = Date.parse(`${startDate}T00:00:00.000Z`);

  const entries: EntryInput[] = [];
  let cursorMs = originMs;
  for (let i = 0; i < count; i += 1) {
    cursorMs += Math.floor(random() * MAX_START_OFFSET_DAYS) * MS_PER_DAY;
    const durationDays =
      MIN_DURATION_DAYS + Math.floor(random() * (MAX_DURATION_DAYS - MIN_DURATION_DAYS + 1));
    const start = new Date(cursorMs);
    const end = new Date(cursorMs + durationDays * MS_PER_DAY);
    entries.push({ id: `seeded-${i}`, name: `Seeded entry ${i}`, start, end });
  }
  return entries;
}
