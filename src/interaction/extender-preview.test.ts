// interaction/ — [S3-A4]: a real pointer drag through `attachEntryGestures` previews an installed
// extension hook's own cascade as a ghost, on the same rAF-coalesced frame the caller's own drag
// previews on (D-S3-18, U7). `interaction/` may import `view/`, `data/` and `model/` only (I1,
// plans/01 §1) — never `scheduling/`, which does not exist yet (S7): this file proves the S3.6
// extender-preview feature with no dependency on it, `data/edit-extension.ts`'s generic
// `EditExtender` hook standing in for whatever a future scheduling plugin would install.

import { describe, expect, it, vi } from 'vitest';
import { GanttShell } from '../view/gantt-shell.js';
import type { GanttShellOptions } from '../view/gantt-shell.js';
import { attachEntryGestures } from './entry-gestures.js';
import { DatasetState } from '../data/index.js';
import type { EditExtender } from '../data/edit-extension.js';
import { entryId } from '../model/index.js';
import type { Instant } from '../model/index.js';

// `interaction/` may not import `time/` (I1) — same seam `view/gantt-shell.test.ts` uses: Date.parse
// on a Z-offset string is deterministic, unlike `new Date(str)` on a zoneless one, so this is not the
// thing I10 (no Date outside time/) exists to ban.
function instant(iso: string): Instant {
  return Date.parse(iso) as Instant;
}

const timeZone = 'UTC';
const A_START = instant('2026-09-01T00:00:00Z');
const A_END = instant('2026-09-03T00:00:00Z');
const X_START = instant('2026-09-05T00:00:00Z');
const X_END = instant('2026-09-06T00:00:00Z');

/** Cascades `x` (never grabbed) by the same delta a move on `a` proposes — the shape D-S3-18's
 *  pseudocode names: `extra = extender({ entries: committed, proposed: draft })`. */
function makeCascadeExtender(): EditExtender {
  return ({ entries, proposed }) => {
    const aEdit = proposed.get(entryId('a'));
    const x = entries.get(entryId('x'));
    if (!aEdit || aEdit.start === undefined || !x) return new Map();
    // I10 bans arithmetic directly on an Instant outside time/ (interaction/ may not import it) —
    // unbrand to plain numbers first, same as gesture-pipeline.test.ts's own `as unknown as Instant`
    // fakes.
    const startMs = aEdit.start as unknown as number;
    const aStartMs = A_START as unknown as number;
    const deltaMs = startMs - aStartMs;
    const xStartMs = X_START as unknown as number;
    const xEndMs = X_END as unknown as number;
    return new Map([
      [
        entryId('x'),
        { start: (xStartMs + deltaMs) as unknown as Instant, end: (xEndMs + deltaMs) as unknown as Instant },
      ],
    ]);
  };
}

function stubPointerCapture(el: HTMLElement): void {
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
}

/** Builds a real `GanttShell` over a real `DatasetState` — `commitEntryEdits` writes through
 *  `state.transaction()`/`state.entries.update()`, the same shape `api/gantt.ts` wires for real
 *  Gantt usage (D-S3-16). `editExtender` is a `GanttShellOptions`-only field (P1: no public install
 *  API in S3, so `api/gantt.ts` never passes one) — this is the "internal option" the S3.6 plan names. */
function buildShell(overrides: Partial<GanttShellOptions> = {}): {
  shell: GanttShell;
  container: HTMLElement;
  timeline: HTMLElement;
  state: DatasetState;
} {
  const state = new DatasetState({
    timeZone,
    entries: [
      { id: 'a', name: 'a', start: A_START, end: A_END },
      { id: 'x', name: 'x', start: X_START, end: X_END },
    ],
  });
  const container = document.createElement('div');
  const shell = new GanttShell({
    container,
    dataset: state,
    wiring: {
      entryGestures: attachEntryGestures,
      commitEntryEdits: (edits) => {
        state.transaction(() => {
          for (const [id, edit] of edits) state.entries.update(id, edit);
        });
        return true;
      },
    },
    ...overrides,
  });
  const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
  return { shell, container, timeline, state };
}

/** `render/dom`'s `hitTest` resolves through `document.elementFromPoint`, not layout math (S1 §4) —
 *  same stub `api/gantt.test.ts`'s drag suite uses, keyed on the one point each test drags from. */
function stubElementFromPoint(at: { x: number; y: number; el: Element }): () => void {
  const original = document.elementFromPoint.bind(document);
  document.elementFromPoint = (x: number, y: number) => (x === at.x && y === at.y ? at.el : original(x, y));
  return () => {
    document.elementFromPoint = original;
  };
}

describe('[S3-A4] extender preview', () => {
  it('ghosts the extension hook’s own extra on the same preview frame as the caller’s drag', async () => {
    const { shell, container, timeline } = buildShell({ editExtender: makeCascadeExtender() });
    const barA = container.querySelector<HTMLElement>('[data-item-id="a:0"]')!;
    const barX = container.querySelector<HTMLElement>('[data-item-id="x:0"]')!;
    function transformXOf(el: HTMLElement): number {
      return Number(/translate\((-?\d+(?:\.\d+)?)px/.exec(el.style.transform)![1]);
    }
    const committedXA = transformXOf(barA);
    const committedXX = transformXOf(barX);
    stubPointerCapture(timeline);
    const restore = stubElementFromPoint({ x: 5, y: 5, el: barA });

    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 55, clientY: 5, pointerId: 1 }));
    // D-S3-18: the preview coalesces on the pipeline's own rAF, not synchronously per pointermove.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(barA.dataset['state']).toContain('dragging');
    expect(barX.dataset['state']).toContain('ghost');
    // The ghost actually moved by the same delta the grabbed bar previews at (identical ms delta,
    // D-S3-18's EditRequest shape) — diff each bar's now-previewed x against its pre-drag committed
    // one, rather than comparing raw transforms, which differ per bar by their own base geometry.
    const dxA = transformXOf(barA) - committedXA;
    const dxX = transformXOf(barX) - committedXX;
    expect(dxX).toBeCloseTo(dxA, 6);

    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 55, clientY: 5, pointerId: 1 }));
    restore();
    shell.destroy();
  });

  it('Escape mid-drag clears the ghost and writes nothing (P1 identity contrast, [S3-A2])', async () => {
    const { shell, container, timeline, state } = buildShell({ editExtender: makeCascadeExtender() });
    const barA = container.querySelector<HTMLElement>('[data-item-id="a:0"]')!;
    const barX = container.querySelector<HTMLElement>('[data-item-id="x:0"]')!;
    const xBefore = state.entries.get(entryId('x'))!;
    stubPointerCapture(timeline);
    const restore = stubElementFromPoint({ x: 5, y: 5, el: barA });

    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 55, clientY: 5, pointerId: 1 }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(barX.dataset['state']).toContain('ghost');

    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // Escape's own cancel() clears the preview through the same rAF-coalesced path (D-S3-18) — the
    // repaint lands on the next frame, not synchronously.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(barA.dataset['state'] ?? '').not.toContain('dragging');
    expect(barX.dataset['state'] ?? '').not.toContain('ghost');
    expect(state.entries.get(entryId('x'))).toEqual(xBefore);

    restore();
    shell.destroy();
  });

  // #167: the trap the S5.10 author flagged. `api/gantt.ts` passes an *arrow*
  // (`(request) => options.dataset.editExtender(request)`), never the function the Dataset holds at
  // construction. A Dataset plugin composes onto that hook later (D-S5-23, S5.10), so anything that
  // stored the arrow's result would silently ghost nothing from that moment on. That is invisible
  // today and wrong the moment S7's scheduling plugin installs after the Gantt is built.
  it('reads the Dataset’s occupant live, so a plugin installed after the Gantt still ghosts', async () => {
    // The arrow closes over `built`, and is only ever called from a later drag. So it reads whatever
    // occupies the Dataset's hook at that moment, which is the whole point.
    const built: ReturnType<typeof buildShell> = buildShell({
      editExtender: (request) => built.state.editExtender(request),
    });
    // Composed after the shell already exists — exactly what `Gantt.plugins = [...]` does later.
    built.state.setExtender(() => makeCascadeExtender());

    const { shell, container, timeline } = built;
    const barA = container.querySelector<HTMLElement>('[data-item-id="a:0"]')!;
    const barX = container.querySelector<HTMLElement>('[data-item-id="x:0"]')!;
    stubPointerCapture(timeline);
    const restore = stubElementFromPoint({ x: 5, y: 5, el: barA });

    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 55, clientY: 5, pointerId: 1 }));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(barA.dataset['state']).toContain('dragging');
    expect(barX.dataset['state']).toContain('ghost');

    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 55, clientY: 5, pointerId: 1 }));
    restore();
    shell.destroy();
  });

  it('no editExtender (P1 default, identity) previews the caller’s own drag with no ghost', async () => {
    const { shell, container, timeline } = buildShell();
    const barA = container.querySelector<HTMLElement>('[data-item-id="a:0"]')!;
    const barX = container.querySelector<HTMLElement>('[data-item-id="x:0"]')!;
    stubPointerCapture(timeline);
    const restore = stubElementFromPoint({ x: 5, y: 5, el: barA });

    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 55, clientY: 5, pointerId: 1 }));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(barA.dataset['state']).toContain('dragging');
    expect(barX.dataset['state'] ?? '').not.toContain('ghost');

    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 55, clientY: 5, pointerId: 1 }));
    restore();
    shell.destroy();
  });
});
