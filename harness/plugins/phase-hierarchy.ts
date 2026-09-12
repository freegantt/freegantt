// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.6, [S5-A2]).

import { definePlugin } from 'freegantt';
import type { DataPlugin } from 'freegantt';

/** The key this plugin reads. An app that already names its tree somewhere else — a WBS code, a
 *  phase id out of another system — names it here and stops writing `parentId` at all. */
export interface PhaseProps {
  phaseId?: string;
}

/**
 * Moves the tree off `parentId` and onto a `props` key (ADR 0020).
 *
 * ```ts
 * const dataset = new Dataset({ entries, plugins: [phaseHierarchy()] });
 * dataset.entries.update('gate', { phaseId: 'phase-empty' });
 * ```
 *
 * Two seams, two jobs:
 * - **the Field** — `phaseId` has to be declared before anything may write it (ADR 0011), and a
 *   plugin declares its own keys while `data()` runs (D-S5-4).
 * - **the hierarchy source** — which Entry is the parent of this one? The phase id when there is
 *   one, otherwise whatever the next source says. Core's own source answers `parentId`, so a row
 *   with no phase id keeps the tree it was authored with.
 *
 * Everything downstream follows from that one answer, with nothing else registered: the row nests,
 * `entry.children()` and `entry.depth` move with it, the Rollup gives the named Entry its children's
 * cost and span, and the `parent` variant paints it as a summary — because it **is** one, not
 * because a stored word said so.
 */
export function phaseHierarchy(): DataPlugin {
  return definePlugin({
    id: 'demo.phaseHierarchy',
    data(ctx) {
      ctx.fields.register({ key: 'phaseId' });
      ctx.hierarchy.setSource<PhaseProps>((next) => (entry) => entry.props.phaseId ?? next(entry));
    },
  });
}
