// render/dom/ — the class names and data attributes this backend writes on nodes another layer
// reads back (review A3). Before this file the same eight strings were retyped in `extensions/`,
// so a rename here broke every plugin with a green build. Nothing outside `render/dom` may retype
// them now. `view/gantt-dom.ts` resolves a node to a `DomTarget` from these constants alone.
// `src/view/gantt-dom.test.ts` renders a real frame and asserts this backend still emits them.
//
// A class listed here is a contract. A class this backend paints for looks alone (`.fg-bars`,
// `.fg-band`, `.fg-content-sizer`) is not, and stays a plain literal at its own paint site.

/** One rendered Item — the bar layer's own node. Carries `data-item-id`. */
export const BAR_CLASS = 'fg-bar';
/** One Row of the grid pane. Carries `data-row-id`, and `data-entry-id` for an entry row. */
export const ROW_CLASS = 'fg-row';
/** The first cell of a Row — the name cell. Carries `data-field`. */
export const ROW_LABEL_CLASS = 'fg-row-label';
/** Every other cell of a Row. Carries `data-field`. */
export const ROW_CELL_CLASS = 'fg-row-cell';
/** The text span inside a Row cell — the already-formatted value the grid painted. */
export const ROW_LABEL_TEXT_CLASS = 'fg-row-label-text';
/** One header cell of the grid pane. Carries `data-field`. */
export const COLUMN_HEADER_CLASS = 'fg-col-header';
/** The collapse control inside a name cell. */
export const ROW_TWISTY_CLASS = 'fg-row-twisty';
/** The shared resize-handle pair over the currently resizable bar. Carries `data-edge`. */
export const BAR_HANDLE_CLASS = 'fg-bar-handle';

/** `dataset` keys, spelled the way `HTMLElement.dataset` reads them (camelCase). */
export const ITEM_ID_KEY = 'itemId';
export const ENTRY_ID_KEY = 'entryId';
export const FIELD_KEY = 'field';

/** The same Field key as a CSS attribute selector name. `dataset` camelCases and a selector does
 *  not, so a reader that needs both gets both from here rather than transliterating one. */
export const FIELD_ATTRIBUTE = 'data-field';
