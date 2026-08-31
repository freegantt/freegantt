// data/ — the Rollup: `data/`'s own commit step (never an extender occupant, D-S2-22), giving a
// roll-up-kind parent every rolling-up Field from its children, bottom-up, on every commit
// (`01` §2.5/§2.6, S4.2). A leaf module — only `data/transaction.ts` names it (D-S4-7,
// `rollup-is-removable`); delete this file and every entry keeps its authored values — the same stored
// result a consumer gets from `rollUpKinds: 'none'`.

import type { Entry, EntryId, EntryKind, FieldContext, FieldUpdated } from '../model/index.js';
import { AggregatorFailedError } from '../model/index.js';
import type { EntryEdits } from './edit-extension.js';
import { authoredFieldKeysOf, overlayStoredEdit, readField, writeField } from './fields/field-access.js';
import type { FieldRegistry, ResolvedField } from './fields/field-registry.js';

export interface RollUpEditSets {
  /** The transaction body's edits — the Rollup yields to a field proposed here (D-S2-22). */
  readonly body: EntryEdits;
  /** Body plus extension-hook edits — used to read effective child values. */
  readonly merged: EntryEdits;
}

/** The entry tree as this transaction will commit it — adds, removes and staged edits applied (S4.2). */
export function buildEffectiveEntries(
  committed: ReadonlyMap<EntryId, Entry>,
  added: readonly Entry[],
  removed: readonly Entry[],
  proposed: EntryEdits,
): ReadonlyMap<EntryId, Entry> {
  const map = new Map(committed);
  for (const entity of removed) map.delete(entity.id);
  for (const entity of added) map.set(entity.id, entity);
  for (const [id, edit] of proposed) {
    const current = map.get(id);
    if (current) map.set(id, overlayStoredEdit(current, edit));
  }
  return map;
}

function depthOf(id: EntryId, entries: ReadonlyMap<EntryId, Entry>): number {
  let depth = 0;
  let current = entries.get(id);
  while (current?.parentId !== undefined) {
    depth += 1;
    current = entries.get(current.parentId);
  }
  return depth;
}

function childrenByParent(entries: ReadonlyMap<EntryId, Entry>): Map<EntryId, EntryId[]> {
  const byParent = new Map<EntryId, EntryId[]>();
  for (const entry of entries.values()) {
    if (entry.parentId === undefined) continue;
    const siblings = byParent.get(entry.parentId);
    if (siblings) siblings.push(entry.id);
    else byParent.set(entry.parentId, [entry.id]);
  }
  return byParent;
}

function ancestorsOf(id: EntryId, entries: ReadonlyMap<EntryId, Entry>): readonly EntryId[] {
  const result: EntryId[] = [];
  let current = entries.get(id)?.parentId;
  while (current !== undefined) {
    result.push(current);
    current = entries.get(current)?.parentId;
  }
  return result;
}

/** Collects every parent that may need recomputation after this transaction (D-S4-8). */
export function collectTouchedIds(
  entries: ReadonlyMap<EntryId, Entry>,
  added: readonly Entry[],
  removed: readonly Entry[],
  proposed: EntryEdits,
): ReadonlySet<EntryId> {
  const touched = new Set<EntryId>();
  for (const entity of added) touched.add(entity.id);
  for (const entity of removed) touched.add(entity.id);
  for (const id of proposed.keys()) touched.add(id);
  for (const [id, edit] of proposed) {
    if ('parentId' in edit) {
      const former = entries.get(id)?.parentId;
      if (former !== undefined) touched.add(former);
    }
  }
  return touched;
}

function parentsToRecompute(
  entries: ReadonlyMap<EntryId, Entry>,
  kinds: ReadonlySet<EntryKind>,
  touched: ReadonlySet<EntryId> | undefined,
): readonly EntryId[] {
  if (kinds.size === 0) return [];

  const parents = new Set<EntryId>();
  if (touched === undefined) {
    for (const entry of entries.values()) {
      if (kinds.has(entry.kind)) parents.add(entry.id);
    }
  } else {
    for (const id of touched) {
      for (const ancestor of ancestorsOf(id, entries)) parents.add(ancestor);
    }
  }

  return Array.from(parents)
    .filter((id) => {
      const entry = entries.get(id);
      return entry !== undefined && kinds.has(entry.kind);
    })
    .sort((a, b) => depthOf(b, entries) - depthOf(a, entries));
}

function bodyProposedField(body: EntryEdits, id: EntryId, field: ResolvedField): boolean {
  const edit = body.get(id);
  if (!edit) return false;
  if (field.source.from === 'entry') {
    return (edit as Record<string, unknown>)[field.source.field] !== undefined;
  }
  if (field.source.from === 'meta') {
    return authoredFieldKeysOf(edit).has(String(field.key));
  }
  return false;
}

function entryWithFieldValue(entry: Entry, field: ResolvedField, value: unknown): Entry {
  if (field.source.from === 'meta') {
    return overlayStoredEdit(entry, writeField({}, entry, field, value));
  }
  if (field.source.from === 'entry') {
    const next: Record<string, unknown> = { ...entry };
    if (value === undefined) delete next[field.source.field];
    else next[field.source.field] = value;
    return next as unknown as Entry;
  }
  return entry;
}

function effectiveEntry(
  id: EntryId,
  entries: ReadonlyMap<EntryId, Entry>,
  merged: EntryEdits,
  computed: ReadonlyMap<EntryId, Entry>,
): Entry | undefined {
  const rolled = computed.get(id);
  if (rolled) return rolled;
  const current = entries.get(id);
  if (!current) return undefined;
  const edit = merged.get(id);
  return edit ? overlayStoredEdit(current, edit) : current;
}

/**
 * `entries` is the pre-transaction committed snapshot. `edits.body` is the transaction body's
 * proposed edits; `edits.merged` is body plus the extension hook. When `touched` is omitted, every
 * deriving parent is walked (construction and `fromJSON`).
 */
export function rollUpFields(
  entries: ReadonlyMap<EntryId, Entry>,
  edits: RollUpEditSets,
  registry: FieldRegistry,
  rollUpKinds: ReadonlySet<EntryKind>,
  ctx: FieldContext,
  touched?: ReadonlySet<EntryId>,
): readonly FieldUpdated[] {
  if (rollUpKinds.size === 0) return [];

  const rollingFields = registry.rollingUp();
  if (rollingFields.length === 0) return [];

  const byParent = childrenByParent(entries);
  const parents = parentsToRecompute(entries, rollUpKinds, touched);
  const computed = new Map<EntryId, Entry>();
  const updated: FieldUpdated[] = [];

  for (const parentId of parents) {
    const parent = entries.get(parentId);
    if (!parent) continue;

    const childIds = byParent.get(parentId);
    if (!childIds || childIds.length === 0) continue;

    const children: Entry[] = [];
    for (const childId of childIds) {
      const child = effectiveEntry(childId, entries, edits.merged, computed);
      if (child) children.push(child);
    }
    if (children.length === 0) continue;

    let effectiveParent = effectiveEntry(parentId, entries, edits.merged, computed) ?? parent;

    for (const field of rollingFields) {
      if (bodyProposedField(edits.body, parentId, field)) continue;

      const aggregator = registry.aggregator(field.rollUp!);
      if (!aggregator) continue;

      const rollCtx = {
        field: field.key,
        read: <T>(entry: Entry, key: typeof field.key) => ctx.read<T>(entry, key),
      };

      let value: unknown;
      try {
        value = aggregator(children, effectiveParent, rollCtx);
      } catch {
        throw new AggregatorFailedError(field.key, field.rollUp!, parentId);
      }

      if (value === undefined) continue;

      const from = readField(effectiveParent, field, ctx);
      if (registry.valuesEqual(String(field.key), from, value)) continue;

      updated.push({ store: 'entries', id: parentId, field: field.key, from, to: value });
      effectiveParent = entryWithFieldValue(effectiveParent, field, value);
    }

    computed.set(parentId, effectiveParent);
  }

  return updated;
}
