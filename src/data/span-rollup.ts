// data/ — the span rollup: `data/`'s own commit step (never an extender occupant, D-S2-22), giving a
// deriving-kind entry's start/end the min/max of its children's spans, bottom-up, on every commit
// (`01` §2.5/§2.6, S2.3 §1.5). A leaf module — only `data/transaction.ts` names it (D-S2-23,
// `span-rollup-is-removable`); delete this file and groups keep their authored span, the same result
// a consumer gets by asking for `derivedSpanKinds: []`.

import type { Entry, EntryId, EntryKind, FieldUpdated, Instant } from '../model/index.js';
import type { EntryEdits } from './edit-extension.js';

interface EffectiveSpan {
  start: Instant;
  end: Instant;
}

/** A child's span for this pass: its own freshly rolled-up value if this pass already computed one
 * (bottom-up composition for nested groups), else what this transaction proposed for it, else its
 * committed value. */
function effectiveSpan(
  id: EntryId,
  entries: ReadonlyMap<EntryId, Entry>,
  proposed: EntryEdits,
  computed: ReadonlyMap<EntryId, EffectiveSpan>,
): EffectiveSpan | undefined {
  const already = computed.get(id);
  if (already) return already;
  const current = entries.get(id);
  if (!current) return undefined;
  const edit = proposed.get(id);
  return { start: edit?.start ?? current.start, end: edit?.end ?? current.end };
}

function depthOf(id: EntryId, entries: ReadonlyMap<EntryId, Entry>): number {
  let depth = 0;
  let current = entries.get(id);
  // parentId cycles are rejected before a transaction ever reaches the rollup (§1.3), so this need
  // not guard against one.
  while (current?.parentId !== undefined) {
    depth += 1;
    current = entries.get(current.parentId);
  }
  return depth;
}

/**
 * `entries` is the pre-transaction committed snapshot; `proposed` is the body's and the extension
 * hook's edits, already merged (S2.2 §2.3 step 5). By the time a transaction reaches this step, a
 * given `(id, field)` pair appears in `proposed` from at most one producer — the dev-mode I4 assert in
 * `transaction.ts` is what guarantees it — so "a field this entry already has a proposed value for"
 * is enough here to implement D-S2-22's "yields to a field the body proposed, wins over one the
 * extender proposed": in S2 nothing occupies the extension hook with real edits, so the two cases
 * never actually diverge yet. Widening this to genuinely prefer body over extender needs
 * `runTransaction` to pass the two edit sets separately instead of pre-merged — S3's call to make
 * when a real extender lands (docs/adr/0002).
 */
export function rollUpDerivedSpans(
  entries: ReadonlyMap<EntryId, Entry>,
  proposed: EntryEdits,
  kinds: ReadonlySet<EntryKind>,
): readonly FieldUpdated[] {
  if (kinds.size === 0) return [];

  const byParent = new Map<EntryId, EntryId[]>();
  for (const entry of entries.values()) {
    if (entry.parentId === undefined) continue;
    const siblings = byParent.get(entry.parentId);
    if (siblings) siblings.push(entry.id);
    else byParent.set(entry.parentId, [entry.id]);
  }

  // Deepest first, so a nested group's own rollup is in `computed` before its parent's turn.
  const derivingEntries = Array.from(entries.values())
    .filter((entry) => kinds.has(entry.kind))
    .sort((a, b) => depthOf(b.id, entries) - depthOf(a.id, entries));

  const computed = new Map<EntryId, EffectiveSpan>();
  const updated: FieldUpdated[] = [];

  for (const parent of derivingEntries) {
    const childIds = byParent.get(parent.id);
    if (!childIds || childIds.length === 0) continue; // childless: keeps its span, no row emitted

    let start: Instant | undefined;
    let end: Instant | undefined;
    for (const childId of childIds) {
      const span = effectiveSpan(childId, entries, proposed, computed);
      if (!span) continue;
      start = start === undefined || span.start < start ? span.start : start;
      end = end === undefined || span.end > end ? span.end : end;
    }
    if (start === undefined || end === undefined) continue;

    computed.set(parent.id, { start, end });

    const edit = proposed.get(parent.id);
    if (edit?.start === undefined && parent.start !== start) {
      updated.push({ store: 'entries', id: parent.id, field: 'start', from: parent.start, to: start });
    }
    if (edit?.end === undefined && parent.end !== end) {
      updated.push({ store: 'entries', id: parent.id, field: 'end', from: parent.end, to: end });
    }
  }

  return updated;
}
