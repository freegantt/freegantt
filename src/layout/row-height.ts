// layout/ — how tall a Row is. A consumer states one height for every Row, or a function that
// answers per Row (ADR 0044).

import type { Entry } from '../model/index.js';
import type { PlannedRowKind } from './rows/row-source.js';

/** What a Row function knows about one Row. A height function and a Lane rule both ask about it. */
export interface RowContext {
  /** The Row's subject Entry. A header Row has none. */
  readonly entry: Entry | undefined;
  readonly kind: PlannedRowKind;
  readonly depth: number;
}

/** What a height function knows about one Row. */
export interface RowHeightContext extends RowContext {
  /** How many Lanes the Row holds. `0` when the Row has none. */
  readonly laneCount: number;
  /** The `--fg-row-height` value in px: the height a Row takes when no function answers for it. */
  readonly defaultHeight: number;
  /** The height in px the Lane tokens give this Row, or `undefined` when it has no Lanes. A function
   *  answers `ctx.laneHeight ?? 48`, so it never repeats the Lane formula. */
  readonly laneHeight: number | undefined;
}

export type RowHeightResolver = (context: RowHeightContext) => number;

/** One height for every Row, or a function that answers per Row. */
export type RowHeight = number | RowHeightResolver;
