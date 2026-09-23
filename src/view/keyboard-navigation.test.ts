import { describe, expect, it, vi } from 'vitest';
import { attachKeyboardNavigation } from './keyboard-navigation.js';
import type { KeyboardNavigationContext } from './keyboard-navigation.js';
import { GanttShell } from './gantt-shell.js';
import type { GanttShellOptions } from './gantt-shell.js';
import { entryId } from '../model/index.js';
import type { Instant, StoredEntry } from '../model/index.js';
import { EntryStore } from '../data/index.js';
import { CORE_FIELDS } from '../data/fields/core-fields.js';
import { editableOf } from '../data/fields/field-registry.js';

function el(): HTMLElement {
  const node = document.createElement('div');
  document.body.append(node);
  return node;
}

function makeCtx(overrides: Partial<KeyboardNavigationContext> = {}): {
  ctx: KeyboardNavigationContext;
  pans: [number, number][];
  tos: { x?: number; y?: number }[];
} {
  const pans: [number, number][] = [];
  const tos: { x?: number; y?: number }[] = [];
  const ctx: KeyboardNavigationContext = {
    keyboardPanEnabled: () => true,
    hasSelection: () => false,
    panBy: (dx, dy) => {
      pans.push([dx, dy]);
    },
    panTo: (to) => {
      tos.push(to);
    },
    arrowStepX: () => 24,
    arrowStepY: () => 32,
    pageStepY: () => 100,
    scrollMaxX: () => 800,
    ...overrides,
  };
  return { ctx, pans, tos };
}

function key(props: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...props });
}

describe('attachKeyboardNavigation (S3.7, D-S3-13 / D-S3-14)', () => {
  it('PageDown/PageUp pan vertically by one pane height', () => {
    const container = el();
    const { ctx, pans } = makeCtx();
    attachKeyboardNavigation(container, ctx);

    const down = key({ key: 'PageDown' });
    container.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(pans).toEqual([[0, 100]]);

    container.dispatchEvent(key({ key: 'PageUp' }));
    expect(pans).toEqual([
      [0, 100],
      [0, -100],
    ]);
    container.remove();
  });

  it('Home pans to x = 0; End pans to scroll max x', () => {
    const container = el();
    const { ctx, tos } = makeCtx();
    attachKeyboardNavigation(container, ctx);

    container.dispatchEvent(key({ key: 'Home' }));
    container.dispatchEvent(key({ key: 'End' }));

    expect(tos).toEqual([{ x: 0 }, { x: 800 }]);
    container.remove();
  });

  it('unmodified arrows pan when nothing is selected', () => {
    const container = el();
    const { ctx, pans } = makeCtx();
    attachKeyboardNavigation(container, ctx);

    container.dispatchEvent(key({ key: 'ArrowRight' }));
    container.dispatchEvent(key({ key: 'ArrowLeft' }));
    container.dispatchEvent(key({ key: 'ArrowDown' }));
    container.dispatchEvent(key({ key: 'ArrowUp' }));

    expect(pans).toEqual([
      [24, 0],
      [-24, 0],
      [0, 32],
      [0, -32],
    ]);
    container.remove();
  });

  it('arrows are a no-op while something is selected (editing owns them)', () => {
    const container = el();
    const { ctx, pans } = makeCtx({ hasSelection: () => true });
    attachKeyboardNavigation(container, ctx);

    const event = key({ key: 'ArrowRight' });
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(pans).toEqual([]);
    container.remove();
  });

  it('Page/Home/End still pan while something is selected', () => {
    const container = el();
    const { ctx, pans, tos } = makeCtx({ hasSelection: () => true });
    attachKeyboardNavigation(container, ctx);

    container.dispatchEvent(key({ key: 'PageDown' }));
    container.dispatchEvent(key({ key: 'Home' }));

    expect(pans).toEqual([[0, 100]]);
    expect(tos).toEqual([{ x: 0 }]);
    container.remove();
  });

  it('keyboardPanEnabled false writes nothing and does not preventDefault', () => {
    const container = el();
    const { ctx, pans, tos } = makeCtx({ keyboardPanEnabled: () => false });
    attachKeyboardNavigation(container, ctx);

    const event = key({ key: 'PageDown' });
    container.dispatchEvent(event);
    container.dispatchEvent(key({ key: 'Home' }));
    container.dispatchEvent(key({ key: 'ArrowRight' }));

    expect(event.defaultPrevented).toBe(false);
    expect(pans).toEqual([]);
    expect(tos).toEqual([]);
    container.remove();
  });

  it('detach() stops further pans', () => {
    const container = el();
    const { ctx, pans } = makeCtx();
    const attachment = attachKeyboardNavigation(container, ctx);
    attachment.detach();

    container.dispatchEvent(key({ key: 'PageDown' }));
    expect(pans).toEqual([]);
    container.remove();
  });
});

// S5.11, D-S5-39: `[S5-A4]` — a real `GanttShell`, wired production-default (`wiring: {}`), drives
// the chord-map table straight through `roving-focus.ts` + `keymap.ts` + `core-commands.ts`. One
// assertion per row proves the *scoped* meaning ("focus scope decides what a chord means"), not
// just that a listener exists. `keyboard-navigation.ts` above is the retired file this table
// replaced; the gate (`s5.13-gallery-and-gate.md` line 4) still names this file, so the new rows
// land here rather than in a new `roving-focus.test.ts`.
describe('[S5-A4] roving-focus chord-map parity (S5.11, D-S5-39)', () => {
  const zone = 'UTC';
  const day = (n: number): Instant => Date.parse(`2026-09-0${n + 1}T00:00:00Z`) as Instant;

  function parityDataset(entries: readonly StoredEntry[]): GanttShellOptions['dataset'] {
    return {
      entries: new EntryStore(entries, {
        timeZone: zone,
        dateOnlyEnd: 'inclusive' as const,
      }),
      timeZone: zone,
      datasetRevision: 0,
      fields: { all: CORE_FIELDS },
      field: (fieldKey) => CORE_FIELDS.find((field) => String(field.key) === String(fieldKey)),
      editableOf: (_id, fieldKey) => {
        const declared = CORE_FIELDS.find((field) => String(field.key) === String(fieldKey));
        return declared === undefined ? 'never' : editableOf(declared);
      },
      on: () => {},
      off: () => {},
    };
  }

  function spanEntry(id: string, opts: { parentId?: string } = {}): StoredEntry {
    return {
      id: entryId(id),
      name: id,
      start: day(0),
      end: day(2),
      ...(opts.parentId !== undefined ? { parentId: entryId(opts.parentId) } : {}),
      props: {},
    };
  }

  function rows(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>('.fg-grid-pane .fg-row'));
  }

  function bars(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>('.fg-timeline-pane .fg-bar'));
  }

  function rowIdOf(el: Element | null): string | undefined {
    return el?.getAttribute('data-row-id') ?? undefined;
  }

  function barIdOf(el: Element | null): string | undefined {
    return el?.getAttribute('data-bar-id') ?? undefined;
  }

  function arrow(key: string, extra: KeyboardEventInit = {}): KeyboardEvent {
    return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
  }

  it('grid pane row: ArrowDown/ArrowUp move focus one row at a time, and only there', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const shell = new GanttShell({
      wiring: {},
      container,
      dataset: parityDataset([spanEntry('a'), spanEntry('b'), spanEntry('c')]),
    });
    shell.render();

    const [row0, row1, row2] = rows(container);
    row0!.focus();

    row0!.dispatchEvent(arrow('ArrowDown'));
    expect(rowIdOf(document.activeElement)).toBe(rowIdOf(row1!));

    document.activeElement!.dispatchEvent(arrow('ArrowDown'));
    expect(rowIdOf(document.activeElement)).toBe(rowIdOf(row2!));

    // Clamped at the last row: one more ArrowDown does not fall off the end.
    document.activeElement!.dispatchEvent(arrow('ArrowDown'));
    expect(rowIdOf(document.activeElement)).toBe(rowIdOf(row2!));

    document.activeElement!.dispatchEvent(arrow('ArrowUp'));
    expect(rowIdOf(document.activeElement)).toBe(rowIdOf(row1!));

    shell.destroy();
    container.remove();
  });

  it('grid pane row: ArrowRight expands a collapsed parent; ArrowLeft collapses it back', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const shell = new GanttShell({
      wiring: {},
      container,
      dataset: parityDataset([spanEntry('p'), spanEntry('c', { parentId: 'p' })]),
      rowSource: { source: 'entries', tree: true },
      collapsed: ['p'],
    });
    shell.render();

    const parentRow = rows(container)[0]!;
    parentRow.focus();
    expect(shell.collapsed.map(String)).toContain('p');
    expect(rows(container)).toHaveLength(1); // the child stays hidden while `p` is collapsed

    parentRow.dispatchEvent(arrow('ArrowRight'));
    // `TreeCollapse.confirm` only requests a frame (`#frames.request()`, rAF-scheduled) — a real
    // page paints it on the next tick; this test forces that same frame now.
    shell.render();
    expect(shell.collapsed.map(String)).not.toContain('p');
    expect(rows(container)).toHaveLength(2); // expanding reveals the child row

    // Focus stays on `p` after the expand — ArrowLeft now collapses it straight back.
    document.activeElement!.dispatchEvent(arrow('ArrowLeft'));
    shell.render();
    expect(shell.collapsed.map(String)).toContain('p');
    expect(rows(container)).toHaveLength(1);

    shell.destroy();
    container.remove();
  });

  it('grid pane row: Home/End jump to the first/last row', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const shell = new GanttShell({
      wiring: {},
      container,
      dataset: parityDataset([spanEntry('a'), spanEntry('b'), spanEntry('c')]),
    });
    shell.render();

    const [row0, , row2] = rows(container);
    row0!.focus();

    document.activeElement!.dispatchEvent(arrow('End'));
    expect(rowIdOf(document.activeElement)).toBe(rowIdOf(row2!));

    document.activeElement!.dispatchEvent(arrow('Home'));
    expect(rowIdOf(document.activeElement)).toBe(rowIdOf(row0!));

    shell.destroy();
    container.remove();
  });

  it('grid pane row: Mod+A selects all, and Escape clears the Selection — whole-Gantt chords, not row-scoped', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const shell = new GanttShell({
      wiring: {},
      container,
      dataset: parityDataset([spanEntry('a'), spanEntry('b')]),
    });
    shell.render();

    rows(container)[0]!.focus();
    document.activeElement!.dispatchEvent(arrow('a', { ctrlKey: true }));
    expect(shell.selection).toHaveLength(2);

    document.activeElement!.dispatchEvent(arrow('Escape'));
    expect(shell.selection).toHaveLength(0);

    shell.destroy();
    container.remove();
  });

  it("timeline pane bar: ArrowDown/ArrowUp move focus to the nearest bar one row down/up — the grid pane's own meaning does not carry over", () => {
    const container = document.createElement('div');
    document.body.append(container);
    const shell = new GanttShell({
      wiring: {},
      container,
      dataset: parityDataset([spanEntry('a'), spanEntry('b'), spanEntry('c')]),
    });
    shell.render();

    const [bar0, bar1] = bars(container);
    bar0!.focus();

    bar0!.dispatchEvent(arrow('ArrowDown'));
    expect(barIdOf(document.activeElement)).toBe(barIdOf(bar1!));

    // A plain ArrowRight nudges the bar (D-GH-1) — it never moves focus, unlike a grid-pane row.
    document.activeElement!.dispatchEvent(arrow('ArrowRight'));
    expect(barIdOf(document.activeElement)).toBe(barIdOf(bar1!));

    shell.destroy();
    container.remove();
  });

  it('timeline pane bar: Home/End focus the first/last bar of the focused row', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const shell = new GanttShell({ wiring: {}, container, dataset: parityDataset([spanEntry('a')]) });
    shell.render();

    const bar0 = bars(container)[0]!;
    bar0.focus();

    document.activeElement!.dispatchEvent(arrow('End'));
    expect(barIdOf(document.activeElement)).toBe(barIdOf(bar0));

    document.activeElement!.dispatchEvent(arrow('Home'));
    expect(barIdOf(document.activeElement)).toBe(barIdOf(bar0));

    shell.destroy();
    container.remove();
  });

  it('#119: Mod+Z runs freegantt.undo and Mod+Shift+Z runs freegantt.redo, from either pane', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const undo = vi.fn();
    const redo = vi.fn();
    const shell = new GanttShell({
      wiring: {
        buildCommandContext: (parts) => ({
          ...parts,
          dataset: { canUndo: true, undo, canRedo: true, redo },
        }),
      },
      container,
      dataset: parityDataset([spanEntry('a')]),
    });
    shell.render();

    bars(container)[0]!.focus();
    document.activeElement!.dispatchEvent(arrow('z', { ctrlKey: true }));
    expect(undo).toHaveBeenCalledTimes(1);

    document.activeElement!.dispatchEvent(arrow('z', { ctrlKey: true, shiftKey: true }));
    expect(redo).toHaveBeenCalledTimes(1);

    shell.destroy();
    container.remove();
  });

  it('#buildCommandContext fills all five TargetKinds from focus (D-S5-39)', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const captured: { target: { kind: string } | undefined } = { target: undefined };
    const shell = new GanttShell({
      wiring: {
        // Mod+Z is registered unconditionally (`core-commands.ts`), so this runs on every chord
        // below regardless of `dataset.canUndo` — it exists only to capture `parts.target`, the
        // same trick the Mod+Z test above uses for `dataset`.
        buildCommandContext: (parts) => {
          captured.target = parts.target;
          return { ...parts, dataset: { canUndo: false, undo: () => {}, canRedo: false, redo: () => {} } };
        },
      },
      container,
      dataset: parityDataset([spanEntry('a')]),
      gridColumns: ['name'],
    });
    shell.render();

    // Mod+Z fires and overwrites `captured.target` on every chord below, so nothing needs to
    // reset it first — the chord itself always runs (D-S5-7's newest-first resolution never
    // skips a registered command for missing `when` state; `dataset.canUndo: false` above only
    // decides whether undo itself then runs).
    function readTargetKindFrom(el: HTMLElement): string | undefined {
      el.focus();
      document.activeElement!.dispatchEvent(arrow('z', { ctrlKey: true }));
      return captured.target?.kind;
    }

    expect(readTargetKindFrom(rows(container)[0]!)).toBe('row');
    expect(readTargetKindFrom(container.querySelector<HTMLElement>('.fg-row-label')!)).toBe('gridCell');
    expect(readTargetKindFrom(bars(container)[0]!)).toBe('bar');
    expect(
      readTargetKindFrom(container.querySelector<HTMLElement>('.fg-col-header[data-field="name"]')!),
    ).toBe('header');
    expect(readTargetKindFrom(container.querySelector<HTMLElement>('.fg-splitter')!)).toBe('splitter');

    shell.destroy();
    container.remove();
  });
});
