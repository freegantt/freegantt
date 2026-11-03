// layout/ — orthogonal route for one connector, from one bar edge to another.

import type { ConnectorEdge } from '../connector-input.js';
import type { VerticalPlacer, VerticalRequest } from './bar-index.js';

export interface Point {
  x: number;
  y: number;
}

/** A bar edge in content pixels, with the band of its row. */
export interface ConnectorAnchor extends Point {
  edge: ConnectorEdge;
  rowIndex: number;
  rowTop: number;
  rowBottom: number;
}

/** How far a line leaves a bar edge before it turns. Room for an arrowhead and a gap. */
export const CONNECTOR_STUB_PX = 12;

/** How far a vertical may slide away from its default x to dodge a bar. */
export const CONNECTOR_SLIDE_PX = 4 * CONNECTOR_STUB_PX;

/** The line leaves a `start` edge to the left and an `end` edge to the right. */
function leaveDirection(edge: ConnectorEdge): 1 | -1 {
  return edge === 'end' ? 1 : -1;
}

/** The line reaches a `start` edge from the left and an `end` edge from the right. */
function arriveDirection(edge: ConnectorEdge): 1 | -1 {
  return edge === 'start' ? -1 : 1;
}

/** Drops a repeated point and a corner that does not turn, so a straight run is one segment. */
function withoutRedundantPoints(points: readonly Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (last !== undefined && last.x === point.x && last.y === point.y) continue;
    const before = kept[kept.length - 2];
    if (before !== undefined && last !== undefined && sameLine(before, last, point)) kept.pop();
    kept.push(point);
  }
  return kept;
}

function sameLine(a: Point, b: Point, c: Point): boolean {
  return (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
}

/** Call: `routeConnector(fromAnchor, toAnchor)`. Returns the corner points, source first.
 *  - Edges of the same kind (start to start, end to end) share one vertical outside both bars.
 *  - A target past the stub gets one vertical at the source stub.
 *  - Any other pair runs along the near gap of the target row. */
export function routeConnector(
  from: ConnectorAnchor,
  to: ConnectorAnchor,
  placeVertical: VerticalPlacer = (request) => request.preferredX,
): Point[] {
  const leave = leaveDirection(from.edge);
  const arrive = arriveDirection(to.edge);
  const leaveX = from.x + leave * CONNECTOR_STUB_PX;
  const arriveX = to.x + arrive * CONNECTOR_STUB_PX;
  const start = { x: from.x, y: from.y };
  const end = { x: to.x, y: to.y };
  const sameRow = from.rowTop === to.rowTop;
  if (leave === arrive && !sameRow) {
    const outerX = leave < 0 ? Math.min(leaveX, arriveX) : Math.max(leaveX, arriveX);
    const x = placeVertical(verticalBetween(from, to, outerX, outerX + leave * CONNECTOR_SLIDE_PX));
    return withoutRedundantPoints([start, { x, y: from.y }, { x, y: to.y }, end]);
  }
  const hasRoom = leave === -arrive && leave * (arriveX - leaveX) >= 0;
  if (hasRoom) {
    const x = placeVertical(verticalBetween(from, to, leaveX, arriveX));
    return withoutRedundantPoints([start, { x, y: from.y }, { x, y: to.y }, end]);
  }
  const laneY = nearGapOf(from, to);
  const x = placeVertical(verticalBetween(from, to, leaveX, leaveX + leave * CONNECTOR_SLIDE_PX));
  return withoutRedundantPoints([
    start,
    { x, y: from.y },
    { x, y: laneY },
    { x: arriveX, y: laneY },
    { x: arriveX, y: to.y },
    end,
  ]);
}

/** The vertical wants `preferredX` and may slide toward `limitX`, over the rows between the anchors. */
function verticalBetween(
  from: ConnectorAnchor,
  to: ConnectorAnchor,
  preferredX: number,
  limitX: number,
): VerticalRequest {
  return {
    fromRow: from.rowIndex,
    toRow: to.rowIndex,
    preferredX,
    minX: Math.min(preferredX, limitX),
    maxX: Math.max(preferredX, limitX),
  };
}

/** The run sits in the target row's gap on the side the line comes from. A same-row loop runs below. */
function nearGapOf(from: ConnectorAnchor, to: ConnectorAnchor): number {
  if (from.rowTop === to.rowTop) return to.rowBottom;
  return to.y > from.y ? to.rowTop : to.rowBottom;
}

/** The point halfway along the line, measured by length. An empty line has none. */
export function midpointOf(points: readonly Point[]): Point | undefined {
  const first = points[0];
  if (first === undefined) return undefined;
  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index]!;
    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (const [index, length] of lengths.entries()) {
    if (remaining <= length) {
      const from = points[index]!;
      const to = points[index + 1]!;
      const along = length === 0 ? 0 : remaining / length;
      return { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along };
    }
    remaining -= length;
  }
  return first;
}
