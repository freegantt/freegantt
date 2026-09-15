// render/dom — Date line paint. Geometry lives in layout/date-line.ts (S1.13).

import type { DateLineDecoration, DateLineLabelPlacement, FrameDecoration } from '../../layout/index.js';
import { DEFAULT_DATE_LINE_LABEL_PLACEMENT } from '../../layout/index.js';
import { KeyedLayer } from './sync-keyed.js';

type DateLineGeom = { x: number; height: number; className: string; today: boolean };
type DateLineLabelGeom = {
  x: number;
  yOffset: number;
  belowHeader: boolean;
  label: string;
  className: string;
  today: boolean;
};
type LabelledDateLine = { line: DateLineDecoration; index: number };

export interface DateLineAttachment {
  sync(
    decorations: readonly FrameDecoration[],
    contentHeight: number,
    paneHeight: number,
    labelPlacement?: DateLineLabelPlacement,
  ): void;
  destroy(): void;
}

function dateLinesOf(decorations: readonly FrameDecoration[]): DateLineDecoration[] {
  return decorations.filter((d): d is DateLineDecoration => d.kind === 'dateLine');
}

function labelledDateLines(lines: readonly DateLineDecoration[]): LabelledDateLine[] {
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
 * Date line index. Call `sync` each frame. `before` is the node the strokes' own wrapper mounts
 * ahead of — pass `contentSizer` (#118), not the end of `timelineHost`'s children: a plain `append`
 * landed after `.fg-content-sizer`, and that 1px `position: relative` sizer box (needed in flow for
 * its own scroll-extent job) pushed this layer one pixel further down than `.fg-bars`/
 * `.fg-tick-lines`, which both mount ahead of it. */
export function attachDateLines(
  timelineHost: HTMLElement,
  headerLayer: HTMLElement,
  before: HTMLElement,
): DateLineAttachment {
  const layer = createHiddenDiv();
  // Same positioning role `.fg-tick-lines` plays for tick-lines.ts: with no `position` of its own,
  // this div is `static`, so a stroke's `position: absolute; top: 0` (CSS) skips past it to the
  // nearest positioned ancestor — `.fg-timeline-pane` itself — landing at the pane's very top edge
  // instead of just below the sticky header, where this layer's own in-flow box actually starts.
  // The class below gives it `position: relative`, so each stroke's `top: 0` lands here instead,
  // already offset by the header's height the same way `.fg-bars`/`.fg-tick-lines` are (#118).
  layer.className = 'fg-date-lines';
  timelineHost.insertBefore(layer, before);

  const labelLayer = createHiddenDiv();
  headerLayer.append(labelLayer);

  const strokes = new KeyedLayer<DateLineDecoration, number, DateLineGeom>();
  const labels = new KeyedLayer<LabelledDateLine, number, DateLineLabelGeom>();

  return {
    sync(decorations, contentHeight, paneHeight, labelPlacement = DEFAULT_DATE_LINE_LABEL_PLACEMENT) {
      const belowHeader = labelPlacement === 'belowHeader';
      const yOffset = typeof labelPlacement === 'number' ? labelPlacement : 0;
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
        toGeom: ({ line }) => ({
          x: line.x,
          yOffset,
          belowHeader,
          label: line.label ?? '',
          className: line.className ?? '',
          today: line.today === true,
        }),
        patch: (node, geom) => {
          node.className = classListFor(geom.className, 'fg-date-line-label');
          // `belowHeader` (default) anchors at `top: 100%` (CSS, #225); every other placement
          // anchors at `top: 0` and nudges down by `yOffset` px instead — 0 for `'inHeader'`,
          // a caller's own number otherwise. transform stays the one inline geometry write (D-S1.10-6).
          node.style.transform = `translate(${geom.x}px, ${geom.yOffset}px)`;
          if (geom.belowHeader) node.dataset['placement'] = 'belowHeader';
          else delete node.dataset['placement'];
          node.textContent = geom.label;
          // The label carries the flag its own stroke carries, so the chip can take the Today colour.
          // It sits in the header layer, not beside the stroke, so no selector reaches it from there.
          if (geom.today) node.dataset['flag'] = 'today';
          else delete node.dataset['flag'];
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
