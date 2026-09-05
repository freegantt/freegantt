// extensions/features/ — the inline cell editor (S5.8, D-S5-19/D-S5-20). An ordinary `GanttPlugin`,
// confined by the `extensions-public-only` rule (D-S5-5) to `api/`/`model/` imports, same as
// `tooltips()`/`contextMenu()`. Every import below names its own narrow source file, never the
// `api/index.js` barrel (which itself re-exports `inlineEditing` — importing it back would close a
// cycle, `no-circular`), the same reason `context-menu.ts`/`popup.ts` do the same.
//
// Unlike `tooltips()`/`contextMenu()`, the editor does not build on `createPopup` (`extensions/
// popup.ts`): `Popup`'s `content` is a static `ElementDescription`, rendered once through the
// reconciler with no way to hand the caller back a live, listener-attachable node — exactly what an
// editable `<input>` needs. `Popup` stays the right primitive for declarative content (a tooltip, a
// menu); this file owns a live control end-to-end instead.
//
// It mounts through `ctx.view.rowLayer` (#158), not the `Overlay` a popup uses. A tooltip and a menu
// *dismiss* on scroll; an open editor must *follow* its cell, and the row layer is the element the
// pane's own scroll already moves — one transform per frame for the vertical axis (D-S1.8-1), native
// horizontal scrolling of the pane around it (D-S1.8-13). A sibling of the rows therefore travels
// with them, in the same frame, with no scroll listener re-measuring anything: repositioning an
// overlay from a `scroll` event runs a frame behind the paint it is chasing, which reads as jitter.
// The clip is a bonus — `.fg-rows-clip` keeps the editor inside the pane instead of over the
// timeline. Beside the rows, never inside one: a row and its cells are `render/dom`'s own reconciled
// DOM, and writing into those corrupts its patch assumptions (`cellSpec.patch`'s
// `node.lastElementChild` reads); `syncKeyed` leaves a foreign sibling of the rows alone.

import type { GanttPlugin, PluginContext } from '../../api/gantt.js';
import type { EntryFieldEdit, Overlay } from '../../api/plugin.js';
import { EntryNotFoundError, MutationCancelledError } from '../../model/index.js';
import type {
  CoreFieldValue,
  Disposer,
  Entry,
  EntryId,
  Field,
  FieldContext,
  FieldKey,
  Instant,
} from '../../model/index.js';
import { activateFocusTrap } from '../focus-trap.js';
import type { FocusTrap } from '../focus-trap.js';
import { createDefaultDateInput } from './date-input.js';
import type { DateInput, DateInputFactory } from './date-input.js';

export type { DateInput, DateInputFactory } from './date-input.js';

export interface InlineEditingOptions {
  /** Replaces the default `<input type="date">` factory (D-S5-20). */
  dateInput?: DateInputFactory;
}

/** S5.8, D-S5-20: `field.type === 'date'` routes through the `dateInput` seam. The two shipped core
 *  date Fields (`start`/`end`) never declare `type` themselves (`type` must name a registered
 *  `fieldTypes` bundle, and shipping one just to spell "date" would be a bigger, riskier change than
 *  this slice needs) — so this also matches those two keys by name. A consumer's own date-valued
 *  Field opts in with `type: 'date'` plus a matching `fieldTypes.date` bundle (even an empty one). */
function isDateField(field: Field): boolean {
  return field.type === 'date' || field.key === 'start' || field.key === 'end';
}

/** Issue #137 F12: with no `parseValue`, only `type: 'text'` (or no `type` at all — a plain meta
 *  Field like the harness's `team`) reads and writes the raw string. Any other named `type` refuses
 *  to open rather than guess a parse. */
function canOpenGeneric(field: Field): boolean {
  return field.parseValue !== undefined || field.type === undefined || field.type === 'text';
}

function cellUnder(node: Node): HTMLElement | undefined {
  const el = node instanceof Element ? node.closest<HTMLElement>('.fg-row-cell, .fg-row-label') : null;
  return el ?? undefined;
}

function rowUnder(node: Node): HTMLElement | undefined {
  const el = node instanceof Element ? node.closest<HTMLElement>('.fg-row') : null;
  return el ?? undefined;
}

function fieldOfCell(cell: HTMLElement): FieldKey | undefined {
  return cell.dataset['field'];
}

function entryIdOfRow(row: HTMLElement): EntryId | undefined {
  const id = row.dataset['entryId'];
  return id === undefined ? undefined : (id as EntryId);
}

/** The `field` cell inside `row`, and only while `row` still paints `entryId` — virtualization
 *  recycles a row node onto another entry, and that node's cells then belong to that entry, not to
 *  this session. `undefined` says "nothing here to anchor to", never "here is the wrong cell".
 *  `CSS.escape` guards a field name containing a quote or other selector-special character. */
function cellInRow(row: HTMLElement, entryId: EntryId, field: FieldKey): HTMLElement | undefined {
  if (entryIdOfRow(row) !== entryId) return undefined;
  return row.querySelector<HTMLElement>(`[data-field="${CSS.escape(String(field))}"]`) ?? undefined;
}

/** The same lookup for a keyboard opener with no DOM node to start from (`onDblClick`
 *  scopes through `ctx.view.overlay.contains(event.target)` instead) — `entryId` alone is not enough
 *  to scope by when two Gantts share entry ids (I2), so this walks every `.fg-row` match in the
 *  document and keeps the one this Gantt's own overlay actually contains. */
function findOwnCell(overlay: Overlay, entryId: EntryId, field: FieldKey): HTMLElement | undefined {
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>(`.fg-row[data-entry-id="${CSS.escape(entryId)}"]`),
  );
  for (const row of rows) {
    if (!overlay.contains(row)) continue;
    const cell = row.querySelector<HTMLElement>(`[data-field="${CSS.escape(String(field))}"]`);
    if (cell) return cell;
  }
  return undefined;
}

/** The already-rendered cell text — reused as the generic editor's seed value instead of recomputing
 *  a `FormatContext` here (`extensions/` cannot reach `view/grid-columns.ts`, D-S5-5), the same
 *  formatted string `field.formatValue` already produced for the grid paint. */
function cellDisplayText(cell: HTMLElement): string {
  return (cell.querySelector<HTMLElement>('.fg-row-label-text') ?? cell).textContent ?? '';
}

/** A real `FieldContext`, built from public reads alone — not a stub. A `parseValue` that reads a
 *  sibling field through `ctx.read` gets the true stored value (`entries.fieldValue`); `durationOf`
 *  goes through `dataset.time.diffDays` (I10: no arithmetic on an `Instant` outside `time/`) and
 *  approximates in whole days — a segmented entry's true duration is `layout/`'s own `durationOf`,
 *  not reachable from `extensions/`, and a `parseValue` calling this is expected to be rare. */
function fieldContextFor(ctx: PluginContext): FieldContext {
  return {
    timeZone: ctx.dataset.timeZone,
    read: <K extends FieldKey>(entry: Entry, key: K): CoreFieldValue<K> | undefined =>
      ctx.dataset.entries.fieldValue(entry.id, key),
    durationOf: (entry: Entry) => ({
      value: ctx.dataset.time.diffDays(entry.start, entry.end),
      unit: 'day',
    }),
  };
}

interface OpenSession {
  entryId: EntryId;
  field: FieldKey;
  row: HTMLElement;
  wrapper: HTMLElement;
  focusTrap: FocusTrap;
  /** Removes the editor from the row layer. */
  unmount: Disposer;
  detachListeners: () => void;
  /** Guards a native `change` and a `keydown` Enter both firing for one commit (`date-input.ts`'s
   *  own `onCommit` fires both), and a commit racing a revert. */
  settled: boolean;
  commit(): void;
  revert(): void;
  markInvalid(): void;
}

/** D-S5-19/D-S5-20: a cost cell edits in place, in one transaction, and a consumer replaces the whole
 *  editor through `beforeEntryEdit` (`[S5-A5]`). Call: `new Gantt({ plugins: [inlineEditing()] })`. */
export function inlineEditing(options: InlineEditingOptions = {}): GanttPlugin {
  return {
    id: 'freegantt.inlineEditing',
    setup(ctx: PluginContext) {
      let session: OpenSession | undefined;
      // Bumped on every `openFor` call, captured locally by that call's own async veto continuation —
      // a stale continuation (an *older* `openFor` whose `beforeEntryEdit` promise resolves after a
      // *newer* `openFor` has already run) checks this before mounting, so it cannot mount a second,
      // orphaned session over the newer one with no teardown of either.
      let openRequestId = 0;

      function closeSession(action: 'commit' | 'revert'): void {
        const current = session;
        if (!current || current.settled) return;
        current.settled = true;
        if (action === 'commit') current.commit();
        else current.revert();
      }

      function teardown(current: OpenSession): void {
        current.detachListeners();
        current.focusTrap.deactivate();
        current.unmount();
        session = undefined;
      }

      /** Places `wrapper` over `cell` in the row layer's own coordinates — no flip/clamp (unlike
       *  `Popup`): a cell editor always sits exactly where the cell already is. Both boxes move
       *  together from here on, so this runs on a real move (a reflow), never on a scroll. */
      function position(wrapper: HTMLElement, cell: HTMLElement): void {
        const rect = cell.getBoundingClientRect();
        const bounds = ctx.view.rowLayer.bounds;
        wrapper.style.transform = `translate(${(rect.left - bounds.left).toFixed(2)}px, ${(rect.top - bounds.top).toFixed(2)}px)`;
        wrapper.style.width = `${rect.width}px`;
        wrapper.style.height = `${rect.height}px`;
      }

      /** Issue #137 F1: the anchor entry disappears (removed, or virtualized out of frame) — close
       *  without committing. Checked on every Dataset change and on every scroll (capture-phase
       *  `document`, the same reach `Popup`'s own scroll dismissal uses — pane elements are not
       *  otherwise addressable from `extensions/`). */
      function stillAnchored(current: OpenSession): boolean {
        return current.row.isConnected && entryIdOfRow(current.row) === current.entryId;
      }

      function onDatasetChange(): void {
        const current = session;
        if (current && !ctx.dataset.entries.has(current.entryId)) closeSession('revert');
      }
      ctx.dataset.on('change', onDatasetChange);

      /** The editor rides the row layer's own scroll (#158), so a scroll never repositions anything.
       *  It still ends the session when the anchor leaves: virtualization recycles the row node onto
       *  another entry, and an editor over another entry's row would write to the wrong place. */
      function onScroll(): void {
        const current = session;
        if (current && !stillAnchored(current)) closeSession('revert');
      }
      document.addEventListener('scroll', onScroll, true);

      function openGeneric(entry: Entry, field: Field, cell: HTMLElement, row: HTMLElement): void {
        const raw = ctx.dataset.entries.fieldValue(entry.id, field.key);
        const input = document.createElement('input');
        input.type = field.inputType ?? 'text';
        input.className = 'fg-cell-editor-control';
        input.value =
          field.parseValue !== undefined
            ? cellDisplayText(cell)
            : typeof raw === 'string'
              ? raw
              : typeof raw === 'number' || typeof raw === 'boolean'
                ? String(raw)
                : '';

        const wrapper = document.createElement('div');
        wrapper.className = 'fg-cell-editor';
        wrapper.append(input);
        mountSession(entry.id, field.key, row, cell, wrapper, {
          read: (): { ok: true; value: unknown } | { ok: false } => {
            if (field.parseValue !== undefined) {
              const value = field.parseValue(input.value, fieldContextFor(ctx));
              return value === undefined ? { ok: false } : { ok: true, value };
            }
            return { ok: true, value: input.value };
          },
          focusTarget: input,
          bindCommitTriggers: (fire) => {
            const onKeydown = (event: KeyboardEvent): void => {
              if (event.key === 'Enter') fire();
            };
            input.addEventListener('keydown', onKeydown);
            return () => input.removeEventListener('keydown', onKeydown);
          },
        });
      }

      function openDate(entry: Entry, field: Field, cell: HTMLElement, row: HTMLElement): void {
        // `isDateField` already vouched for this Field's type; `fieldValue` types core keys only,
        // so a consumer-declared date Field reads back as `unknown` without this.
        const raw = ctx.dataset.entries.fieldValue(entry.id, field.key) as Instant | undefined;
        if (raw === undefined) return;
        const factory = options.dateInput;
        let dateInput: DateInput;
        if (factory !== undefined) {
          dateInput = factory({ zone: ctx.dataset.timeZone, locale: ctx.gantt.locale });
        } else {
          // Issue #137 F11: the default `<input type="date">` has no time-of-day control. An
          // Instant that is not local midnight would silently round-trip to midnight on an
          // unchanged Enter — refuse to open the *default* editor rather than lose data. A
          // consumer's own `dateInput` factory (a `datetime-local` control, say) owns this instead.
          if (ctx.dataset.time.startOfDay(raw) !== raw) return;
          dateInput = createDefaultDateInput(ctx.dataset.time);
        }
        dateInput.write(raw);
        dateInput.element.classList.add('fg-cell-editor-control');

        const wrapper = document.createElement('div');
        wrapper.className = 'fg-cell-editor';
        wrapper.append(dateInput.element);
        mountSession(entry.id, field.key, row, cell, wrapper, {
          read: (): { ok: true; value: unknown } | { ok: false } => {
            const value = dateInput.read();
            return value === undefined ? { ok: false } : { ok: true, value };
          },
          focusTarget: dateInput.element,
          bindCommitTriggers: (fire) => dateInput.onCommit(fire),
          onClosed: () => dateInput.destroy(),
        });
      }

      function mountSession(
        entryId: EntryId,
        field: FieldKey,
        row: HTMLElement,
        cell: HTMLElement,
        wrapper: HTMLElement,
        control: {
          read(): { ok: true; value: unknown } | { ok: false };
          focusTarget: HTMLElement;
          bindCommitTriggers(fire: () => void): () => void;
          onClosed?: () => void;
        },
      ): void {
        const unmount = ctx.view.rowLayer.present(wrapper);
        position(wrapper, cell);
        // The cell is re-found from `row` on every move, never the closed-over `cell`: virtualization
        // may have recycled that node onto another entry, and `cellInRow` returns nothing when it did.
        function reposition(): void {
          const current = cellInRow(row, entryId, field);
          if (current) position(wrapper, current);
        }
        // A resize can also come with a reflow (a column width change, say) that moves the cell.
        const detachResize = ctx.view.overlay.onResize(reposition);

        const detachEscape = ctx.interaction.registerKeyHandler(
          'Escape',
          (event) => {
            event.stopPropagation();
            closeSession('revert');
          },
          { captureInEditable: true },
        );

        function fire(): void {
          closeSession('commit');
        }
        const detachCommitTriggers = control.bindCommitTriggers(fire);

        function onFocusOut(event: FocusEvent): void {
          const next = event.relatedTarget;
          if (next instanceof Node && wrapper.contains(next)) return;
          closeSession('commit');
        }
        wrapper.addEventListener('focusout', onFocusOut);

        const focusTrap = activateFocusTrap(wrapper);
        control.focusTarget.focus();

        const current: OpenSession = {
          entryId,
          field,
          row,
          wrapper,
          focusTrap,
          unmount,
          detachListeners: () => {
            detachResize();
            detachEscape();
            detachCommitTriggers();
            wrapper.removeEventListener('focusout', onFocusOut);
            control.onClosed?.();
          },
          settled: false,
          revert(): void {
            teardown(this);
          },
          commit(): void {
            const entry = ctx.dataset.entries.get(entryId);
            if (entry === undefined) {
              teardown(this);
              return;
            }
            const result = control.read();
            if (!result.ok) {
              markInvalid(wrapper, control.focusTarget);
              this.settled = false;
              return;
            }
            const from = ctx.dataset.entries.fieldValue(entryId, field);
            try {
              ctx.dataset.entries.update(entryId, { [field]: result.value });
            } catch (error) {
              if (error instanceof MutationCancelledError) {
                markInvalid(wrapper, control.focusTarget);
                this.settled = false;
                return;
              }
              if (error instanceof EntryNotFoundError) {
                teardown(this);
                return;
              }
              throw error;
            }
            const to = ctx.dataset.entries.fieldValue(entryId, field);
            ctx.interaction.emitEntryEdit({ entry, field, from, to });
            teardown(this);
          },
          markInvalid(): void {
            markInvalid(wrapper, control.focusTarget);
          },
        };
        session = current;
      }

      function markInvalid(wrapper: HTMLElement, focusTarget: HTMLElement): void {
        wrapper.dataset['state'] = 'invalid';
        focusTarget.focus();
      }

      function entryForRow(row: HTMLElement): Entry | undefined {
        const id = entryIdOfRow(row);
        return id !== undefined ? ctx.dataset.entries.get(id) : undefined;
      }

      /** D-S5-19: the veto question fires *before the editor opens*, not before the write — a
       *  consumer's `beforeEntryEdit` handler opens its own dialog and returns `false` to suppress
       *  the built-in editor entirely (U8). */
      function openFor(entry: Entry, field: Field, cell: HTMLElement, row: HTMLElement): void {
        if (!ctx.interaction.canEdit(entry)) return;
        if (ctx.view.isColumnEditable(field.key) !== true) return;
        if (ctx.dataset.isRollUpKind(entry.kind) && field.rollUp !== undefined) return;
        const date = isDateField(field);
        if (!date && !canOpenGeneric(field)) return;

        if (session) closeSession('commit');

        const requestId = ++openRequestId;
        const currentValue = ctx.dataset.entries.fieldValue(entry.id, field.key);
        const payload: EntryFieldEdit = { entry, field: field.key, from: currentValue, to: currentValue };
        const result = ctx.interaction.emitBeforeEntryEdit(payload);
        const openNow = (): void => {
          if (date) openDate(entry, field, cell, row);
          else openGeneric(entry, field, cell, row);
        };
        if (result === false) return;
        if (result instanceof Promise) {
          void result.then((allowed) => {
            // A newer `openFor` ran while this veto was pending — that call has already closed
            // whatever was open and may have mounted its own session; this stale request must not
            // mount a second one over it (see `openRequestId`'s own doc comment).
            if (allowed !== false && requestId === openRequestId) openNow();
          });
          return;
        }
        openNow();
      }

      function onDblClick(event: MouseEvent): void {
        if (!(event.target instanceof Node) || !ctx.view.overlay.contains(event.target)) return;
        const cell = cellUnder(event.target);
        const row = cell ? rowUnder(cell) : undefined;
        if (!cell || !row) return;
        const fieldKey = fieldOfCell(cell);
        const entry = entryForRow(row);
        if (fieldKey === undefined || entry === undefined) return;
        const field = ctx.dataset.field(fieldKey);
        if (field === undefined) return;
        openFor(entry, field, cell, row);
      }
      document.addEventListener('dblclick', onDblClick);

      /** D-S3-13: `Enter` is reserved for opening the inline editor. With no established per-cell
       *  focus yet (S5.11 adds roving tabindex, D-S5-25), this opens the first `editable` column of
       *  the selected entry — a pragmatic simplification `s5.11-a11y-completion.md` supersedes. */
      const disposeEnter = ctx.interaction.registerKeyHandler('Enter', () => {
        const entryId = ctx.gantt.selectedIds[0];
        if (entryId === undefined) return;
        const entry = ctx.dataset.entries.get(entryId);
        if (entry === undefined) return;
        for (const column of ctx.gantt.gridColumns) {
          const fieldKey = typeof column === 'string' ? column : column.field;
          if (ctx.view.isColumnEditable(fieldKey) !== true) continue;
          const cell = findOwnCell(ctx.view.overlay, entryId, fieldKey);
          const row = cell ? rowUnder(cell) : undefined;
          if (!cell || !row) continue;
          const field = ctx.dataset.field(fieldKey);
          if (field === undefined) continue;
          openFor(entry, field, cell, row);
          return;
        }
      });

      return () => {
        if (session) closeSession('revert');
        document.removeEventListener('dblclick', onDblClick);
        document.removeEventListener('scroll', onScroll, true);
        ctx.dataset.off('change', onDatasetChange);
        disposeEnter();
      };
    },
  };
}
