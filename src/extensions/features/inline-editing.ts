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
// menu); this file owns a live control end-to-end instead, mounted through the same `Overlay` layer
// (`ctx.view.overlay.present`) so it never becomes a child of a recycled grid-row/cell node (those
// are `render/dom`'s own reconciled DOM — writing into one directly would corrupt its own patch
// assumptions, e.g. `cellSpec.patch`'s `node.lastElementChild` reads).
//
// One open editor is one `CellEditorSession`. The session owns the mount, the position, the commit
// rules and its own teardown. The plugin below owns whether an editor is open at all. `commit()`
// answers whether it closed, so no flag records that twice.

import type { GanttPlugin, PluginContext } from '../../api/gantt.js';
import type { EntryFieldEdit, Overlay, OverlayHandle } from '../../api/plugin.js';
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

/** `field`'s own cell inside one already-found row — the lookup an open editor repeats on every
 *  reposition, because virtualization recycles cell nodes. The row is the whole scope: it already
 *  answers "which entry" and "which Gantt" (I2), so this asks neither again. `CSS.escape` guards a
 *  field key that holds a quote or another selector-special character. */
function findCellInRow(row: HTMLElement, field: FieldKey): HTMLElement | undefined {
  return row.querySelector<HTMLElement>(`[data-field="${CSS.escape(String(field))}"]`) ?? undefined;
}

/** The same cell, for a keyboard opener with no DOM node to start from (`onDblClick` scopes through
 *  `ctx.view.overlay.contains(event.target)` instead) — `entryId` alone is not enough to scope by
 *  when two Gantts share entry ids (I2), so this walks every `.fg-row` match in the document and
 *  keeps the one this Gantt's own overlay actually contains. `undefined` when the row is not in the
 *  current virtualized frame (nothing to anchor a keyboard-opened editor to). */
function findOwnCell(overlay: Overlay, entryId: EntryId, field: FieldKey): HTMLElement | undefined {
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>(`.fg-row[data-entry-id="${CSS.escape(entryId)}"]`),
  );
  for (const row of rows) {
    if (!overlay.contains(row)) continue;
    const cell = findCellInRow(row, field);
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

/** What the user typed, read back through the control's own rules. `ok: false` means the control
 *  makes no value from what is there now — a `parseValue` that refused, or an empty date. */
export type CellEditorValue = { ok: true; value: unknown } | { ok: false };

/** The live control one session drives: a plain `<input>` (`openGeneric`) or a `DateInput`
 *  (`openDate`). The control owns the value and the "the user is done" triggers. The session owns
 *  everything else — the mount, the position, the write, and the teardown. */
export interface CellEditorControl {
  /** The node the session mounts, and the node focus returns to after a refused commit. */
  readonly element: HTMLElement;
  read(): CellEditorValue;
  /** Binds whatever "done" means for this control. Returns its own removal. */
  bindCommitTriggers(fire: () => void): Disposer;
  /** Runs once, when the session closes. */
  onClosed?: () => void;
}

/** Which cell one editor edits. `row` is the DOM scope, not the cell node: the session re-finds the
 *  cell inside the row on every reposition (`findCellInRow`). */
export interface EditedCell {
  readonly entryId: EntryId;
  readonly field: FieldKey;
  readonly row: HTMLElement;
}

/** What a `CellEditorSession` borrows from the plugin that owns it — the same "this module borrows
 *  the machinery" idiom `view/column-chrome.ts` names `ColumnChromePorts`. A test builds these from
 *  plain objects, so a session runs with no mounted Gantt. */
export interface CellEditorPorts {
  /** The layer the editor mounts into, and the rect its transform is relative to (D-S5-8). */
  readonly overlay: Pick<Overlay, 'present' | 'bounds' | 'onResize'>;
  /** Binds Escape for as long as this editor is open. The plugin routes it through the shared
   *  Keymap, so the newest handler wins (D-S5-9). */
  bindEscape(onEscape: () => void): Disposer;
  /** The stored entry, re-read at commit time — the session keeps no copy of it. */
  entryById(id: EntryId): Entry | undefined;
  /** The stored value of one field, for the `from` and the `to` of `entryEdit`. */
  storedValue(id: EntryId, field: FieldKey): unknown;
  /** One `entries.update` call: one transaction, one changeset, one undo step (I6). It throws
   *  `MutationCancelledError` on a `beforeChange` veto, and `EntryNotFoundError` when the entry went
   *  away (`plans/02` §7). The session answers both. */
  writeValue(id: EntryId, field: FieldKey, value: unknown): void;
  /** Raises `entryEdit` after the write (D-S5-19). */
  announceEntryEdit(payload: EntryFieldEdit): void;
  /** The session asks its owner to close it. The owner decides, and drops its own reference, so one
   *  place alone knows whether an editor is open. */
  requestCommit(): void;
  requestRevert(): void;
}

/** One open cell editor: mounted over its cell, bound to its own triggers, closed exactly once.
 *
 *  `commit()` answers whether it closed. A refused commit keeps the editor open in the invalid
 *  state, and the owner reads that answer instead of a flag both sides write (review C2/C2b). */
export class CellEditorSession {
  readonly entryId: EntryId;
  readonly field: FieldKey;
  readonly #ports: CellEditorPorts;
  readonly #row: HTMLElement;
  readonly #control: CellEditorControl;
  readonly #wrapper: HTMLElement;
  readonly #detachers: Disposer[] = [];
  #handle: OverlayHandle | undefined;
  #focusTrap: FocusTrap | undefined;
  /** `#close()` alone writes this, and `commit()`/`revert()` read it. It records this one session's
   *  lifetime, so a re-entrant close (a `change` handler that removes the entry while `commit()`
   *  still writes) never tears the same editor down twice. */
  #open = false;

  constructor(ports: CellEditorPorts, edited: EditedCell, control: CellEditorControl) {
    this.#ports = ports;
    this.entryId = edited.entryId;
    this.field = edited.field;
    this.#row = edited.row;
    this.#control = control;
    this.#wrapper = document.createElement('div');
    this.#wrapper.className = 'fg-cell-editor';
    this.#wrapper.append(control.element);
  }

  /** The presented editor element, for a caller that inspects or styles it. */
  get element(): HTMLElement {
    return this.#wrapper;
  }

  /** Presents the editor over `cell`, binds every trigger, and moves focus into the control. */
  mount(cell: HTMLElement): void {
    this.#open = true;
    this.#handle = this.#ports.overlay.present(this.#wrapper);
    this.#positionOver(cell);
    this.#detachers.push(this.#ports.overlay.onResize(() => this.reposition()));
    this.#detachers.push(this.#ports.bindEscape(() => this.#ports.requestRevert()));
    this.#detachers.push(this.#control.bindCommitTriggers(() => this.#ports.requestCommit()));
    this.#wrapper.addEventListener('focusout', this.#onFocusOut);
    this.#focusTrap = activateFocusTrap(this.#wrapper);
    this.#control.element.focus();
  }

  /** Writes what the control holds, then closes. It answers `false` — and stays open in the invalid
   *  state, with focus on the control — when the control reads no value, or when `beforeChange`
   *  vetoes the changeset. Those are D-S5-19's two refusals. */
  commit(): boolean {
    if (!this.#open) return true;
    const entry = this.#ports.entryById(this.entryId);
    if (entry === undefined) {
      // The entry went away while the editor was open. Nothing is left to write to, and a value
      // typed against a gone entry is not a value the consumer asked for (issue #137 F10).
      this.#close();
      return true;
    }
    const value = this.#control.read();
    if (!value.ok) {
      this.#markInvalid();
      return false;
    }
    const from = this.#ports.storedValue(this.entryId, this.field);
    try {
      this.#ports.writeValue(this.entryId, this.field, value.value);
    } catch (error) {
      if (error instanceof MutationCancelledError) {
        this.#markInvalid();
        return false;
      }
      if (error instanceof EntryNotFoundError) {
        // Another call removed the entry after the read above, and before this write. The user's own
        // edit is moot now, so this closes and reports no error (issue #137 F10).
        this.#close();
        return true;
      }
      throw error;
    }
    const to = this.#ports.storedValue(this.entryId, this.field);
    this.#ports.announceEntryEdit({ entry, field: this.field, from, to });
    this.#close();
    return true;
  }

  /** Closes and writes nothing — Escape's answer, and the answer to an anchor that went away. */
  revert(): void {
    this.#close();
  }

  /** Follows the cell after a container resize. A resize can also bring a reflow (a column width
   *  change, say), so this re-finds the cell in the row. It never reuses the node `mount` received:
   *  virtualization can recycle that node while the editor is open. */
  reposition(): void {
    const cell = findCellInRow(this.#row, this.field);
    if (cell) this.#positionOver(cell);
  }

  /** Whether this editor's row is still on screen, and still this entry's own row. It goes false
   *  once virtualization recycles the row for another entry (issue #137 F10). */
  stillAnchored(): boolean {
    return this.#row.isConnected && entryIdOfRow(this.#row) === this.entryId;
  }

  readonly #onFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && this.#wrapper.contains(next)) return;
    this.#ports.requestCommit();
  };

  /** Puts the wrapper over `cell`'s own rect — no flip and no clamp, unlike `Popup`. A cell editor
   *  always sits exactly where the cell already is. */
  #positionOver(cell: HTMLElement): void {
    const rect = cell.getBoundingClientRect();
    const bounds = this.#ports.overlay.bounds;
    this.#wrapper.style.transform = `translate(${(rect.left - bounds.left).toFixed(2)}px, ${(rect.top - bounds.top).toFixed(2)}px)`;
    this.#wrapper.style.width = `${rect.width}px`;
    this.#wrapper.style.height = `${rect.height}px`;
  }

  /** The one "this did not save" signal (D-S5-19). The editor stays open, the state names the
   *  refusal, and focus goes back to the control. */
  #markInvalid(): void {
    this.#wrapper.dataset['state'] = 'invalid';
    this.#control.element.focus();
  }

  /** Detaches the listeners first. The focus restore the trap runs can otherwise fire a `focusout`
   *  commit into a half-closed editor. Runs once. */
  #close(): void {
    if (!this.#open) return;
    this.#open = false;
    for (let i = this.#detachers.length - 1; i >= 0; i--) this.#detachers[i]!();
    this.#detachers.length = 0;
    this.#wrapper.removeEventListener('focusout', this.#onFocusOut);
    this.#control.onClosed?.();
    this.#focusTrap?.deactivate();
    this.#handle?.detach();
  }
}

/** D-S5-19/D-S5-20: a cost cell edits in place, in one transaction, and a consumer replaces the whole
 *  editor through `beforeEntryEdit` (`[S5-A5]`). Call: `new Gantt({ plugins: [inlineEditing()] })`. */
export function inlineEditing(options: InlineEditingOptions = {}): GanttPlugin {
  return {
    id: 'freegantt.inlineEditing',
    setup(ctx: PluginContext) {
      let session: CellEditorSession | undefined;
      // Bumped on every `openFor` call, captured locally by that call's own async veto continuation —
      // a stale continuation (an *older* `openFor` whose `beforeEntryEdit` promise resolves after a
      // *newer* `openFor` has already run) checks this before mounting, so it cannot mount a second,
      // orphaned session over the newer one with no teardown of either.
      let openRequestId = 0;

      /** Closes whatever is open, and answers whether it closed. A commit declines on an unreadable
       *  value, and on a `beforeChange` veto — the editor stays open then, and the caller must not
       *  open a second one over it (review C2). A revert always closes. */
      function closeSession(action: 'commit' | 'revert'): boolean {
        const current = session;
        if (!current) return true;
        if (action === 'revert') {
          current.revert();
          session = undefined;
          return true;
        }
        const closed = current.commit();
        if (closed) session = undefined;
        return closed;
      }

      const ports: CellEditorPorts = {
        overlay: ctx.view.overlay,
        bindEscape: (onEscape) =>
          ctx.interaction.registerKeyHandler(
            'Escape',
            (event) => {
              event.stopPropagation();
              onEscape();
            },
            { captureInEditable: true },
          ),
        entryById: (id) => ctx.dataset.entries.get(id),
        storedValue: (id, field) => ctx.dataset.entries.fieldValue(id, field),
        writeValue: (id, field, value) => {
          ctx.dataset.entries.update(id, { [field]: value });
        },
        announceEntryEdit: (payload) => {
          ctx.interaction.emitEntryEdit(payload);
        },
        requestCommit: () => {
          closeSession('commit');
        },
        requestRevert: () => {
          closeSession('revert');
        },
      };

      function onDatasetChange(): void {
        const current = session;
        if (current && !ctx.dataset.entries.has(current.entryId)) closeSession('revert');
      }
      ctx.dataset.on('change', onDatasetChange);

      /** Issue #137 F1: the anchor entry disappears (removed, or virtualized out of frame) — close
       *  without committing. Checked on every scroll (capture-phase `document`, the same reach
       *  `Popup`'s own scroll dismissal uses — pane elements are not otherwise addressable from
       *  `extensions/`), and on every Dataset change just above. */
      function onScroll(): void {
        const current = session;
        if (current && !current.stillAnchored()) closeSession('revert');
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

        mountSession(
          cell,
          { entryId: entry.id, field: field.key, row },
          {
            element: input,
            read: (): CellEditorValue => {
              if (field.parseValue !== undefined) {
                const value = field.parseValue(input.value, fieldContextFor(ctx));
                return value === undefined ? { ok: false } : { ok: true, value };
              }
              return { ok: true, value: input.value };
            },
            bindCommitTriggers: (fire) => {
              const onKeydown = (event: KeyboardEvent): void => {
                if (event.key === 'Enter') fire();
              };
              input.addEventListener('keydown', onKeydown);
              return () => input.removeEventListener('keydown', onKeydown);
            },
          },
        );
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

        mountSession(
          cell,
          { entryId: entry.id, field: field.key, row },
          {
            element: dateInput.element,
            read: (): CellEditorValue => {
              const value = dateInput.read();
              return value === undefined ? { ok: false } : { ok: true, value };
            },
            bindCommitTriggers: (fire) => dateInput.onCommit(fire),
            onClosed: () => dateInput.destroy(),
          },
        );
      }

      function mountSession(cell: HTMLElement, edited: EditedCell, control: CellEditorControl): void {
        const opened = new CellEditorSession(ports, edited, control);
        opened.mount(cell);
        session = opened;
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

        // An open editor whose value the Field refuses declines to close. A second editor mounted
        // over it would orphan the first one, its listeners and its focus trap included (review C2).
        if (!closeSession('commit')) return;

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
        closeSession('revert');
        document.removeEventListener('dblclick', onDblClick);
        document.removeEventListener('scroll', onScroll, true);
        ctx.dataset.off('change', onDatasetChange);
        disposeEnter();
      };
    },
  };
}
