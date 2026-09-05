// view/ — this Gantt's own rendered DOM, as a read surface (review N1/A3). One seam answers the
// three questions a feature plugin asks of a node. Is this node mine? What is it? Where is the
// element for this entry?
//
// Why it exists. `extensions/` may not import `render/` (D-S5-5). Before this file, plugin code
// retyped the contract between them: eight `.fg-*` selectors and three `data-*` keys.
// Nothing versioned them and nothing tested them, so renaming a class in `render/dom` broke every
// plugin with a green build. Every one of those strings now comes from `render/dom/dom-contract.ts`,
// and from `pane-layout.ts`'s own `SPLITTER_CLASS`. `gantt-dom.test.ts` renders a real frame and
// asserts this resolver still reads what those backends emit.
//
// Why it is not on `Overlay`. `Overlay` is the mount layer — `present` and `render`. `contains`,
// `bounds`, `paneBounds` and `elementForEntry` were never overlay work. They answer for the whole
// container, and two of them return timeline nodes that sit outside the overlay. One word for
// two concepts is the #7 failure, so the concepts split rather than the word being renamed.

import {
  BAR_CLASS,
  COLUMN_HEADER_CLASS,
  ENTRY_ID_KEY,
  FIELD_ATTRIBUTE,
  FIELD_KEY,
  ITEM_ID_KEY,
  ROW_CELL_CLASS,
  ROW_CLASS,
  ROW_LABEL_CLASS,
  ROW_LABEL_TEXT_CLASS,
} from '../render/dom/dom-contract.js';
import { entryIdOfItem, itemId, itemIdFromDataset } from '../model/index.js';
import type { Entry, EntryId, FieldKey, TargetKind } from '../model/index.js';
import { SPLITTER_CLASS } from './pane-layout.js';
import type { PaneLayout } from './pane-layout.js';

/** What one node in a Gantt's own DOM stands for. `kind` is `model/`'s `TargetKind`, the same five
 *  words `CommandTarget` already uses. One vocabulary, so a plugin that resolves a right-click and
 *  a command that filters on `when` say the same thing.
 *
 *  `entry` is filled for `'bar'`, `'row'` and `'cell'`. It is left out when the row stands for no
 *  Entry (a grouping header row), or when the Entry is gone from the Dataset. `field` is filled for
 *  `'cell'` and `'header'`. */
export interface DomTarget {
  kind: TargetKind;
  /** The node the walk stopped on — the bar, the cell, the row, the header cell or the splitter.
   *  A popup anchors to it; the cell editor positions over it. */
  element: HTMLElement;
  entry?: Entry;
  field?: FieldKey;
}

/** This Gantt's own DOM, as questions (S5.3, D-S5-8; review N1/A3). Reached by a plugin through
 *  `ctx.view.dom`. Every member is scoped to one container, which is what keeps two Gantts on one
 *  page independent (I2). */
export interface GanttDom {
  /** Whether `node` sits inside this Gantt's own container. The one answer to "is this event mine?"
   *  — `ctx.view.onDomEvent` asks it for every document-level listener a plugin opens. */
  owns(node: Node): boolean;
  /** What the nearest bar, cell, row, header cell or splitter at or above `node` stands for.
   *  `undefined` when `node` is outside this Gantt, or inside it but on none of those (an empty
   *  stretch of timeline, a pane's own padding).
   *
   *  Hot path: this seam memoizes the resolved object on the element it came from. A pointer that
   *  stays over one bar resolves to the same frozen object every time, and allocates nothing. */
  targetUnder(node: Node): DomTarget | undefined;
  /** The rendered bar for `id`'s primary segment (segment 0). `undefined` when that entry has no bar
   *  in the current frame — scrolled out of the virtualized viewport, or no bar at all. */
  barFor(id: EntryId): HTMLElement | undefined;
  /** The rendered grid cell for one entry and one Field. `undefined` when that row is not in the
   *  current frame, or the Gantt shows no column for `field`. It is also the one answer to "is my
   *  editor still anchored?" — a recycled row stops answering for the entry it used to hold. */
  cellFor(id: EntryId, field: FieldKey): HTMLElement | undefined;
  /** The text one grid cell shows right now — the string `field.formatValue` already produced for
   *  this paint. The inline editor seeds itself with it rather than formatting the value a second
   *  time from a `FormatContext` a plugin cannot reach (D-S5-5). */
  cellText(cell: HTMLElement): string;
  /** The container's own client rect — the outer clamp, so a popup never spills past the Gantt
   *  entirely. */
  readonly bounds: DOMRect;
  /** The grid pane's and timeline pane's own client rects (issue #137 F8). The container spans both
   *  panes, so `bounds` alone cannot flip a popup at a pane edge. Placement flips and clamps against
   *  the anchor's own pane rect instead. `bounds` stays the outer clamp for a popup whose anchor
   *  sits in neither pane (a toolbar button, say). */
  readonly paneBounds: { grid: DOMRect; timeline: DOMRect };
  /** The grid row layer's own client rect — the frame content mounted through `ctx.view.rowLayer`
   *  positions in (#158). Unlike `paneBounds.grid`, this box moves with the rows: a sibling of the
   *  rows rides the same transform, so the box it measures against must be the moved one. */
  readonly rowLayerBounds: DOMRect;
}

/** Ordered by nothing: `Element.closest` answers with the *nearest* ancestor that matches any of
 *  these, so DOM depth decides. A cell is inside a row, so a cell wins over its row. A bar sits in
 *  the bar layer, and is inside no row at all. */
const TARGET_SELECTOR = `.${BAR_CLASS}, .${ROW_LABEL_CLASS}, .${ROW_CELL_CLASS}, .${COLUMN_HEADER_CLASS}, .${SPLITTER_CLASS}, .${ROW_CLASS}`;

/** `GanttDom` over one Container (`ContainerNotFoundError`'s own word — the element a consumer hands
 *  `new Gantt`). `GanttShell` builds exactly one per Gantt and lends it through `GanttShellPorts`. */
export class ContainerDom implements GanttDom {
  readonly #container: HTMLElement;
  readonly #paneLayout: PaneLayout;
  readonly #entryById: (id: EntryId) => Entry | undefined;
  /** One-slot memo, so a pointer resting on one node allocates no target per event. The three
   *  stamps go stale together with the node. Virtualization recycles a row node under a new entry,
   *  and the stamps say so before this seam hands the cached object back. */
  #memoElement: Element | undefined;
  #memoItemId: string | undefined;
  #memoEntryId: string | undefined;
  #memoField: string | undefined;
  #memoTarget: DomTarget | undefined;

  constructor(container: HTMLElement, paneLayout: PaneLayout, entryById: (id: EntryId) => Entry | undefined) {
    this.#container = container;
    this.#paneLayout = paneLayout;
    this.#entryById = entryById;
  }

  owns(node: Node): boolean {
    return this.#container.contains(node);
  }

  targetUnder(node: Node): DomTarget | undefined {
    if (!(node instanceof Element)) return undefined;
    const element = node.closest<HTMLElement>(TARGET_SELECTOR);
    if (element === null || !this.owns(element)) return undefined;
    const itemIdAttr = element.dataset[ITEM_ID_KEY];
    const entryIdAttr = element.dataset[ENTRY_ID_KEY];
    const fieldAttr = element.dataset[FIELD_KEY];
    if (
      this.#memoTarget !== undefined &&
      this.#memoElement === element &&
      this.#memoItemId === itemIdAttr &&
      this.#memoEntryId === entryIdAttr &&
      this.#memoField === fieldAttr
    ) {
      return this.#memoTarget;
    }
    const target = this.#resolve(element, itemIdAttr, fieldAttr);
    this.#memoElement = element;
    this.#memoItemId = itemIdAttr;
    this.#memoEntryId = entryIdAttr;
    this.#memoField = fieldAttr;
    this.#memoTarget = target;
    return target;
  }

  barFor(id: EntryId): HTMLElement | undefined {
    const want = itemId(id, 0);
    const bars = this.#container.querySelectorAll<HTMLElement>(`.${BAR_CLASS}`);
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      if (bar?.dataset[ITEM_ID_KEY] === want) return bar;
    }
    return undefined;
  }

  cellFor(id: EntryId, field: FieldKey): HTMLElement | undefined {
    const selector = `[${FIELD_ATTRIBUTE}="${cssEscape(String(field))}"]`;
    const rows = this.#container.querySelectorAll<HTMLElement>(`.${ROW_CLASS}`);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row === undefined || row.dataset[ENTRY_ID_KEY] !== id) continue;
      const cell = row.querySelector<HTMLElement>(selector);
      if (cell !== null) return cell;
    }
    return undefined;
  }

  cellText(cell: HTMLElement): string {
    return (cell.querySelector<HTMLElement>(`.${ROW_LABEL_TEXT_CLASS}`) ?? cell).textContent ?? '';
  }

  get bounds(): DOMRect {
    return this.#paneLayout.bounds();
  }

  get paneBounds(): { grid: DOMRect; timeline: DOMRect } {
    return this.#paneLayout.paneBounds();
  }

  get rowLayerBounds(): DOMRect {
    return this.#paneLayout.rowLayerBounds();
  }

  /** Frozen, because plugin code reads this object and the memo keeps it. A caller that wrote to it
   *  would poison every later reader of the same node. */
  #resolve(element: HTMLElement, itemIdAttr: string | undefined, fieldAttr: string | undefined): DomTarget {
    if (element.classList.contains(BAR_CLASS)) {
      const id = itemIdFromDataset(itemIdAttr);
      return freezeTarget({
        kind: 'bar',
        element,
        ...entryPart(id === undefined ? undefined : this.#entryById(entryIdOfItem(id))),
      });
    }
    if (element.classList.contains(SPLITTER_CLASS)) return freezeTarget({ kind: 'splitter', element });
    if (element.classList.contains(COLUMN_HEADER_CLASS)) {
      return freezeTarget({ kind: 'header', element, ...fieldPart(fieldAttr) });
    }
    if (element.classList.contains(ROW_CLASS)) {
      return freezeTarget({ kind: 'row', element, ...entryPart(this.#entryOfRow(element)) });
    }
    // A name cell or an ordinary cell: the row above it names the entry, the cell names the Field.
    const row = element.closest<HTMLElement>(`.${ROW_CLASS}`);
    return freezeTarget({
      kind: 'cell',
      element,
      ...entryPart(row === null ? undefined : this.#entryOfRow(row)),
      ...fieldPart(fieldAttr),
    });
  }

  #entryOfRow(row: HTMLElement): Entry | undefined {
    const raw = row.dataset[ENTRY_ID_KEY];
    return raw === undefined ? undefined : this.#entryById(raw as EntryId);
  }
}

function entryPart(entry: Entry | undefined): { entry?: Entry } {
  return entry === undefined ? {} : { entry };
}

function fieldPart(field: string | undefined): { field?: FieldKey } {
  return field === undefined ? {} : { field };
}

function freezeTarget(target: DomTarget): DomTarget {
  return Object.freeze(target);
}

/** `CSS.escape` where the environment has it. happy-dom's `Element.querySelector` runs without it,
 *  and a Field key holding a selector-special character must still find its own cell. */
function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}
