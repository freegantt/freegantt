// layout/ — the pure gesture math a drag needs (plans/s3-direct-manipulation/s3.3-drag-move.md
// D-S3-4). `interaction/` performs no arithmetic of its own — it receives a `Draft` (a `ProposedEdits`,
// D-S3-2) from `GesturePipeline.session()` (`#draftFor`), which calls `draftForMove` here.
// Every date computation goes through `time/` (I10); this file never touches an Instant except by
// calling one of those functions.

import type {
  Entry,
  EntryId,
  Instant,
  BarId,
  ProposedEdit,
  ProposedEdits,
  TimeUnit,
} from '../model/index.js';
import { barId, spansTime } from '../model/index.js';
import { addMs, diffMs, formatDate, stepBy, snapInstant, stepsBetween } from '../time/index.js';
import type { SnapUnit } from '../time/index.js';
import type { TimeScale } from '../time/index.js';

export interface DraftInput {
  zone: string;
  scale: TimeScale;
  /** Resolved snap setting (D-S3-12) — the caller has already turned an unset/`'tick'`
   *  `ViewPreset.snap` into a concrete `{ unit, increment }`, and Alt into `'none'`. */
  snap: SnapUnit;
  /** The entries this gesture moves, grabbed entry first (D-S3-22) — `entries[0]`'s own `start` is
   *  the anchor every other entry's delta is measured against, so a multi-selection drag moves as one
   *  rigid group instead of each row snapping independently.
   *
   *  A parent bar's drag hands over the grabbed parent *and* the descendants it translates (ADR
   *  0013). Every one of them gets an edit here; which of those edits commit is the caller's own
   *  answer (`view/gesture-pipeline.ts`), because a parent's dates roll up rather than being
   *  written. Which Entries a gesture reaches is entirely the caller's own answer now too (ADR
   *  0026): a Bar is one child Entry, so "select bar 2 of 3" already names the one child Entry to put
   *  in this list — this file never re-derives that answer from a Selection. */
  entries: readonly Entry[];
  /** Horizontal pointer travel since the gesture armed, in content px (D-S3-11: vertical is ignored). */
  dxPx: number;
}

/** A move draft: `{ start, end }` for every grabbed entry, snapped and stepped as one rigid group
 *  (D-S3-3, D-S3-19). Each grabbed Entry moves whole — a Bar is one child Entry now (ADR 0026), so
 *  there is no partial reach within one Entry left to compute. Empty when `input.entries` is empty —
 *  a gesture with nothing to move. */
export function draftForMove(input: DraftInput): ProposedEdits {
  const { zone, entries } = input;
  const anchor = entries[0];
  if (!anchor) return new Map();

  const by = translationOf(input, edgeInstantOf(anchor, 'start'));
  const edits = new Map<EntryId, ProposedEdit>();
  for (const entry of entries) edits.set(entry.id, translatedEdit(zone, entry, by));
  return edits;
}

/** A resize draft: one edge of every grabbed entry moves by the same snapped/stepped calendar delta
 *  as `entries[0]`'s own grabbed edge (D-S3-19), the opposite edge held fixed. */
export function draftForResize(input: DraftInput & { edge: 'start' | 'end' }): ProposedEdits {
  const { zone, entries, edge } = input;
  const anchor = entries[0];
  if (!anchor) return new Map();

  const by = translationOf(input, edgeInstantOf(anchor, edge));
  const edits = new Map<EntryId, ProposedEdit>();
  for (const entry of entries) {
    const current = edgeInstantOf(entry, edge);
    edits.set(entry.id, resizeEdit(entry, edge, translate(zone, current, by)));
  }
  return edits;
}

/** How far this gesture moves what it grabbed: raw milliseconds when nothing snaps, else a count of
 *  calendar steps in the snap's own unit. One gesture resolves this once, against the grabbed edge's
 *  own instant, and every entry it touches then takes the same translation — that is what keeps a
 *  multi-entry drag rigid (D-S3-19) instead of letting each row snap on its own. */
type Translation = { readonly ms: number } | { readonly unit: TimeUnit; readonly steps: number };

function translationOf(input: DraftInput, anchorInstant: Instant): Translation {
  const { zone, scale, snap, dxPx } = input;
  const anchorX = scale.xForInstant(anchorInstant);
  const candidate = snapInstant(zone, scale.instantForX(anchorX + dxPx), snap);
  if (snap === 'none') return { ms: diffMs(candidate, anchorInstant) };
  const steps = stepsBetween(zone, snap.unit, snap.increment, anchorInstant, candidate);
  return { unit: snap.unit, steps: steps * snap.increment };
}

function translate(zone: string, instant: Instant, by: Translation): Instant {
  return 'ms' in by ? addMs(instant, by.ms) : stepBy(zone, instant, by.unit, by.steps);
}

/** The instant a gesture anchors on or drags: `entry`'s own `start`/`end` (ADR 0026 — a Bar is one
 *  child Entry, so there is no envelope over several Segments left to take an edge of). Falls back to
 *  the other edge when the asked one is absent, so a half-dated descendant (ADR 0013, Q9: no bar to
 *  grab) never anchors a gesture on `undefined`. */
function edgeInstantOf(entry: Entry, edge: 'start' | 'end'): Instant {
  const asked = edge === 'start' ? entry.start : entry.end;
  return asked ?? (edge === 'start' ? entry.end : entry.start)!;
}

/** Moves `entry`'s dates by `by`, and proposes nothing for a date it lacks (ADR 0013, Q9). A keyboard
 *  nudge (D-S3-13) arrives here too — it differs only in the `Translation` it carries. */
function translatedEdit(zone: string, entry: Entry, by: Translation): ProposedEdit {
  const proposedKeys = new Set<string>();
  const dates: { start?: Instant; end?: Instant } = {};
  if (entry.start !== undefined) {
    dates.start = translate(zone, entry.start, by);
    proposedKeys.add('start');
  }
  if (entry.end !== undefined) {
    dates.end = translate(zone, entry.end, by);
    proposedKeys.add('end');
  }
  return { __brand: 'ProposedEdit', props: {}, proposedKeys, ...dates };
}

/** Resizes `entry`'s `edge` to `moved`. Zero-length clamp: the dragged edge never crosses the fixed
 *  one, so an inverted span is refused here, in the layout layer, before it reaches a changeset
 *  (D-S3-4). */
function resizeEdit(entry: Entry, edge: 'start' | 'end', moved: Instant): ProposedEdit {
  // `ProposedEdit`'s brand/`props`/`proposedKeys` are required (ADR 0011); `layout/` may not import
  // `data/`'s `emptyProposedEdit` (layout-boundary), so this is the one place that shape is inlined.
  if (edge === 'start') {
    const start = entry.end !== undefined && moved > entry.end ? entry.end : moved;
    return { __brand: 'ProposedEdit', props: {}, proposedKeys: new Set(['start']), start };
  }
  const end = entry.start !== undefined && moved < entry.start ? entry.start : moved;
  return { __brand: 'ProposedEdit', props: {}, proposedKeys: new Set(['end']), end };
}

/** What the hot-path paint needs to preview a draft with no frame rebuild (D-S3-18): a pixel offset
 *  and width delta per affected item, read off the bound `TimeScale` against each entry's committed
 *  span. `extra` marks an entry the extension hook added rather than the caller's own selection
 *  (S3.6 — always `false` until the extender is wired in). */
export interface BarPreview {
  barId: BarId;
  dx: number;
  dWidth: number;
  extra: boolean;
}

export interface PreviewOffsetsInput {
  /** The caller's own draft. */
  proposed: ProposedEdits;
  /** Extension-hook extras layered on top (S3.6). Empty until then. */
  extra: ProposedEdits;
  /** Committed entries `proposed`/`extra` are diffed against — one lookup per row, not a dataset scan. */
  entries: readonly Entry[];
  scale: TimeScale;
}

export function previewOffsets(input: PreviewOffsetsInput): readonly BarPreview[] {
  const { proposed, extra, entries, scale } = input;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const out: BarPreview[] = [];

  function pushOffset(id: EntryId, edit: ProposedEdit, isExtra: boolean): void {
    const original = byId.get(id);
    if (!original) return;
    if (!spansTime(edit)) return;
    // A gesture reaches this branch only for an Entry that already has a grip to grab, which means
    // it already spans (`spansTime`, ADR 0012) — but nothing narrows `original` here, so this asks
    // the question rather than asserting it: a dateless Entry paints no offset instead of a crash.
    if (!spansTime(original)) return;
    const x0 = scale.xForInstant(original.start);
    const x1 = scale.xForInstant(edit.start);
    const width0 = scale.xForInstant(original.end) - x0;
    const width1 = scale.xForInstant(edit.end) - x1;
    out.push({ barId: barId(id), dx: x1 - x0, dWidth: width1 - width0, extra: isExtra });
  }

  for (const [id, edit] of proposed) pushOffset(id, edit, false);
  for (const [id, edit] of extra) pushOffset(id, edit, true);
  return out;
}

/** S3.8, D-S3-15: the Cursor line label at content `x` — `instantForX` → `snapInstant` →
 *  `formatDate`. All `time/` work stays in this file so `view/` never formats a date. */
export function cursorLabelForX(
  x: number,
  scale: TimeScale,
  snap: SnapUnit,
  locale?: Intl.LocalesArgument,
): string {
  const snapped = snapInstant(scale.timeZone, scale.instantForX(x), snap);
  return formatDate(scale.timeZone, snapped, locale);
}
