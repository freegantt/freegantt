// render/dom/ — the class names and data attributes this backend writes on nodes another layer
// reads back (review A3). Before this file the same eight strings were retyped in `extensions/`,
// so a rename here broke every plugin with a green build. Nothing outside `render/dom` may retype
// them now. `view/gantt-dom.ts` resolves a node to a `DomTarget` from these constants alone.
// `src/view/gantt-dom.test.ts` renders a real frame and asserts this backend still emits them.
//
// A class listed here is a contract. A class this backend paints for looks alone (`.fg-bars`,
// `.fg-band`, `.fg-content-sizer`) is not, and stays a plain literal at its own paint site.

/** One rendered Bar — the bar layer's own node. Carries `data-bar-id`. */
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
export const TESTID_KEY = 'testid';
export const BAR_ID_KEY = 'barId';
/** The Row this node is — the row's own identity, which `view/gantt-dom.ts` asks the layout about to
 *  learn every Entry the row owns (#199). `ENTRY_ID_KEY` below is a different question. */
export const ROW_ID_KEY = 'rowId';
export const ENTRY_ID_KEY = 'entryId';
export const FIELD_KEY = 'field';

// What an `e2e/` spec queries. A test id is a *separate* contract from the class beside it. A class
// is ours to rename for looks. A test id is a name Playwright specs pin. Before #180 the backend
// wrote the class into `data-testid`, so a rename here silently renamed the e2e contract, and no
// build failed. The two now carry the same string on purpose, and each moves on its own.

/** `[data-testid="fg-row"]` — one Row (`e2e/large-dataset.spec.ts`, `e2e/zoom.spec.ts`). */
export const ROW_TESTID = 'fg-row';
/** `[data-testid="fg-bar"]` — one rendered Bar. */
export const BAR_TESTID = 'fg-bar';

// The same three keys as CSS attribute selector names. `dataset` camelCases and a selector does
// not, so a reader that needs both gets both from here rather than transliterating one. A lookup
// by id is one `querySelector` over these, never a scan of every row or every bar (#176).

/** The Field key, as a selector name — `[data-field="start"]`. */
export const FIELD_ATTRIBUTE = 'data-field';
/** The Entry id a Row stands for, as a selector name — `[data-entry-id="e1"]`. */
export const ENTRY_ID_ATTRIBUTE = 'data-entry-id';
/** The Row a node belongs to, as a selector name — `[data-row-id="r1"]`. `view/roving-focus.ts`
 *  looks a row back up by id after a scroll-and-flush brings it into the rendered window (S5.11). */
export const ROW_ID_ATTRIBUTE = 'data-row-id';
/** The Bar id a bar stands for, as a selector name — `[data-bar-id="e1:0"]`. */
export const BAR_ID_ATTRIBUTE = 'data-bar-id';

/** `--fg-bar-label-gap`'s fallback, in px. `view/styles.ts` interpolates this number twice: into
 *  the declared token, and into each `var(...)` fallback. `render/dom/index.ts` reads the same
 *  constant for its label fit test and for the label's inline padding. One constant, three readers,
 *  so the token and its fallback cannot drift apart (#294).
 *
 *  It lives here, not in `render/dom/index.ts`. `view/styles.ts` imports a DOM-free constant from
 *  this file, and never the DOM backend itself. */
export const DEFAULT_BAR_LABEL_GAP_PX = 8;
