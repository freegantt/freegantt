// interaction/ — gesture controllers as drafts: Drag, Resize, LinkCreate, Select (plans/01 §9). Touches the DOM.
// Never writes model/selection state on pointerdown; one transaction per gesture, at commit (I6).
export { attachEntryGestures } from './entry-gestures.js';
export type { EntryGesturesAttachment, EntrySelectionContext } from './entry-gestures.js';
