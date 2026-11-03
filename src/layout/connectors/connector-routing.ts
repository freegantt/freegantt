// layout/ — the consumer's choices for how connector routes dodge bars.

/** How connector routes treat bars. Every key is optional; an omitted key takes its default. */
export interface ConnectorRouting {
  /** Slide a vertical segment sideways to dodge bars in the rows it crosses. Default `true`. */
  avoidBars?: boolean;
  /** A vertical across more rows than this keeps its default x. Routing runs on every data change,
   *  so the cap bounds that cost. Default `200`. */
  maxAvoidRows?: number;
}

export const DEFAULT_MAX_AVOID_ROWS = 200;

/** Fills the omitted keys with their defaults. */
export function resolveConnectorRouting(routing: ConnectorRouting | undefined): Required<ConnectorRouting> {
  return {
    avoidBars: routing?.avoidBars ?? true,
    maxAvoidRows: routing?.maxAvoidRows ?? DEFAULT_MAX_AVOID_ROWS,
  };
}
