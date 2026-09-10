/** Baseline — brand inner bag (spike/0011-proposed-edit-brand placement). */

import type { EntryProps, PropsEdit } from '../combined-store/types.js';

export type PropsEditPatch = PropsEdit & { readonly __brand?: never };

export type EntryEdit = { props?: PropsEditPatch | undefined };

type ProposedProps = Readonly<EntryProps> & { readonly __brand: 'ProposedEdit' };

export type ProposedEdit = {
  readonly props: ProposedProps;
  readonly proposedKeys: ReadonlySet<string>;
};

