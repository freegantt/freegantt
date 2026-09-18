// layout/ — one match syntax for "which Entry does this rule claim?" A variant's `when`
// (`items/variants.ts`) and a row source's `childrenAsSegments` (`rows/entries-source.ts`) both ask
// this question, so both compile their rule here rather than each reading its own syntax (#421 C1).
//
// Depends on `model/` alone. Neither `items/variants.ts` nor `rows/entries-source.ts` may import the
// other (`items/` already imports `rows/row-source.js`, so the arrow the other way would close a
// ring) — this file is the shared floor both stand on instead.

import type { CoreFieldValues, Entry, Field, FieldKey } from '../model/index.js';

/** A rule that reads the whole row. Call: `when: (entry) => entry.duration()?.value === 0`. It runs
 *  on the hover path, so keep it cheap: it answers a question and draws nothing. */
export type EntryPredicate<TProps = Record<string, unknown>> = (entry: Entry<TProps>) => boolean;

/** Every named Field equals the value beside it, and several keys are AND (`J6`).
 *
 *  **A match is equality, never "has a value".** `{ 'demo:phaseId': true }` claims the rows whose
 *  `demo:phaseId` **is** `true` — not the rows that carry a phase id. Ask that with a predicate:
 *  `(entry) => entry.read('demo:phaseId') !== undefined`.
 *
 *  **A key no Field declares matches no row.** The match reads through the Field registry, so a
 *  typo claims nothing rather than taking the layout pass down. A plugin that matches on its own
 *  key declares that key from its `data` half (`ctx.fields.register`).
 *
 *  Each key reads through `entry.read(key)` and compares with that Field's own `equals`
 *  (`model/field.ts`), so `{ start: someInstant }` and `{ status: 'blocked' }` compare the way a
 *  Grid comparison does. With no `equals` declared, the comparison is `Object.is`. */
export type FieldMatch<TProps = Record<string, unknown>> = Partial<CoreFieldValues> & {
  [K in keyof TProps]?: TProps[K];
} & { [key: string]: unknown };

/** What a variant's `when` and a row source's `childrenAsSegments` both take: the field-match
 *  shorthand, or a predicate. The shorthand is what core can index — it names its keys — and the
 *  predicate answers everything the shorthand cannot. */
export type EntryRule<TProps = Record<string, unknown>> = FieldMatch<TProps> | EntryPredicate<TProps>;

/** What `compileEntryRule` reads outside itself. Both callers pair `fieldFor` with their own report
 *  sink, the way `VariantRegistryPorts` already does — one type, so a caller cannot hand the
 *  compiler a `fieldFor` with no way to say a key came back unknown. */
export interface EntryRulePorts {
  /** The Field registry a field match reads. It answers which keys are declared and carries each
   *  one's own `equals`. */
  fieldFor: (key: FieldKey) => Field | undefined;
  /** A `when`/`childrenAsSegments` names a key no Field declares. Called once per rule and key
   *  (`compileEntryRule` holds the dedupe), never per row. */
  reportUnknownKey: (key: FieldKey) => void;
}

/** A rule, as one predicate. A field match reads each named key off the row and compares it with
 *  that Field's own `equals`. The Field is looked up per read rather than at compile time: a Gantt
 *  may be rebound to another Dataset, and a match names one or two keys, so the lookup is a Map read
 *  per key per row. */
export function compileEntryRule(rule: EntryRule, ports: EntryRulePorts): EntryPredicate {
  if (typeof rule === 'function') return rule;
  const keys = Object.keys(rule);
  const reported = new Set<FieldKey>();
  const reportOnce = (key: FieldKey): void => {
    if (reported.has(key)) return;
    reported.add(key);
    ports.reportUnknownKey(key);
  };
  return (entry) => keys.every((key) => valueMatches(entry, key, rule[key], ports.fieldFor, reportOnce));
}

function valueMatches(
  entry: Entry,
  key: FieldKey,
  expected: unknown,
  fieldFor: EntryRulePorts['fieldFor'],
  reportUnknownKey: (key: FieldKey) => void,
): boolean {
  // The lookup comes first, and a key no Field declares answers no. `entry.read` throws on such a
  // key, and this runs on every row of every layout pass, so reading first would take the frame
  // down for a typo — or for the one rule a chrome plugin cannot help itself with, because it
  // installs after the Dataset closes its Field gate. Claiming nothing is the answer; saying so is
  // the report (`J59`).
  const field = fieldFor(key);
  if (field === undefined) {
    reportUnknownKey(key);
    return false;
  }
  const actual = entry.read(key);
  // Called on the Field, never detached: a consumer's own `equals` may read `this`.
  return field.equals !== undefined ? field.equals(actual, expected) : Object.is(actual, expected);
}
