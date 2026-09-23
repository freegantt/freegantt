// view/ — the live switch for convenience keyboard chords (#262). A convenience chord's own default
// binding does the same job a button, a menu entry, or a public method already does — see
// `api/command.ts`'s `ConvenienceCommandId` for the full list and why each member qualifies. An
// obligation chord (`Escape`, the column keys, `Mod+Arrow` reach, `Enter`) never reaches this file:
// `[S5-A4]` and WCAG 2.1.1 keep it bound, so `view/gantt-shell.ts` registers it with no `when` at all.

import type { ConvenienceCommandId } from '../extensions/commands.js';
import { convenienceCommandIds } from '../extensions/commands.js';

/** Live (`Gantt.convenienceChords`). `false` turns every convenience chord off; `true` or `{}` turns
 *  them all on. A per-command map pins one at a time and leaves the rest at their default — typed
 *  against `ConvenienceCommandId` alone, so naming an obligation command here fails to compile. The
 *  command itself always stays reachable through `gantt.commands.run(id)`, a menu, or a toolbar
 *  button; this gates only the default chord. */
export type ConvenienceChords = boolean | Partial<Record<ConvenienceCommandId, boolean>>;

export type ResolvedConvenienceChords = Readonly<Record<ConvenienceCommandId, boolean>>;

export function resolveConvenienceChords(input: ConvenienceChords | undefined): ResolvedConvenienceChords {
  const resolved = {} as Record<ConvenienceCommandId, boolean>;
  for (const id of convenienceCommandIds) {
    resolved[id] =
      input === false ? false : input === true || input === undefined ? true : (input[id] ?? true);
  }
  return resolved;
}
