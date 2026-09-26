// view/ — Page/Home/End and unselected-arrow pan (S3.7, the "nothing selected"
// column plus the keys that never re-bind). Writes no dataset. `attachKeyboardEditing` in
// interaction/ owns the "something selected" column of the same table; both listen on the
// container and split work by selection, the same per-module pattern S3.5 already shipped.
//
// Superseded, not deleted: since S5.2 the shell wires these keys through core commands + default
// bindings (`view/core-commands.ts` / `view/gantt-shell.ts`) instead of calling this function.
// No production caller remains — kept, and tested, per the S5.2 TODO in case a future slice needs
// a keymap-free navigation attachment again.

export interface KeyboardNavigationAttachment {
  detach(): void;
}

export interface KeyboardNavigationContext {
  keyboardPanEnabled(): boolean;
  hasSelection(): boolean;
  panBy(dx: number, dy: number): void;
  panTo(to: { x?: number; y?: number }): void;
  arrowStepX(): number;
  arrowStepY(): number;
  pageStepY(): number;
  scrollMaxX(): number;
}

export function attachKeyboardNavigation(
  container: HTMLElement,
  ctx: KeyboardNavigationContext,
): KeyboardNavigationAttachment {
  function onKeyDown(e: KeyboardEvent): void {
    if (!ctx.keyboardPanEnabled()) return;

    if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault();
      ctx.panBy(0, ctx.pageStepY() * (e.key === 'PageDown' ? 1 : -1));
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      ctx.panTo({ x: 0 });
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      ctx.panTo({ x: ctx.scrollMaxX() });
      return;
    }

    if (ctx.hasSelection()) return;
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      ctx.panBy(ctx.arrowStepX() * (e.key === 'ArrowRight' ? 1 : -1), 0);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      ctx.panBy(0, ctx.arrowStepY() * (e.key === 'ArrowDown' ? 1 : -1));
    }
  }

  container.addEventListener('keydown', onKeyDown);

  return {
    detach(): void {
      container.removeEventListener('keydown', onKeyDown);
    },
  };
}
