// layout/ — clips a connector's corner points to the window.

import type { PathCommand } from '../connector-input.js';
import type { Point } from './route-connector.js';

export interface ConnectorWindow {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Call: `boundsTouchWindow(bounds, window)`. A cheap test before any clipping. */
export function boundsTouchWindow(bounds: ConnectorWindow, window: ConnectorWindow): boolean {
  return (
    bounds.left <= window.right &&
    bounds.right >= window.left &&
    bounds.top <= window.bottom &&
    bounds.bottom >= window.top
  );
}

export function boundsOf(points: readonly Point[]): ConnectorWindow {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

/** Liang–Barsky on one segment. Returns the part inside the window, or `undefined`. */
function clipSegment(a: Point, b: Point, w: ConnectorWindow): [Point, Point] | undefined {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let enter = 0;
  let leave = 1;
  const edges: readonly [number, number][] = [
    [-dx, a.x - w.left],
    [dx, w.right - a.x],
    [-dy, a.y - w.top],
    [dy, w.bottom - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return undefined;
      continue;
    }
    const t = q / p;
    if (p < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return undefined;
  }
  return [
    { x: a.x + enter * dx, y: a.y + enter * dy },
    { x: a.x + leave * dx, y: a.y + leave * dy },
  ];
}

/** Call: `clipPath(points, window)`. Returns `M`/`L` commands for the parts inside the window.
 *  A path that crosses the window and has both ends outside it still draws. */
export function clipPath(points: readonly Point[], window: ConnectorWindow): PathCommand[] {
  const commands: PathCommand[] = [];
  let pen: Point | undefined;
  for (let i = 1; i < points.length; i++) {
    const piece = clipSegment(points[i - 1]!, points[i]!, window);
    if (piece === undefined) {
      pen = undefined;
      continue;
    }
    const [from, to] = piece;
    if (pen === undefined || pen.x !== from.x || pen.y !== from.y) {
      commands.push({ cmd: 'M', x: from.x, y: from.y });
    }
    commands.push({ cmd: 'L', x: to.x, y: to.y });
    pen = to;
  }
  return commands;
}
