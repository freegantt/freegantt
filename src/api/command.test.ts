import { describe, expect, it } from 'vitest';
import { entryId, segmentId } from '../model/index.js';
import { resolveActedOn } from './command.js';
import type { ActedOn } from './command.js';

const A = segmentId('a');
const B = segmentId('b');
const C = segmentId('c');

/** The pair every caller hands the resolver: a Segment set and the Entries behind it. Each Segment
 *  in these cases belongs to an Entry of the same name, which keeps the projection readable. */
function actedOn(...ids: readonly (typeof A)[]): ActedOn {
  return { segmentIds: ids, entryIds: ids.map((id) => entryId(String(id))) };
}

describe('resolveActedOn() (#212)', () => {
  it('acts on the Selection when the clicked node is part of it (#199)', () => {
    expect(resolveActedOn(actedOn(A), actedOn(A, B, C))).toEqual(actedOn(A, B, C));
  });

  it('acts on the Selection when the clicked node is a superset of it, instead of widening (#212)', () => {
    expect(resolveActedOn(actedOn(A, B, C), actedOn(A))).toEqual(actedOn(A));
  });

  it('acts on the clicked node when it shares nothing with the Selection', () => {
    expect(resolveActedOn(actedOn(B), actedOn(A))).toEqual(actedOn(B));
  });

  it('acts on the clicked node when nothing is selected', () => {
    expect(resolveActedOn(actedOn(A, B), actedOn())).toEqual(actedOn(A, B));
  });

  it('acts on the Selection when the two sets are equal', () => {
    expect(resolveActedOn(actedOn(A, B), actedOn(A, B))).toEqual(actedOn(A, B));
  });

  it('names nothing when the clicked node stands for no Segment', () => {
    expect(resolveActedOn(actedOn(), actedOn(A, B))).toEqual(actedOn());
  });

  it('carries both readings of one set, so a command never projects one from the other', () => {
    const resolved = resolveActedOn(actedOn(A), actedOn(A, B));
    expect(resolved.segmentIds).toEqual([A, B]);
    expect(resolved.entryIds).toEqual([entryId('a'), entryId('b')]);
  });
});
