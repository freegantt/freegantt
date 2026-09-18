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
// Why it is not on a mount layer. A `MountLayer` answers "where do I mount, and how do I stay put"
// (#168). `contains`, `bounds`, `paneBounds` and `elementForEntry` were never that work. They answer
// for the whole container, and two of them return timeline nodes that sit in no layer at all. One
// word for two concepts is the #7 failure, so the concepts split rather than the word being renamed.
//
// A layer's own rect left with it. `rowLayerBounds` sat here until #168 and now reads
// `ctx.view.rowLayer.bounds` — the box belongs to the layer it describes.
//
// What this seam reads off a node, and what it asks for. A node states its own identity: which Bar,
// which Row, which Field. Every *set* a target names is asked of the layout instead (#185, #199,
// #212). A stamp is written for one frame, and a node outlives that frame. So a set read off a node
// can describe the frame before this one. That is why `entryIds` always comes from the layout, never
// from a node's own stamp.

import {
  BAR_CLASS,
  COLUMN_HEADER_CLASS,
  ENTRY_ID_ATTRIBUTE,
  ENTRY_ID_KEY,
  FIELD_ATTRIBUTE,
  FIELD_KEY,
  BAR_ID_ATTRIBUTE,
  BAR_ID_KEY,
  ROW_CELL_CLASS,
  ROW_CLASS,
  ROW_ID_KEY,
  ROW_LABEL_CLASS,
  ROW_LABEL_TEXT_CLASS,
} from '../render/dom/dom-contract.js';
import { cssEscapeAttr } from '../render/dom/css-escape.js';
import { entryId, entryIdOfBar, barIdFromDataset, rowIdFromDataset } from '../model/index.js';
import type { Entry, EntryId, FieldKey, RowId, TargetKind } from '../model/index.js';
import { SPLITTER_CLASS } from './pane-layout.js';
import type { PaneLayout, PaneName } from './pane-layout.js';
import type { FrameLayoutView } from '../layout/index.js';

/** What one node in a Gantt's own DOM stands for. `kind` is `model/`'s `TargetKind`, the same five
 *  words `CommandTarget` already uses. One vocabulary, so a plugin that resolves a right-click and
 *  a command that filters on `when` say the same thing.
 *
 *  It answers two different questions about Entries, because a Row may own several of them (#185,
 *  #199). `entry` is the node's **subject** — the one Entry whose Fields this node's content shows.
 *  A tooltip describes that Entry, and the cell editor anchors on it. `entryIds` is everything the
 *  node stands for, which is what an action on the node acts on. For a bar the two agree. For a
 *  row, and for a cell of that row, `entry` is the row's first Entry and `entryIds` is all of them.
 *
 *  `entry` is left out when the row stands for no Entry (a grouping header row), or when the Entry
 *  is gone from the Dataset. `field` is filled for `'gridCell'` and `'header'`. */
export interface DomTarget {
  kind: TargetKind;
  /** The node the walk stopped on — the bar, the cell, the row, the header cell or the splitter.
   *  A popup anchors to it; the cell editor positions over it. */
  element: HTMLElement;
  entry?: Entry | undefined;
  /** Every Entry this node stands for, in row order. Empty for a header cell, for the splitter, and
   *  for a grouping header row. Never `undefined`, so a reader counts it without a fallback. */
  entryIds: readonly EntryId[];
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
  /** The first bar of `id` that the current frame has mounted. A popup or a tooltip anchors on it.
   *  It asks the layout which Bars the entry draws (#185). So an entry whose first bar is scrolled
   *  off still anchors on a later bar that is on screen. `undefined` when the entry has no bar in
   *  the current frame at all. */
  barFor(id: EntryId | string): HTMLElement | undefined;
  /** The rendered grid cell for one entry and one Field. `undefined` when that row is not in the
   *  current frame, or the Gantt shows no column for `field`. It is also the one answer to "is my
   *  editor still anchored?" — a recycled row stops answering for the entry it used to hold. */
  cellFor(id: EntryId | string, field: FieldKey): HTMLElement | undefined;
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
  readonly paneBounds: Record<PaneName, DOMRect>;
  /** Which pane holds `node`, or `undefined` when it is in neither — a node outside this Gantt, or
   *  inside it but over the overlay layer. It answers by element identity, so it is a `contains`
   *  check and costs no layout (#177).
   *
   *  Use it for an ownership question: whose scroll was that, which pane did the user act in. Use
   *  `paneBounds` for a geometric one: where do I place and clamp a box. Asking geometry about
   *  ownership forces two `getBoundingClientRect` calls per event. That is what `Popup`'s own scroll
   *  dismissal used to do, on every scroll in the document. */
  paneOf(node: Node): PaneName | undefined;
}

/** Ordered by nothing: `Element.closest` answers with the *nearest* ancestor that matches any of
 *  these, so DOM depth decides. A cell is inside a row, so a cell wins over its row. A bar sits in
 *  the bar layer, and is inside no row at all. */
const TARGET_SELECTOR = `.${BAR_CLASS}, .${ROW_LABEL_CLASS}, .${ROW_CELL_CLASS}, .${COLUMN_HEADER_CLASS}, .${SPLITTER_CLASS}, .${ROW_CLASS}`;

/** What one `ContainerDom` reads to answer a pointer. `layout` is the frame's own questions
 *  (#185, #199, #212). A node states its own identity and nothing more. So every set a target names
 *  is asked for, never guessed off the node. */
export interface ContainerDomPorts {
  /** The element a consumer handed `new Gantt`. Everything this seam answers is scoped to it (I2). */
  container: HTMLElement;
  paneLayout: PaneLayout;
  /** The Entry one id names, for the node's subject — `Dataset.entries.get`. It stays its own member,
   *  not part of `layout`: a node's subject is the *live* Entry, not the frame's own copy. */
  entryById: (id: EntryId) => Entry | undefined;
  /** What the current frame drew — `FrameLayout` itself, or a test's own `FrameLayoutView` literal. */
  layout: FrameLayoutView;
}

/** `GanttDom` over one Container (`ContainerNotFoundError`'s own word — the element a consumer hands
 *  `new Gantt`). `GanttShell` builds exactly one per Gantt and lends it through `GanttShellPorts`. */
export class ContainerDom implements GanttDom {
  readonly #ports: ContainerDomPorts;
  /** One-slot memo, so a pointer resting on one node allocates no target per event. The three
   *  stamps go stale together with the node. Virtualization recycles a row node under a new entry,
   *  and the stamps say so before this seam hands the cached object back.
   *
   *  The frame stamp catches what the node's own stamps cannot (#212). A row keeps its
   *  `data-row-id`/`data-entry-id` while the set of Entries it owns changes underneath. A child
   *  added or removed leaves every node stamp equal, and the cached `entryIds` set stale. One number
   *  compare per event, and no allocation (I5). */
  #memoElement: Element | undefined;
  #memoBarId: string | undefined;
  #memoEntryId: string | undefined;
  #memoField: string | undefined;
  #memoFrameRevision: number | undefined;
  #memoTarget: DomTarget | undefined;

  constructor(ports: ContainerDomPorts) {
    this.#ports = ports;
  }

  owns(node: Node): boolean {
    return this.#ports.container.contains(node);
  }

  targetUnder(node: Node): DomTarget | undefined {
    if (!(node instanceof Element)) return undefined;
    const element = node.closest<HTMLElement>(TARGET_SELECTOR);
    if (element === null || !this.owns(element)) return undefined;
    const barIdAttr = element.dataset[BAR_ID_KEY];
    const entryIdAttr = element.dataset[ENTRY_ID_KEY];
    const fieldAttr = element.dataset[FIELD_KEY];
    const frameRevision = this.#ports.layout.frameRevision;
    if (
      this.#memoTarget !== undefined &&
      this.#memoElement === element &&
      this.#memoBarId === barIdAttr &&
      this.#memoEntryId === entryIdAttr &&
      this.#memoField === fieldAttr &&
      this.#memoFrameRevision === frameRevision
    ) {
      return this.#memoTarget;
    }
    const target = this.#resolve(element, barIdAttr, fieldAttr);
    this.#memoElement = element;
    this.#memoBarId = barIdAttr;
    this.#memoEntryId = entryIdAttr;
    this.#memoField = fieldAttr;
    this.#memoFrameRevision = frameRevision;
    this.#memoTarget = target;
    return target;
  }

  barFor(id: EntryId | string): HTMLElement | undefined {
    for (const item of this.#ports.layout.barIdsForEntry(entryId(id))) {
      const bar = this.#ports.container.querySelector<HTMLElement>(
        `.${BAR_CLASS}${attributeIs(BAR_ID_ATTRIBUTE, item)}`,
      );
      if (bar !== null) return bar;
    }
    return undefined;
  }

  cellFor(id: EntryId | string, field: FieldKey): HTMLElement | undefined {
    const row = `.${ROW_CLASS}${attributeIs(ENTRY_ID_ATTRIBUTE, id)}`;
    const cell = attributeIs(FIELD_ATTRIBUTE, field);
    return this.#ports.container.querySelector<HTMLElement>(`${row} ${cell}`) ?? undefined;
  }

  cellText(cell: HTMLElement): string {
    return (cell.querySelector<HTMLElement>(`.${ROW_LABEL_TEXT_CLASS}`) ?? cell).textContent ?? '';
  }

  get bounds(): DOMRect {
    return this.#ports.paneLayout.bounds();
  }

  get paneBounds(): Record<PaneName, DOMRect> {
    return this.#ports.paneLayout.paneBounds();
  }

  paneOf(node: Node): PaneName | undefined {
    return this.#ports.paneLayout.paneOf(node);
  }

  /** Frozen, because plugin code reads this object and the memo keeps it. A caller that wrote to it
   *  would poison every later reader of the same node. */
  #resolve(element: HTMLElement, itemIdAttr: string | undefined, fieldAttr: string | undefined): DomTarget {
    if (element.classList.contains(BAR_CLASS)) {
      const id = barIdFromDataset(itemIdAttr);
      const entry = id === undefined ? undefined : this.#ports.entryById(entryIdOfBar(id));
      // A bar draws one Entry (#421), so the subject and the set it stands for are the same one Entry.
      return freezeTarget({
        kind: 'bar',
        element,
        entryIds: entry === undefined ? NO_ENTRY_IDS : [entry.id],
        ...entryPart(entry),
      });
    }
    if (element.classList.contains(SPLITTER_CLASS)) {
      return freezeTarget({ kind: 'splitter', element, entryIds: NO_ENTRY_IDS });
    }
    if (element.classList.contains(COLUMN_HEADER_CLASS)) {
      return freezeTarget({
        kind: 'header',
        element,
        entryIds: NO_ENTRY_IDS,
        ...fieldPart(fieldAttr),
      });
    }
    if (element.classList.contains(ROW_CLASS)) {
      const rowId = rowIdFromDataset(element.dataset[ROW_ID_KEY]);
      return freezeTarget({
        kind: 'row',
        element,
        entryIds: this.#entryIdsOfRow(rowId),
        ...entryPart(this.#subjectOfRow(element)),
      });
    }
    // A name cell or an ordinary cell: the row above it names the Entries, the cell names the Field.
    // A click anywhere in a row selects every Entry the row owns (#185), so a cell target names the
    // same set the row does. Only the subject stays per-cell: these cells format that Entry's Fields.
    const row = element.closest<HTMLElement>(`.${ROW_CLASS}`);
    const rowId = row === null ? undefined : rowIdFromDataset(row.dataset[ROW_ID_KEY]);
    return freezeTarget({
      kind: 'gridCell',
      element,
      entryIds: this.#entryIdsOfRow(rowId),
      ...entryPart(row === null ? undefined : this.#subjectOfRow(row)),
      ...fieldPart(fieldAttr),
    });
  }

  /** The Entry whose Fields this row's cells format. `data-entry-id` names it, and nothing else. */
  #subjectOfRow(row: HTMLElement): Entry | undefined {
    const raw = row.dataset[ENTRY_ID_KEY];
    return raw === undefined ? undefined : this.#ports.entryById(raw as EntryId);
  }

  /** Every Entry this row owns. The layout answers, because the row node carries its subject only. */
  #entryIdsOfRow(id: RowId | undefined): readonly EntryId[] {
    return id === undefined ? NO_ENTRY_IDS : this.#ports.layout.entryIdsForRow(id);
  }
}

/** Shared and frozen, so a target that stands for no Entry allocates nothing (I5). */
const NO_ENTRY_IDS: readonly EntryId[] = Object.freeze([]);

/** One `[name="value"]` selector clause, with the value escaped for the quoted string it sits in.
 *  Both id lookups above are one `querySelector` over these, because the CSS engine already indexes
 *  attributes. A scan of every row costs O(rows) of DOM work, and `cellFor` answers "is my editor
 *  still anchored?" on every scroll while an editor is open (#176). */
function attributeIs(name: string, value: string): string {
  return `[${name}="${cssEscapeAttr(value)}"]`;
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
