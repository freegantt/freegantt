// model/ — the hierarchy source (ADR 0020). Types only, like everything else here; `data/` holds
// core's own source and the check core runs over a source's answers.
//
// A plugin states which Entry is the parent of another, and core owns everything downstream of that
// answer: the child index, `depth`, the descendant walk and the Rollup.

import type { EntryId } from './ids.js';
import type { StoredEntry } from './stored-entry.js';

/**
 * Which Entry is the parent of this one? `undefined` is a root.
 *
 * **It reads a `StoredEntry`, never the live `Entry`** (ADR 0020). The live `Entry` answers
 * `parent()`, `children()`, `depth` and `descendants()`, and every one of those answers is built
 * from this function. A source handed a live `Entry` would ask the question it exists to answer.
 *
 * Core's own source is `(entry) => entry.parentId`, registered like any other with no special claim
 * on the seam (D-S5-23).
 *
 * One Entry in, one parent id out — never the whole dataset. Core inverts the answer into the child
 * index, so a query stays O(children + edits) instead of O(dataset).
 *
 * A plain `string` is a legal answer, the way it is on every other way into the library: core brands
 * it. `TProps` types `entry.props`, so a source that reads a consumer key names that key's own type
 * — `definePlugin<PlannerProps>({ hierarchySource })`.
 */
export type HierarchySource<TProps = Record<string, unknown>> = (
  entry: StoredEntry<TProps>,
) => EntryId | string | undefined;

/**
 * How a plugin claims the seam. Declared on the plugin's own `hierarchySource` member (ADR 0031); it
 * receives the current occupant and may call it, the same way an `ExtenderWrapper` composes:
 *
 * ```ts
 * hierarchySource: (next) => (entry) => entry.props.phaseId ?? next(entry),
 * ```
 *
 * That reads: the phase id when there is one, otherwise whatever the next source says.
 */
export type HierarchySourceWrapper<TProps = Record<string, unknown>> = (
  next: HierarchySource<TProps>,
) => HierarchySource<TProps>;
