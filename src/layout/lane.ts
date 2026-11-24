// layout/ — a Lane is a band inside one Row. A Row with n Lanes stacks n guides, and the Row grows to
// hold them (ADR 0043). Geometry comes from `--fg-lane-*` tokens only, never from an option.

import type { Entry } from '../model/index.js';
import type { RowContext } from './row-height.js';

/** Which Lanes does a Row hold? A consumer states it per Row, and per Entry for the Bar's Lane. */
export interface LaneRule {
  /** Lanes the Row of this Entry holds. An empty Lane still counts. `0` or less: the Row has none. */
  laneCount(row: RowContext): number;
  /** The zero-based Lane a Bar of this Entry sits in. */
  laneOf(entry: Entry): number;
}

/** The three `--fg-lane-*` tokens, read as px. */
export interface LaneGeometry {
  readonly heightPx: number;
  readonly gapPx: number;
  readonly paddingPx: number;
}

/** A rule with the geometry it draws at. One object, so a change of either rebuilds the heights. */
export interface LaneLayout {
  readonly rule: LaneRule;
  readonly geometry: LaneGeometry;
}

/** One drawn Lane, in frame coordinates. */
export interface FrameLane {
  readonly top: number;
  readonly height: number;
}

/** Lanes a Row holds, as a whole number. A rule that answers nothing usable gives `0`. */
export function laneCountOf(layout: LaneLayout, row: RowContext): number {
  const count = Math.floor(layout.rule.laneCount(row));
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function stackHeight(count: number, geometry: LaneGeometry): number {
  return count * geometry.heightPx + (count - 1) * geometry.gapPx;
}

/** The Row height that holds `count` Lanes with the padding above and below. */
export function laneRowHeight(count: number, geometry: LaneGeometry): number {
  return 2 * geometry.paddingPx + stackHeight(count, geometry);
}

/** The Lanes of a Row at `rowTop`. A Row taller than its stack centres the stack. */
export function laneBandsOf(
  rowTop: number,
  rowHeight: number,
  count: number,
  geometry: LaneGeometry,
): readonly FrameLane[] {
  const first = rowTop + Math.max(0, (rowHeight - stackHeight(count, geometry)) / 2);
  return Array.from({ length: count }, (_, lane) => ({
    top: first + lane * (geometry.heightPx + geometry.gapPx),
    height: geometry.heightPx,
  }));
}
