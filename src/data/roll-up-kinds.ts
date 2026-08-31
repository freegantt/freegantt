// data/ — resolves `rollUpKinds` construction input (D-S4-6).

import type { EntryKind, RollUpKinds } from '../model/index.js';

/** `'none'` and `[]` both disable derivation; omitted defaults to `['group']`. */
export function resolveRollUpKinds(input: RollUpKinds | undefined): ReadonlySet<EntryKind> {
  if (input === 'none') return new Set();
  const list = input ?? ['group'];
  if (list.length === 0) return new Set();
  return new Set(list);
}

/** The getter/toJSON form — always a plain array, never `'none'`. */
export function rollUpKindsAsArray(kinds: ReadonlySet<EntryKind>): readonly EntryKind[] {
  return [...kinds];
}
