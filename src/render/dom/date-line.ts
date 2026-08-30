// render/dom — Date line paint. Geometry lives in layout/date-line.ts (S1.13).

import type { DateLine, FrameDecoration } from '../../layout/index.js';
import { KeyedLayer } from './sync-keyed.js';

type DateLineGeom = { x: number; height: number; className: string; today: boolean };
type DateLineLabelGeom = { x: number; label: string; className: string };
type LabelledDateLine = { line: DateLine; index: number };

export interface DateLineAttachment {
  sync(decorations: readonly FrameDecoration[], contentHeight: number, paneHeight: number): void;
  destroy(): void;
}

function dateLinesOf(decorations: readonly FrameDecoration[]): DateLine[] {
  return decorations.filter((d): d is DateLine => d.kind === 'dateLine');
}

function labelledDateLines(lines: readonly DateLine[]): LabelledDateLine[] {
  const labelled: LabelledDateLine[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (line.label !== undefined) labelled.push({ line, index });
  }
  return labelled;
}

function classListFor(className: string | undefined, base: string): string {
  return className ? `${base} ${className}` : base;
}

function createHiddenDiv(): HTMLElement {
  const node = document.createElement('div');
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/** Attaches Date line paint to the timeline pane: a 1px stroke per line, keyed by array position
 * (S1.13, D-S1.13-3 — no `id`, same precedent as Header bands), and a sibling Date line label layer
 * mounted in `headerLayer` for lines that carry a `label` (D-S1.13-6). Both layers key by the source
 * Date line index. Call `sync` each frame. */
export function attachDateLines(timelineHost: HTMLElement, headerLayer: HTMLElement): DateLineAttachment {
  const layer = createHiddenDiv();
  timelineHost.append(layer);

  const labelLayer = createHiddenDiv();
  headerLayer.append(labelLayer);

  const strokes = new KeyedLayer<DateLine, number, DateLineGeom>();
  const labels = new KeyedLayer<LabelledDateLine, number, DateLineLabelGeom>();

  return {
    sync(decorations, contentHeight, paneHeight) {
      // `.fg-date-line` CSS gives `top: 0` but not a height. This node is a child of
      // `.fg-timeline-pane`, which is both the positioned ancestor and the `overflow: auto`
      // scroller. A CSS `bottom: 0` would size to the pane's clientHeight, not scrollHeight.
      // `height` is an allowed inline geometry write (D-S1.10-6).
      const height = Math.max(contentHeight, paneHeight);
      const lines = dateLinesOf(decorations);
      strokes.sync(layer, lines, {
        key: (_line, i) => i,
        create: () => createHiddenDiv(),
        toGeom: (line) => ({
          x: line.x,
          height,
          className: line.className ?? '',
          today: line.today === true,
        }),
        patch: (node, geom) => {
          node.className = classListFor(geom.className, 'fg-date-line');
          node.style.transform = `translateX(${geom.x}px)`;
          node.style.height = `${geom.height}px`;
          if (geom.today) node.dataset['flag'] = 'today';
          else delete node.dataset['flag'];
        },
      });

      labels.sync(labelLayer, labelledDateLines(lines), {
        key: (item) => item.index,
        create: () => createHiddenDiv(),
        toGeom: ({ line }) => ({ x: line.x, label: line.label ?? '', className: line.className ?? '' }),
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
      strokes.clear();
      labels.clear();
    },
  };
}
