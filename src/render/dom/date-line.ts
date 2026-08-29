// render/dom — Date line paint. Geometry lives in layout/date-line.ts (issue #96).

import type { DateLine, FrameDecoration } from '../../layout/index.js';
import { syncKeyed } from './sync-keyed.js';

type DateLineGeom = { x: number; height: number; label: string };

export interface DateLineAttachment {
  sync(decorations: readonly FrameDecoration[], contentHeight: number, paneHeight: number): void;
  destroy(): void;
}

function dateLinesOf(decorations: readonly FrameDecoration[]): DateLine[] {
  return decorations.filter((d): d is DateLine => d.kind === 'dateLine');
}

/** Attaches Date line paint to the timeline pane. Call `sync` each frame. */
export function attachDateLines(timelineHost: HTMLElement): DateLineAttachment {
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  timelineHost.append(layer);

  const nodes = new Map<string, HTMLElement>();
  const geoms = new Map<string, DateLineGeom>();

  return {
    sync(decorations, contentHeight, paneHeight) {
      // `.fg-today-line` CSS gives `top: 0` but not a height. This node is a child of
      // `.fg-timeline-pane`, which is both the positioned ancestor and the `overflow: auto`
      // scroller. A CSS `bottom: 0` would size to the pane's clientHeight, not scrollHeight.
      // `height` is an allowed inline geometry write (D-S1.10-6).
      const height = Math.max(contentHeight, paneHeight);
      syncKeyed(layer, dateLinesOf(decorations), nodes, geoms, {
        key: (line) => line.id,
        create: () => {
          const node = document.createElement('div');
          node.className = 'fg-today-line';
          node.setAttribute('aria-hidden', 'true');
          return node;
        },
        toGeom: (line) => ({ x: line.x, height, label: line.label ?? '' }),
        patch: (node, geom) => {
          node.style.transform = `translateX(${geom.x}px)`;
          node.style.height = `${geom.height}px`;
          node.textContent = geom.label;
        },
      });
    },
    destroy() {
      layer.remove();
      nodes.clear();
      geoms.clear();
    },
  };
}
