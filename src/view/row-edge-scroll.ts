// view/ — scrolls the rows while a row drag holds the pointer near the top or bottom edge of the
// rows viewport (#603). The drag cannot reach a row that is off screen without it.
//
// It owns no scroll of its own: each step pans the bound y `ScrollAxis`, the same door keyboard
// paging and `reveal` use. The grid pane follows that axis by transform, so both panes stay in sync.

import type { ScrollAxis } from '../layout/index.js';
import { FrameScheduler } from './frame-scheduler.js';

/** How far inside each edge the pointer must be, in px, before the rows scroll. */
export const EDGE_ZONE_PX = 40;
/** The scroll speed at the edge, and past it, in px per second. */
export const MAX_EDGE_SCROLL_PX_PER_SECOND = 900;
/** The longest time one step may cover. A slow first frame then cannot jump the rows. */
const MAX_STEP_MS = 50;

/** What a row drag asks to scroll the rows. */
export interface RowEdgeScroll {
  /** Report the pointer position. Starts the scroll in an edge zone, and stops it outside one.
   *  `onScrolled` runs after each step that moved the rows. Pass one stable function per drag. */
  follow(clientY: number, onScrolled: () => void): void;
  /** Stop the scroll. Safe when nothing scrolls. */
  stop(): void;
}

export interface RowEdgeScrollPorts {
  /** The vertical scroll the rows follow. */
  readonly scrollY: ScrollAxis;
  /** The top of the visible rows in client px, below the sticky header. */
  rowsTop(): number;
  /** The height of the visible rows in px. */
  rowsHeight(): number;
  /** Milliseconds on a monotonic clock. */
  now(): number;
}

/** The signed scroll speed in px per second for a pointer `distanceFromTop` px below the rows top.
 *  Negative scrolls up, positive scrolls down. Speed grows linearly toward the edge and holds its
 *  cap for a pointer past it. */
export function edgeScrollSpeed(distanceFromTop: number, rowsHeight: number): number {
  const zone = Math.min(EDGE_ZONE_PX, rowsHeight / 2);
  if (zone <= 0) return 0;
  const distanceFromBottom = rowsHeight - distanceFromTop;
  if (distanceFromTop < zone) return -depth(distanceFromTop, zone) * MAX_EDGE_SCROLL_PX_PER_SECOND;
  if (distanceFromBottom < zone) return depth(distanceFromBottom, zone) * MAX_EDGE_SCROLL_PX_PER_SECOND;
  return 0;
}

/** 0 at the zone boundary, 1 at the edge and past it. */
function depth(distanceFromEdge: number, zone: number): number {
  return Math.min(1, (zone - distanceFromEdge) / zone);
}

export function createRowEdgeScroll(ports: RowEdgeScrollPorts): RowEdgeScroll {
  // Read on `follow`, not per frame: a step then makes no DOM read and creates no object.
  let speed = 0;
  let lastFrameMs = 0;
  let onScrolled: (() => void) | undefined;
  let looping = false;

  const frames = new FrameScheduler(step);

  function step(): void {
    looping = false;
    if (speed === 0 || onScrolled === undefined) return;
    const now = ports.now();
    const elapsedMs = Math.min(now - lastFrameMs, MAX_STEP_MS);
    lastFrameMs = now;
    const before = ports.scrollY.state.position;
    ports.scrollY.panTo(before + (speed * elapsedMs) / 1000);
    // The rows sit at a content end: nothing moved, so the loop ends until the pointer moves.
    if (ports.scrollY.state.position === before) return;
    onScrolled();
    startLooping();
  }

  function startLooping(): void {
    looping = true;
    frames.request();
  }

  return {
    follow(clientY, callback): void {
      const rowsHeight = ports.rowsHeight();
      speed = edgeScrollSpeed(clientY - ports.rowsTop(), rowsHeight);
      onScrolled = callback;
      if (speed === 0) {
        looping = false;
        frames.cancel();
        return;
      }
      if (!looping) {
        lastFrameMs = ports.now();
        startLooping();
      }
    },
    stop(): void {
      speed = 0;
      onScrolled = undefined;
      looping = false;
      frames.cancel();
    },
  };
}
