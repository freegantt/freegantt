// time/ — human-readable date display (plans/01 §5, S1.10). `formatEndInclusive` is the one place
// half-open `end` becomes an inclusive display value — no `end - 1` anywhere else in the codebase.
// Both helpers go through toPlain/addMs, `time/`'s own zone-aware primitives (I10 exempts this file).

import type { Instant } from '../model/index.js';
import { toPlain } from './zone.js';
import { addMs } from './instant.js';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatPlainDate(zone: string, i: Instant): string {
  const { year, month, day } = toPlain(zone, i);
  return `${MONTH_ABBR[month - 1]} ${day}, ${year}`;
}

/** Plain display formatting for an instant needing no conversion — a start is already inclusive. */
export function formatDate(zone: string, i: Instant): string {
  return formatPlainDate(zone, i);
}

/** The one place half-open `end` becomes an inclusive display value: the last millisecond the span
 * actually covers, read back through the dataset zone. No `end - 1` anywhere else in the codebase
 * (plans/01 §5, promised since S0). */
export function formatEndInclusive(zone: string, end: Instant): string {
  return formatPlainDate(zone, addMs(end, -1));
}
