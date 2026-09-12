// api/ — the narrow slice of `time/`'s public surface `extensions/features/tooltips.ts` needs
// directly (D-S5-5: extensions/ may reach api/ and model/ only). Not `api/index.ts`'s own barrel:
// that file re-exports `tooltips`/`contextMenu` themselves (D-S5-13), so a feature file importing
// the barrel back would close a cycle (no-circular) — the same reason `extensions/popup.ts` imports
// `api/plugin-context.ts` directly instead of the barrel that re-exports it.
export { formatDate, formatEndInclusive } from '../time/index.js';
