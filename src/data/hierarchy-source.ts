// data/ — core's own hierarchy source, and the check core runs over any source's answers (ADR 0020).
// `model/hierarchy-source.ts` declares the type; this file holds the two runtime pieces.
//
// A source is a plugin's function, so its answers are claims. Core checks them once per revision and
// never per read: an id no Entry holds reads as a root, and a chain that loops is broken at the link
// that closes it. Both are refused answers, and neither throws — a Gantt whose plugin answers badly
// still draws.
//
// **The check reports nothing itself** (`F5`). It hands the refused answers back, and the caller
// raises them where it wants them raised: the store does it once per revision, from the commit path,
// and the Rollup's own pass — a tree no commit has landed — drops them on the floor.

import type { EntryId, ReportCode, ErrorReportInput, HierarchySource, StoredEntry } from '../model/index.js';
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

/** The tree core will use, and every answer it refused on the way to it. Each refusal is an Error
 *  report the caller raises as it is — the raise site adds the `console` fallback, because the
 *  fallback is the same one line for all of them. */
export interface CheckedHierarchy {
  readonly parents: ParentIndex;
  readonly refused: readonly ErrorReportInput[];
}

/**
 * Reads `parentIdOf` once per Entry and hands back the tree core will actually use.
 *
 * Two answers are refused, and each is refused once for the whole pass (ADR 0020):
 *
 * - **A parent id no Entry holds.** That Entry reads as a root.
 * - **A chain that loops.** The Entry whose answer closes the loop reads as a root, so the rest of
 *   the chain keeps its shape and one link is dropped rather than the whole cycle.
 *
 * Pure: it raises nothing and it reads no clock. `CheckedHierarchy.refused` is what the caller
 * raises, and the Rollup's own pass ignores it — that pass walks a hypothetical tree the store has
 * not committed yet, and the store reports the same tree once the commit lands.
 */
export function checkHierarchyAnswers(
  entries: ReadonlyMap<EntryId, StoredEntry>,
  parentIdOf: HierarchySource,
): CheckedHierarchy {
  const parentOf = new Map<EntryId, EntryId>();
  const refused: ErrorReportInput[] = [];
  for (const entry of entries.values()) {
    const parentId = parentIdFrom(parentIdOf, entry);
    if (parentId === undefined) continue;
    if (!entries.has(parentId)) {
      refused.push(
        refuse(
          entry,
          parentId,
          'unknown-parent',
          `names "${parentId}" as the parent of "${entry.id}", and no Entry holds that id.`,
        ),
      );
      continue;
    }
    parentOf.set(entry.id, parentId);
  }
  breakCycles(entries, parentOf, refused);
  return { parents: parentOf, refused };
}

/** One answer core refused, worded for whoever gave it (`F4`).
 *
 *  A source composes, so who is installed does not say who answered: a plugin that falls through
 *  (`entry.props.phaseId ?? next(entry)`) hands back the row's own `parentId`, which the consumer
 *  authored. The **answer** names the author — it is the consumer's when it is the value stored on
 *  the row, and a plugin's when it is anything else. The two authors read different words, because
 *  an app author meets `parentId` on their own data and never meets "the source", which `plans/02`
 *  calls an expert door.
 *
 *  `says` completes the sentence after whoever answered. */
function refuse(entry: StoredEntry, answer: EntryId, code: ReportCode, says: string): ErrorReportInput {
  const authored = entry.parentId === answer;
  return {
    code,
    message: `hierarchy: ${authored ? "the row's own parentId" : 'the source'} ${says} "${entry.id}" reads as a root.`,
    severity: 'warning',
    by: authored ? 'consumer' : 'plugin',
    entryId: entry.id,
  };
}

/** Walks every chain once, colouring each Entry as it goes, and drops the link that closes a loop.
 *  A worklist over the parent chain, never recursion: how deep a tree goes is the consumer's to
 *  author, and a stack overflow answers no question. */
function breakCycles(
  entries: ReadonlyMap<EntryId, StoredEntry>,
  parentOf: Map<EntryId, EntryId>,
  refused: ErrorReportInput[],
): void {
  const settled = new Set<EntryId>();
  const walking = new Set<EntryId>();
  const chain: EntryId[] = [];

  for (const start of parentOf.keys()) {
    if (settled.has(start)) continue;
    chain.length = 0;
    let current: EntryId | undefined = start;
    while (current !== undefined && !settled.has(current) && !walking.has(current)) {
      walking.add(current);
      chain.push(current);
      current = parentOf.get(current);
    }
    // `current` is still being walked, so this chain arrived back at an Entry it already passed.
    // The last Entry in the chain is the one whose answer closed the loop.
    if (current !== undefined && walking.has(current)) {
      const closingId = chain[chain.length - 1]!;
      const closing = entries.get(closingId);
      parentOf.delete(closingId);
      if (closing !== undefined) {
        refused.push(
          refuse(
            closing,
            current,
            'hierarchy-cycle',
            `makes "${closingId}" its own ancestor, through "${current}".`,
          ),
        );
      }
    }
    for (const id of chain) {
      walking.delete(id);
      settled.add(id);
    }
  }
}
