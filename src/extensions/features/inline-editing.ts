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
import type { EntryFieldEdit, GanttDom, Overlay, OverlayHandle } from '../../api/plugin.js';
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

/** The two classes this plugin writes, and `view/styles.ts` styles. The session dresses the wrapper
 *  and the control, so no control factory has to remember to. */
const EDITOR_CLASS = 'fg-cell-editor';
const EDITOR_CONTROL_CLASS = 'fg-cell-editor-control';

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

/** Which cell one editor edits. Not the cell node: virtualization recycles that node, so the session
 *  asks `ctx.view.dom.cellFor(entryId, field)` for it again on every reposition. */
export interface EditedCell {
  readonly entryId: EntryId;
  readonly field: FieldKey;
}

/** What a `CellEditorSession` borrows from the plugin that owns it — the same "this module borrows
 *  the machinery" idiom `view/column-chrome.ts` names `ColumnChromePorts`. A test builds these from
 *  plain objects, so a session runs with no mounted Gantt. */
export interface CellEditorPorts {
  /** The layer the editor mounts into (D-S5-8), and the resize it repositions on. */
  readonly overlay: Pick<Overlay, 'present' | 'onResize'>;
  /** Where the edited cell is now (`cellFor`), and the rect the wrapper's transform is relative to
   *  (`bounds`). One seam answers both, so "is my editor still anchored?" and "where do I move it?"
   *  are one question with one answer (review A3). */
  readonly dom: Pick<GanttDom, 'bounds' | 'cellFor'>;
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
    this.#control = control;
    this.#wrapper = document.createElement('div');
    this.#wrapper.className = EDITOR_CLASS;
    // One place dresses the control, whichever control it is — the default `<input>`, the default
    // date input, or a consumer's own from the `dateInput` factory (D-S5-20).
    control.element.classList.add(EDITOR_CONTROL_CLASS);
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
   *  change, say), so this asks for the cell again. It never reuses the node `mount` received:
   *  virtualization can recycle that node while the editor is open. */
  reposition(): void {
    const cell = this.#currentCell();
    if (cell) this.#positionOver(cell);
  }

  /** Whether this editor's own cell is still on screen (issue #137 F10). It goes false once
   *  virtualization scrolls the row away, or recycles it for another entry — `cellFor` answers for
   *  this entry and this Field, so a recycled node stops matching. */
  stillAnchored(): boolean {
    return this.#currentCell() !== undefined;
  }

  #currentCell(): HTMLElement | undefined {
    return this.#ports.dom.cellFor(this.entryId, this.field);
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
    const bounds = this.#ports.dom.bounds;
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
        dom: ctx.view.dom,
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
          ctx.interaction.announceEntryEdit(payload);
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

      /** Issue #137 F1: the anchor cell disappears (removed, or virtualized out of frame) — close
       *  without committing. Checked on every scroll of this Gantt's own panes, and on every Dataset
       *  change just above. Capture phase, because `scroll` does not bubble. Review A4: this
       *  listener was the one of the twelve with no "is this my Gantt?" guard at all — a scroll in a
       *  second Gantt used to reach it. `ctx.view.onDomEvent` answers that once, for every plugin. */
      ctx.view.onDomEvent(
        'scroll',
        () => {
          const current = session;
          if (current && !current.stillAnchored()) closeSession('revert');
        },
        { capture: true },
      );

      function openGeneric(entry: Entry, field: Field, cell: HTMLElement): void {
        const raw = ctx.dataset.entries.fieldValue(entry.id, field.key);
        const input = document.createElement('input');
        input.type = field.inputType ?? 'text';
        input.value =
          field.parseValue !== undefined
            ? ctx.view.dom.cellText(cell)
            : typeof raw === 'string'
              ? raw
              : typeof raw === 'number' || typeof raw === 'boolean'
                ? String(raw)
                : '';

        mountSession(
          cell,
          { entryId: entry.id, field: field.key },
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

      function openDate(entry: Entry, field: Field, cell: HTMLElement): void {
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

        mountSession(
          cell,
          { entryId: entry.id, field: field.key },
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

      /** D-S5-19: the veto question fires *before the editor opens*, not before the write — a
       *  consumer's `beforeEntryEdit` handler opens its own dialog and returns `false` to suppress
       *  the built-in editor entirely (U8). */
      function openFor(entry: Entry, field: Field, cell: HTMLElement): void {
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
        const result = ctx.interaction.proposeEntryEdit(payload);
        const openNow = (): void => {
          if (date) openDate(entry, field, cell);
          else openGeneric(entry, field, cell);
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

      // Review A4: `ctx.view.onDomEvent` scopes this to this Gantt (I2) and resolves the node, so
      // the whole "which cell, which entry, which Field" walk is one answer instead of four
      // hand-written `.fg-*` lookups.
      ctx.view.onDomEvent('dblclick', (_event, target) => {
        if (target?.kind !== 'cell') return;
        const { entry, field: fieldKey } = target;
        if (entry === undefined || fieldKey === undefined) return;
        const field = ctx.dataset.field(fieldKey);
        if (field === undefined) return;
        openFor(entry, field, target.element);
      });

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
          const cell = ctx.view.dom.cellFor(entryId, fieldKey);
          if (cell === undefined) continue;
          const field = ctx.dataset.field(fieldKey);
          if (field === undefined) continue;
          openFor(entry, field, cell);
          return;
        }
      });

      // The two `onDomEvent` listeners above remove themselves through `ctx.disposables`, which
      // runs ahead of this disposer (S5.1, D-S5-3).
      return () => {
        closeSession('revert');
        ctx.dataset.off('change', onDatasetChange);
        disposeEnter();
      };
    },
  };
}
