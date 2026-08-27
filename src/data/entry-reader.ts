// Moved verbatim from api/entry-input.ts (D-S2-2): construction and `entries.add()` must read an
// `EntryInput` the same way, and the one place that happens is inside the store now.
//
// This file maps fields and nothing else. Every date decision — resolving a Plain time through the
// zone, and what a date-only `end` means against half-open storage — belongs to `time/input.ts`
// (I10); anything resembling date math here is a bug.

import { entryId } from '../model/index.js';
import type { DateOnlyEndRule, Entry, EntryInput, TimeSpan, TimeSpanInput } from '../model/index.js';
import { toEndInstant, toInstant } from '../time/index.js';

/** The Dataset context every entry is read against: one zone, one end rule, for the whole list. */
export interface EntryReadContext {
  timeZone: string;
  dateOnlyEnd: DateOnlyEndRule;
}

function readSpan(span: TimeSpanInput, context: EntryReadContext): TimeSpan {
  return {
    start: toInstant(context.timeZone, span.start),
    end: toEndInstant(context.timeZone, span.end, context.dateOnlyEnd),
  };
}

/** Optional fields are copied only when present: `exactOptionalPropertyTypes` makes an explicit
 * `undefined` a different thing from an absent key, and an `Entry` must not gain keys its input
 * never had. */
function readEntry(input: EntryInput, context: EntryReadContext): Entry {
  const entry: Entry = {
    id: entryId(input.id),
    name: input.name,
    start: toInstant(context.timeZone, input.start),
    end: toEndInstant(context.timeZone, input.end, context.dateOnlyEnd),
    kind: input.kind ?? 'span',
  };
  if (input.parentId !== undefined) entry.parentId = entryId(input.parentId);
  if (input.progress !== undefined) entry.progress = input.progress;
  if (input.segments !== undefined) {
    entry.segments = input.segments.map((span) => readSpan(span, context));
  }
  if (input.meta !== undefined) entry.meta = input.meta;
  return entry;
}

export function readEntries(inputs: readonly EntryInput[], context: EntryReadContext): readonly Entry[] {
  return inputs.map((input) => readEntry(input, context));
}
