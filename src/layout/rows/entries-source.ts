// layout/ — `{ source: 'entries' }`. Flat list matches S1; tree is depth-first in insertion order.
// `childrenAsSegments` (#421 C1) folds a claimed parent's children onto its own row in both modes —
// a claim is a collapse one level deeper (README's `J-plan-I`).

import { entryId, rowId } from '../../model/index.js';
import type { Entry, EntryId, RowId } from '../../model/index.js';
import type { EntriesRowSource, UnindexedRow } from './row-source.js';
import { PLANNED_ROW_KIND } from './row-source.js';
import { compileEntryRule } from '../entry-rule.js';
import type { EntryPredicate, EntryRulePorts } from '../entry-rule.js';

export function entryTreeIndex(entries: readonly Entry[]): {
  roots: readonly Entry[];
  childRowsOf: ReadonlyMap<EntryId, readonly Entry[]>;
} {
  const known = new Set(entries.map((entry) => entry.id));
  const childRowsOf = new Map<EntryId, Entry[]>();
  const roots: Entry[] = [];
  for (const entry of entries) {
    const parent = entry.parent()?.id;
    if (parent === undefined || !known.has(parent)) {
      roots.push(entry);
      continue;
    }
    const siblings = childRowsOf.get(parent);
    if (siblings) siblings.push(entry);
    else childRowsOf.set(parent, [entry]);
  }
  return { roots, childRowsOf };
}

/** No Field registry wired in — a pure `layout/` test, or any caller with no Dataset behind it —
 *  reads every key as undeclared, the same fallback `createVariantRegistry` takes for `when`
 *  (`items/variants.ts`). A field-match rule then claims nothing; a predicate rule still runs, since
 *  it reads no Field at all. */
const NO_ENTRY_RULE_PORTS: EntryRulePorts = Object.freeze({
  fieldFor: () => undefined,
  reportUnknownKey: () => {},
});

/** `childrenAsSegments`, as one predicate — `undefined` when the source names no rule. Compiled
 *  once per pass, through the one match syntax `layout/entry-rule.ts` shares with a variant's
 *  `when`. */
function compileClaim(source: EntriesRowSource, ports: EntryRulePorts): EntryPredicate | undefined {
  const rule = source.childrenAsSegments;
  if (rule === undefined) return undefined;
  if (rule === true) return () => true;
  return compileEntryRule(rule, ports);
}

function entryRow(
  entry: Entry,
  fields: {
    depth: number;
    expandable: boolean;
    parentRowId?: RowId;
    /** The claimed parent's children, drawn on its row with no row of their own (Q19 shape (a) —
     *  `entryIds[0]` stays the subject, the rest are the bars it draws). */
    claimedChildren?: readonly Entry[];
  },
): UnindexedRow {
  const extra = fields.claimedChildren?.map((child) => entryId(child.id)) ?? [];
  return {
    id: rowId(entry.id),
    kind: PLANNED_ROW_KIND.entry,
    depth: fields.depth,
    entryIds: [entryId(entry.id), ...extra],
    expandable: fields.expandable,
    expanded: false,
    ...(fields.parentRowId !== undefined ? { parentRowId: fields.parentRowId } : {}),
    ...(fields.claimedChildren !== undefined ? { claimed: true } : {}),
  };
}

export function resolveEntriesSource(
  entries: readonly Entry[],
  source: EntriesRowSource,
  ports: EntryRulePorts = NO_ENTRY_RULE_PORTS,
): UnindexedRow[] {
  // A flat source with no rule is today's path, and it pays today's cost: no tree index, no claim
  // pass, no Map. Building all three unconditionally taxed every consumer who never asked for the
  // feature (measured 0.09 ms -> 0.24 ms on the shipped fixture, #421 C1).
  if (source.childrenAsSegments === undefined && source.tree !== true) {
    return entries.map((entry) => entryRow(entry, { depth: 0, expandable: false }));
  }

  const { roots, childRowsOf } = entryTreeIndex(entries);
  const claims = compileClaim(source, ports);

  // Claimed parent -> its children, built in one pass so both branches below answer "is this
  // parent claimed?" with `.has` and read the children it takes off the row list from the same
  // read. Only a parent can be claimed, and the rule reads a Field — the most expensive question
  // this pass asks — so `childRowsOf.get` runs first and the Field read runs once per parent, not
  // once per Entry: a childless Entry (most of a real dataset) never asks the rule at all.
  const claimedChildrenOf = new Map<EntryId, readonly Entry[]>();
  if (claims !== undefined) {
    for (const entry of entries) {
      const children = childRowsOf.get(entry.id);
      if (children === undefined || children.length === 0) continue;
      if (!claims(entry)) continue;
      claimedChildrenOf.set(entry.id, children);
    }
  }

  if (source.tree !== true) {
    // The flat branch's own skip set: every descendant of a claimed parent, not only its direct
    // children — a grandchild loses its row the same way tree mode drops it off the walk stack
    // below (README's `J-plan-I`). Built off `childRowsOf`, so no second walk of `entries`.
    const excludedRows = new Set<EntryId>();
    for (const claimedParentId of claimedChildrenOf.keys()) {
      const stack = [...(childRowsOf.get(claimedParentId) ?? [])];
      while (stack.length > 0) {
        const descendant = stack.pop()!;
        if (excludedRows.has(descendant.id)) continue;
        excludedRows.add(descendant.id);
        const grandchildren = childRowsOf.get(descendant.id);
        if (grandchildren !== undefined) stack.push(...grandchildren);
      }
    }

    const rows: UnindexedRow[] = [];
    for (const entry of entries) {
      if (excludedRows.has(entry.id)) continue;
      const claimedChildren = claimedChildrenOf.get(entry.id);
      rows.push(
        entryRow(entry, {
          depth: 0,
          // A claimed parent is never expandable — it has no rows to expand into.
          expandable: false,
          ...(claimedChildren !== undefined ? { claimedChildren } : {}),
        }),
      );
    }
    return rows;
  }

  const rows: UnindexedRow[] = [];
  const stack: { list: readonly Entry[]; index: number; depth: number; parentRowId?: RowId }[] = [
    { list: roots, index: 0, depth: 0 },
  ];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.index >= frame.list.length) {
      stack.pop();
      continue;
    }
    const entry = frame.list[frame.index]!;
    frame.index += 1;
    const claimedChildren = claimedChildrenOf.get(entry.id);
    const children = childRowsOf.get(entry.id) ?? [];
    rows.push(
      entryRow(entry, {
        depth: frame.depth,
        // A claimed parent is never expandable, in tree mode either.
        expandable: claimedChildren === undefined && children.length > 0,
        ...(frame.parentRowId !== undefined ? { parentRowId: frame.parentRowId } : {}),
        ...(claimedChildren !== undefined ? { claimedChildren } : {}),
      }),
    );
    // A claimed parent's children get no row of their own (they are already on this row via
    // `entryIds`), so the walk does not push them onto the stack — the same drop
    // `collapse.ts:18-20` already does for a collapsed parent's descendants. A direct child that
    // has children of its own still loses its row here; its own bar rolls up over them exactly as
    // a collapsed parent's bar does today (README's `J-plan-I`).
    if (claimedChildren === undefined) {
      stack.push({ list: children, index: 0, depth: frame.depth + 1, parentRowId: rowId(entry.id) });
    }
  }
  return rows;
}
