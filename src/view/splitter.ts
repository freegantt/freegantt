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
  /** Turns the widget on or off (#432, F1/F5). This is the one place that knows what "a locked
   *  splitter" is, so a Gantt that starts locked and a Gantt that locks live land in the same DOM
   *  state.
   *  On: the pointer and keyboard listeners are live, the handle is a tab stop, and it carries the
   *  full separator contract — an accessible name, an orientation, and the live `aria-value*` trio.
   *  Off: no listener can arm a drag, the handle drops out of the tab order, and it disappears from
   *  the accessibility tree. A widget nobody can operate must not still read as a named, valued
   *  control (F1) — this sets `aria-hidden="true"` rather than dropping `role="separator"`: the node
   *  stays the same fixed-width divider either way, and `aria-hidden` says plainly that it now
   *  carries no operable semantics. */
  setEnabled(enabled: boolean): void;
  /** Re-reads `hooks` and refreshes the separator's `aria-value*` trio. Call after a width change
   *  this attachment did not itself cause — a programmatic `gantt.gridWidth = …` or a `'fitColumns'`
   *  re-measure (S5.11). A drag or a keyboard step already calls this on its own. A no-op while
   *  disabled: a locked splitter carries no value trio to refresh. */
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
 *  nothing more. Starts disabled: the caller's first `setEnabled` call (constructor or live) decides
 *  the initial state, so there is only ever one path into "enabled" DOM, not a second one for
 *  construction (#432, F1/F5). */
export function attachSplitter(handle: HTMLElement, hooks: SplitterContext): SplitterAttachment {
  let dragging = false;
  let pointerId: number | undefined;
  let startWidth = 0;
  let startX = 0;
  // `undefined`, not `false`: the handle starts with none of the disabled DOM applied either, so the
  // very first `setEnabled` call — `false` included — still has to run its branch (#432, F1/F5).
  let enabled: boolean | undefined;

  function syncAria(): void {
    if (!enabled) return;
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

  /** #432, F1/F5: the one place that decides what "enabled" and "locked" each look like in the DOM.
   *  Idempotent, so a caller may call it with the answer it already holds. */
  function setEnabled(next: boolean): void {
    if (next === enabled) return;
    enabled = next;
    if (enabled) {
      handle.addEventListener('pointerdown', onPointerDown);
      handle.addEventListener('pointermove', onPointerMove);
      handle.addEventListener('pointerup', onPointerUp);
      // Obligation (#262): `[S5-A4]`, WCAG 2.1.1 — the only keyboard path to resize the grid pane
      // (arrows, Home/End).
      handle.addEventListener('keydown', onSplitterKeyDown);
      handle.tabIndex = 0;
      handle.removeAttribute('data-resize-off');
      handle.removeAttribute('aria-hidden');
      // S5.11: an accessible name and the initial `aria-value*` reading, the moment it re-enables.
      handle.setAttribute('aria-label', 'Resize grid pane');
      handle.setAttribute('aria-orientation', 'vertical');
      syncAria();
    } else {
      if (dragging) endDrag();
      handle.removeEventListener('pointerdown', onPointerDown);
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerUp);
      handle.removeEventListener('keydown', onSplitterKeyDown);
      // The attribute goes, rather than pointing at -1: `tabindex="-1"` still leaves the node
      // programmatically focusable, and `aria-hidden` below must never sit on a focusable node
      // (axe's `aria-hidden-focus`). A Gantt built with `gridResizable: false` runs this branch in
      // its own constructor, so an a11y sweep would meet the violation on the first paint.
      handle.removeAttribute('tabindex');
      // No listener can arm a drag, so the resize cursor (`.fg-splitter[data-resize-off]`,
      // styles.ts) would be the one affordance left advertising a gesture that does nothing.
      handle.setAttribute('data-resize-off', '');
      // F1: a screen reader must not meet a named, valued widget it cannot operate. `role` stays —
      // the node is still the same layout divider — but every trace of "you can resize this" goes,
      // and `aria-hidden` says the node carries no operable semantics at all right now.
      handle.removeAttribute('aria-label');
      handle.removeAttribute('aria-orientation');
      handle.removeAttribute('aria-valuemin');
      handle.removeAttribute('aria-valuemax');
      handle.removeAttribute('aria-valuenow');
      handle.setAttribute('aria-hidden', 'true');
    }
  }

  return {
    setEnabled,
    syncAria,
  };
}
