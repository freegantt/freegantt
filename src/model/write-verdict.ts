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

/** Where a write to one cell lands. `'entry'` lands where the write aimed; `'refused'` is a
 *  rolling-up cell on a row with children — it lands nowhere. `data/write-rule.ts`'s
 *  `resolveWriteTarget` computes it; `EditRequest.writeTarget` (`edit-request.ts`) publishes it to a
 *  plugin author.
 *
 *  A third value, `'children'`, lived here between #466 and #470: a Field could declare
 *  `writeToChildren` and split a parent's write across its children. #470 retired that policy seam —
 *  a distribution rule has no defensible library default, and its one caller (a harness button) wrote
 *  it in app code instead, over public API. With the policy gone, every rolling-up cell on a row with
 *  children refuses, so the third value had nothing left to name. */
export type WriteTarget = 'entry' | 'refused';
