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

/** Every refusal the user can see, with the words the user reads. One table, because the wording is
 *  user-visible and belongs in one place — the four `return` sites below decide *which* refusal
 *  applies, never *how it reads* (review SP1).
 *
 *  Which refusals speak, and which stay silent, is stated once in `s5.8-inline-editing.md` §1:
 *  a cell that offers no editor at all refuses silently, and a cell that offers one but cannot open
 *  it here names the reason. */
const REFUSAL_TEXT = {
  derivedValue: 'this value comes from the rows below it; edit a child row instead',
  noParseValue: 'this field has no parseValue; the default editor cannot read the text back',
  noDateValue: 'this field holds no date yet; the default date editor needs one',
  timeOfDay: 'this field carries a time of day; the default date editor cannot show it',
  unsavedValue: 'another cell still holds a value that did not save; fix it or press Escape',
} as const;

/** Why the editor refused a cell that does offer one. The key is the machine-readable half — it goes
 *  on the notice's own `data-reason` — and `REFUSAL_TEXT` holds the half the user reads. */
export type CellEditorRefusal = keyof typeof REFUSAL_TEXT;

/** Puts `element` exactly over `cell`'s own rect — no flip and no clamp, unlike `Popup`. An editor
 *  and a refusal notice both sit exactly where the cell already is, so both position through this. */
function positionOver(element: HTMLElement, cell: HTMLElement, bounds: DOMRect): void {
  const rect = cell.getBoundingClientRect();
  element.style.transform = `translate(${(rect.left - bounds.left).toFixed(2)}px, ${(rect.top - bounds.top).toFixed(2)}px)`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
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

  #positionOver(cell: HTMLElement): void {
    positionOver(this.#wrapper, cell, this.#ports.dom.bounds);
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

/** The refusal notice paints itself, because it is the one thing this plugin mounts that carries no
 *  `.fg-cell-editor-control`. It reads only published level-1 tokens, and it falls back to a sane
 *  value for each, so a consumer stylesheet that sets none of them still gets a legible box.
 *  `pointer-events: none` is the load-bearing line: the notice sits over the cell, and the next
 *  double-click must reach the cell, not the notice. */
function paintRefusal(element: HTMLElement): void {
  const style = element.style;
  style.pointerEvents = 'none';
  style.display = 'flex';
  style.alignItems = 'center';
  style.overflow = 'hidden';
  style.whiteSpace = 'nowrap';
  style.textOverflow = 'ellipsis';
  style.paddingInline = 'var(--fg-cell-padding-inline, 8px)';
  style.border = '1px solid var(--fg-warn, #D97706)';
  style.background = 'var(--fg-pane-bg, #FAFAF7)';
  style.color = 'var(--fg-warn, #D97706)';
  style.font = 'inherit';
}

/** One mounted refusal, dismissed exactly once. */
export interface RefusalNotice {
  readonly element: HTMLElement;
  dismiss(): void;
}

/** What a refusal notice borrows — the same three members a `CellEditorSession` borrows for the same
 *  three jobs, so a test drives a notice with no mounted Gantt. */
export type RefusalNoticePorts = Pick<CellEditorPorts, 'overlay' | 'dom' | 'bindEscape'>;

/** Puts the refusal where the user acted: over the cell, in the same `data-state="invalid"` a refused
 *  commit already uses (D-S5-19, issue #137 F11/F12). It is a notice, not an editor — it mounts no
 *  control and it takes no focus, so it never becomes a sixth thing the user must close.
 *
 *  `role="status"` is the strongest thing a plugin can say on its own node today. S5.11 owes the
 *  real announcement, through the per-Gantt polite live region D-S5-27 adds. */
export function presentRefusal(
  ports: RefusalNoticePorts,
  cell: HTMLElement,
  reason: CellEditorRefusal,
): RefusalNotice {
  const element = document.createElement('div');
  element.className = EDITOR_CLASS;
  element.dataset['state'] = 'invalid';
  element.dataset['reason'] = reason;
  const text = REFUSAL_TEXT[reason];
  element.textContent = text;
  // A cell is often narrower than the sentence, so the same words are the hover text too.
  element.title = text;
  element.setAttribute('role', 'status');
  paintRefusal(element);
  positionOver(element, cell, ports.dom.bounds);

  const handle = ports.overlay.present(element);
  const detachers: Disposer[] = [ports.overlay.onResize(() => positionOver(element, cell, ports.dom.bounds))];
  let open = true;
  const notice: RefusalNotice = {
    element,
    dismiss(): void {
      if (!open) return;
      open = false;
      for (let i = detachers.length - 1; i >= 0; i--) detachers[i]!();
      handle.detach();
    },
  };
  detachers.push(ports.bindEscape(() => notice.dismiss()));
  return notice;
}

/** D-S5-19/D-S5-20: a cost cell edits in place, in one transaction, and a consumer replaces the whole
 *  editor through `beforeEntryEdit` (`[S5-A5]`). Call: `new Gantt({ plugins: [inlineEditing()] })`. */
export function inlineEditing(options: InlineEditingOptions = {}): GanttPlugin {
  return {
    id: 'freegantt.inlineEditing',
    setup(ctx: PluginContext) {
      let session: CellEditorSession | undefined;
      let notice: RefusalNotice | undefined;
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

      /** The one place a refusal becomes something the user can see (review SP1). Every refusal of a
       *  cell that *does* offer an editor goes through here, so no two of them look alike. */
      function refuse(cell: HTMLElement, reason: CellEditorRefusal): void {
        dismissRefusal();
        notice = presentRefusal(ports, cell, reason);
      }

      /** A notice answers one action, so the next action clears it. */
      function dismissRefusal(): void {
        notice?.dismiss();
        notice = undefined;
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
        dismissRefusal();
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
          // The notice does not follow a scroll — it answers one action, and the scroll is the next
          // action. The editor follows its own cell instead, until that cell leaves the frame.
          dismissRefusal();
          const current = session;
          if (current && !current.stillAnchored()) closeSession('revert');
        },
        { capture: true },
      );

      // A pointer press anywhere in this Gantt is the user's next action, so it clears the notice.
      // `pointerdown` runs before the `dblclick` below, so a second double-click on a refused cell
      // clears the old notice and then presents the new one.
      ctx.view.onDomEvent('pointerdown', () => {
        dismissRefusal();
      });

      /** The text a generic editor opens with. A Field that declares `parseValue` owns both
       *  directions of its own text, so the seed is the string the grid already painted — the user
       *  edits what they see, and `parseValue` reads it back. A Field without one stores a
       *  primitive, so the stored value is the text. Anything else opens empty. */
      function seedText(field: Field, fieldValue: unknown, cell: HTMLElement): string {
        if (field.parseValue !== undefined) return ctx.view.dom.cellText(cell);
        if (typeof fieldValue === 'string') return fieldValue;
        if (typeof fieldValue === 'number' || typeof fieldValue === 'boolean') return String(fieldValue);
        return '';
      }

      function openGeneric(entry: Entry, field: Field, cell: HTMLElement): void {
        const fieldValue = ctx.dataset.entries.fieldValue(entry.id, field.key);
        const input = document.createElement('input');
        input.type = field.inputType ?? 'text';
        input.value = seedText(field, fieldValue, cell);

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
        if (raw === undefined) {
          // A date control needs a date to seed. Nothing here is broken, so the cell says so rather
          // than looking like a dead double-click (review SP1).
          refuse(cell, 'noDateValue');
          return;
        }
        const factory = options.dateInput;
        let dateInput: DateInput;
        if (factory !== undefined) {
          dateInput = factory({ zone: ctx.dataset.timeZone, locale: ctx.gantt.locale });
        } else {
          // Issue #137 F11: the default `<input type="date">` has no time-of-day control. An
          // Instant that is not local midnight would silently round-trip to midnight on an
          // unchanged Enter — refuse to open the *default* editor rather than lose data. A
          // consumer's own `dateInput` factory (a `datetime-local` control, say) owns this instead.
          if (ctx.dataset.time.startOfDay(raw) !== raw) {
            refuse(cell, 'timeOfDay');
            return;
          }
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
        dismissRefusal();
        // The next two refusals stay silent by decision (`s5.8-inline-editing.md` §1, "Which
        // refusals speak"). Neither cell offers an editor at all, and I14 already hides the
        // affordance from the same resolution that refuses the gesture — there is nothing to
        // explain. Every refusal below them is about a cell that *does* offer an editor, so each
        // one names itself.
        if (!ctx.interaction.canEdit(entry)) return;
        if (ctx.view.isColumnEditable(field.key) !== true) return;
        if (ctx.dataset.isRollUpKind(entry.kind) && field.rollUp !== undefined) {
          refuse(cell, 'derivedValue');
          return;
        }
        const date = isDateField(field);
        if (!date && !canOpenGeneric(field)) {
          refuse(cell, 'noParseValue');
          return;
        }

        // An open editor whose value the Field refuses declines to close. A second editor mounted
        // over it would orphan the first one, its listeners and its focus trap included (review C2).
        // The refusal lands on the cell the user asked for, and names the cell they must fix first.
        if (!closeSession('commit')) {
          refuse(cell, 'unsavedValue');
          return;
        }

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
        dismissRefusal();
        closeSession('revert');
        ctx.dataset.off('change', onDatasetChange);
        disposeEnter();
      };
    },
  };
}
