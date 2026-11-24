// layout/ — the today highlight option and its normal form. DOM-free.

import type { DecorationLayer } from './decoration.js';

/** What a caller states for the today highlight. `true` is `{ layer: 'underBars' }`. `false` draws nothing. */
export type TodayHighlight = boolean | TodayHighlightSpec;

/** The normal form of a drawn today highlight. `layer` says if the tint paints under or over the bars. */
export interface TodayHighlightSpec {
  readonly layer: DecorationLayer;
}

/** The highlight the frame draws, or `false` for none. */
export type ResolvedTodayHighlight = TodayHighlightSpec | false;

/** Turns the loose option into its normal form, so one reader handles one shape. */
export function resolveTodayHighlight(value: TodayHighlight): ResolvedTodayHighlight {
  if (value === true) return { layer: 'underBars' };
  if (value === false) return false;
  return { layer: value.layer };
}
