// render/dom — timeline grid lines. Geometry lives in layout/frame.ts (`GeometryFrame.tickLines`).
// J2: a consumer opts out by setting `--fg-tick-line-color`/`--fg-tick-line-strong-color` to
// `transparent`. There is no config key and no boolean for this — the token pair is the whole knob.

import type { FrameTickLine } from '../../layout/index.js';
import { KeyedLayer } from './sync-keyed.js';

type TickLineGeom = { x: number; height: number; major: boolean };

export interface TickLineAttachment {
  sync(tickLines: readonly FrameTickLine[], contentHeight: number, paneHeight: number): void;
  destroy(): void;
}

/** Attaches one 1px stroke per finest-band tick to the timeline pane, keyed by array position —
 *  same precedent as Header bands and Date lines (no `id` of its own). Mounted before the row band
 *  layer (D-S1.7-4's overscan) so the zebra and the selected-row band paint over the lines, matching
 *  the design's own order. Call `sync` each frame. */
export function attachTickLines(timelineHost: HTMLElement, before: HTMLElement): TickLineAttachment {
  const layer = document.createElement('div');
  layer.className = 'fg-tick-lines';
  layer.setAttribute('aria-hidden', 'true');
  timelineHost.insertBefore(layer, before);

  const lines = new KeyedLayer<FrameTickLine, number, TickLineGeom>();

  return {
    sync(tickLines, contentHeight, paneHeight) {
      // Same reasoning `.fg-date-line` already carries: this node's positioned ancestor is also its
      // own `overflow: auto` scroller, so `bottom: 0` would size to the pane's clientHeight and cut
      // the line off at the first screenful instead of running the full scrollable row content.
      const height = Math.max(contentHeight, paneHeight);
      lines.sync(layer, tickLines, {
        key: (_line, i) => i,
        create: () => {
          const node = document.createElement('div');
          node.className = 'fg-tick-line';
          return node;
        },
        toGeom: (line) => ({ x: line.x, height, major: line.major }),
        patch: (node, geom) => {
          node.style.transform = `translateX(${geom.x}px)`;
          node.style.height = `${geom.height}px`;
          if (geom.major) node.dataset['major'] = '';
          else delete node.dataset['major'];
        },
      });
    },
    destroy() {
      layer.remove();
      lines.clear();
    },
  };
}
