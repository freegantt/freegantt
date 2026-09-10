/** Extender seam. Runtime owns composition. Brand the whole ProposedEdit (improvement B). */

import { mergeEntryEdits } from './merge.js';
import { proposedKeysByPresence } from './props.js';
import { PluginWriteCollisionError } from './errors.js';
import type { EntryProps, PropsEdit } from './types.js';

export type EntryEdit = { props?: PropsEdit | undefined; readonly __brand?: never };

export type EntryEdits = ReadonlyMap<string, EntryEdit>;

export type ProposedEdit = {
  readonly __brand: 'ProposedEdit';
  readonly props: Readonly<EntryProps>;
  readonly proposedKeys: ReadonlySet<string>;
};

export type EditExtender = (request: {
  proposed: ReadonlyMap<string, ProposedEdit>;
}) => EntryEdits | undefined;

export function toProposedEdit(pre: EntryProps, body: EntryEdit): ProposedEdit {
  return {
    __brand: 'ProposedEdit',
    props: { ...pre, ...(body.props ?? {}) },
    proposedKeys: proposedKeysByPresence(body.props ?? {}),
  };
}

export function composeExtenders(
  extenders: readonly { name: string; fn: EditExtender }[],
  proposed: ReadonlyMap<string, ProposedEdit>,
): Map<string, EntryEdit> {
  const merged = new Map<string, EntryEdit>();
  const writers = new Map<string, Set<string>>();

  for (const { name, fn } of extenders) {
    const extra = fn({ proposed });
    if (!extra) continue;
    for (const [id, edit] of extra) {
      for (const key of proposedKeysByPresence(edit.props ?? {})) {
        let set = writers.get(key);
        if (!set) {
          set = new Set();
          writers.set(key, set);
        }
        set.add(name);
      }
      mergeEntryEdits(merged, id, edit);
    }
  }

  for (const [field, plugins] of writers) {
    if (plugins.size > 1) {
      throw new PluginWriteCollisionError(field, [...plugins]);
    }
  }

  return merged;
}

export const identityExtender: EditExtender = () => undefined;
