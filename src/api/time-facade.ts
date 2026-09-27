// api/ — the narrow slice of `time/`'s public surface `extensions/features/time-shading.ts`,
// `extensions/features/time-shading-covers.ts`, `extensions/features/inline-editing.ts`, and
// `extensions/features/tooltips.ts` need directly (extensions/ may reach api/ and model/ only).
// Not `api/index.ts`'s own barrel:
// that file re-exports `tooltips`/`contextMenu` themselves, so a feature file importing
// the barrel back would close a cycle (no-circular) — the same reason `extensions/popup.ts` imports
// `api/plugin-context.ts` directly instead of the barrel that re-exports it.
export {
  isCoarserThan,
  joinStartAndEnd,
  readPlainTime,
  startOfLastCoveredDay,
  startOfNextDay,
} from '../time/index.js';
export type { ZonedTime } from '../time/index.js';
