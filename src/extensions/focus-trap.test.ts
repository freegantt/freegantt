import { describe, expect, it } from 'vitest';
import { activateFocusTrap } from './focus-trap.js';

interface FocusCall {
  element: HTMLElement;
  options: FocusOptions | undefined;
}

/** Records every `.focus()` the trap makes on `elements`, in order, with the options it passed.
 *  `preventScroll` is a promise about scrolling, and happy-dom scrolls nothing, so the options of
 *  the call are the only witness a DOM test has. Each element is wrapped on its own instance, which
 *  leaves `HTMLElement.prototype` untouched between tests. */
function recordFocusCallsOn(elements: HTMLElement[]): FocusCall[] {
  const calls: FocusCall[] = [];
  for (const element of elements) {
    element.focus = (options?: FocusOptions): void => {
      calls.push({ element, options });
    };
  }
  return calls;
}

/** Every focusable item of `root`, in the order the trap sees them. */
function itemsOf(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button'));
}

/** A trap root with `count` buttons in it, mounted so focus really moves. */
function trapRootWith(count: number): HTMLElement {
  const root = document.createElement('div');
  for (let index = 0; index < count; index++) {
    const button = document.createElement('button');
    button.textContent = `item ${index}`;
    root.append(button);
  }
  document.body.replaceChildren(root);
  return root;
}

describe('activateFocusTrap never scrolls to move focus itself (#228)', () => {
  it('focuses the first item with preventScroll', () => {
    const root = trapRootWith(2);
    const items = itemsOf(root);
    const calls = recordFocusCallsOn(items);

    activateFocusTrap(root);

    expect(calls).toEqual([{ element: items[0], options: { preventScroll: true } }]);
  });

  it('focuses the root itself with preventScroll when it holds no focusable item', () => {
    const root = document.createElement('div');
    root.textContent = 'nothing to tab to';
    document.body.replaceChildren(root);
    const calls = recordFocusCallsOn([root]);

    activateFocusTrap(root);

    expect(calls).toEqual([{ element: root, options: { preventScroll: true } }]);
  });

  it('restores the previously focused element with preventScroll', () => {
    const root = trapRootWith(1);
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const trap = activateFocusTrap(root);
    const calls = recordFocusCallsOn([outside]);

    trap.deactivate();

    expect(calls).toEqual([{ element: outside, options: { preventScroll: true } }]);
  });

  it('lets Tab cycling scroll, because there the user asked for the next item', () => {
    const root = trapRootWith(2);
    const items = itemsOf(root);
    activateFocusTrap(root);
    items[1]!.focus();
    const calls = recordFocusCallsOn(items);

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

    expect(calls).toEqual([{ element: items[0], options: undefined }]);
  });
});
