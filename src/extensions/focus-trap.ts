// extensions/ — Tab cycling and focus restore for `Popup`'s `focus: 'trap'` policy (S5.3, D-S5-9).
// ~40 lines, no dependency: plain DOM only, so it stays inside `extensions/`'s own boundary (D-S5-5).

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export interface FocusTrap {
  deactivate(): void;
}

/** Moves focus to `root`'s first focusable descendant (or `root` itself, given a `tabindex="-1"`, if
 *  it has none), keeps Tab/Shift+Tab cycling inside it, and restores the element that was focused
 *  when this was activated. */
export function activateFocusTrap(root: HTMLElement): FocusTrap {
  const previouslyFocused = root.ownerDocument.activeElement as HTMLElement | null;

  const focusFirst = (): void => {
    const [first] = focusableIn(root);
    if (first) {
      first.focus();
      return;
    }
    root.setAttribute('tabindex', '-1');
    root.focus();
  };
  focusFirst();

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const focusable = focusableIn(root);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = root.ownerDocument.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };
  root.addEventListener('keydown', onKeydown);

  return {
    deactivate(): void {
      root.removeEventListener('keydown', onKeydown);
      previouslyFocused?.focus();
    },
  };
}
