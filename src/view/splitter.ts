// view/ — a pointer drag over the splitter chrome that proposes a grid width; it commits nothing
// itself (plans/01 §8.3, D-S1.8-5). Lives in view/, not interaction/: interaction/ owns *data*
// gestures over drafts and transactions (plans/01 §9), and a splitter mutates no data.
//
// S5.11, D-S5-26: the splitter is also a keyboard widget, scope `'splitter'`. `ArrowLeft`/
// `ArrowRight` step the width; `Home`/`End` jump to the #127 floor and the #139 ceiling — the
// published window-splitter pattern's own reading of those two keys, and the only "first/last"
// this one-node scope has. Every step runs `hooks.commitGridWidth`, the same cancelable commit
// sequence a drag's pointerup runs — there is no second write path. This module also keeps the
// separator's `aria-value*` trio live, because it is the one place that already knows every width
// this handle produces, drag or key.

/** One `ArrowLeft`/`ArrowRight` press moves the pane this many px — the same step
 *  `column-chrome.ts`'s own header-cell resize already uses (D-S5-18, `COLUMN_RESIZE_STEP_PX`), so
 *  a keyboard resize feels the same size everywhere in the Gantt. */
const SPLITTER_RESIZE_STEP_PX = 16;

export interface SplitterAttachment {
  detach(): void;
  /** Re-reads `hooks` and refreshes the separator's `aria-value*` trio. Call after a width change
   *  this attachment did not itself cause — a programmatic `gantt.gridWidth = …` or a `'fitColumns'`
   *  re-measure (S5.11). A drag or a keyboard step already calls this on its own. */
  syncAria(): void;
}

export interface SplitterContext {
  /** The grid width when the drag arms, and what `aria-valuenow` reports. */
  readGridWidth(): number;
  /** The #127 floor — `aria-valuemin`, and what `Home` jumps to. */
  readMinWidth(): number;
  /** The #139 ceiling, or the shell's own outer bound when the columns name no edge (a `flex`
   *  column) — `aria-valuemax`, and what `End` jumps to. */
  readMaxWidth(): number;
  /** During the drag — preview only, no event, no commit. */
  previewGridWidth(px: number): void;
  /** On pointerup, or on a keyboard step. The shell decides whether it becomes the new width. */
  commitGridWidth(px: number): void;
}

/** Pointer capture always. Escape restores `readGridWidth()` from drag start and cancels the drag —
 *  it previews the restored width but commits nothing (U5). Clamping to `minGridWidth` is
 *  `PaneLayout`'s job (`gridWidth`'s setter), not this attachment's — it proposes a raw px delta and
 *  nothing more. */
export function attachSplitter(handle: HTMLElement, hooks: SplitterContext): SplitterAttachment {
  let dragging = false;
  let pointerId: number | undefined;
  let startWidth = 0;
  let startX = 0;

  function syncAria(): void {
    handle.setAttribute('aria-valuemin', String(hooks.readMinWidth()));
    handle.setAttribute('aria-valuemax', String(hooks.readMaxWidth()));
    handle.setAttribute('aria-valuenow', String(hooks.readGridWidth()));
  }

  function endDrag(): void {
    dragging = false;
    if (pointerId !== undefined) handle.releasePointerCapture(pointerId);
    pointerId = undefined;
    window.removeEventListener('keydown', onKeyDown);
  }

  function onPointerDown(e: PointerEvent): void {
    dragging = true;
    pointerId = e.pointerId;
    startWidth = hooks.readGridWidth();
    startX = e.clientX;
    handle.setPointerCapture(pointerId);
    window.addEventListener('keydown', onKeyDown);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragging) return;
    hooks.previewGridWidth(startWidth + (e.clientX - startX));
    syncAria();
  }

  function onPointerUp(e: PointerEvent): void {
    if (!dragging) return;
    const width = startWidth + (e.clientX - startX);
    endDrag();
    hooks.commitGridWidth(width);
    syncAria();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!dragging || e.key !== 'Escape') return;
    endDrag();
    hooks.previewGridWidth(startWidth);
    syncAria();
  }

  /** `ArrowLeft`/`ArrowRight`/`Home`/`End`, plain — the splitter has nothing else to navigate away
   *  from, so a modified chord (`Alt+ArrowLeft` pans, D-S5-26) is left for the Gantt-wide fallback
   *  to see. Ignored mid-drag: a live drag already owns this handle's Escape key, and a second
   *  write path here would race it. */
  function onSplitterKeyDown(e: KeyboardEvent): void {
    if (dragging || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        hooks.commitGridWidth(hooks.readGridWidth() + SPLITTER_RESIZE_STEP_PX);
        syncAria();
        return;
      case 'ArrowLeft':
        e.preventDefault();
        hooks.commitGridWidth(hooks.readGridWidth() - SPLITTER_RESIZE_STEP_PX);
        syncAria();
        return;
      case 'Home':
        e.preventDefault();
        hooks.commitGridWidth(hooks.readMinWidth());
        syncAria();
        return;
      case 'End':
        e.preventDefault();
        hooks.commitGridWidth(hooks.readMaxWidth());
        syncAria();
        return;
      default:
        return;
    }
  }

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('keydown', onSplitterKeyDown);
  // S5.11: an accessible name and the initial `aria-value*` reading, the moment the widget exists.
  handle.setAttribute('aria-label', 'Resize grid pane');
  handle.setAttribute('aria-orientation', 'vertical');
  syncAria();

  return {
    detach(): void {
      if (dragging) endDrag();
      handle.removeEventListener('pointerdown', onPointerDown);
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerUp);
      handle.removeEventListener('keydown', onSplitterKeyDown);
    },
    syncAria,
  };
}
