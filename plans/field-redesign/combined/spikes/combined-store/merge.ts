/** One merge shape: per-key inside props, shallow elsewhere. Improvement F. */

import type { EntryProps, PropsEdit } from './types.js';

export function mergeProps(base: EntryProps, patch: PropsEdit): EntryProps {
  const next: EntryProps = { ...base };
  for (const key of Object.keys(patch) as (keyof EntryProps)[]) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const value = patch[key];
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

export type LooseEdit = { props?: PropsEdit | undefined };

/** mergeEntryEdits — per-key inside props. */
export function mergeEntryEdits(
  merged: Map<string, LooseEdit>,
  id: string,
  edit: LooseEdit,
): void {
  const prev = merged.get(id) ?? {};
  const prevProps = prev.props ?? {};
  const nextProps = edit.props ?? {};
  merged.set(id, {
    ...prev,
    ...edit,
    props: mergeProps(prevProps as EntryProps, nextProps),
  });
}

/** mergeStoredEdits — same per-key rule as mergeEntryEdits. */
export function mergeStoredEdits(
  merged: Map<string, LooseEdit>,
  id: string,
  edit: LooseEdit,
): void {
  mergeEntryEdits(merged, id, edit);
}
