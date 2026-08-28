import { describe, expect, it, vi } from 'vitest';
import { ensureBaseStyles } from './styles.js';
import { GanttShell } from './gantt-shell.js';
import type { GanttShellOptions } from './gantt-shell.js';
import { entryId } from '../model/index.js';
import type { Entry, Instant } from '../model/index.js';
import { EntryStore } from '../data/index.js';

function fakeDataset(list: readonly Entry[]): GanttShellOptions['dataset'] {
  const context = {
    timeZone,
    dateOnlyEnd: 'inclusive' as const,
    referenceDate: 0 as Instant,
    derivedSpanKinds: new Set(['group']),
  };
  return { entries: new EntryStore(list, context), timeZone, on: () => {}, off: () => {} };
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
    const a = new GanttShell({ container: makeContainer(), dataset: fakeDataset(entries) });
    const b = new GanttShell({ container: makeContainer(), dataset: fakeDataset(entries) });
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

  it('setting --fg-bar-fill on the container before construction overrides the shipped default', () => {
    clearStyles();
    const container = makeContainer();
    container.style.setProperty('--fg-bar-fill', 'rgb(1, 2, 3)');
    const shell = new GanttShell({ container, dataset: fakeDataset(entries) });
    const bar = container.querySelector('.fg-bar');
    expect(bar).not.toBeNull();
    expect(getComputedStyle(bar as Element).backgroundColor).toBe('rgb(1, 2, 3)');
    shell.destroy();
  });

  it('dark theme paints bar labels in warm ink so they read on the light blue fill', () => {
    clearStyles();
    const container = makeContainer();
    const shell = new GanttShell({ container, dataset: fakeDataset(entries), theme: 'dark' });
    const bar = container.querySelector('.fg-bar');
    expect(bar).not.toBeNull();
    expect(getComputedStyle(bar as Element).color).toBe('#1A1815');
    shell.destroy();
  });
});
