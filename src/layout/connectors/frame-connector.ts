// layout/ — one connector as the frame carries it.

import type { ConnectorFlags, PathCommand } from '../connector-input.js';

export interface FrameConnector {
  id: string;
  path: readonly PathCommand[];
  flags: ConnectorFlags;
  /** The `data-flag` value, built here once so `render/` allocates nothing per frame. */
  flagTokens: string;
  class?: string;
  label?: string;
}
