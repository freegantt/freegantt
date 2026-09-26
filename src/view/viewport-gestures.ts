// view/ — the live switch for read-only viewport gestures (S3.7). These are not
// Capabilities: a Capability is per-entry (`capabilities.move`), and a wheel zoom has no entry.
// One object, one job. A boolean is the shorthand; the long form pins each gesture.

/** Per-gesture pins. An omitted key stays on — same "default on" reading `capabilities: {}` uses
 *  for data gestures, without a per-entry predicate because there is no entry. */
export interface ViewportGestureFlags {
  /** ctrl/⌘+wheel anchored zoom. Default on. */
  wheelZoom?: boolean;
  /** shift+wheel horizontal pan. Default on. */
  wheelPan?: boolean;
  /** Page/Home/End, and arrows when nothing is selected. Default on. */
  keyboardPan?: boolean;
}

/** Live (`Gantt.viewportGestures`). `false` turns every viewport gesture off; `true` or `{}` turns
 *  them all on. The imperative surface (`zoomBy`, `panToDate`, `zoomIn`) does not consult this. */
export type ViewportGestures = boolean | ViewportGestureFlags;

export interface ResolvedViewportGestures {
  wheelZoom: boolean;
  wheelPan: boolean;
  keyboardPan: boolean;
}

export function resolveViewportGestures(input: ViewportGestures | undefined): ResolvedViewportGestures {
  if (input === false) {
    return { wheelZoom: false, wheelPan: false, keyboardPan: false };
  }
  if (input === true || input === undefined) {
    return { wheelZoom: true, wheelPan: true, keyboardPan: true };
  }
  return {
    wheelZoom: input.wheelZoom ?? true,
    wheelPan: input.wheelPan ?? true,
    keyboardPan: input.keyboardPan ?? true,
  };
}
