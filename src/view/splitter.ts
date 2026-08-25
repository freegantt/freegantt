// view/ — a pointer drag over the splitter chrome that proposes a grid width; it commits nothing
// itself (plans/01 §8.3, D-S1.8-5). Lives in view/, not interaction/: interaction/ owns *data*
// gestures over drafts and transactions (plans/01 §9), and a splitter mutates no data.

export interface SplitterAttachment {
  detach(): void;
}

export interface SplitterHooks {
  /** The grid width when the drag arms. */
  readGridWidth(): number;
  /** During the drag — preview only, no event, no commit. */
  previewGridWidth(px: number): void;
  /** On pointerup. The shell decides whether it becomes the new width. */
  commitGridWidth(px: number): void;
}

/** Pointer capture always. Escape restores `readGridWidth()` from drag start and cancels the drag —
 *  it previews the restored width but commits nothing (U5). Clamping to `minGridWidth` is
 *  `PaneLayout`'s job (`gridWidth`'s setter), not this attachment's — it proposes a raw px delta and
 *  nothing more. */
export function attachSplitter(handle: HTMLElement, hooks: SplitterHooks): SplitterAttachment {
  let dragging = false;
  let pointerId: number | undefined;
  let startWidth = 0;
  let startX = 0;

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
  }

  function onPointerUp(e: PointerEvent): void {
    if (!dragging) return;
    const width = startWidth + (e.clientX - startX);
    endDrag();
    hooks.commitGridWidth(width);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!dragging || e.key !== 'Escape') return;
    endDrag();
    hooks.previewGridWidth(startWidth);
  }

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);

  return {
    detach(): void {
      if (dragging) endDrag();
      handle.removeEventListener('pointerdown', onPointerDown);
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerUp);
    },
  };
}
