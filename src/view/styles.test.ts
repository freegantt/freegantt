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
  '--fg-row-even-bg',
  '--fg-row-odd-bg',
  '--fg-row-label-color',
  '--fg-bar-fill',
  '--fg-bar-label-color',
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
    expect(getComputedStyle(bar as Element).backgroundColor).toBe('rgb(1, 2, 3)');
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

  // #171: the Refusal notice used to write eleven inline declarations over this sheet, so a consumer
  // stylesheet could not reach it and the two token fallbacks were pinned to the light theme.
  it('styles the refusal notice from the sheet, on published tokens with no light-theme fallback', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    const rule = css
      .split('\n')
      .find((line) => line.startsWith(".fg-cell-editor[data-state='invalid'][data-reason]"));

    expect(rule).toBeDefined();
    // Load-bearing: the notice sits over the cell, and the next double-click must reach the cell.
    expect(rule).toContain('pointer-events: none');
    expect(rule).toContain('border: 1px solid var(--fg-warn)');
    expect(rule).toContain('background: var(--fg-pane-bg)');
    expect(rule).not.toContain('#D97706');
  });

  it('dark theme paints bar labels in warm ink so they read on the light blue fill', () => {
    clearStyles();
    const container = makeContainer();
    const shell = new GanttShell({ wiring: {}, container, dataset: fakeDataset(entries), theme: 'dark' });
    const bar = container.querySelector('.fg-bar');
    expect(bar).not.toBeNull();
    expect(getComputedStyle(bar as Element).color).toBe('#1A1815');
    shell.destroy();
  });
});
