// `sampleEntryInputs` (`sample-dataset.ts`) is frozen at 2026-09-01 on purpose — dozens of unit
// tests assert exact `2026-09-*` instants, so that fixture must never move (see this repo's
// `plans/s1.12-timeline-navigation/header-readability-followup.md`, finding 1). But a harness demo
// page wants the opposite: real dates around the real "today", so `todayLine`/`panToToday` actually
// show something when a person opens the page. This fixture reshapes `sampleEntryInputs` for that —
// every entry's own gaps and durations stay identical, the whole dataset is just slid on the
// calendar so it starts `WEEKS_BACK` weeks before whatever "now" is when the module loads.

import { sampleEntryInputs } from './sample-dataset.js';
import type { EntryInput } from '../src/api/index.js';

const ORIGINAL_START_MS = Date.UTC(2026, 8, 1); // sampleEntryInputs's entry-1 start
const WEEKS_BACK = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const desiredStartMs = Date.now() - WEEKS_BACK * 7 * DAY_MS;
const shiftMs = ORIGINAL_START_MS - desiredStartMs;

function shift(input: NonNullable<EntryInput['start']>): Date {
  const ms = input instanceof Date ? input.getTime() : new Date(`${input}T00:00:00Z`).getTime();
  return new Date(ms - shiftMs);
}

/** `sampleEntryInputs`, slid onto the calendar so it spans from `WEEKS_BACK` weeks before "now" to a
 * few months after — the shape a today-line/today-button demo needs. Not for unit tests: the exact
 * instants move every time this module loads. Every `sampleEntryInputs` entry sets both `start` and
 * `end`, so the non-null assertions below just carry that existing fixture's own shape forward. */
export const demoEntryInputs: EntryInput[] = sampleEntryInputs.map((entry) => ({
  ...entry,
  start: shift(entry.start!),
  end: shift(entry.end!),
}));
