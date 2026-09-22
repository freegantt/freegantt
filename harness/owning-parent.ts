// #470 harness: a Field may opt out of the Rollup with `rollUp: 'none'`. This page overrides both
// core date Fields that way. `phase`'s `start`/`end` become ordinary cells, a consumer's own.
// A gesture or a call authors them once, and keeps them until it writes them again. Nothing
// recomputes them underneath.
//
// `view/capability.ts` gives that row the ordinary bar rule as a result. The move writes the
// parent **and** the dated rows below it — ADR 0013's translate still runs on the subtree. The
// resize handle opens on an edge the parent owns, and writes the parent alone.
// `e2e/owning-parent.spec.ts` drives both gestures in a real browser, plus the one-undo case.

import './harness-nav.ts';
import { Dataset, Gantt, attemptMutation } from 'freegantt';
import type { DatasetEventMap } from 'freegantt';
import { prependChangeSet } from './change-log.js';
import { mountPageBrief } from './docs/page-brief.js';

mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'owning-parent');

declare global {
  interface Window {
    __gantt: Gantt;
  }
}

// #142/#470: `CORE_FIELD_OVERRIDABLE_KEYS` grew `rollUp`, so a consumer states this Dataset-wide,
// the same door `editable` already used. `phase`'s dates are now its own. The Rollup skips them in
// both directions: it does not clear them on a demotion, and does not overwrite them on a commit.
const dataset = new Dataset({
  entries: [
    // Task B runs past the end Phase authors, which a rolling-up parent could never show: the
    // envelope and the parent's own span disagree, and #470 records that as the consumer's
    // declaration, not a fault. It also keeps Phase's rail clear of the pane's right edge, so the
    // end handle stays in reach of a pointer.
    { id: 'phase', name: 'Phase', start: '2026-01-01', end: '2026-01-06' },
    { id: 'task-a', name: 'Task A', parentId: 'phase', start: '2026-01-01', end: '2026-01-02' },
    { id: 'task-b', name: 'Task B', parentId: 'phase', start: '2026-01-03', end: '2026-01-08' },
  ],
  timeZone: 'UTC',
  fields: [
    { key: 'start', rollUp: 'none' },
    { key: 'end', rollUp: 'none' },
  ],
});

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  range: 'fitDataset',
  gridWidth: 'fitColumns',
});

window.__gantt = gantt;

const undoBtn = document.querySelector<HTMLButtonElement>('#undo-btn')!;
const log = document.querySelector<HTMLDivElement>('#log')!;

function refreshHistoryButtons(): void {
  undoBtn.disabled = !dataset.canUndo;
}

dataset.on('change', ({ changeSet }: DatasetEventMap['change']) => {
  prependChangeSet(log, changeSet);
  refreshHistoryButtons();
});

undoBtn.addEventListener('click', () => {
  attemptMutation(() => dataset.undo());
});

refreshHistoryButtons();
