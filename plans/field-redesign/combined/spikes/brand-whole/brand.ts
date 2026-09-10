/** Improvement B — brand the whole ProposedEdit, not the inner bag. */

import type { EntryProps, PropsEdit } from '../combined-store/types.js';

export type EntryEdit = { props?: PropsEdit | undefined; readonly __brand?: never };

export type ProposedEdit = {
  readonly __brand: 'ProposedEdit';
  readonly props: Readonly<EntryProps>;
  readonly proposedKeys: ReadonlySet<string>;
};

export type EntryEdits = ReadonlyMap<string, EntryEdit>;
