// render/dom — Date line paint. Geometry lives in layout/date-line.ts (S1.13).

import type { DateLine, FrameDecoration } from '../../layout/index.js';
import { syncKeyed } from './sync-keyed.js';

type DateLineGeom = { x: number; height: number; className: string };
type DateLineLabelGeom = { x: number; label: string; className: string };

export interface DateLineAttachment {
  sync(decorations: readonly FrameDecoration[], contentHeight: number, paneHeight: number): void;
  destroy(): void;
}

function dateLinesOf(decorations: readonly FrameDecoration[]): DateLine[] {
  return decorations.filter((d): d is DateLine => d.kind === 'dateLine');
}

function withLabels(lines: readonly DateLine[]): DateLine[] {
  return lines.filter((line) => line.label !== undefined);
}

function classListFor(className: string | undefined, base: string): string {
  return className ? `${base} ${className}` : base;
}

/** Attaches Date line paint to the timeline pane: a 1px stroke per line, keyed by array position
 * (S1.13, D-S1.13-3 — no `id`, same precedent as Header bands), and a sibling caption layer mounted
 * in `headerLayer` for lines that carry a `label` (D-S1.13-6). Call `sync` each frame. */
export function attachDateLines(timelineHost: HTMLElement, headerLayer: HTMLElement): DateLineAttachment {
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  timelineHost.append(layer);

  const labelLayer = document.createElement('div');
  labelLayer.setAttribute('aria-hidden', 'true');
  headerLayer.append(labelLayer);

  const nodes = new Map<number, HTMLElement>();
  const geoms = new Map<number, DateLineGeom>();
  const labelNodes = new Map<number, HTMLElement>();
  const labelGeoms = new Map<number, DateLineLabelGeom>();

  return {
    sync(decorations, contentHeight, paneHeight) {
      // `.fg-date-line` CSS gives `top: 0` but not a height. This node is a child of
      // `.fg-timeline-pane`, which is both the positioned ancestor and the `overflow: auto`
      // scroller. A CSS `bottom: 0` would size to the pane's clientHeight, not scrollHeight.
      // `height` is an allowed inline geometry write (D-S1.10-6).
      const height = Math.max(contentHeight, paneHeight);
      const lines = dateLinesOf(decorations);
      syncKeyed(layer, lines, nodes, geoms, {
        key: (_line, i) => i,
        create: () => {
          const node = document.createElement('div');
          node.setAttribute('aria-hidden', 'true');
          return node;
        },
        toGeom: (line) => ({ x: line.x, height, className: line.className ?? '' }),
        patch: (node, geom) => {
          node.className = classListFor(geom.className, 'fg-date-line');
          node.style.transform = `translateX(${geom.x}px)`;
          node.style.height = `${geom.height}px`;
        },
      });

      syncKeyed(labelLayer, withLabels(lines), labelNodes, labelGeoms, {
        key: (_line, i) => i,
        create: () => {
          const node = document.createElement('div');
          node.setAttribute('aria-hidden', 'true');
          return node;
        },
        toGeom: (line) => ({ x: line.x, label: line.label ?? '', className: line.className ?? '' }),
        patch: (node, geom) => {
          node.className = classListFor(geom.className, 'fg-date-line-label');
          node.style.transform = `translateX(${geom.x}px)`;
          node.textContent = geom.label;
        },
      });
    },
    destroy() {
      layer.remove();
      labelLayer.remove();
      nodes.clear();
      geoms.clear();
      labelNodes.clear();
      labelGeoms.clear();
    },
  };
}
