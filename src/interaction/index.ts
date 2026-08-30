// interaction/ — gesture controllers as drafts: Drag, Resize, LinkCreate, Select (plans/01 §9). Touches the DOM.
// Never writes model/selection state on pointerdown; one transaction per gesture, at commit (I6).
export { attachEntryGestures } from './entry-gestures.js';
export type { EntryGesturesAttachment } from './entry-gestures.js';
export type { EntryGestureContext, EntryGesture, DraftOptions, EntryHit } from './entry-gesture-context.js';
export { createPointerGesture } from './pointer-gesture.js';
export type { PointerGestureCallbacks, PointerGestureController } from './pointer-gesture.js';
