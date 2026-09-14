// #333: a thrown code and a report code are two vocabularies, and a few faults speak both. A
// `beforeChange` veto throws `MutationCancelledError` and raises a report; the cell editor reads no
// value back and does the same. Each pair must use one spelling, or a consumer who switches on
// `error.code` and on `report.code` writes two different cases for one fault.
//
// `error-report.ts` documented that match and nothing checked it (#259). Both unions are closed now,
// so the overlap is computable. `Record<Extract<…>, true>` makes TypeScript name every shared code
// exactly once: a third code added to one union that happens to spell a member of the other fails
// here until someone writes it down on purpose. A near-miss spelling is the case this catches —
// `'unreadable-cell-value'` beside `'unreadable-value'` would drop out of `Extract` and break the
// literal, rather than shipping as two names for one fault.
import { describe, expect, it } from 'vitest';
import type { BuiltInThrownCode } from './errors.js';
import type { BuiltInReportCode } from './error-report.js';

const SHARED_CODES: Record<Extract<BuiltInThrownCode, BuiltInReportCode>, true> = {
  'mutation-cancelled': true,
  'unreadable-value': true,
};

describe('the thrown and report vocabularies (#333)', () => {
  it('share exactly the two codes whose fault both throws and reports', () => {
    expect(Object.keys(SHARED_CODES).sort()).toEqual(['mutation-cancelled', 'unreadable-value']);
  });
});
