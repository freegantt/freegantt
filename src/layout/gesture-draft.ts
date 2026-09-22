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
import { barSpan } from './frame.js';
import type { Bar } from './bars/bar.js';
import type { TimeScale } from '../time/index.js';

export interface DraftInput {
  zone: string;
  scale: TimeScale;
  /** Resolved snap setting (D-S3-12) — the caller has already turned an unset/`'tick'`
   *  `Gantt.snap` into a concrete `{ unit, increment }`, and Alt into `'none'`. */
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
  // A calendar step counts in whole `unit`s (DST-correct across a multi-day drag, D-S3-19). `'none'`
  // and a custom `SnapRule` have no unit to count in — both take the plain millisecond delta instead,
  // the same translation raw pixel placement always took (#489).
  if (snap === 'none' || typeof snap === 'function') return { ms: diffMs(candidate, anchorInstant) };
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

/** The span an edit draws: the edit read over the entry it edits.
 *
 *  A resize names the one edge it moves and holds the other (ADR 0026 — `start`/`end` are ordinary
 *  Fields now, and an edit writes only what moved). So a drafted span is never the edit alone, and
 *  every reader that wants the whole span asks here rather than assuming the edit carries it.
 *
 *  A half-dated entry stays half-dated: this fills in nothing the entry does not already hold. */
export function spanAfterEdit(
  entry: Entry,
  edit: ProposedEdit,
): { start: Instant | undefined; end: Instant | undefined } {
  return { start: edit.start ?? entry.start, end: edit.end ?? entry.end };
}

/** What the hot-path paint needs to preview a draft with no frame rebuild (D-S3-18): a pixel offset
 *  and width delta per affected bar, read off the bound `TimeScale` against each entry's committed
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
  /** The Gantt's own resolved bar floor (`--fg-bar-min-width`, `view/frame-settings.ts`), the value
   *  `placeFrame` hands `barSpan` for the committed frame. Required, not defaulted: taking
   *  `barSpan`'s own module default here instead would agree with the commit only for a consumer
   *  who never sets the token, and disagree by exactly the override for everyone who does — the
   *  preview/commit jump this whole function exists to close (#436 branch review F4). */
  minBarWidthPx: number;
  /** The committed Bar this preview moves — the one `barId(entryId)` names, part 0. It is the
   *  template both `barSpan` calls read, so a Bar carrying a fixed `box` (ADR 0022 — `diamond()`)
   *  is measured on its own box path rather than on the span-and-floor path a hand-built literal
   *  would silently take (`barSpan`'s own signature doc warns about exactly that literal, #295).
   *  `undefined` for an entry that paints no Bar, which previews nothing. */
  barForEntry: (id: EntryId) => Bar | undefined;
}

export function previewOffsets(input: PreviewOffsetsInput): readonly BarPreview[] {
  const { proposed, extra, entries, scale, minBarWidthPx, barForEntry } = input;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const out: BarPreview[] = [];

  function pushOffset(id: EntryId, edit: ProposedEdit, isExtra: boolean): void {
    const original = byId.get(id);
    if (!original) return;
    // An edit that names no date moves no bar. An extender writing `props` alone is the usual one.
    if (edit.start === undefined && edit.end === undefined) return;
    // A gesture reaches this branch only for an Entry that already has a grip to grab, which means
    // it already spans (`spansTime`, ADR 0012) — but nothing narrows `original` here, so this asks
    // the question rather than asserting it: a dateless Entry paints no offset instead of a crash.
    if (!spansTime(original)) return;
    const drafted = spanAfterEdit(original, edit);
    if (!spansTime(drafted)) return;
    // Read through `barSpan` — the one formula the commit's own frame paints from (#436 branch
    // review F4) — rather than the entry's raw start/end delta. A straddling bar's painted width
    // is not its true duration (`barSpan` trims an `'exact'` box to `[0, contentWidth)`), so a
    // delta measured on the untrimmed dates disagrees with the trim the very next frame applies:
    // the live preview under- or over-shoots, then jumps to the correct size on commit. Diffing
    // two `barSpan` calls instead reports the *painted* delta, so `applyBarPreview` (I5 hot path,
    // `render/dom/index.ts`) can go on adding a plain offset to the committed geometry with no
    // clip of its own to apply.
    const id0 = barId(id);
    // The committed Bar is the template, not a literal assembled here: it carries this bar's own
    // `box` and `variant`, which decide which path `barSpan` takes at all. Both calls read the same
    // template, so the pair still measures one formula against itself — only the dates differ.
    const painted = barForEntry(id);
    if (painted === undefined) return;
    const before = barSpan({ ...painted, start: original.start, end: original.end }, scale, minBarWidthPx);
    const after = barSpan({ ...painted, start: drafted.start, end: drafted.end }, scale, minBarWidthPx);
    // `barSpan` reports a dropped box as `{ x: 0, width: 0 }` — a fabricated point, not a real box
    // at the origin, which is why `unionSpan` and `placeFrame` both skip it too (#436). A delta
    // formed from that sentinel is not a translation: dragging a bar off the content's right edge
    // would read `dx = -before.x` and teleport the painted node back to `x ≈ 0`, collapsed to
    // nothing, mid-drag. No painted geometry on either side means no offset to paint.
    if (before.width === 0 || after.width === 0) return;
    out.push({ barId: id0, dx: after.x - before.x, dWidth: after.width - before.width, extra: isExtra });
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
