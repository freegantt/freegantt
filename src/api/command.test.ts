import { describe, expect, it } from 'vitest';
import { entryId } from '../model/index.js';
import { resolveActedOnEntryIds } from './command.js';

const A = entryId('a');
const B = entryId('b');
const C = entryId('c');

describe('resolveActedOnEntryIds() (#212)', () => {
  it('acts on the Selection when the clicked node is part of it (#199)', () => {
    expect(resolveActedOnEntryIds([A], [A, B, C])).toEqual([A, B, C]);
  });

  it('acts on the Selection when the clicked node is a superset of it, instead of widening (#212)', () => {
    expect(resolveActedOnEntryIds([A, B, C], [A])).toEqual([A]);
  });

  it('acts on the clicked node when it shares nothing with the Selection', () => {
    expect(resolveActedOnEntryIds([B], [A])).toEqual([B]);
  });

  it('acts on the clicked node when nothing is selected', () => {
    expect(resolveActedOnEntryIds([A, B], [])).toEqual([A, B]);
  });

  it('acts on the Selection when the two sets are equal', () => {
    expect(resolveActedOnEntryIds([A, B], [A, B])).toEqual([A, B]);
  });

  it('names nothing when the clicked node stands for no Entry', () => {
    expect(resolveActedOnEntryIds([], [A, B])).toEqual([]);
  });
});
