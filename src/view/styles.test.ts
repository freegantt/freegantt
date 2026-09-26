import { describe, expect, it, vi } from 'vitest';
import { ensureBaseStyles } from './styles.js';
import { GanttShell } from './gantt-shell.js';
import type { GanttShellOptions } from './gantt-shell.js';
import { entryId } from '../model/index.js';
import type { Instant, StoredEntry } from '../model/index.js';
import { EntryStore } from '../data/index.js';
import { CORE_FIELDS } from '../data/fields/core-fields.js';
import { editableOf } from '../data/fields/field-registry.js';

function fakeDataset(list: readonly StoredEntry[]): GanttShellOptions['dataset'] {
  const context = {
    timeZone,
  };
  return {
    entries: new EntryStore(list, context),
    timeZone,
    datasetRevision: 0,
    fields: { all: CORE_FIELDS },
    field: (key) => CORE_FIELDS.find((field) => String(field.key) === String(key)),
    editableOf: (_id, key) => {
      const declared = CORE_FIELDS.find((field) => String(field.key) === String(key));
      return declared === undefined ? 'never' : editableOf(declared);
    },
    on: () => () => {},
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
const entries: StoredEntry[] = [
  {
    id: entryId('t1'),
    name: 'Entry 1',
    start: instant('2026-09-01T00:00:00Z'),
    end: instant('2026-09-03T00:00:00Z'),
    props: {},
    siblingIndex: 0,
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

// One call site for every ordinary construction in this file, so the step that moves the first
// paint out of the constructor (ADR 0032) touches this file once, not at every call site.
function paintedShell(options: GanttShellOptions): GanttShell {
  const shell = new GanttShell(options);
  shell.paintFirstFrame();
  return shell;
}

describe('ensureBaseStyles', () => {
  it('injects exactly one <style> for two Gantt instances constructed in one document', () => {
    clearStyles();
    const a = paintedShell({ wiring: {}, container: makeContainer(), dataset: fakeDataset(entries) });
    const b = paintedShell({ wiring: {}, container: makeContainer(), dataset: fakeDataset(entries) });
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

  it('ships wrapped in @layer freegantt (ADR 0021), so an unlayered consumer rule always wins', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    expect(css).toMatch(/^@layer freegantt \{/);
    expect(css.trimEnd()).toMatch(/\}$/);
    // The wrapper, not one rule inside it — an edit that only means to add a rule must not be able
    // to drop the layer.
    expect(css).toContain(':root {');
    expect(css).toContain('.fg-live-region {');
  });

  it('the injected sheet carries every colour token on :root and on the theme pins, never on .fg-container (#271)', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    const [rootBlock] = css.match(/:root\s*{[^}]*}/) ?? [''];
    const [containerBlock] = css.match(/\.fg-container\s*{[^}]*}/) ?? [''];
    // Attribute only, no `.fg-container`: a consumer's own chrome outside the Gantt — a toolbar above
    // it — carries the pin and reads the same token set. `.fg-container` itself declares no colour of
    // its own, so an ancestor's pin reaches the container by inheritance instead of being blocked by
    // a colour declaration on the container that always wins over anything inherited (#271).
    const [lightBlock] = css.match(/\n\[data-fg-theme='light'\]\s*{[^}]*}/) ?? [''];
    const [darkBlock] = css.match(/\n\[data-fg-theme='dark'\]\s*{[^}]*}/) ?? [''];
    // The auto-dark arm lives on :root, not on .fg-container, so `--fg-*` outside the container
    // follows the OS too, and a dark OS never overrides an ancestor's own light pin (#271).
    const [autoDarkBlock] = css.match(/:root:not\(\[data-fg-theme\]\)\s*{[^}]*}/) ?? [''];
    for (const token of COLOR_TOKENS) {
      expect(rootBlock, `:root missing ${token}`).toContain(token);
      expect(containerBlock, `.fg-container must not declare ${token}`).not.toContain(token);
      expect(lightBlock, `[data-fg-theme='light'] missing ${token}`).toContain(token);
      expect(darkBlock, `[data-fg-theme='dark'] missing ${token}`).toContain(token);
      expect(autoDarkBlock, `auto-dark missing ${token}`).toContain(token);
    }
    expect(css).toContain(':root:not([data-fg-theme])');
  });

  it('[S1-A8] --fg-band-height sizes bands; --fg-header-height is gone', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    expect(css).toContain('--fg-band-height');
    expect(css).toContain('--fg-tick-box-floor');
    expect(css).toContain('--fg-indent-width');
    // #294: a px metric, not a colour — it moved out of the light/dark token blocks into this
    // metrics block, so a theme pin can no longer change it.
    expect(css).toContain('--fg-bar-label-gap');
    expect(css).toContain('--fg-bar-opacity');
    expect(css).toContain('--fg-bar-fill-painted');
    expect(css).not.toContain(':root, .fg-container');
    expect(css).not.toContain('--fg-header-height');
  });

  it('[#319] .fg-cursor-line-label paints below the header bands, same anchor #225 gave the Date line label', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    expect(css).toMatch(/\.fg-cursor-line-label\s*\{[^}]*top:\s*100%/);
  });

  it("[#318] the Date line label's default anchor is scoped to data-placement='belowHeader', not every label", () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    expect(css).toMatch(/\.fg-date-line-label\[data-placement='belowHeader'\]\s*\{[^}]*top:\s*100%/);
  });

  it('setting --fg-bar-fill on the container before construction overrides the shipped default', () => {
    clearStyles();
    const container = makeContainer();
    container.style.setProperty('--fg-bar-fill', 'rgb(1, 2, 3)');
    const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });
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

  it('a pending bar uses reduced opacity and a dotted selection outline', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    expect(css).toContain('--fg-pending-opacity');
    expect(css).toContain('outline: 2px dotted var(--fg-selection-color)');
  });

  // #326: .fg-bar:focus-visible and .fg-bar[data-state~="selected"] share one specificity, so
  // document order alone decides which outline paints a focused, selected bar. The focus rule must
  // come last among them, or a keyboard-focused bar reads as selected instead of focused.
  it("orders .fg-bar's own focus-visible rule after every outline-setting state/flag rule (#326)", () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    const lines = css.split('\n');
    const focusVisibleIndex = lines.findIndex((line) => line.trim() === '.fg-bar:focus-visible,');
    const conflictIndex = lines.findIndex((line) => line.startsWith('.fg-bar[data-flag~="conflict"]'));
    const selectedIndex = lines.findIndex((line) => line.startsWith('.fg-bar[data-state~="selected"]'));
    const pendingIndex = lines.findIndex((line) => line.startsWith('.fg-bar[data-state~="pending"]'));
    expect(focusVisibleIndex).toBeGreaterThan(conflictIndex);
    expect(focusVisibleIndex).toBeGreaterThan(selectedIndex);
    expect(focusVisibleIndex).toBeGreaterThan(pendingIndex);
  });

  // --fg-selection-color now shares --fg-bar-fill's own hue, so a flush outline would nearly
  // vanish into the fill. The offset is what keeps the ring visible against the pane instead.
  it('offsets the selected and pending bar outline off the fill, not flush against it', () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    const selectedRule = css.split('\n').find((line) => line.startsWith('.fg-bar[data-state~="selected"]'));
    const pendingRule = css.split('\n').find((line) => line.startsWith('.fg-bar[data-state~="pending"]'));
    expect(selectedRule).toContain('outline-offset: 2px');
    expect(pendingRule).toContain('outline-offset: 2px');
  });

  // A selected row (or filtered row band) reads as one opaque colour, not a mix over whatever
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

  // An inside label ellipsises rather than overflowing the bar, and an outside one paints past
  // the bar's own edge in the pane's own ink, with no ellipsis — the two rules a fit test picks between.
  it('carries a .fg-bar-label rule that ellipsises, and an outside variant that does not', () => {
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

  // #436: the clip that contains a too-wide 'inside' label keys on the token, never on `.fg-bar`
  // itself. A bar whose content a `barRenderer` owns carries no `data-label` (render/dom/index.ts's
  // `ownsContent`), so a clip on the element would reach a child the consumer placed on purpose and
  // no escape hatch could reach it back — the #325 defect, one seam further out.
  // e2e/planner.spec.ts holds the paint-tree half of this; here is the rule that produces it.
  it("clips only a bar carrying the library's own inside label, never the bar itself (#436)", () => {
    clearStyles();
    ensureBaseStyles(document);
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    const barRule = css.split('\n').find((line) => line.startsWith('.fg-bar {'));
    const clipRule = css.split('\n').find((line) => line.startsWith(".fg-bar[data-label='inside'] {"));

    expect(barRule).toBeDefined();
    expect(barRule).not.toContain('overflow');
    expect(clipRule).toBeDefined();
    expect(clipRule).toContain('overflow: hidden');
  });

  // ADR 0013 retired core's milestone diamond (`.fg-bar-diamond`) end to end — the base sheet never
  // wrote it, so the three tests that once read it here stayed gone. ADR 0022 brought the class back
  // as a shipped `diamond()` Variant, but its rules live on the Variant's own `css`
  // (`variant-styles.ts`), never in this base sheet — see `variants.test.ts` instead.

  // #171: the Refusal notice used to write eleven inline declarations over this sheet, so a consumer
  // stylesheet could not reach it and the two token fallbacks were pinned to the light theme.
  // #231: it selects on its own class, so no consumer copying this selector can reach an editor.
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

  // ADR 0021: the sheet ships inside `@layer freegantt`, which happy-dom's CSSOM does not parse, so
  // a rule declared inside the layer never reaches getComputedStyle here — real engines do apply it
  // (e2e/theme.spec.ts reads the same bar's computed colour in Chromium). This unit test instead
  // pins the two declarations the cascade would join: the dark pin sets the dark ink token, and
  // .fg-bar paints its label from that token.
  it("declares the dark theme's dark ink token, and .fg-bar reads its label colour from that token", () => {
    clearStyles();
    const container = makeContainer();
    const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries), theme: 'dark' });
    const bar = container.querySelector('.fg-bar');
    expect(bar).not.toBeNull();
    expect(container.getAttribute('data-fg-theme')).toBe('dark');
    const css = document.head.querySelector('style[data-freegantt-styles]')?.textContent ?? '';
    const [darkBlock] = css.match(/\[data-fg-theme='dark'\]\s*{[^}]*}/) ?? [''];
    expect(darkBlock).toContain('--fg-bar-label-color: #16181D');
    expect(css).toMatch(/\.fg-bar \{[^}]*color: var\(--fg-bar-label-color\)/);
    shell.destroy();
  });
});
