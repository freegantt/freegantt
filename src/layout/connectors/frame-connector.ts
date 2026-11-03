// layout/ — one connector as the frame carries it.

import type { ConnectorFlags, PathCommand } from '../connector-input.js';
import type { Point } from './route-connector.js';

export interface FrameConnector {
  id: string;
  path: readonly PathCommand[];
  flags: ConnectorFlags;
  /** The `data-flag` value, built here once so `render/` allocates nothing per frame. */
  flagTokens: string;
  class?: string;
  label?: string;
  /** Where `render/` draws `label` as text. Present only when the provider asked for the text. */
  labelAnchor?: Point;
}
