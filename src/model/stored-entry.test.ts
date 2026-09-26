import { describe, expect, it } from 'vitest';
import { entryId } from './ids.js';
import { spansTime } from './stored-entry.js';
import type { FlatEntryInput, StoredEntry } from './stored-entry.js';
import type { Instant } from './time.js';

const instant = (value: number): Instant => value as Instant;

function entry(dates: { start?: Instant; end?: Instant }): StoredEntry {
  return { id: entryId('e1'), name: 'Design', props: {}, siblingIndex: 0, ...dates };
}

/** ADR 0012's span invariant, and the one place it is written. Before this, the rule was guard
 *  arithmetic at about ten sites plus six casts, and nothing in the suite stated it once. */
describe('spansTime', () => {
  it('answers yes for an Entry that holds both dates', () => {
    expect(spansTime(entry({ start: instant(0), end: instant(10) }))).toBe(true);
  });

  it('answers no for a start with no end', () => {
    expect(spansTime(entry({ start: instant(0) }))).toBe(false);
  });

  it('answers no for an end with no start', () => {
    expect(spansTime(entry({ end: instant(10) }))).toBe(false);
  });

  it('answers no for an Entry with no date at all', () => {
    expect(spansTime(entry({}))).toBe(false);
  });

  it('answers yes for a zero-length span — the rule is presence, not width', () => {
    expect(spansTime(entry({ start: instant(5), end: instant(5) }))).toBe(true);
  });

  it('answers yes for the epoch, which is falsy as a number', () => {
    expect(spansTime(entry({ start: instant(0), end: instant(0) }))).toBe(true);
  });

  it('reads any record that carries the two dates, not only an Entry', () => {
    expect(spansTime({ start: instant(0), end: instant(1) })).toBe(true);
    expect(spansTime({ start: instant(0) })).toBe(false);
  });

  it('narrows both dates to Instant for the caller', () => {
    const subject = entry({ start: instant(3), end: instant(8) });
    if (!spansTime(subject)) throw new Error('unreachable');
    // Both reads compile without a cast, which is the whole point: the six load-bearing casts
    // retired existed because nothing narrowed here.
    const width: number = subject.end - subject.start;
    expect(width).toBe(5);
  });

  it('keeps every other key of the record it narrows', () => {
    const subject: StoredEntry = {
      id: entryId('e2'),
      name: 'Build',
      start: instant(1),
      end: instant(2),
      props: { team: 'A' },
      siblingIndex: 0,
    };
    if (!spansTime(subject)) throw new Error('unreachable');
    expect(subject.props).toEqual({ team: 'A' });
  });
});

// Type tests only — these exist to compile, not to run (same convention as `entry-edit-types.test.ts`).
// A `TProps` with a key literally named `props` once made the nested-bag arm uninhabitable: the
// declared-key mapped arm did not exclude `'props'`, so `Partial<TProps>['props']` (the nested-bag
// arm) and `TProps['props']` (the declared-key arm) intersected into `never`. Excluding `'props'`
// from the declared-key arm is the fix; this test pins it against a regression.
describe('FlatEntryInput — a TProps key named "props" does not break the nested-bag form', () => {
  it('compiles: nested props still works when TProps itself declares a "props" key', () => {
    const input: FlatEntryInput<{ props: number; owner: string }> = {
      id: 't1',
      props: { props: 1, owner: 'Ali' },
    };
    expect(input).toBeDefined();
  });
});
