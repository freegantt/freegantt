// api/ — the narrow slice of `layout/`'s decoration vocabulary `extensions/features/time-shading.ts`
// needs directly (extensions/ may reach api/ and model/ only). Not `api/index.ts`'s own
// barrel: that file will re-export `timeShading` itself (#404), so a feature file importing the
// barrel back would close a cycle (no-circular) — the same reason `time-facade.ts` exists for
// `tooltips.ts` and `plugin-context.ts` is imported directly by `popup.ts`.
export type { DecorationLayer, DecorationContext, DecorationInput } from '../layout/index.js';
