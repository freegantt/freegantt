import { describe, expect, it } from 'vitest';
import { attemptMutation } from './attempt-mutation.js';
import { MutationCancelledError } from '../model/index.js';
import type { ChangeSet } from '../model/index.js';

// #275 item 4: the catch's whole job is "swallow a refusal, rethrow everything else". The rethrow
// is the one that matters — regress it to a swallow and every harness button would report success
// over a failed mutation with nothing to say so.
describe('attemptMutation (#275 §4)', () => {
  it('runs the body and returns true when nothing is refused', () => {
    let ran = false;
    const result = attemptMutation(() => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(result).toBe(true);
  });

  it('a refused beforeChange (MutationCancelledError) is swallowed and reported as false', () => {
    const changeSet = {} as ChangeSet;
    const result = attemptMutation(() => {
      throw new MutationCancelledError(changeSet, 'no thanks');
    });
    expect(result).toBe(false);
  });

  it('any other error still throws — a refusal is not a license to swallow everything', () => {
    const boom = new Error('boom');
    expect(() =>
      attemptMutation(() => {
        throw boom;
      }),
    ).toThrow(boom);
  });
});
