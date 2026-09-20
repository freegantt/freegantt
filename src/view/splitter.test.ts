import { describe, expect, it, vi } from 'vitest';
import { attachSplitter } from './splitter.js';
import type { SplitterContext } from './splitter.js';

// happy-dom's pointer-capture methods are not layout-backed; stubbed here the same way other DOM
// suites in this repo stub browser primitives happy-dom does not implement (pane-size-attachment.test.ts).
function stubPointerCapture(el: HTMLElement): { releasePointerCapture: ReturnType<typeof vi.fn> } {
  el.setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  el.releasePointerCapture = releasePointerCapture;
  return { releasePointerCapture };
}

function down(x: number): PointerEvent {
  return new PointerEvent('pointerdown', { clientX: x, pointerId: 1 });
}
function move(x: number): PointerEvent {
  return new PointerEvent('pointermove', { clientX: x, pointerId: 1 });
}
function up(x: number): PointerEvent {
  return new PointerEvent('pointerup', { clientX: x, pointerId: 1 });
}

/** A mutable stand-in for `GridPaneWidth` — `readGridWidth()` answers whatever `commitGridWidth`/
 *  `previewGridWidth` last wrote, the same way the real port chain does. Lets a keyboard-step test
 *  assert on the *next* value without reaching into `GanttShell`. */
function fakeHooks(overrides: Partial<SplitterContext> = {}): SplitterContext & {
  readonly previews: number[];
  readonly commits: number[];
} {
  let width = 200;
  const previews: number[] = [];
  const commits: number[] = [];
  return {
    readGridWidth: () => width,
    readMinWidth: () => 40,
    readMaxWidth: () => 500,
    previewGridWidth: (px) => {
      previews.push(px);
      width = px;
    },
    commitGridWidth: (px) => {
      commits.push(px);
      width = px;
    },
    previews,
    commits,
    ...overrides,
  };
}

function key(k: string, modifiers: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: k, cancelable: true, ...modifiers });
}

describe('attachSplitter', () => {
  it('previews widths during a drag and commits on pointerup', () => {
    const handle = document.createElement('div');
    stubPointerCapture(handle);
    const hooks = fakeHooks();
    const attachment = attachSplitter(handle, hooks);
    attachment.setEnabled(true);

    handle.dispatchEvent(down(100));
    handle.dispatchEvent(move(140));
    handle.dispatchEvent(up(150));

    expect(hooks.previews).toEqual([240]);
    expect(hooks.commits).toEqual([250]);

    attachment.setEnabled(false);
  });

  it('Escape restores the width at drag start and commits nothing (U5)', () => {
    const handle = document.createElement('div');
    stubPointerCapture(handle);
    const hooks = fakeHooks();
    const attachment = attachSplitter(handle, hooks);
    attachment.setEnabled(true);

    handle.dispatchEvent(down(100));
    handle.dispatchEvent(move(140));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    handle.dispatchEvent(up(150));

    expect(hooks.previews).toEqual([240, 200]);
    expect(hooks.commits).toEqual([]);

    attachment.setEnabled(false);
  });

  it('setEnabled(false) releases pointer capture and removes every listener', () => {
    const handle = document.createElement('div');
    const { releasePointerCapture } = stubPointerCapture(handle);
    const hooks = fakeHooks();
    const attachment = attachSplitter(handle, hooks);
    attachment.setEnabled(true);

    handle.dispatchEvent(down(100));
    attachment.setEnabled(false);
    expect(releasePointerCapture).toHaveBeenCalled();

    handle.dispatchEvent(move(200));
    handle.dispatchEvent(up(200));

    expect(hooks.previews).toEqual([]);
    expect(hooks.commits).toEqual([]);
  });

  describe('setEnabled (#432, F1/F5)', () => {
    it('starts disabled: no listener arms a drag and no ARIA trio paints before the first setEnabled(true)', () => {
      const handle = document.createElement('div');
      attachSplitter(handle, fakeHooks());

      expect(handle.getAttribute('aria-label')).toBeNull();
      expect(handle.getAttribute('aria-valuenow')).toBeNull();
      expect(handle.getAttribute('aria-hidden')).toBeNull();
    });

    it('setEnabled(false) strips every trace of the widget from the accessibility tree, not only the tab stop', () => {
      const handle = document.createElement('div');
      const attachment = attachSplitter(handle, fakeHooks());
      attachment.setEnabled(true);

      attachment.setEnabled(false);

      // The attribute is absent, not -1: `aria-hidden` on a focusable node is axe's
      // `aria-hidden-focus` violation, and `tabindex="-1"` is still focusable.
      expect(handle.hasAttribute('tabindex')).toBe(false);
      expect(handle.getAttribute('data-resize-off')).toBe('');
      expect(handle.getAttribute('aria-hidden')).toBe('true');
      expect(handle.getAttribute('aria-label')).toBeNull();
      expect(handle.getAttribute('aria-orientation')).toBeNull();
      expect(handle.getAttribute('aria-valuemin')).toBeNull();
      expect(handle.getAttribute('aria-valuemax')).toBeNull();
      expect(handle.getAttribute('aria-valuenow')).toBeNull();
    });

    it('setEnabled(true) after a disable restores the tab stop and the full ARIA contract', () => {
      const handle = document.createElement('div');
      const attachment = attachSplitter(handle, fakeHooks());
      attachment.setEnabled(true);
      attachment.setEnabled(false);

      attachment.setEnabled(true);

      expect(handle.tabIndex).toBe(0);
      expect(handle.getAttribute('data-resize-off')).toBeNull();
      expect(handle.getAttribute('aria-hidden')).toBeNull();
      expect(handle.getAttribute('aria-label')).toBe('Resize grid pane');
      expect(handle.getAttribute('aria-orientation')).toBe('vertical');
      expect(handle.getAttribute('aria-valuenow')).toBe('200');

      attachment.setEnabled(false);
    });

    it('a disabled splitter arms no drag and steps no keyboard resize', () => {
      const handle = document.createElement('div');
      stubPointerCapture(handle);
      const hooks = fakeHooks();
      const attachment = attachSplitter(handle, hooks);
      attachment.setEnabled(true);
      attachment.setEnabled(false);

      handle.dispatchEvent(down(100));
      handle.dispatchEvent(move(140));
      handle.dispatchEvent(up(150));
      handle.dispatchEvent(key('ArrowRight'));

      expect(hooks.previews).toEqual([]);
      expect(hooks.commits).toEqual([]);
    });
  });

  describe('ARIA (S5.11, D-S5-25)', () => {
    it('carries an accessible name and the initial aria-value* trio the moment it attaches', () => {
      const handle = document.createElement('div');
      const attachment = attachSplitter(handle, fakeHooks());
      attachment.setEnabled(true);

      expect(handle.getAttribute('aria-label')).toBe('Resize grid pane');
      expect(handle.getAttribute('aria-valuemin')).toBe('40');
      expect(handle.getAttribute('aria-valuemax')).toBe('500');
      expect(handle.getAttribute('aria-valuenow')).toBe('200');

      attachment.setEnabled(false);
    });

    it('aria-valuenow tracks the width live, during a drag and not only after it', () => {
      const handle = document.createElement('div');
      stubPointerCapture(handle);
      const attachment = attachSplitter(handle, fakeHooks());
      attachment.setEnabled(true);

      handle.dispatchEvent(down(100));
      handle.dispatchEvent(move(140));
      expect(handle.getAttribute('aria-valuenow')).toBe('240');
      handle.dispatchEvent(up(150));
      expect(handle.getAttribute('aria-valuenow')).toBe('250');

      attachment.setEnabled(false);
    });

    it('syncAria() refreshes the trio from a width change this attachment did not cause', () => {
      const handle = document.createElement('div');
      const hooks = fakeHooks();
      const attachment = attachSplitter(handle, hooks);
      attachment.setEnabled(true);
      expect(handle.getAttribute('aria-valuenow')).toBe('200');

      hooks.commitGridWidth(320); // stands in for a plugin's `gantt.gridWidth = 320`
      attachment.syncAria();

      expect(handle.getAttribute('aria-valuenow')).toBe('320');
      attachment.setEnabled(false);
    });
  });

  describe('keyboard resize (S5.11, D-S5-26)', () => {
    it('ArrowRight widens by the step and commits through the same hook a drag commits through', () => {
      const handle = document.createElement('div');
      const hooks = fakeHooks();
      const attachment = attachSplitter(handle, hooks);
      attachment.setEnabled(true);

      handle.dispatchEvent(key('ArrowRight'));

      expect(hooks.commits).toEqual([216]);
      expect(handle.getAttribute('aria-valuenow')).toBe('216');

      attachment.setEnabled(false);
    });

    it('ArrowLeft narrows by the step', () => {
      const handle = document.createElement('div');
      const hooks = fakeHooks();
      const attachment = attachSplitter(handle, hooks);
      attachment.setEnabled(true);

      handle.dispatchEvent(key('ArrowLeft'));

      expect(hooks.commits).toEqual([184]);

      attachment.setEnabled(false);
    });

    it('Home jumps to the floor and End jumps to the ceiling', () => {
      const handle = document.createElement('div');
      const hooks = fakeHooks();
      const attachment = attachSplitter(handle, hooks);
      attachment.setEnabled(true);

      handle.dispatchEvent(key('Home'));
      expect(hooks.commits).toEqual([40]);

      handle.dispatchEvent(key('End'));
      expect(hooks.commits).toEqual([40, 500]);

      attachment.setEnabled(false);
    });

    it('a modified arrow is left for the Gantt-wide fallback (Alt+Arrow pans, D-S5-26)', () => {
      const handle = document.createElement('div');
      const hooks = fakeHooks();
      const attachment = attachSplitter(handle, hooks);
      attachment.setEnabled(true);

      handle.dispatchEvent(key('ArrowRight', { altKey: true }));
      handle.dispatchEvent(key('ArrowRight', { shiftKey: true }));
      handle.dispatchEvent(key('ArrowRight', { ctrlKey: true }));

      expect(hooks.commits).toEqual([]);

      attachment.setEnabled(false);
    });

    it('an unresolved before* veto refuses a keyboard step exactly as it refuses a drag', () => {
      // The veto itself lives one layer up (`GanttShell#proposeChange`, exercised end-to-end in
      // `api/gantt.test.ts`) — `commitGridWidth` here stands for a vetoed commit that rolls the
      // width back to what it was, the same contract `GridPaneWidth.commitDrag` returns.
      const handle = document.createElement('div');
      const hooks = fakeHooks({ commitGridWidth: () => {} }); // width never moves: the veto's own effect
      const attachment = attachSplitter(handle, hooks);
      attachment.setEnabled(true);

      handle.dispatchEvent(key('ArrowRight'));

      expect(handle.getAttribute('aria-valuenow')).toBe('200');

      attachment.setEnabled(false);
    });

    it('a live drag owns Escape, so a keyboard step mid-drag is ignored', () => {
      const handle = document.createElement('div');
      stubPointerCapture(handle);
      const hooks = fakeHooks();
      const attachment = attachSplitter(handle, hooks);
      attachment.setEnabled(true);

      handle.dispatchEvent(down(100));
      handle.dispatchEvent(key('ArrowRight'));

      expect(hooks.commits).toEqual([]);

      handle.dispatchEvent(up(100));
      attachment.setEnabled(false);
    });
  });
});
