import { describe, expect, it, vi } from 'vitest';
import { attachEntryGestures } from './entry-gestures.js';
import type {
  DraftOptions,
  EntryGestureContext,
  EntryGesture,
  EntryHit,
  SelectionForGestures,
} from '../view/index.js';
import { entryId, entryIdOfBar, barId, rowId, partIndexOfBar } from '../model/index.js';
import type { Entry, EntryEdits, EntryId, Instant, BarId, StoredEntry } from '../model/index.js';
import { EntryStore } from '../data/index.js';

/** `pointer-gesture.ts`'s own touch long-press threshold — this suite reads it only to advance
 *  fake timers past it, never to restate the rule. */
const ROW_REORDER_LONG_PRESS_MS = 400;

const A = entryId('a');
const B = entryId('b');
const C = entryId('c');
const ORDER: readonly EntryId[] = [A, B, C];

/** `interaction/` may not import `time/` (I1) — this suite is about pointer semantics, never real
 *  dates, so a bare number stands in for an `Instant` at this one call site. */
function toInstant(ms: number): Instant {
  return ms as unknown as Instant;
}

/** The rows a gesture reads, built through the real store. `interaction/` may reach `data/`
 *  (`.dependency-cruiser.cjs`), and the store is the one place a live `Entry` is built (ADR 0017),
 *  so nothing here stands one in. */
function storeOf(rows: readonly StoredEntry[]): EntryStore {
  return new EntryStore(rows, { timeZone: 'UTC' });
}

function storedFor(id: EntryId, siblingIndex: number): StoredEntry {
  return { id, name: id, start: toInstant(0), end: toInstant(1), props: {}, siblingIndex };
}

const rows = storeOf(ORDER.map((id, index) => storedFor(id, index)));

function entryFor(id: EntryId): Entry {
  return rows.get(id)!;
}

function up(clientX: number, mods: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent('pointerup', { clientX, clientY: 0, pointerId: 1, ...mods });
}

function down(clientX: number, mods: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent('pointerdown', { clientX, clientY: 0, pointerId: 1, ...mods });
}

function move(clientX: number, mods: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent('pointermove', { clientX, clientY: 0, pointerId: 1, ...mods });
}

/** The `session()`-shaped pieces a test wants to control — everything `GesturePipeline.session()`
 *  would otherwise resolve for real (D-GH-1). Not `EntryGestureContext` members themselves: they
 *  build the fake `session` this file's `ctx.session` returns. */
interface SessionOverrides {
  entriesForGesture?: (grabbed: EntryId, capability: 'move' | 'resize') => Entry[];
  draftFor?: (gesture: EntryGesture, entries: Entry[], dxPx: number, options?: DraftOptions) => EntryEdits;
  commit?: (gesture: EntryGesture, draft: EntryEdits) => Promise<boolean>;
}

/** `hitTest` reads a fake `data-hit-x` position map instead of real layout — this suite is about
 *  pointer semantics, not hit-testing, which `render/dom/index.test.ts` already covers. */
/** Overrides merge one level into `selection`, not over it: a test that replaces
 *  `selectableEntriesOf` keeps the other three answers the fake already gives (#230). */
type ContextOverrides = Partial<Omit<EntryGestureContext, 'selection'>> &
  SessionOverrides & { selection?: Partial<SelectionForGestures> };

/** What the fake `rowEdgeScroll` saw: each `follow` call, and how many times it stopped. */
interface EdgeScrollLog {
  follows: [number, () => void][];
  stops: number;
}

function makeContext(overrides: ContextOverrides = {}): {
  ctx: EntryGestureContext;
  proposals: (readonly EntryId[])[];
  previews: (EntryEdits | undefined)[];
  commits: [EntryGesture, EntryEdits][];
  activations: [EntryId, number, 'bar' | 'row'][];
  edgeScroll: EdgeScrollLog;
} {
  const {
    entriesForGesture = (grabbed) => [entryFor(grabbed)],
    draftFor = () => new Map(),
    commit = () => Promise.resolve(true),
    selection: selectionOverrides,
    ...ctxOverrides
  } = overrides;

  let selection: readonly EntryId[] = [];
  const proposals: (readonly EntryId[])[] = [];
  const previews: (EntryEdits | undefined)[] = [];
  const commits: [EntryGesture, EntryEdits][] = [];
  const activations: [EntryId, number, 'bar' | 'row'][] = [];
  const edgeScroll: EdgeScrollLog = { follows: [], stops: 0 };

  const ctx: EntryGestureContext = {
    hitTest: (at) =>
      at.x >= 0 && at.x < ORDER.length ? { kind: 'bar', barId: barId(ORDER[at.x]!) } : undefined,
    entryFor: (barId: BarId) => {
      const id = entryIdOfBar(barId);
      return ORDER.includes(id) ? entryFor(id) : undefined;
    },
    can: () => true,
    // #198: the shell filters this list by the `select` capability before `interaction/` ever sees it
    // (`gantt-shell.ts#selectableEntriesInRowOrder`), and the capability resolves there once (I14).
    setHovered: () => {},
    setHoveredRow: () => {},
    contentXAtPaneOffset: (offsetX) => offsetX,
    contentYAtClientY: (clientY) => clientY,
    rowEdgeScroll: {
      follow: (clientY, onScrolled) => edgeScroll.follows.push([clientY, onScrolled]),
      stop: () => {
        edgeScroll.stops += 1;
      },
    },
    discardHeldGesture: () => false,
    session: (grabbed, gesture) => {
      const entries = entriesForGesture(grabbed, gesture.kind === 'resize' ? 'resize' : 'move');
      if (entries.length === 0) return undefined;
      return {
        preview: (dxPx, options) => {
          const draft = draftFor(gesture, entries, dxPx, options);
          previews.push(draft);
        },
        commit: (dxPx, options) => {
          const draft = draftFor(gesture, entries, dxPx, options);
          previews.push(undefined);
          commits.push([gesture, draft]);
          return commit(gesture, draft);
        },
        nudge: (direction, options) => {
          const draft = draftFor(gesture, entries, direction, options);
          previews.push(undefined);
          commits.push([gesture, draft]);
          return commit(gesture, draft);
        },
        cancel: () => {
          previews.push(undefined);
        },
      };
    },
    selection: {
      entryIds: () => selection,
      propose: (next) => {
        selection = next;
        proposals.push(next);
      },
      // The fake answers the same question, so a test that makes an Entry incapable drops it from
      // the order rather than expecting `interaction/` to filter a second time.
      selectableEntriesInRowOrder: () => ORDER.filter((id) => ctx.can('select', entryFor(id))),
      // #185, #212, #230: the pane rule — a row names every selectable Entry it owns (the fake
      // maps one row id to the Entry of the same name, so a test that wants a multi-entry row
      // overrides it); a bar names its own Entry when it may be selected.
      selectableEntriesOf: (hit) => {
        if (hit.kind === 'row') {
          return ORDER.includes(hit.rowId as unknown as EntryId) ? [hit.rowId as unknown as EntryId] : [];
        }
        const entry = ctx.entryFor(hit.barId);
        return entry !== undefined && ctx.can('select', entry) ? [entry.id] : [];
      },
    },
    activation: {
      activateFromClick: (entry, detail, target) => {
        activations.push([entry.id, detail, target]);
      },
    },
    // #434, #602: the fake mirrors `selection.selectableEntriesOf` above — a bar names its own
    // Entry, a row names the same-named Entry the fake's row ids stand for.
    subjectEntryOf: (hit) =>
      hit.kind === 'bar'
        ? ctx.entryFor(hit.barId)
        : ORDER.includes(hit.rowId as unknown as EntryId)
          ? entryFor(hit.rowId as unknown as EntryId)
          : undefined,
    ...ctxOverrides,
  };
  Object.assign(ctx.selection, selectionOverrides);
  return { ctx, proposals, previews, commits, activations, edgeScroll };
}

function mockPointerCapture(el: HTMLElement): void {
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
}

/** happy-dom never lays out for real (`column-gestures.test.ts`'s own note) — a pane rect with a
 *  non-zero `top` is the only way to tell a real pane-relative offset from a raw `clientY` passthrough. */
function domRect(top: number): DOMRect {
  return { left: 0, right: 0, width: 0, top, bottom: top, height: 0, x: 0, y: top, toJSON: () => ({}) };
}

describe('attachEntryGestures — selection (S3.1)', () => {
  it('plain click on a bar replaces the selection', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0));
    expect(proposals).toEqual([[A]]);

    pane.dispatchEvent(up(1));
    expect(proposals).toEqual([[A], [B]]);
  });

  it('ctrl/cmd-click toggles membership', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0));
    pane.dispatchEvent(up(1, { ctrlKey: true }));
    expect(proposals.at(-1)).toEqual([A, B]);

    pane.dispatchEvent(up(0, { metaKey: true }));
    expect(proposals.at(-1)).toEqual([B]);
  });

  it('shift-click extends over row order from the last plain/ctrl click', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0)); // anchor = A
    pane.dispatchEvent(up(2, { shiftKey: true })); // extend to C
    expect(proposals.at(-1)).toEqual([A, B, C]);
  });

  it('a right-click on a bar inside a multi-bar Selection leaves the Selection intact (#199/#205)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0)); // anchor = A
    pane.dispatchEvent(up(1, { shiftKey: true })); // range A..B
    expect(proposals).toEqual([[A], [A, B]]);

    pane.dispatchEvent(down(1, { button: 2 }));
    pane.dispatchEvent(up(1, { button: 2 })); // right-click on B, part of the Selection
    // Unchanged — context-menu.ts decides what happens next. No propose call ran at all.
    expect(proposals).toEqual([[A], [A, B]]);
  });

  it('a right-click on an unselected bar writes nothing at the interaction layer (#199/#205)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0)); // select A
    pane.dispatchEvent(down(1, { button: 2 }));
    pane.dispatchEvent(up(1, { button: 2 })); // right-click on B, never selected
    expect(proposals).toEqual([[A]]); // context-menu.ts decides what B's right-click acts on, not this layer
  });

  it('a right-click on empty timeline clears a multi-bar Selection (#199/#205 follow-up)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0)); // anchor = A
    pane.dispatchEvent(up(1, { shiftKey: true })); // range A..B
    expect(proposals.at(-1)).toEqual([A, B]);

    pane.dispatchEvent(down(99, { button: 2 }));
    pane.dispatchEvent(up(99, { button: 2 })); // right-click on empty timeline
    expect(proposals.at(-1)).toEqual([]); // a right-click is a click for the clearing rule (D-S3-10)
  });

  it('a middle-click on empty timeline does not clear the selection (#199/#205, B9)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0)); // select A
    pane.dispatchEvent(down(99, { button: 1 }));
    pane.dispatchEvent(up(99, { button: 1 })); // middle-click on empty timeline — opens no menu
    expect(proposals).toEqual([[A]]); // only a primary or a right-click may clear
  });

  it('a touch tap on a bar selects it, the same as a primary-button click', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0, { pointerType: 'touch' }));
    expect(proposals).toEqual([[A]]);
  });

  it('shift-click omits incapable entries from the range; an empty result writes nothing', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext({
      can: (capability, entry) => capability !== 'select' || entry.id !== B,
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0)); // anchor = A (capable)
    pane.dispatchEvent(up(2, { shiftKey: true })); // range A..C, B dropped
    expect(proposals.at(-1)).toEqual([A, C]);
  });

  it('a click on an incapable bar leaves the selection untouched', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext({
      can: (capability, entry) => capability !== 'select' || entry.id !== B,
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0));
    pane.dispatchEvent(up(1)); // B, incapable
    expect(proposals).toEqual([[A]]);
  });

  it('click on empty timeline clears; Escape clears', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0));
    pane.dispatchEvent(up(99)); // no hit
    expect(proposals.at(-1)).toEqual([]);

    pane.dispatchEvent(up(1));
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(proposals.at(-1)).toEqual([]);
  });

  it('detach() removes the pointer, key, and native-highlight listeners', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    const attachment = attachEntryGestures(pane, rowLayer, container, ctx);
    attachment.detach();

    pane.dispatchEvent(up(0));
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const secondClick = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 2 });
    container.dispatchEvent(secondClick);
    expect(proposals).toEqual([]);
    expect(secondClick.defaultPrevented).toBe(false);
  });

  it('a second click of a double-click does not start a native text range (the first still focuses)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    attachEntryGestures(pane, rowLayer, container, makeContext().ctx);

    const first = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 });
    const second = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 2 });
    container.dispatchEvent(first);
    container.dispatchEvent(second);
    expect(first.defaultPrevented).toBe(false);
    expect(second.defaultPrevented).toBe(true);

    const selectStart = new Event('selectstart', { bubbles: true, cancelable: true });
    container.dispatchEvent(selectStart);
    expect(selectStart.defaultPrevented).toBe(true);
  });
});

function click(detail = 1): MouseEvent {
  return new MouseEvent('click', { bubbles: true, cancelable: true, detail });
}

// #434: `pendingActivation` names a candidate on `pointerup`; the native `click` that always
// follows in the same synchronous dispatch confirms it. A candidate must live for exactly one
// pointer sequence — stale past that, an unrelated later click could confirm the wrong Entry.
describe('attachEntryGestures — activation candidate lifetime (#434)', () => {
  it('a click that follows the naming pointerup confirms it', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, activations } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0)); // names A as the candidate
    container.dispatchEvent(click());
    expect(activations).toEqual([[A, 1, 'bar']]);
  });

  it('a candidate that never gets its click does not survive to confirm a later, unrelated click', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, activations } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0)); // names A — its own click never comes (drag, cancel, scroll…)
    pane.dispatchEvent(down(99)); // a new pointer sequence, on empty space
    pane.dispatchEvent(up(99)); // a miss — names nothing
    container.dispatchEvent(click()); // an unrelated click must not confirm A

    expect(activations).toEqual([]);
  });

  it('a pointercancel drops a named candidate', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, activations } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0)); // names A
    pane.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }));
    container.dispatchEvent(click());

    expect(activations).toEqual([]);
  });

  it('a miss on pointerup drops a named candidate', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, activations } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0)); // names A
    pane.dispatchEvent(up(99)); // a miss, same sequence's pointerup skipped by a stray extra up
    container.dispatchEvent(click());

    expect(activations).toEqual([]);
  });

  // #434: a hit that exists (not a miss) but names no new candidate — a modifier held, or the
  // hit itself refuses `activate` — used to leave an older, still-unconfirmed candidate in place.
  // A later, unrelated click then wrongly confirmed it.
  it('a hit that exists but is not activate-capable still drops an older, unconfirmed candidate', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, activations } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0)); // names A — its own click has not fired yet
    pane.dispatchEvent(up(0, { shiftKey: true })); // same hit, shift held: names nothing new
    container.dispatchEvent(click()); // must not confirm the stale A

    expect(activations).toEqual([]);
  });

  // #434: the grid pane's row layer arms no drag of its own, so it never had a
  // `pointerdown`/`pointercancel` listener of its own to clear from — only `pane`'s did. A cancelled
  // sequence that named its candidate through the row layer's own `pointerup` (`onRowLayerPointerUp`)
  // must not outlive it either.
  it('a pointercancel on the grid pane row layer drops a named candidate too', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, activations } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    rowLayer.dispatchEvent(up(0)); // names A through the row layer's own pointerup
    rowLayer.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }));
    container.dispatchEvent(click());

    expect(activations).toEqual([]);
  });
});

// Bug hunt (S5 fixes, "grid row highlight and row click"): a row click selects the same way a bar
// click does, but never arms move/resize, and a grid miss never clears (only an empty timeline
// click does).
describe('attachEntryGestures — grid row click', () => {
  it('a click on a grid row selects the same way a bar click does', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    rowLayer.dispatchEvent(up(0));
    expect(proposals).toEqual([[A]]);
  });

  it('shift-click on a grid row ranges, same as the timeline', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    rowLayer.dispatchEvent(up(0)); // anchor = A
    rowLayer.dispatchEvent(up(2, { shiftKey: true })); // extend to C
    expect(proposals.at(-1)).toEqual([A, B, C]);
  });

  it('a right-click on a selected grid row leaves the Selection intact (#199/#205)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    rowLayer.dispatchEvent(up(0)); // anchor = A
    rowLayer.dispatchEvent(up(1, { shiftKey: true })); // range A..B
    expect(proposals).toEqual([[A], [A, B]]);

    rowLayer.dispatchEvent(up(0, { button: 2 })); // right-click on A, part of the Selection
    // Unchanged: a right-click inside the Selection proposes nothing at all.
    expect(proposals).toEqual([[A], [A, B]]);
  });

  it('a miss on the grid pane does not clear the selection', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0)); // select A off the timeline
    rowLayer.dispatchEvent(up(99)); // grid miss — header row, padding, a twisty
    expect(proposals).toEqual([[A]]);
    expect(ctx.selection.entryIds()).toEqual([A]);
  });

  it('a right-click miss on the grid pane does not clear the selection', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0)); // select A off the timeline
    rowLayer.dispatchEvent(up(99, { button: 2 })); // right-click grid miss — header row, padding, a twisty
    expect(proposals).toEqual([[A]]);
    expect(ctx.selection.entryIds()).toEqual([A]);
  });

  it('a grid miss does not drop the shift-anchor — a later shift-click still ranges from it', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    rowLayer.dispatchEvent(up(0)); // anchor = A
    rowLayer.dispatchEvent(up(99)); // grid miss — clearOnMiss is false, must not drop the anchor either
    rowLayer.dispatchEvent(up(2, { shiftKey: true })); // extend from A to C
    expect(proposals.at(-1)).toEqual([A, B, C]);
  });

  it('an empty timeline click still clears, even after a grid miss', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0));
    rowLayer.dispatchEvent(up(99)); // no-op
    pane.dispatchEvent(up(99)); // timeline miss — clears
    expect(proposals.at(-1)).toEqual([]);
  });

  // #185: a row that owns several Entries selects all of them. `hitTest` reports the row, and
  // `selectableEntriesOf` answers which Entries it owns — no Bar id is invented anywhere on this path.
  const MULTI_ENTRY_ROW = rowId('multi-entry');

  function multiEntryRowContext(rowEntries: readonly EntryId[] = [A, B]) {
    // x = 0 is the multi-entry row; x = 1 is A's own bar, so a test can select off the timeline too.
    return makeContext({
      hitTest: (at) => {
        if (at.x === 0) return { kind: 'row', rowId: MULTI_ENTRY_ROW };
        return at.x === 1 ? { kind: 'bar', barId: barId(A) } : undefined;
      },
      selection: {
        selectableEntriesOf: (hit: EntryHit) => (hit.kind === 'row' ? rowEntries : [entryIdOfBar(hit.barId)]),
      },
    });
  }

  it('a row click selects every Entry the row owns (#185)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = multiEntryRowContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    rowLayer.dispatchEvent(up(0));
    // #212: the grid pane's unit is the row, so it selects both Entries the row owns.
    expect(proposals.at(-1)).toEqual([A, B]);
  });

  it('ctrl-click toggles a multi-entry row as a unit (#185)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = multiEntryRowContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    rowLayer.dispatchEvent(up(0, { ctrlKey: true }));
    expect(proposals.at(-1)).toEqual([A, B]);

    // Every member is selected now, so the same chord removes the whole row.
    rowLayer.dispatchEvent(up(0, { ctrlKey: true }));
    expect(proposals.at(-1)).toEqual([]);
  });

  it('ctrl-click adds the missing members when only some of the row is selected (#185)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = multiEntryRowContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(1)); // select A off its own bar
    rowLayer.dispatchEvent(up(0, { ctrlKey: true }));
    expect(proposals.at(-1)).toEqual([A, B]);
  });

  it('shift-click ranges to the last Entry the row owns (#185)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext({
      hitTest: (at) =>
        at.x === 0 ? { kind: 'bar', barId: barId(A) } : { kind: 'row', rowId: MULTI_ENTRY_ROW },
      selection: {
        selectableEntriesOf: (hit: EntryHit) => (hit.kind === 'row' ? [B, C] : [entryIdOfBar(hit.barId)]),
      },
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(0)); // anchor = A
    rowLayer.dispatchEvent(up(1, { shiftKey: true })); // range ends on C, the row's last Entry
    expect(proposals.at(-1)).toEqual([A, B, C]);
  });

  it('a row Entry that refuses select is skipped, and never blocks the rest (#185)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    // `selectableEntriesOf` resolves the capability (I14), so an incapable Entry never reaches this file.
    const { ctx, proposals } = multiEntryRowContext([B]);
    attachEntryGestures(pane, rowLayer, container, ctx);

    rowLayer.dispatchEvent(up(0));
    expect(proposals.at(-1)).toEqual([B]);
  });

  it('a row that owns nothing selectable writes nothing and clears nothing (#185)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = multiEntryRowContext([]);
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(1)); // select A off its own bar
    rowLayer.dispatchEvent(up(0)); // a header row: it owns no Entry
    expect(proposals).toEqual([[A]]);
  });

  it('a grid-row pointerup never arms move/resize — no session() call, no drag', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    let sessionCalls = 0;
    const { ctx } = makeContext();
    const spiedCtx: EntryGestureContext = {
      ...ctx,
      session: (...args) => {
        sessionCalls++;
        return ctx.session(...args);
      },
    };
    attachEntryGestures(pane, rowLayer, container, spiedCtx);

    rowLayer.dispatchEvent(down(0));
    rowLayer.dispatchEvent(up(0));
    expect(sessionCalls).toBe(0);
  });

  it('detach() removes the grid pointerup listener', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, rowLayer, container, ctx).detach();

    rowLayer.dispatchEvent(up(0));
    expect(proposals).toEqual([]);
  });
});

describe('attachEntryGestures — row reorder drag (#602)', () => {
  // `hitTest` reports a row over every x `ORDER` covers, the row named after the same Entry
  // (`makeContext`'s default `subjectEntryOf` already resolves a row id this way).
  function rowReorderContext(overrides: ContextOverrides = {}) {
    return makeContext({
      hitTest: (at) =>
        at.x >= 0 && at.x < ORDER.length ? { kind: 'row', rowId: rowId(ORDER[at.x]!) } : undefined,
      ...overrides,
    });
  }

  it('a pointerdown on a row plus a 5 px vertical move arms a reorder session, previewing content-y with dxPx zero', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    mockPointerCapture(rowLayer);
    const seenGestures: EntryGesture[] = [];
    const seenDx: number[] = [];
    const seenContentY: (number | undefined)[] = [];
    const { ctx } = rowReorderContext({
      draftFor: (gesture, entries, dxPx, options) => {
        seenGestures.push(gesture);
        seenDx.push(dxPx);
        seenContentY.push(options?.contentY);
        return new Map(entries.map((e) => [e.id, {}]));
      },
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    rowLayer.dispatchEvent(down(0, { clientY: 0 }));
    rowLayer.dispatchEvent(move(0, { clientY: 5 }));

    expect(seenGestures.at(-1)).toEqual({ kind: 'reorder' });
    expect(seenDx.at(-1)).toBe(0);
    expect(seenContentY.at(-1)).toBe(5);
  });

  it('a 3 px move then pointerup never arms — the row click still selects', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    mockPointerCapture(rowLayer);
    const { ctx, proposals } = rowReorderContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    rowLayer.dispatchEvent(down(0, { clientY: 0 }));
    rowLayer.dispatchEvent(move(0, { clientY: 3 })); // under the 4 px threshold
    rowLayer.dispatchEvent(up(0, { clientY: 3 }));

    expect(proposals).toEqual([[A]]);
  });

  it('after an armed drag, pointerup proposes nothing further and activates nothing', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    mockPointerCapture(rowLayer);
    const { ctx, proposals, activations } = rowReorderContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    rowLayer.dispatchEvent(down(0, { clientY: 0 }));
    rowLayer.dispatchEvent(move(0, { clientY: 10 })); // arms, and selects the grabbed row's subject
    expect(proposals).toEqual([[A]]);

    rowLayer.dispatchEvent(up(0, { clientY: 10 }));
    expect(proposals).toEqual([[A]]);
    expect(activations).toEqual([]);
  });

  it('a subject that refuses reorder never arms — the click still selects', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    mockPointerCapture(rowLayer);
    const { ctx, proposals } = rowReorderContext({ can: (capability) => capability !== 'reorder' });
    attachEntryGestures(pane, rowLayer, container, ctx);

    rowLayer.dispatchEvent(down(0, { clientY: 0 }));
    rowLayer.dispatchEvent(move(0, { clientY: 10 }));
    rowLayer.dispatchEvent(up(0, { clientY: 10 }));

    expect(proposals).toEqual([[A]]);
  });

  it('arming on an unselected row proposes its Entries before session() runs', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    mockPointerCapture(rowLayer);
    const order: string[] = [];
    const { ctx } = rowReorderContext();
    const spiedCtx: EntryGestureContext = {
      ...ctx,
      selection: {
        ...ctx.selection,
        propose: (next) => {
          order.push('propose');
          ctx.selection.propose(next);
        },
      },
      session: (grabbed, gesture) => {
        order.push('session');
        return ctx.session(grabbed, gesture);
      },
    };
    attachEntryGestures(pane, rowLayer, container, spiedCtx);

    rowLayer.dispatchEvent(down(0, { clientY: 0 }));
    rowLayer.dispatchEvent(move(0, { clientY: 10 }));

    expect(order).toEqual(['propose', 'session']);
  });

  it('a pointerdown on a control inside the row layer never arms (#602)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    mockPointerCapture(rowLayer);
    const input = document.createElement('input');
    rowLayer.appendChild(input);
    let sessionCalls = 0;
    const { ctx } = rowReorderContext();
    const spiedCtx: EntryGestureContext = {
      ...ctx,
      session: (...args) => {
        sessionCalls++;
        return ctx.session(...args);
      },
    };
    attachEntryGestures(pane, rowLayer, container, spiedCtx);

    input.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, bubbles: true }),
    );
    rowLayer.dispatchEvent(move(0, { clientY: 10 }));

    expect(sessionCalls).toBe(0);
  });

  it('a right-button press claims no pointer slot — a primary drag on its own pointer still arms (#602)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    mockPointerCapture(rowLayer);
    const { ctx } = rowReorderContext();
    const seenGestures: EntryGesture[] = [];
    const spiedCtx: EntryGestureContext = {
      ...ctx,
      session: (grabbed, gesture) => {
        seenGestures.push(gesture);
        return ctx.session(grabbed, gesture);
      },
    };
    attachEntryGestures(pane, rowLayer, container, spiedCtx);

    // A right-button press on another pointer (a second finger, a pen) — held, no matching
    // pointerup yet.
    rowLayer.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 2, button: 2 }),
    );
    // A primary press on its own pointer must still arm — a stray non-primary press elsewhere
    // never blocks it.
    rowLayer.dispatchEvent(down(0, { clientY: 0 }));
    rowLayer.dispatchEvent(move(0, { clientY: 5 }));

    expect(seenGestures.at(-1)).toEqual({ kind: 'reorder' });
  });

  it('Escape mid-drag cancels the row reorder without clearing the Selection', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    mockPointerCapture(rowLayer);
    const { ctx, previews } = rowReorderContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    rowLayer.dispatchEvent(down(0, { clientY: 0 }));
    rowLayer.dispatchEvent(move(0, { clientY: 10 })); // arms, selects A
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(previews.at(-1)).toBeUndefined(); // cancel() clears the preview
    expect(ctx.selection.entryIds()).toEqual([A]); // untouched — Escape cancels the drag, not the pick
  });

  it('pointercancel mid-drag cancels the row reorder session', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    mockPointerCapture(rowLayer);
    const { ctx, previews } = rowReorderContext();
    attachEntryGestures(pane, rowLayer, container, ctx);

    rowLayer.dispatchEvent(down(0, { clientY: 0 }));
    rowLayer.dispatchEvent(move(0, { clientY: 10 }));
    rowLayer.dispatchEvent(new PointerEvent('pointercancel', { clientX: 0, clientY: 10, pointerId: 1 }));

    expect(previews.at(-1)).toBeUndefined();
  });

  describe('near the rows edge', () => {
    function armedRowDrag(overrides: ContextOverrides = {}) {
      const pane = document.createElement('div');
      const container = document.createElement('div');
      const rowLayer = document.createElement('div');
      mockPointerCapture(rowLayer);
      const made = rowReorderContext(overrides);
      const detachable = attachEntryGestures(pane, rowLayer, container, made.ctx);
      rowLayer.dispatchEvent(down(0, { clientY: 0 }));
      rowLayer.dispatchEvent(move(0, { clientY: 10 }));
      return { ...made, rowLayer, container, detachable };
    }

    it('reports every pointer move to the edge scroll', () => {
      const { edgeScroll, rowLayer } = armedRowDrag();
      rowLayer.dispatchEvent(move(0, { clientY: 30 }));
      expect(edgeScroll.follows.map(([clientY]) => clientY)).toEqual([10, 30]);
    });

    it('previews again with the scrolled content-y when the rows scroll under a still pointer', () => {
      let scrollY = 0;
      const seenContentY: (number | undefined)[] = [];
      const { edgeScroll } = armedRowDrag({
        contentYAtClientY: (clientY) => clientY + scrollY,
        draftFor: (_gesture, entries, _dxPx, options) => {
          seenContentY.push(options?.contentY);
          return new Map(entries.map((e) => [e.id, {}]));
        },
      });
      expect(seenContentY.at(-1)).toBe(10);

      scrollY = 25;
      edgeScroll.follows.at(-1)![1]();

      expect(seenContentY.at(-1)).toBe(35);
    });

    it('stops on commit, on Escape and on detach', () => {
      const commit = armedRowDrag();
      const stopsWhileDragging = commit.edgeScroll.stops;
      commit.rowLayer.dispatchEvent(up(0, { clientY: 10 }));
      expect(commit.edgeScroll.stops).toBeGreaterThan(stopsWhileDragging);

      const escape = armedRowDrag();
      const stopsBeforeEscape = escape.edgeScroll.stops;
      escape.container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(escape.edgeScroll.stops).toBeGreaterThan(stopsBeforeEscape);

      const detach = armedRowDrag();
      const stopsBeforeDetach = detach.edgeScroll.stops;
      detach.detachable.detach();
      expect(detach.edgeScroll.stops).toBeGreaterThan(stopsBeforeDetach);
    });
  });

  it('a touch long-press arms a reorder, then stops the page pan (#602)', () => {
    vi.useFakeTimers();
    try {
      const pane = document.createElement('div');
      const container = document.createElement('div');
      const rowLayer = document.createElement('div');
      mockPointerCapture(rowLayer);
      const { ctx } = rowReorderContext();
      attachEntryGestures(pane, rowLayer, container, ctx);

      rowLayer.dispatchEvent(down(0, { clientY: 0, pointerType: 'touch' }));

      const beforeArming = new Event('touchmove', { cancelable: true });
      rowLayer.dispatchEvent(beforeArming);
      expect(beforeArming.defaultPrevented).toBe(false);

      vi.advanceTimersByTime(ROW_REORDER_LONG_PRESS_MS);

      const afterArming = new Event('touchmove', { cancelable: true });
      rowLayer.dispatchEvent(afterArming);
      expect(afterArming.defaultPrevented).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('attachEntryGestures — hover (S3.2)', () => {
  it('reports the raw hit under the pointer on pointermove, and undefined on pointerleave', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const hovered: (BarId | undefined)[] = [];
    const { ctx } = makeContext({ setHovered: (id) => hovered.push(id) });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(move(1));
    pane.dispatchEvent(move(99)); // no hit
    pane.dispatchEvent(new PointerEvent('pointerleave'));

    expect(hovered).toEqual([barId(B), undefined, undefined]);
  });

  it('detach() stops reporting hover', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const hovered: (BarId | undefined)[] = [];
    const { ctx } = makeContext({ setHovered: (id) => hovered.push(id) });
    attachEntryGestures(pane, rowLayer, container, ctx).detach();

    pane.dispatchEvent(move(1));
    expect(hovered).toEqual([]);
  });
});

const DRAG_THRESHOLD_PX = 4;

describe('attachEntryGestures — move (S3.3)', () => {
  it('[S3-A1] a drag past the threshold previews, then commits on pointerup and touches selection no further', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals, previews, commits } = makeContext({
      can: (capability) => capability === 'move' || capability === 'select',
      draftFor: (_gesture, entries, dxPx) =>
        new Map(entries.map((e) => [e.id, { start: toInstant(dxPx), end: toInstant(dxPx) }])),
    });
    attachEntryGestures(pane, rowLayer, container, ctx);
    // A is already the Selection, with no pick — the drag below grabs the bar it already names, so
    // the pointerdown-arm write (#211) has nothing to do. `proposals` is reset after seeding so the
    // assertion below is about what the drag itself proposes, not this setup step.
    ctx.selection.propose([A]);
    proposals.length = 0;

    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1));
    pane.dispatchEvent(up(0 + DRAG_THRESHOLD_PX + 5));

    expect(previews.length).toBeGreaterThan(0);
    expect(previews.at(-1)).toBeUndefined(); // cleared on commit
    expect(commits).toHaveLength(1);
    expect(commits[0]![0]).toEqual({ kind: 'move' });
    expect(proposals).toEqual([]); // a drag on an already-selected, already-picked bar proposes nothing
  });

  it('[#211, D-S4-30] a drag on a bar not in the Selection proposes it, with that bar as the pick, once armed', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals, commits } = makeContext({
      can: (capability) => capability === 'move' || capability === 'select',
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    // Nothing is selected. A press-then-drag on A's bar must pick up A, with that bar as its pick,
    // the moment the drag arms — not deferred to pointerup, and not left unset for the whole gesture.
    pane.dispatchEvent(down(0));
    expect(proposals).toEqual([]); // still nothing on pointerdown alone, threshold not yet crossed
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1)); // crosses the threshold — the drag arms here
    expect(proposals).toEqual([[A]]);

    pane.dispatchEvent(up(0 + DRAG_THRESHOLD_PX + 5));
    expect(commits).toHaveLength(1);
    expect(proposals).toEqual([[A]]); // pointerup after a drag proposes nothing further
  });

  it('[#211] a drag on a bar already in a multi-Entry Selection does not re-propose it', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext({
      can: (capability) => capability === 'move' || capability === 'select',
    });
    attachEntryGestures(pane, rowLayer, container, ctx);
    ctx.selection.propose([A, B]);
    proposals.length = 0;

    pane.dispatchEvent(down(0)); // grabs A, already part of the Selection
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1));

    expect(proposals).toEqual([]); // A is already selected — the rigid multi-Entry drag applies as-is
  });

  it('[#211] a resize-handle grab never proposes a Selection change on arm', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const { ctx, proposals } = makeContext({
      can: (capability) => capability === 'resize' || capability === 'select',
      hitTest: (at) =>
        at.x >= 0 && at.x < ORDER.length
          ? { kind: 'bar', barId: barId(ORDER[at.x]!), edge: 'end' }
          : undefined,
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    // Nothing is selected, yet a resize-handle grab on A's bar arms fine — `resizableEntryId` already
    // resolves off hover, not the Selection, so this grab names no new Entry (#211 scopes the
    // pointerdown-arm write to a move grab only).
    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1));

    expect(proposals).toEqual([]);
  });

  it('[S3-A2] Escape mid-drag clears the preview and commits nothing', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const commit = vi.fn(() => Promise.resolve(true));
    const { ctx, previews, commits } = makeContext({
      can: (capability) => capability === 'move' || capability === 'select',
      commit,
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1));
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(previews.at(-1)).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
    expect(commits).toEqual([]);
  });

  it('a pointerdown on a bar without move capability falls back to a plain click on pointerup', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const commit = vi.fn(() => Promise.resolve(true));
    const { ctx, proposals } = makeContext({ can: (capability) => capability === 'select', commit });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1)); // never arms: not move-capable
    pane.dispatchEvent(up(0));

    expect(commit).not.toHaveBeenCalled();
    expect(proposals).toEqual([[A]]);
  });

  it('preview reads content-y straight off the client y — the door subtracts the pane top', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const seenContentY: (number | undefined)[] = [];
    const { ctx } = makeContext({
      can: (capability) => capability === 'move' || capability === 'select',
      contentYAtClientY: (clientY) => clientY + 1000,
      draftFor: (_gesture, entries, _dxPx, options) => {
        seenContentY.push(options?.contentY);
        return new Map(entries.map((e) => [e.id, {}]));
      },
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(down(0, { clientY: 50 }));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1, { clientY: 65 }));

    expect(seenContentY.at(-1)).toBe(65 + 1000);
  });

  it('commit reads content-y the same way, off the pointerup position', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const seenContentY: (number | undefined)[] = [];
    const { ctx } = makeContext({
      can: (capability) => capability === 'move' || capability === 'select',
      contentYAtClientY: (clientY) => clientY + 1000,
      draftFor: (_gesture, entries, _dxPx, options) => {
        seenContentY.push(options?.contentY);
        return new Map(entries.map((e) => [e.id, {}]));
      },
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(down(0, { clientY: 50 }));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1, { clientY: 65 }));
    pane.dispatchEvent(up(0 + DRAG_THRESHOLD_PX + 5, { clientY: 90 }));

    expect(seenContentY.at(-1)).toBe(90 + 1000);
  });

  it('a mostly-horizontal arm locks the time axis — content-y is never read (#425)', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const seenContentY: (number | undefined)[] = [];
    const { ctx } = makeContext({
      can: (capability) => capability === 'move' || capability === 'select',
      draftFor: (_gesture, entries, _dxPx, options) => {
        seenContentY.push(options?.contentY);
        return new Map(entries.map((e) => [e.id, {}]));
      },
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    // Arms mostly horizontal (dx=20, dy=1), then travels further vertically — the axis stays
    // locked to time, so `contentY` is never read on `preview()` or `commit()`.
    pane.dispatchEvent(down(0, { clientY: 0 }));
    pane.dispatchEvent(move(20, { clientY: 1 }));
    pane.dispatchEvent(move(25, { clientY: 50 }));
    pane.dispatchEvent(up(25, { clientY: 50 }));

    expect(seenContentY.every((value) => value === undefined)).toBe(true);
    expect(seenContentY.length).toBeGreaterThan(0);
  });

  it('a mostly-vertical arm locks the row axis — dxPx commits as 0, dates hold still (#425)', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const seenDxPx: number[] = [];
    const { ctx } = makeContext({
      can: (capability) => capability === 'move' || capability === 'select',
      draftFor: (_gesture, entries, dxPx) => {
        seenDxPx.push(dxPx);
        return new Map(entries.map((e) => [e.id, {}]));
      },
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    // Arms mostly vertical (dx=1, dy=20), then drifts further horizontal — the axis stays locked
    // to row, so every preview/commit reads `dxPx` as 0, however far the pointer travels sideways.
    pane.dispatchEvent(down(0, { clientY: 0 }));
    pane.dispatchEvent(move(1, { clientY: 20 }));
    pane.dispatchEvent(move(60, { clientY: 25 }));
    pane.dispatchEvent(up(60, { clientY: 25 }));

    expect(seenDxPx.every((value) => value === 0)).toBe(true);
    expect(seenDxPx.length).toBeGreaterThan(0);
  });

  it('reads the pane rect once per move, and never on a time-axis move (#425 finding 12)', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const rect = vi.fn(() => domRect(20));
    pane.getBoundingClientRect = rect;
    const { ctx } = makeContext({ can: (capability) => capability === 'move' || capability === 'select' });
    attachEntryGestures(pane, rowLayer, container, ctx);

    // Arms mostly horizontal — the axis locks to time, so `offsetY` never needs the pane rect.
    pane.dispatchEvent(down(0, { clientY: 0 }));
    pane.dispatchEvent(move(20, { clientY: 1 }));
    rect.mockClear();

    pane.dispatchEvent(move(30, { clientY: 2 }));
    expect(rect).toHaveBeenCalledTimes(1); // one rect for `offsetX`, none spent on `offsetY`

    pane.dispatchEvent(up(30, { clientY: 2 }));
    expect(rect).toHaveBeenCalledTimes(1); // commit on a time-axis drag reads no rect at all
  });

  it('reads the pane rect once, not twice, on a row-axis move (#425 finding 12)', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const rect = vi.fn(() => domRect(20));
    pane.getBoundingClientRect = rect;
    const { ctx } = makeContext({ can: (capability) => capability === 'move' || capability === 'select' });
    attachEntryGestures(pane, rowLayer, container, ctx);

    // Arms mostly vertical — the axis locks to row, so `offsetY` is read, but off one shared rect.
    pane.dispatchEvent(down(0, { clientY: 0 }));
    pane.dispatchEvent(move(1, { clientY: 20 }));
    rect.mockClear();

    pane.dispatchEvent(move(2, { clientY: 30 }));
    expect(rect).toHaveBeenCalledTimes(1);
  });

  it('a drag moves every capable entry `entriesForGesture` returns, grabbed first', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const seenEntries: Entry[][] = [];
    const { ctx } = makeContext({
      can: () => true,
      entriesForGesture: (grabbed) => [entryFor(grabbed), entryFor(grabbed === A ? B : A)],
      draftFor: (_g, entries) => {
        seenEntries.push([...entries]);
        return new Map();
      },
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(down(0)); // grabs A
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1));

    expect(seenEntries[0]?.map((e) => e.id)).toEqual([A, B]);
  });

  it('a row-axis bar drag follows the pointer with the edge scroll, and a time-axis drag does not', () => {
    const rowAxis = makeContext();
    const rowPane = document.createElement('div');
    mockPointerCapture(rowPane);
    attachEntryGestures(rowPane, document.createElement('div'), document.createElement('div'), rowAxis.ctx);
    rowPane.dispatchEvent(down(0));
    rowPane.dispatchEvent(move(0, { clientY: 12 }));
    rowPane.dispatchEvent(move(0, { clientY: 20 }));
    expect(rowAxis.edgeScroll.follows.map(([clientY]) => clientY)).toEqual([12, 20]);
    const stopsWhileDragging = rowAxis.edgeScroll.stops;
    rowPane.dispatchEvent(up(0, { clientY: 20 }));
    expect(rowAxis.edgeScroll.stops).toBeGreaterThan(stopsWhileDragging);

    const timeAxis = makeContext();
    const timePane = document.createElement('div');
    mockPointerCapture(timePane);
    attachEntryGestures(timePane, document.createElement('div'), document.createElement('div'), timeAxis.ctx);
    timePane.dispatchEvent(down(0));
    timePane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1, { clientY: 2 }));
    expect(timeAxis.edgeScroll.follows).toEqual([]);
  });

  it('a touch long-press on a bar waits for the first travel to pick its axis', () => {
    vi.useFakeTimers();
    try {
      const pane = document.createElement('div');
      mockPointerCapture(pane);
      const container = document.createElement('div');
      const rowLayer = document.createElement('div');
      const seenGestures: EntryGesture[] = [];
      const { ctx } = makeContext({
        draftFor: (gesture, entries) => {
          seenGestures.push(gesture);
          return new Map(entries.map((e) => [e.id, {}]));
        },
      });
      attachEntryGestures(pane, rowLayer, container, ctx);

      pane.dispatchEvent(down(0, { pointerType: 'touch' }));
      vi.advanceTimersByTime(ROW_REORDER_LONG_PRESS_MS);
      pane.dispatchEvent(move(0, { pointerType: 'touch' })); // a still finger: no travel yet
      expect(seenGestures).toEqual([]);

      pane.dispatchEvent(move(0, { clientY: 8, pointerType: 'touch' }));
      expect(seenGestures.at(-1)).toEqual({ kind: 'reorder' });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('attachEntryGestures — resize (S3.4)', () => {
  it("[S3-A1] a pointerdown on the end handle arms a resize({ edge: 'end' }) gesture, committed on pointerup", () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const capabilities: ('move' | 'resize')[] = [];
    const { ctx, proposals, commits } = makeContext({
      hitTest: () => ({ kind: 'bar' as const, barId: barId(A), edge: 'end' }),
      can: (capability) => capability === 'resize' || capability === 'select',
      entriesForGesture: (grabbed, capability) => {
        capabilities.push(capability);
        return [entryFor(grabbed)];
      },
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1));
    pane.dispatchEvent(up(0 + DRAG_THRESHOLD_PX + 5));

    expect(capabilities).toEqual(['resize']);
    expect(commits).toHaveLength(1);
    expect(commits[0]![0]).toEqual({ kind: 'resize', edge: 'end' });
    expect(proposals).toEqual([]); // a drag never also proposes a selection change
  });

  it('a pointerdown on the start handle of a resize-incapable entry falls back to a plain click', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const commit = vi.fn(() => Promise.resolve(true));
    const { ctx, proposals } = makeContext({
      hitTest: (at) =>
        at.x === 0
          ? { kind: 'bar' as const, barId: barId(A), edge: 'start' }
          : { kind: 'bar' as const, barId: barId(ORDER[at.x]!) },
      can: (capability) => capability === 'select', // resize refused (e.g. milestone)
      commit,
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1)); // never arms: not resize-capable
    pane.dispatchEvent(up(0));

    expect(commit).not.toHaveBeenCalled();
    expect(proposals).toEqual([[A]]);
  });

  it("asks can('resize', entry, edge) with the grabbed handle's own edge, not the other one (#142)", () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const asked: Array<'start' | 'end' | undefined> = [];
    const { ctx } = makeContext({
      hitTest: () => ({ kind: 'bar' as const, barId: barId(A), edge: 'start' }),
      can: (capability, _entry, edge) => {
        if (capability === 'resize') asked.push(edge);
        return capability === 'select';
      },
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1));
    pane.dispatchEvent(up(0));

    expect(asked).toEqual(['start']);
  });

  it("a start handle refused by its own Field arms nothing, even though 'end' would allow it (#142)", () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const commit = vi.fn(() => Promise.resolve(true));
    const { ctx, proposals } = makeContext({
      hitTest: () => ({ kind: 'bar' as const, barId: barId(A), edge: 'start' }),
      can: (capability, _entry, edge) =>
        capability === 'select' || (capability === 'resize' && edge === 'end'),
      commit,
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1)); // start is refused: falls back to a click
    pane.dispatchEvent(up(0));

    expect(commit).not.toHaveBeenCalled();
    expect(proposals).toEqual([[A]]);
  });
});

// Retired (ADR 0026, #421): this describe block used to be 'segments and visible row order' — a
// core Entry could grab a middle Segment's bar, and clicking it selected that one Segment, not
// Segment 0. A core Entry now always draws exactly one Bar over its own span, so there is no
// per-part identity left to select; only a plugin variant may still hand out several `partIndex`
// values for one Entry (`layout/frame-layout.test.ts`'s "plugin variant" test), and grabbing any
// one of its Bars must still arm — and select — the one Entry underneath, never a part of it. The
// two tests below are kept, rewritten against that surviving question.
describe('attachEntryGestures — multi-part bars and visible row order (S4.10)', () => {
  it('[S4-A4] arms the Entry when a bar with a non-zero partIndex is grabbed, never a part of it (#200)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    mockPointerCapture(pane);
    const middle = barId(A, 1);
    const grabbedIds: EntryId[] = [];
    const { ctx } = makeContext({
      hitTest: () => ({ kind: 'bar' as const, barId: middle }),
      session: (grabbed) => {
        grabbedIds.push(grabbed);
        return {
          preview: () => {},
          commit: () => Promise.resolve(true),
          nudge: () => Promise.resolve(true),
          cancel: () => {},
        };
      },
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(DRAG_THRESHOLD_PX + 1));

    // The grabbed bar carries partIndex 1; what arms is the Entry the Selection names.
    expect(partIndexOfBar(middle)).toBe(1);
    expect(grabbedIds).toEqual([A]);
  });

  it('plain click on a bar with a non-zero partIndex selects its Entry, not a per-part id (#212)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const middle = barId(A, 1);
    const { ctx, proposals } = makeContext({
      hitTest: () => ({ kind: 'bar' as const, barId: middle }),
    });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(1000)); // hit resolves to A's bar at partIndex 1

    expect(proposals).toEqual([[A]]);
  });

  it('shift-click ranges over selectableEntriesInRowOrder, skipping rows not shown', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const rowLayer = document.createElement('div');
    const visible: readonly EntryId[] = [B, C];
    const { ctx, proposals } = makeContext({ selection: { selectableEntriesInRowOrder: () => visible } });
    attachEntryGestures(pane, rowLayer, container, ctx);

    pane.dispatchEvent(up(1)); // select B
    pane.dispatchEvent(up(2, { shiftKey: true })); // range to C

    expect(proposals).toEqual([[B], [B, C]]);
  });
});
