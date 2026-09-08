import { describe, expect, it, vi } from 'vitest';
import { ensureBaseStyles } from './styles.js';
import { GanttShell } from './gantt-shell.js';
import type { GanttShellOptions } from './gantt-shell.js';
import { entryId, mintedSegmentId, segmentId } from '../model/index.js';
import type { Entry, Instant } from '../model/index.js';
import { EntryStore } from '../data/index.js';
import { CORE_FIELDS } from '../data/fields/core-fields.js';

function fakeDataset(list: readonly Entry[]): GanttShellOptions['dataset'] {
  let mintedSegmentCounter = 0;
  const context = {
    timeZone,
    dateOnlyEnd: 'inclusive' as const,
    referenceDate: 0 as Instant,
    rollUpKinds: new Set(['group']),
    mintSegmentId: () => mintedSegmentId(++mintedSegmentCounter),
  };
  return {
    entries: new EntryStore(list, context),
    timeZone,
    datasetRevision: 0,
    isRollUpKind: () => false,
    fields: { all: CORE_FIELDS },
    field: (key) => CORE_FIELDS.find((field) => String(field.key) === String(key)),
    on: () => {},
    off: () => {},
  };
}

// happy-dom does no layout, so a real ResizeObserver never fires — same seam as gantt-shell.test.ts.
class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', FakeResizeObserver);

function instant(iso: string): Instant {
  return Date.parse(iso) as Instant;
}

const timeZone = 'UTC';
const entries: Entry[] = [
  {
    id: entryId('t1'),
    name: 'Entry 1',
    start: instant('2026-09-01T00:00:00Z'),
    end: instant('2026-09-03T00:00:00Z'),
    kind: 'span',
    segments: [
      { id: segmentId('t1-1'), start: instant('2026-09-01T00:00:00Z'), end: instant('2026-09-03T00:00:00Z') },
    ],
  },
];

const COLOR_TOKENS = [
  '--fg-pane-bg',
  '--fg-splitter-color',
  '--fg-header-bg',
  '--fg-header-band-bg',
  '--fg-header-text',
  '--fg-header-subtext',
  '--fg-header-divider-color',
  '--fg-tick-line-color',
  '--fg-tick-line-strong-color',
  '--fg-row-even-bg',
  '--fg-row-odd-bg',
  '--fg-row-selected-bg',
  '--fg-row-label-color',
  '--fg-bar-fill',
  '--fg-bar-label-color',
  '--fg-bar-label-outside-color',
  '--fg-bar-label-gap',
  '--fg-warn',
  '--fg-date-line-color',
];

function makeContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  return container;
}

function clearStyles(): void {
  document.head.querySelectorAll('style[data-freegantt-styles]').forEach((n) => n.remove());
}

describe('ensureBaseStyles', () => {
  it('injects exactly one <style> for two Gantt instances constructed in one document', () => {
    clearStyles();
    const a = new GanttShell({ wiring: {}, container: makeContainer(), dataset: fakeDataset(entries) });
    const b = new GanttShell({ wiring: {}, container: makeContainer(), dataset: fakeDataset(entries) });
    expect(document.head.querySelectorAll('style[data-freegantt-styles]')).toHaveLength(1);
    a.destroy();
    b.destroy();
  });

  it('is a true no-op on a second call — node count unchanged', () => {
    clearStyles();
    ensureBaseStyles(document);
    const before = document.head.querySelectorAll('style[data-freegantt-styles]').length;
    ensureBaseStyles(document);
    expect(document.head.querySelectorAll('style[data-freegantt-styles]')).toHaveLength(before);
  });

  it('the injected sheet carries every D-S1.10-9 colour token on :root and on the container theme pins', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    const [rootBlock] = css.match(/:root\s*{[^}]*}/) ?? [''];
    const [containerBlock] = css.match(/\.fg-container\s*{[^}]*}/) ?? [''];
    const [lightBlock] = css.match(/\.fg-container\[data-fg-theme='light'\]\s*{[^}]*}/) ?? [''];
    const [darkBlock] = css.match(/\.fg-container\[data-fg-theme='dark'\]\s*{[^}]*}/) ?? [''];
    const [autoDarkBlock] = css.match(/\.fg-container:not\(\[data-fg-theme\]\)\s*{[^}]*}/) ?? [''];
    for (const token of COLOR_TOKENS) {
      expect(rootBlock, `:root missing ${token}`).toContain(token);
      expect(containerBlock, `.fg-container missing ${token}`).toContain(token);
      expect(lightBlock, `[data-fg-theme='light'] missing ${token}`).toContain(token);
      expect(darkBlock, `[data-fg-theme='dark'] missing ${token}`).toContain(token);
      expect(autoDarkBlock, `auto-dark missing ${token}`).toContain(token);
    }
    expect(css).not.toContain(':root:not([data-fg-theme])');
  });

  it('[S1-A8] --fg-band-height sizes bands; --fg-header-height is gone (D-S1.12-10)', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    expect(css).toContain('--fg-band-height');
    expect(css).toContain('--fg-tick-box-floor');
    expect(css).toContain('--fg-indent-width');
    expect(css).toContain('--fg-lane-gap');
    expect(css).toContain('--fg-bar-opacity');
    expect(css).toContain('--fg-bar-fill-painted');
    expect(css).not.toContain(':root, .fg-container');
    expect(css).not.toContain('--fg-header-height');
  });

  it('setting --fg-bar-fill on the container before construction overrides the shipped default', () => {
    clearStyles();
    const container = makeContainer();
    container.style.setProperty('--fg-bar-fill', 'rgb(1, 2, 3)');
    const shell = new GanttShell({ wiring: {}, container, dataset: fakeDataset(entries) });
    const bar = container.querySelector('.fg-bar');
    expect(bar).not.toBeNull();
    expect(container.style.getPropertyValue('--fg-bar-fill')).toBe('rgb(1, 2, 3)');
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    expect(css).toMatch(/\.fg-bar \{[^}]*background: var\(--fg-bar-fill-painted\)/);
    shell.destroy();
  });

  it('the container turns off native text highlight so a click on a bar is an Entry select', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    expect(css).toContain('user-select: none');
  });

  it('a pending bar uses reduced opacity and a dotted selection outline (D-S3-17)', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    expect(css).toContain('--fg-pending-opacity');
    expect(css).toContain('outline: 2px dotted var(--fg-selection-color)');
  });

  // J3: --fg-selection-color now shares --fg-bar-fill's own hue, so a flush outline would nearly
  // vanish into the fill. The offset is what keeps the ring visible against the pane instead.
  it('offsets the selected and pending bar outline off the fill, not flush against it (J3)', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    const selectedRule = css.split('\n').find((line) => line.startsWith('.fg-bar[data-state~="selected"]'));
    const pendingRule = css.split('\n').find((line) => line.startsWith('.fg-bar[data-state~="pending"]'));
    expect(selectedRule).toContain('outline-offset: 2px');
    expect(pendingRule).toContain('outline-offset: 2px');
  });

  // J3: a selected row (or filtered row band) reads as one opaque colour, not a mix over whatever
  // sits behind the container — so axe can check it without knowing the pane's own background.
  it('paints a selected row with the flat --fg-row-selected-bg token, not a colour-mix', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    const rule = css.split('\n').find((line) => line.includes(".fg-row[data-state~='selected']"));
    expect(rule).toBeDefined();
    expect(rule).toContain('var(--fg-row-selected-bg)');
    expect(rule).not.toContain('color-mix');
  });

  // J1: an inside label ellipsises rather than overflowing the bar, and an outside one paints past
  // the bar's own edge in the pane's own ink, with no ellipsis — the two rules a fit test picks between.
  it('carries a .fg-bar-label rule that ellipsises, and an outside variant that does not (J1)', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    const insideRule = css.split('\n').find((line) => line.startsWith('.fg-bar-label {'));
    const outsideRule = css.split('\n').find((line) => line.includes("[data-label='outside'] .fg-bar-label"));
    expect(insideRule).toBeDefined();
    expect(insideRule).toContain('text-overflow: ellipsis');
    expect(insideRule).toContain('var(--fg-bar-label-gap');
    expect(outsideRule).toBeDefined();
    expect(outsideRule).toContain('var(--fg-bar-label-outside-color)');
    expect(outsideRule).not.toContain('ellipsis');
  });

  // Bug hunt: color: transparent on .fg-bar-diamond hid a milestone's own painted glyph from
  // double-painting under ::before's own fill — but J1 lets a milestone carry a label too, and a
  // transparent inherited colour would silently hide that label as well without this override.
  it('gives a milestone label a real colour, undoing .fg-bar-diamond’s own transparent (J1)', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    const rule = css.split('\n').find((line) => line.startsWith('.fg-bar-diamond .fg-bar-label {'));
    expect(rule).toBeDefined();
    expect(rule).toContain('var(--fg-bar-label-color)');
  });

  // A hollow checkpoint — "not done yet" in every Gantt that draws one — is `--fg-bar-fill` at the
  // pane's own background behind a stroke. The stroke is the token; when a consumer sets neither,
  // the glyph paints exactly as it always has.
  it('paints the diamond glyph from --fg-diamond-stroke, inside its own size', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    const rule = css.split('\n').find((line) => line.startsWith('.fg-bar-diamond::before {'));

    expect(rule).toBeDefined();
    expect(rule).toContain('border: var(--fg-diamond-stroke, none)');
    // Without border-box a 1.5px stroke would push the glyph past --fg-diamond-size, and layout's
    // own painted-span floor (size × √2) would no longer contain it.
    expect(rule).toContain('box-sizing: border-box');
  });

  // The same split the group rail makes: the box is the hit target, the glyph is the ink. A shared
  // outline would frame a full-height rectangle of empty pane around a 10px diamond.
  it('paints a diamond’s hover and selection on the glyph, not on its box', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    const lines = css.split('\n');
    const cancel = lines.find((line) => line.startsWith('.fg-bar-diamond[data-state~="hovered"],'));
    const selected = lines.find((line) =>
      line.startsWith('.fg-bar-diamond[data-state~="selected"]::before {'),
    );

    expect(cancel).toBeDefined();
    expect(cancel).toContain('outline: none');
    expect(cancel).toContain('box-shadow: none');
    expect(selected).toBeDefined();
    expect(selected).toContain('var(--fg-selection-color)');
    // Equal specificity with the shared .fg-bar rules, so the running order decides: the diamond's
    // own rules must come last, or the box paints its outline back.
    expect(lines.indexOf(cancel!)).toBeGreaterThan(
      lines.findIndex((line) => line.startsWith('.fg-bar[data-state~="selected"] {')),
    );
  });

  // #171: the Refusal notice used to write eleven inline declarations over this sheet, so a consumer
  // stylesheet could not reach it and the two token fallbacks were pinned to the light theme.
  // #231 F1: it selects on its own class, so no consumer copying this selector can reach an editor.
  it('styles the refusal notice from the sheet, on published tokens with no light-theme fallback', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    const rule = css.split('\n').find((line) => line.startsWith('.fg-cell-notice {'));

    expect(rule).toBeDefined();
    // Load-bearing: the notice sits over the cell, and the next double-click must reach the cell.
    expect(rule).toContain('pointer-events: none');
    expect(rule).toContain('border: 1px solid var(--fg-warn)');
    expect(rule).toContain('background: var(--fg-pane-bg)');
    expect(rule).not.toContain('#D97706');
  });

  it('dark theme paints bar labels in dark ink so they read on the light blue fill', () => {
    clearStyles();
    const container = makeContainer();
    const shell = new GanttShell({ wiring: {}, container, dataset: fakeDataset(entries), theme: 'dark' });
    const bar = container.querySelector('.fg-bar');
    expect(bar).not.toBeNull();
    expect(getComputedStyle(bar as Element).color).toBe('#16181D');
    shell.destroy();
  });
});
