// model/ — the public verdict pair a plugin author reads off `ctx.interaction.canWrite`
// (`view/capability.ts`). `data/write-rule.ts` computes it (ADR 0011's write resolver); `view/`
// republishes it under these names. Declaring the pair here, not in `data/`, is what keeps both of
// those files' public exports actually reachable — "only `api/` and `model/` types are public".

import type { BuiltInReportCode } from './error-report.js';

/** Why a write is refused, when the refusal is worth words. Shared with `model/error-report.ts`'s
 *  `BuiltInReportCode` and the cell editor's own `REFUSAL_TEXT` — one spelling. */
export type WriteRefusalReason = Extract<BuiltInReportCode, 'derived-value'>;

/** May this cell's value change, and if not, is the refusal worth explaining? A plugin author reads
 *  this off `ctx.interaction.canWrite`. */
export type WriteVerdict =
  { readonly ok: true } | { readonly ok: false; readonly reason?: WriteRefusalReason };

/** Where a write to one cell lands (ADR 0013, amendment 2026-09-11). `'entry'` lands where the
 *  write aimed; `'children'` is a Field that declared `writeToChildren`, so the write is refused at
 *  the row and redirected to its children through that policy; `'refused'` is a rolling-up cell with
 *  no `writeToChildren` — it lands nowhere. `data/write-rule.ts`'s `resolveWriteTarget` computes it;
 *  `EditRequest.writeTarget` (`edit-request.ts`) publishes it to a plugin author, ruled 2026-09-21
 *  (#466): today `'children'` and `'refused'` both mean "dropped" for a cascade, so a boolean would
 *  be truthful, and lossy the moment a cascade can address `'children'` on its own — a published
 *  surface cannot narrow later, so the three-value answer ships now. */
export type WriteTarget = 'entry' | 'children' | 'refused';
