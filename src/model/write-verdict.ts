// model/ — the public verdict pair a plugin author reads off `ctx.interaction.canWrite`
// (`view/capability.ts`). `data/write-rule.ts` computes it (ADR 0011's write resolver); `view/`
// republishes it under these names. Declaring the pair here, not in `data/`, is what keeps both of
// those files' public exports actually reachable — "only `api/` and `model/` types are public".

import type { BuiltInErrorCode } from './error-report.js';

/** Why a write is refused, when the refusal is worth words. Shared with `model/error-report.ts`'s
 *  `BuiltInErrorCode` and the cell editor's own `REFUSAL_TEXT` — one spelling. */
export type WriteRefusalReason = Extract<BuiltInErrorCode, 'derived-value'>;

/** May this cell's value change, and if not, is the refusal worth explaining? A plugin author reads
 *  this off `ctx.interaction.canWrite`. */
export type WriteVerdict =
  { readonly ok: true } | { readonly ok: false; readonly reason?: WriteRefusalReason };
