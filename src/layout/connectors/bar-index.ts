// layout/ — answers "which x can a vertical connector segment use without crossing a bar".

/** The x extent of one bar, in content pixels. */
export interface BarInterval {
  left: number;
  right: number;
}

/** What a vertical segment asks: a free x near `preferredX`, inside `[minX, maxX]`, across the rows
 *  strictly between `fromRow` and `toRow`. */
export interface VerticalRequest {
  fromRow: number;
  toRow: number;
  preferredX: number;
  minX: number;
  maxX: number;
}

/** Gives a vertical segment its x. The router calls it once per vertical. */
export type VerticalPlacer = (request: VerticalRequest) => number;

/** A vertical keeps this much air beside a bar. */
export const BAR_CLEARANCE_PX = 2;

/** One search direction stops after this many bars, so a crowded range stays cheap. */
const MAX_HOPS = 16;

/** Pads each interval, sorts them and joins overlaps, so a row check is one binary search. */
function paddedAndMerged(intervals: readonly BarInterval[]): BarInterval[] {
  const sorted = intervals
    .map((bar) => ({ left: bar.left - BAR_CLEARANCE_PX, right: bar.right + BAR_CLEARANCE_PX }))
    .sort((a, b) => a.left - b.left);
  const merged: BarInterval[] = [];
  for (const bar of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && bar.left <= last.right) last.right = Math.max(last.right, bar.right);
    else merged.push(bar);
  }
  return merged;
}

/** The merged interval that holds `x` strictly inside it. An edge counts as free. */
function blockerAt(row: readonly BarInterval[], x: number): BarInterval | undefined {
  let low = 0;
  let high = row.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const bar = row[middle]!;
    if (x <= bar.left) high = middle - 1;
    else if (x >= bar.right) low = middle + 1;
    else return bar;
  }
  return undefined;
}

/** Bar extents by row index. A row builds its sorted intervals on first use. */
export class BarIndex {
  readonly #intervalsOfRow: (rowIndex: number) => readonly BarInterval[];
  readonly #maxRows: number;
  readonly #rows = new Map<number, readonly BarInterval[]>();

  constructor(intervalsOfRow: (rowIndex: number) => readonly BarInterval[], maxRows: number) {
    this.#intervalsOfRow = intervalsOfRow;
    this.#maxRows = maxRows;
  }

  /** Call: `index.freeX(request)`. Returns the free x nearest `preferredX`.
   *  A vertical over more than `maxRows` rows, or with no free x, keeps `preferredX`. */
  freeX(request: VerticalRequest): number {
    const firstRow = Math.min(request.fromRow, request.toRow) + 1;
    const lastRow = Math.max(request.fromRow, request.toRow) - 1;
    const rowCount = lastRow - firstRow + 1;
    if (rowCount < 1 || rowCount > this.#maxRows) return request.preferredX;
    const blockerOf = (x: number): BarInterval | undefined => {
      for (let row = firstRow; row <= lastRow; row += 1) {
        const blocker = blockerAt(this.#rowAt(row), x);
        if (blocker !== undefined) return blocker;
      }
      return undefined;
    };
    if (blockerOf(request.preferredX) === undefined) return request.preferredX;
    const before = this.#hop(request.preferredX, request.minX, blockerOf, 'before');
    const after = this.#hop(request.preferredX, request.maxX, blockerOf, 'after');
    const candidates = [before, after].filter((x): x is number => x !== undefined);
    if (candidates.length === 0) return request.preferredX;
    return candidates.reduce((best, x) =>
      Math.abs(x - request.preferredX) < Math.abs(best - request.preferredX) ? x : best,
    );
  }

  /** Steps from `from` to the edge of each bar in the way, until x is free or leaves the limit. */
  #hop(
    from: number,
    limit: number,
    blockerOf: (x: number) => BarInterval | undefined,
    side: 'before' | 'after',
  ): number | undefined {
    let x = from;
    for (let hops = 0; hops < MAX_HOPS; hops += 1) {
      const blocker = blockerOf(x);
      if (blocker === undefined) return x;
      x = side === 'before' ? blocker.left : blocker.right;
      if (side === 'before' ? x < limit : x > limit) return undefined;
    }
    return undefined;
  }

  #rowAt(rowIndex: number): readonly BarInterval[] {
    let row = this.#rows.get(rowIndex);
    if (row === undefined) {
      row = paddedAndMerged(this.#intervalsOfRow(rowIndex));
      this.#rows.set(rowIndex, row);
    }
    return row;
  }
}
