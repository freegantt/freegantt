// data/ — core's own hierarchy source, and the check core runs over any source's answers (ADR 0020).
// `model/hierarchy-source.ts` declares the type; this file holds the two runtime pieces.
//
// A source is a plugin's function, so its answers are claims. Core checks them once per revision and
// never per read: an id no Entry holds reads as a root, and a chain that loops is broken at the link
// that closes it. Both raise one Fault each, and neither throws — a Gantt whose plugin answers badly
// still draws.

import type { EntryId, HierarchySource, RaiseError, StoredEntry } from '../model/index.js';
import { entryId } from '../model/index.js';

/** Core's own source, registered like any other with no special claim on the seam (D-S5-23). A
 *  Dataset with no plugin installed reads this and nothing else, so `parentId` stays the tree. */
export const storedParentSource: HierarchySource = (entry) => entry.parentId;

/** What the source says about one row, branded — core's one `string → EntryId` boundary for this
 *  seam. A source may answer with a plain `string`, the way every other way into the library takes
 *  a loose id, and every reader downstream holds an `EntryId`. */
export function parentIdFrom(source: HierarchySource, entry: StoredEntry): EntryId | undefined {
  const answer = source(entry);
  return answer === undefined ? undefined : entryId(answer);
}

/** Which Entry the source named as the parent of each of these, after core checked the answers.
 *  Only an Entry with an accepted parent is in the map; everything else is a root. */
export type ParentIndex = ReadonlyMap<EntryId, EntryId>;

/**
 * Reads `parentIdOf` once per Entry and hands back the tree core will actually use.
 *
 * Two answers are refused, and each reports once for the whole pass (ADR 0020):
 *
 * - **A parent id no Entry holds.** That Entry reads as a root.
 * - **A chain that loops.** The Entry whose answer closes the loop reads as a root, so the rest of
 *   the chain keeps its shape and one link is dropped rather than the whole cycle.
 *
 * `report` is omitted on the Rollup's own pass, which walks a hypothetical tree the store has not
 * committed yet — the store reports that tree once the commit lands, and a pass that reported too
 * would say the same thing twice per commit.
 */
export function checkHierarchySource(
  entries: ReadonlyMap<EntryId, StoredEntry>,
  parentIdOf: HierarchySource,
  report?: RaiseError,
): ParentIndex {
  const claimed = new Map<EntryId, EntryId>();
  for (const entry of entries.values()) {
    const parentId = parentIdFrom(parentIdOf, entry);
    if (parentId === undefined) continue;
    if (!entries.has(parentId)) {
      report?.(
        {
          code: 'unknown-parent',
          message: `hierarchy: the source named "${parentId}" as the parent of "${entry.id}", and no Entry holds that id. "${entry.id}" reads as a root.`,
          severity: 'warning',
          by: 'plugin',
          entryId: entry.id,
        },
        () =>
          console.warn(
            `FreeGantt: hierarchy: no Entry holds "${parentId}", named as the parent of "${entry.id}".`,
          ),
      );
      continue;
    }
    claimed.set(entry.id, parentId);
  }
  breakCycles(claimed, report);
  return claimed;
}

/** Walks every chain once, colouring each Entry as it goes, and drops the link that closes a loop.
 *  A worklist over the parent chain, never recursion: how deep a tree goes is the consumer's to
 *  author, and a stack overflow answers no question. */
function breakCycles(claimed: Map<EntryId, EntryId>, report?: RaiseError): void {
  const settled = new Set<EntryId>();
  const walking = new Set<EntryId>();
  const chain: EntryId[] = [];

  for (const start of claimed.keys()) {
    if (settled.has(start)) continue;
    chain.length = 0;
    let current: EntryId | undefined = start;
    while (current !== undefined && !settled.has(current) && !walking.has(current)) {
      walking.add(current);
      chain.push(current);
      current = claimed.get(current);
    }
    // `current` is still being walked, so this chain arrived back at an Entry it already passed.
    // The last Entry in the chain is the one whose answer closed the loop.
    if (current !== undefined && walking.has(current)) {
      const closingId = chain[chain.length - 1]!;
      claimed.delete(closingId);
      report?.(
        {
          code: 'hierarchy-cycle',
          message: `hierarchy: the source makes "${closingId}" its own ancestor, through "${current}". "${closingId}" reads as a root.`,
          severity: 'warning',
          by: 'plugin',
          entryId: closingId,
        },
        () => console.warn(`FreeGantt: hierarchy: the source makes "${closingId}" its own ancestor.`),
      );
    }
    for (const id of chain) {
      walking.delete(id);
      settled.add(id);
    }
  }
}
