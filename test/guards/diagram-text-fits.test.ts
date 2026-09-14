// Text in an architecture diagram overflows its box silently. Nothing draws a red mark, nothing
// fails a build, and the page still parses — the label just runs out of its box and under the
// shape beside it. A handoff called this "one cosmetic overlap"; measuring found 32.
//
// So the layout's own assumption becomes a test. The diagrams are hand-placed against a monospace
// font (`--fg-doc-mono`), and a hand-placed label only fits if whoever placed it counted the
// characters. This counts them instead.
//
// **It measures a model, not a reader's screen.** `--fg-doc-mono` is a fallback chain, so the real
// glyph width depends on which of those fonts the reader has installed. The check uses the widest
// realistic advance (0.6em, which a `monospace` fallback such as DejaVu Sans Mono matches), so a
// label that passes here fits everywhere, and a label that fails here clips for somebody. Browser
// `getComputedTextLength()` agreed with this model within ~3px over all 32 findings.
//
// Scope is the labels this model can place with certainty: left-aligned text anchored just inside
// one box, and text centred in one box. A label the model cannot attribute to exactly one box is
// skipped rather than guessed at — a guard that cries wolf gets switched off.
//
// A guard with no failing fixture is presumed broken (`docs/04-hooks-and-ci.md` §4), so
// `labelsThatOverflow` is pure and runs against a rigged diagram below.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pagesDir = path.join(root, 'website/docs/architecture');

/** Font size per text class, from `website/src/css/architecture-doc.css`. */
const FONT_SIZE: Readonly<Record<string, number>> = { t: 11, s: 9.5, xs: 9 };

/** Widest advance per em across the `--fg-doc-mono` fallback chain. */
const ADVANCE_PER_EM = 0.6;

/** Space a label must leave between its last glyph and the box edge. */
const GUTTER = 4;

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface Overflow {
  readonly label: string;
  readonly overflowPx: number;
}

const BOX = /<rect class="bx[^"]*" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g;
const LABEL =
  /<text class="(t|s|xs)(?: [\w-]+)?" x="(\d+)" y="(\d+)"( text-anchor="middle")?>([^<]*)<\/text>/g;

/** How wide `label` draws at `fontClass`, in the diagram's own user units. */
function drawnWidth(label: string, fontClass: string): number {
  // `&#160;` indents a label; any other entity stands for one glyph.
  const glyphs = label.replace(/&#160;/g, ' ').replace(/&[a-z]+;/g, 'x');
  return [...glyphs].length * (FONT_SIZE[fontClass] ?? FONT_SIZE['t']!) * ADVANCE_PER_EM;
}

function boxesIn(svg: string): Box[] {
  return [...svg.matchAll(BOX)].map((m) => {
    const [x, y, w, h] = m.slice(1, 5).map(Number) as [number, number, number, number];
    return { left: x, top: y, right: x + w, bottom: y + h };
  });
}

/** The one box a label sits in, or `undefined` when the placement is not certain. */
function boxHolding(boxes: readonly Box[], x: number, y: number, centred: boolean): Box | undefined {
  const inRow = (box: Box) => y >= box.top && y <= box.bottom;
  const owners = centred
    ? boxes.filter((box) => Math.abs((box.left + box.right) / 2 - x) <= 2 && inRow(box))
    : boxes.filter((box) => x - box.left >= 6 && x - box.left <= 16 && inRow(box));
  return owners.length === 1 ? owners[0] : undefined;
}

/** Every label in `svg` that draws past its own box, and by how much. */
function labelsThatOverflow(svg: string): Overflow[] {
  const boxes = boxesIn(svg);
  const found: Overflow[] = [];
  for (const match of svg.matchAll(LABEL)) {
    const [fontClass, xText, yText, centred, label] = match.slice(1, 6);
    const x = Number(xText);
    const box = boxHolding(boxes, x, Number(yText), centred !== undefined);
    if (box === undefined) continue;
    const width = drawnWidth(label ?? '', fontClass!);
    const right = centred === undefined ? x + width : x + width / 2;
    const overflowPx = right - (box.right - GUTTER);
    if (overflowPx > 0) found.push({ label: label ?? '', overflowPx: Math.round(overflowPx * 10) / 10 });
  }
  return found;
}

function diagramsOn(page: string): string[] {
  return [...fs.readFileSync(path.join(pagesDir, page), 'utf8').matchAll(/<svg[\s\S]*?<\/svg>/g)].map(
    (m) => m[0],
  );
}

const pages = fs.readdirSync(pagesDir).filter((name) => name.endsWith('.md'));

describe('no diagram label draws past its own box', () => {
  it.each(pages)('%s', (page) => {
    const overflowing = diagramsOn(page).flatMap(labelsThatOverflow);
    expect(overflowing).toEqual([]);
  });

  it('reads the diagrams it claims to read', () => {
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.flatMap(diagramsOn).length).toBeGreaterThan(5);
  });

  it('catches a label that runs past its box, and leaves its neighbours alone', () => {
    const rigged = [
      '<svg viewBox="0 0 400 100">',
      '<rect class="bx pure" x="10" y="10" width="100" height="40" />',
      '<text class="s" x="22" y="28">fits</text>',
      '<text class="s" x="22" y="42">this label is far too long for the box</text>',
      '<rect class="bx dom" x="200" y="10" width="100" height="40" />',
      '<text class="t" x="250" y="28" text-anchor="middle">centred and much too wide</text>',
      '</svg>',
    ].join('\n');
    expect(labelsThatOverflow(rigged).map((o) => o.label)).toEqual([
      'this label is far too long for the box',
      'centred and much too wide',
    ]);
  });

  it('skips a label it cannot attribute to exactly one box', () => {
    const ambiguous = [
      '<svg viewBox="0 0 400 100">',
      '<rect class="bx pure" x="10" y="10" width="100" height="40" />',
      '<rect class="bx dom" x="14" y="10" width="100" height="40" />',
      '<text class="s" x="22" y="28">two boxes could hold this, so neither is assumed</text>',
      '</svg>',
    ].join('\n');
    expect(labelsThatOverflow(ambiguous)).toEqual([]);
  });
});
