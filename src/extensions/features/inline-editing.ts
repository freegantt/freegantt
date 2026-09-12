// extensions/features/ — the inline cell editor (S5.8, D-S5-19/D-S5-20). An ordinary `ChromePlugin`,
// confined by the `extensions-public-only` rule (D-S5-5) to `api/`/`model/` imports, same as
// `tooltips()`/`contextMenu()`. Every import below names its own narrow source file, never the
// `api/index.js` barrel. That barrel re-exports `inlineEditing` itself. Importing it back would
// close a cycle (`no-circular`). `context-menu.ts` and `popup.ts` do the same, for the same reason.
//
// Unlike `tooltips()`/`contextMenu()`, the editor does not build on `createPopup`
// (`extensions/popup.ts`). `Popup`'s `content` is a static `ElementDescription`, rendered once
// through the reconciler. It has no way to hand the caller back a live, listener-attachable node,
// which is exactly what an editable `<input>` needs.
//
// `Popup` stays the right primitive for declarative content, a tooltip or a menu. This file owns a
// live control end-to-end instead.
//
// It mounts through `ctx.view.rowLayer`, not the `overlay` a popup uses (#158). A tooltip and a menu
// *dismiss* on a scroll; an open editor must *follow* its cell. The row layer is the element the
// pane's own scroll already moves. That is one transform per frame for the vertical axis (D-S1.8-1),
// and native horizontal scrolling of the pane around it (D-S1.8-13). A sibling of the rows therefore
// travels with them, in the same frame, and nothing repositions it on a scroll. Repositioning an
// overlay from a `scroll` listener runs a frame behind the paint it chases, which reads as jitter. The clip is a
// bonus: `.fg-rows-clip` keeps the editor inside the pane instead of over the timeline.
//
// Beside the rows, never inside one. A row and its cells are `render/dom`'s own reconciled DOM, and
// writing into one would corrupt its patch assumptions — `cellSpec.patch`'s `node.lastElementChild`
// reads, for example. `syncKeyed` prunes only the keys it created, so it leaves a foreign sibling of
// the rows alone.
//
// One open editor is one `CellEditorSession`. The session owns the mount, the position, the commit
// rules and its own teardown. `commit()` answers whether it closed, so no flag records that twice.
//
// `CellEditing` owns what is mounted over a cell right now, and every transition between those
// states (#169). `inlineEditing()` below is then wiring: it resolves the target, applies the policy,
// asks the veto question, and delegates.

import type { ChromePlugin, PluginContext } from '../../api/gantt.js';
import type { EntryFieldEdit, GanttDom, MountLayer } from '../../api/plugin-context.js';
import { EntryNotFoundError, MutationCancelledError, UnreadableCellValueError } from '../../model/index.js';
import type {
  Disposer,
  Entry,
  EntryId,
  Field,
  FieldKey,
  Instant,
  PluginErrorReport,
} from '../../model/index.js';
import { DisposableStore } from '../disposables.js';
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
 *  date Fields (`start`/`end`) never declare `type` themselves. `type` must name a registered
 *  `fieldTypes` bundle, and shipping one just to spell "date" would be a bigger, riskier change
 *  than this slice needs. So this guard also matches those two keys by name. A consumer's own date-valued
 *  Field opts in with `type: 'date'` plus a matching `fieldTypes.date` bundle (even an empty one). */
function isDateField(field: Field): boolean {
  return field.type === 'date' || field.key === 'start' || field.key === 'end';
}

/** Would an edit of this cell write the `start`/`end` envelope of an Entry that stores `segments`?
 *
 *  Those two values span the segments; they are not authored on their own. `data/` refuses the write
 *  and throws `SegmentsOutOfSyncError` (`data/entry-reader.ts`), so an editor over this cell can only
 *  fail on commit. The cell says why instead, the same way a rolled-up parent cell does.
 *
 *  It asks about *several* Segments only. Every Entry stores at least one since #212. The one a plain
 *  Entry stores is its envelope's own drawing. `data/` moves that one with the envelope, so this cell
 *  opens as it always did. Several Segments still have no answer to "which stretch did you mean?".
 *  The cell keeps refusing, because an editor over it can only fail on commit.
 *
 *  This names `start` and `end` by key, as `isDateField` above already does for the same two core
 *  Fields. That repeats a rule `data/` also holds.
 *
 *  #256 added the library's own write question, `ctx.interaction.canWrite`. This rule stays out of
 *  it, on purpose. A drag on a segmented bar writes `segments` and a recomputed envelope, so it
 *  writes these two keys legally. Only a *direct* envelope write is refused.
 *
 *  So this is a rule about which door, not about whether the value may change. Folding it into
 *  `canWrite` would take the handles off every segmented bar. */
function writesSegmentEnvelope(entry: Entry, field: Field): boolean {
  if (entry.segments.length <= 1) return false;
  return field.key === 'start' || field.key === 'end';
}

/** Issue #137 F12: with no `parseValue`, only `type: 'text'` reads and writes the raw string. A
 *  Field with no `type` at all reads and writes it too — a plain `props`-addressed Field like the
 *  harness's `team`. Any other named `type` refuses to open rather than guess a parse. */
function canOpenGeneric(field: Field): boolean {
  return field.parseValue !== undefined || field.type === undefined || field.type === 'text';
}

/** The four classes this plugin writes, and `view/styles.ts` styles. The session dresses the
 *  wrapper and the control, so no control factory has to remember to.
 *
 *  An editor holds a control the user types into. A notice holds words the user reads and takes no
 *  pointer. They are two things, so they carry two class names (#231 F1). One class told them apart
 *  only through `:not(:has(.fg-cell-editor-control))`. The stylesheet spelled that trick, and a test
 *  spelled it again. A consumer who copied the documented editor selector reached the notice too. */
const EDITOR_CLASS = 'fg-cell-editor';
const EDITOR_CONTROL_CLASS = 'fg-cell-editor-control';
const EDITOR_DISCARD_CLASS = 'fg-cell-editor-discard';
const NOTICE_CLASS = 'fg-cell-notice';

/** Every refusal the user can see, with the words the user reads. One table, because the wording is
 *  user-visible and belongs in one place. The four `return` sites below decide *which* refusal
 *  applies, never *how it reads* (review SP1).
 *
 *  `s5.8-inline-editing.md` §1 states once which refusals speak and which stay silent. A cell that
 *  offers no editor at all refuses silently. A cell that offers one but cannot open it here names
 *  the reason. */
// Exported for `error-code-drift.test.ts` (#247 S3-4) alone — never through `api/index.ts`. That
// test is what keeps `model/error-report.ts`'s `BuiltInErrorCode` honest against these two tables,
// because `model/` may not import `extensions/` to check the other way (I11).
export const REFUSAL_TEXT = {
  'derived-value': 'this value comes from the rows below it; edit a child row instead',
  'no-parse-value': 'this field has no parseValue; the default editor cannot read the text back',
  'no-date-value': 'this field holds no date yet; the default date editor needs one',
  'time-of-day': 'this field carries a time of day; the default date editor cannot show it',
  'unsaved-value': 'another cell still holds a value that did not save; fix it or press Escape',
  'segmented-entry': 'these dates span the segments below; move a segment instead',
} as const;

/** Why the editor refused a cell that does offer one. The key is the machine-readable half — it goes
 *  on the notice's own `data-reason` — and `REFUSAL_TEXT` holds the half the user reads.
 *
 *  S5.12, D-S5-40: the keys are kebab-case because each one is also the `code` of the Error report
 *  this plugin raises. One refusal must not have two spellings, and kebab is the better value for a
 *  DOM attribute anyway. */
export type CellEditorRefusal = keyof typeof REFUSAL_TEXT;

/** Every commit refusal, with the words the user reads (#234). A second table from `REFUSAL_TEXT`,
 *  because the two vocabularies sit on two elements (#231 F1). These words belong to an open
 *  `.fg-cell-editor`; those belong to a `.fg-cell-notice`. The class alone answers which vocabulary
 *  a `data-reason` speaks.
 *
 *  Both sentences speak about **editor state** — what is unsaved, and what to do next — and never
 *  about why a write was refused. Core already reports that (`mutation-cancelled`,
 *  `data/transaction.ts`), and a vetoed cell commit raises both reports on one feed. Two reports are
 *  right here, because they are different facts at two layers; two copies of one sentence are not. */
// See the note beside `REFUSAL_TEXT` above — exported for the same one test, and for no other reason.
export const COMMIT_REFUSAL_TEXT = {
  'unreadable-value': 'this editor cannot read a value from the text; correct it, or discard the edit',
  'refused-write': 'this editor still holds a value that did not save; correct it, or discard the edit',
} as const;

/** Why a *commit* left the editor invalid (#160, D-S5-47): the control read no value back
 *  (`unreadable-value`), or a `beforeChange` handler vetoed the write (`refused-write`).
 *
 *  The key is the machine-readable half. It goes on the open editor's own `data-reason`, and it is
 *  also the `code` of the Error report the editor raises (#234, D-S5-40). `COMMIT_REFUSAL_TEXT`
 *  holds the half the user reads. One refusal, one spelling. */
export type CellEditorCommitRefusal = keyof typeof COMMIT_REFUSAL_TEXT;

/** Puts `element` exactly over `cell`'s own rect — no flip and no clamp, unlike `Popup`. An editor
 *  and a refusal notice both sit exactly where the cell already is, so both position through this.
 *  `bounds` is the row layer's own box (#158), the frame both are mounted in. */
function positionOver(element: HTMLElement, cell: HTMLElement, bounds: DOMRect): void {
  const rect = cell.getBoundingClientRect();
  element.style.transform = `translate(${(rect.left - bounds.left).toFixed(2)}px, ${(rect.top - bounds.top).toFixed(2)}px)`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

/** What the user typed, read back through the control's own rules. `ok: false` means the control
 *  makes no value from what is there now — a `parseValue` that refused, or an empty date.
 *
 *  A failed read carries the `text` it failed on, so the `unreadable-value` report can hand a
 *  consumer what the user actually typed (#234). It is optional because a control need not keep text
 *  at all. A date control reads a date or nothing, and has no string to give. */
export type CellEditorValue = { ok: true; value: unknown } | { ok: false; text?: string };

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
  /** The layer the editor mounts into (#158): the grid's own row layer, which the pane's scroll
   *  already moves. That is what makes an open editor follow its cell with no scroll listener.
   *
   *  It answers all three of "where do I mount", "what box do I position in" (`bounds`) and "when
   *  must I move" (`onResize`). Before #168 those came from two different objects. */
  readonly mountLayer: MountLayer;
  /** Where the edited cell is now. It is the one answer to "is my editor still anchored?" — a
   *  recycled row stops answering for the entry it used to hold. */
  readonly dom: Pick<GanttDom, 'cellFor'>;
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
  /** The session asks its owner to close it and write nothing (#160, D-S5-47). Escape asks, and so
   *  does the invalid editor's discard button.
   *
   *  D-S5-26 puts one command behind both, so this runs `freegantt.discardCellEdit` rather than
   *  `CellEditing.discard()`. A consumer who overrides that command changes the keyboard and the
   *  pointer together (#231 F2). Escape used to skip the command and reach the method, so an
   *  override changed the button alone. */
  requestDiscard(): void;
  /** S5.12, D-S5-40: reports one refusal on the Gantt's `error` event. A consumer can then toast it,
   *  rather than rely on a notice the user may not look at. `ctx.raiseError` fills `by` with this
   *  plugin's id. */
  raiseError(report: PluginErrorReport): void;
}

/** One open cell editor: mounted over its cell, bound to its own triggers, closed exactly once.
 *
 *  `commit()` answers whether it closed. A refused commit keeps the editor open in the invalid
 *  state. The owner reads that answer instead of a flag both sides write (review C2/C2b). */
export class CellEditorSession {
  readonly entryId: EntryId;
  readonly field: FieldKey;
  readonly #ports: CellEditorPorts;
  readonly #control: CellEditorControl;
  readonly #wrapper: HTMLElement;
  /** Every trigger `mount()` binds, freed in reverse on `#close()`. The same store a plugin gets on
   *  `ctx.disposables`, so the list latches and a second close costs nothing. */
  readonly #bindings = new DisposableStore();
  #unmount: Disposer | undefined;
  #focusTrap: FocusTrap | undefined;
  #discardButton: HTMLButtonElement | undefined;
  /** `#close()` alone writes this, and `commit()`/`discard()` read it. It records this one session's
   *  lifetime. A re-entrant close never tears the same editor down twice — a `change` handler that
   *  removes the entry while `commit()` still writes. */
  #open = false;

  constructor(ports: CellEditorPorts, edited: EditedCell, control: CellEditorControl) {
    this.#ports = ports;
    this.entryId = edited.entryId;
    this.field = edited.field;
    this.#control = control;
    this.#wrapper = document.createElement('div');
    this.#wrapper.className = EDITOR_CLASS;
    // One place dresses the control, whichever control it is. That is the default `<input>`, the
    // default date input, or a consumer's own from the `dateInput` factory (D-S5-20).
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
    this.#unmount = this.#ports.mountLayer.present(this.#wrapper);
    this.#positionOver(cell);
    this.#bindings.add(this.#ports.mountLayer.onResize(() => this.reposition()));
    this.#bindings.add(this.#ports.bindEscape(() => this.#ports.requestDiscard()));
    this.#bindings.add(this.#control.bindCommitTriggers(() => this.#ports.requestCommit()));
    this.#wrapper.addEventListener('focusout', this.#onFocusOut);
    this.#focusTrap = activateFocusTrap(this.#wrapper);
    this.#control.element.focus();
  }

  /** Writes what the control holds, then closes. It answers `false` when the control reads no
   *  value, and when `beforeChange` vetoes the changeset. It then stays open in the invalid state,
   *  with focus on the control. Those are D-S5-19's two refusals. */
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
      this.#markInvalid(
        'unreadable-value',
        new UnreadableCellValueError(this.entryId, this.field, value.text),
      );
      return false;
    }
    const from = this.#ports.storedValue(this.entryId, this.field);
    try {
      this.#ports.writeValue(this.entryId, this.field, value.value);
    } catch (error) {
      if (error instanceof MutationCancelledError) {
        // The same error core's own `mutation-cancelled` report carries. Two reports, one cause: the
        // consumer reads the refused `ChangeSet` off either one (#234).
        this.#markInvalid('refused-write', error);
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

  /** Closes and writes nothing — Escape's answer, the discard command's answer, and the answer to an
   *  anchor that went away. */
  discard(): void {
    this.#close();
  }

  /** Follows the cell after a container resize. A resize can bring a reflow that moves the cell
   *  with no scroll at all — a column width change, say. A scroll needs none of this: the row layer
   *  carries the editor and the cell together (#158). This asks for the cell again rather than
   *  reusing the node `mount` received: virtualization can recycle that node while the editor is
   *  open. */
  reposition(): void {
    const cell = this.#currentCell();
    if (cell) this.#positionOver(cell);
  }

  /** Whether this editor's own cell is still on screen (issue #137 F10). It goes false once
   *  virtualization scrolls the row away, or recycles it for another entry. `cellFor` answers for
   *  this entry and this Field, so a recycled node stops matching. */
  stillAnchored(): boolean {
    return this.#currentCell() !== undefined;
  }

  #currentCell(): HTMLElement | undefined {
    return this.#ports.dom.cellFor(this.entryId, this.field);
  }

  /** #160, D-S5-47, Q4: a blur out of an already-invalid editor stays put. Re-attempting a value the
   *  commit path already refused buys nothing, and pulling focus back is the trap this issue exists
   *  to close. A blur out of a *valid* editor still commits, unchanged. */
  readonly #onFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && this.#wrapper.contains(next)) return;
    if (this.#wrapper.dataset['state'] === 'invalid') return;
    this.#ports.requestCommit();
  };

  #positionOver(cell: HTMLElement): void {
    positionOver(this.#wrapper, cell, this.#ports.mountLayer.bounds);
  }

  /** The one "this did not save" signal (D-S5-19). The editor stays open, the state and reason name
   *  the refusal, and focus goes back to the control. #160, D-S5-47 adds the discard button — the
   *  invalid state's only affordance, because a valid editor already has Enter, click-away and
   *  Escape.
   *
   *  It also reports (#234, D-S5-40). Until now a commit refusal told the screen and nothing else.
   *  A consumer who logged every refusal kept a partial log, with nothing to say so.
   *  `severity: 'info'`, because a Refusal is the library working correctly (D-S5-41). The report
   *  reads the same words the user reads, so one refusal has one spelling everywhere.
   *
   *  A cell is often narrower than the sentence, so the words are the hover text too. That is the
   *  same reason the notice sets its own `title`. */
  #markInvalid(reason: CellEditorCommitRefusal, cause: unknown): void {
    const words = COMMIT_REFUSAL_TEXT[reason];
    this.#wrapper.dataset['state'] = 'invalid';
    this.#wrapper.dataset['reason'] = reason;
    this.#wrapper.title = words;
    this.#ensureDiscardButton();
    this.#control.element.focus();
    this.#ports.raiseError({
      code: reason,
      message: words,
      severity: 'info',
      entryId: this.entryId,
      field: this.field,
      cause,
    });
  }

  /** Idempotent: a second refused commit on the same editor must not append a second button. Placed
   *  after the control so `activateFocusTrap`'s first-focusable-descendant rule still opens focus on
   *  the control, and Tab reaches this button next (#160, D-S5-47, Q6). */
  #ensureDiscardButton(): void {
    if (this.#discardButton !== undefined) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = EDITOR_DISCARD_CLASS;
    button.setAttribute('aria-label', 'Discard edit');
    button.title = 'Discard edit';
    button.textContent = '×';
    // Some browsers do not focus a <button> on click. Without this, the click's own focusout fires
    // first, with a null relatedTarget, which would run one more doomed commit before the click lands.
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    // The command, not the method (D-S5-26): a consumer who overrides `freegantt.discardCellEdit`
    // changes what this button does too. Escape takes the same one road (#231 F2).
    button.addEventListener('click', () => this.#ports.requestDiscard());
    this.#wrapper.append(button);
    this.#discardButton = button;
  }

  /** Detaches the listeners first. The focus restore the trap runs can otherwise fire a `focusout`
   *  commit into a half-closed editor. Runs once. The unmount is last, so the editor leaves the DOM
   *  only after every trigger on it is gone. */
  #close(): void {
    if (!this.#open) return;
    this.#open = false;
    this.#bindings.disposeAll();
    this.#wrapper.removeEventListener('focusout', this.#onFocusOut);
    this.#control.onClosed?.();
    this.#focusTrap?.deactivate();
    this.#unmount?.();
  }
}

/** One mounted refusal, dismissed exactly once. */
export interface RefusalNotice {
  readonly element: HTMLElement;
  dismiss(): void;
}

/** What a refusal notice borrows: the same three members a `CellEditorSession` borrows, for the
 *  same three jobs. A test drives a notice with no mounted Gantt. */
export type RefusalNoticePorts = Pick<CellEditorPorts, 'mountLayer' | 'dom' | 'bindEscape'>;

/** Follows the cell after a container resize, the same way `CellEditorSession.reposition` does, and
 *  for the same reason (#172). It asks for the cell again rather than reusing the node the refusal
 *  was raised on. Virtualization can recycle that node while the notice is up. */
function repositionNotice(ports: RefusalNoticePorts, element: HTMLElement, edited: EditedCell): void {
  const cell = ports.dom.cellFor(edited.entryId, edited.field);
  if (cell) positionOver(element, cell, ports.mountLayer.bounds);
}

/** Puts the refusal where the user acted: over the cell (D-S5-19, issue #137 F11/F12). It is a
 *  notice, not an editor. It mounts no control and it takes no focus, so it never becomes a sixth
 *  thing the user must close. That is why it carries its own class and not `.fg-cell-editor`
 *  (#231 F1). A selector for the notice must never reach a live editor. The notice's own
 *  `pointer-events: none` would put that editor's control and discard button out of reach.
 *
 *  It paints nothing of its own (#171). `view/styles.ts` styles `.fg-cell-notice[data-reason]`, so a
 *  consumer stylesheet can still win. An inline declaration would outrank one, which is the opposite
 *  of what level-1 tokens are for.
 *
 *  `role="status"` is the strongest thing a plugin can say on its own node today. The real
 *  announcement reaches a screen reader another way. `raiseError` below raises the same report on
 *  this Gantt's `error` event. The per-Gantt polite live region D-S5-26 adds (`view/live-region.ts`)
 *  reads it from there, not from this node. */
export function presentRefusal(
  ports: RefusalNoticePorts,
  edited: EditedCell,
  cell: HTMLElement,
  reason: CellEditorRefusal,
): RefusalNotice {
  const element = document.createElement('div');
  element.className = NOTICE_CLASS;
  element.dataset['reason'] = reason;
  const text = REFUSAL_TEXT[reason];
  element.textContent = text;
  // A cell is often narrower than the sentence, so the same words are the hover text too.
  element.title = text;
  element.setAttribute('role', 'status');
  positionOver(element, cell, ports.mountLayer.bounds);

  // One store, freed in reverse and exactly once — the latch a hand-rolled `open` flag used to
  // spell here (#174). The unmount goes in first, so it runs last.
  const mounted = new DisposableStore();
  mounted.add(ports.mountLayer.present(element));
  mounted.add(ports.mountLayer.onResize(() => repositionNotice(ports, element, edited)));
  const notice: RefusalNotice = {
    element,
    dismiss: () => mounted.disposeAll(),
  };
  mounted.add(ports.bindEscape(() => notice.dismiss()));
  return notice;
}

/** One attempt to open an editor, from the veto question to the mount (D-S5-19, #169).
 *
 *  `beforeEntryEdit` may answer asynchronously. So an older answer can arrive after a newer
 *  double-click has already opened its own editor. Both calls below do nothing once a newer attempt
 *  has begun. An older one must not mount a second, orphaned session over the newer one. It must not
 *  overwrite the newer one's notice either. */
export interface PendingOpen {
  /** Opens the editor over this attempt's own cell. */
  mount(control: CellEditorControl): void;
  /** Names why this attempt did not open, over that same cell. */
  refuse(reason: CellEditorRefusal): void;
}

/** What this plugin has mounted over a cell: an open editor, a refusal notice, or neither (#169).
 *
 *  Before this class the three fields below were `setup()` closure variables, coordinated by hand
 *  across seven call sites. Every transition is a method here, and `inlineEditing()` below is wiring.
 *
 *  The two slots are separate on purpose. A commit the Field refuses keeps its own editor open. It
 *  also names the cell the user must fix first. So an editor plus a notice is the one legal pair
 *  (review C2 with review SP1). Every other pairing is not: opening replaces, the next action
 *  clears. */
export class CellEditing {
  readonly #ports: CellEditorPorts;
  #editor: CellEditorSession | undefined;
  #notice: RefusalNotice | undefined;
  /** Bumped by `beginOpen`. It is the whole of the stale-veto guard — see `PendingOpen`. */
  #openCount = 0;

  constructor(ports: CellEditorPorts) {
    this.#ports = ports;
  }

  /** The open editor, or `undefined`. A test reads this; the plugin does not need it. */
  get editor(): CellEditorSession | undefined {
    return this.#editor;
  }

  /** The notice showing now, or `undefined`. A test reads this; the plugin does not need it. */
  get notice(): RefusalNotice | undefined {
    return this.#notice;
  }

  /** Writes what the open editor holds, and answers whether nothing is open now. It answers `false`
   *  when the Field refuses the value, or `beforeChange` vetoes it. The editor stays open then, and
   *  the caller must not open a second one over it (review C2). */
  commit(): boolean {
    const editor = this.#editor;
    if (editor === undefined) return true;
    const closed = editor.commit();
    if (closed) this.#editor = undefined;
    return closed;
  }

  /** Closes the open editor and writes nothing — Escape's answer, and the discard command's answer
   *  (#160, D-S5-47). It always closes. */
  discard(): void {
    this.#editor?.discard();
    this.#editor = undefined;
  }

  /** A notice answers one action, so the user's next action clears it. An open editor is not an
   *  answer to one action, so it stays. */
  dismissNotice(): void {
    this.#notice?.dismiss();
    this.#notice = undefined;
  }

  /** The frame moved under whatever is mounted, so the anchors are worth re-checking. An editor
   *  closes without writing when its anchor is gone. An anchor goes away two ways: the Entry left
   *  the Dataset (issue #137 F10), or the cell left the current frame (issue #137 F1). */
  onAnchorLost(): void {
    this.dismissNotice();
    const editor = this.#editor;
    if (editor === undefined) return;
    const entryGone = this.#ports.entryById(editor.entryId) === undefined;
    if (entryGone || !editor.stillAnchored()) this.discard();
  }

  /** Everything goes, and nothing is written — the plugin's own disposer. */
  clear(): void {
    this.dismissNotice();
    this.discard();
  }

  /** Names why this cell did not open, over the cell the user acted on. It replaces whatever notice
   *  was showing, so two never stack. */
  refuse(edited: EditedCell, cell: HTMLElement, reason: CellEditorRefusal): void {
    this.dismissNotice();
    this.#notice = presentRefusal(this.#ports, edited, cell, reason);
    // The notice and the report say the same thing, in the same words, under the same name: the
    // notice's `data-reason` is this `code` (D-S5-40). `severity: 'info'` — the library said no on
    // purpose and nothing is broken.
    this.#ports.raiseError({
      code: reason,
      message: REFUSAL_TEXT[reason],
      severity: 'info',
      entryId: edited.entryId,
      field: edited.field,
    });
  }

  /** Starts one attempt to open `edited`. Every later call cancels this one — see `PendingOpen`. */
  beginOpen(edited: EditedCell, cell: HTMLElement): PendingOpen {
    const attempt = ++this.#openCount;
    const isCurrent = (): boolean => attempt === this.#openCount;
    return {
      mount: (control) => {
        if (isCurrent()) this.#mount(edited, cell, control);
      },
      refuse: (reason) => {
        if (isCurrent()) this.refuse(edited, cell, reason);
      },
    };
  }

  #mount(edited: EditedCell, cell: HTMLElement, control: CellEditorControl): void {
    const opened = new CellEditorSession(this.#ports, edited, control);
    opened.mount(cell);
    this.#editor = opened;
  }
}

/** D-S5-19/D-S5-20: a cost cell edits in place, in one transaction, and a consumer replaces the whole
 *  editor through `beforeEntryEdit` (`[S5-A5]`). Call: `new Gantt({ plugins: [inlineEditing()] })`. */
export function inlineEditing(options: InlineEditingOptions = {}): ChromePlugin {
  return {
    id: 'freegantt.inlineEditing',
    view(ctx: PluginContext) {
      const ports: CellEditorPorts = {
        mountLayer: ctx.view.rowLayer,
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
        storedValue: (id, field) => ctx.dataset.entries.get(id)?.read(field),
        writeValue: (id, field, value) => {
          ctx.dataset.entries.update(id, { [field]: value });
        },
        announceEntryEdit: (payload) => {
          ctx.interaction.announceEntryEdit(payload);
        },
        requestCommit: () => {
          editing.commit();
        },
        requestDiscard: () => {
          ctx.commands.run('freegantt.discardCellEdit');
        },
        raiseError: (report) => {
          ctx.raiseError(report);
        },
      };

      // #169: every mutable this plugin used to hold lives here now, with one method per transition.
      // The `requestCommit`/`requestDiscard` ports above read it after it is built, never before.
      const editing = new CellEditing(ports);

      // #160, D-S5-47, Q2/Q5: the public way to close an invalid editor with no keyboard and no
      // Escape. `core-commands.ts` registers the same id first, as an inert placeholder — a
      // read-only Gantt with no `inlineEditing()` carries no editor code (D-S5-19). This overrides
      // that placeholder for as long as this plugin is installed (D-S5-7). The id namespace names the
      // command's vendor, not the layer that registered it.
      ctx.commands.register({
        id: 'freegantt.discardCellEdit',
        label: 'Discard edit',
        when: () => editing.editor !== undefined,
        run: () => editing.discard(),
      });

      /** Issue #137 F1/F10: the anchor cell disappears — removed from the Dataset, or virtualized
       *  out of frame — so an open editor closes without committing. `CellEditing.onAnchorLost`
       *  asks both questions. */
      function onDatasetChange(): void {
        editing.onAnchorLost();
      }
      ctx.dataset.on('change', onDatasetChange);

      // Checked on every scroll of this Gantt's own panes. Capture phase, because `scroll` does not
      // bubble. Review A4: this listener was the one of the twelve with no "is this my Gantt?" guard
      // at all. A scroll in a second Gantt used to reach it. `ctx.view.onDomEvent` answers that once,
      // for every plugin. The editor itself needs no help here: the row layer carries it with its
      // cell (#158), until that cell leaves the frame.
      ctx.view.onDomEvent('scroll', () => editing.onAnchorLost(), { capture: true });

      // A pointer press anywhere in this Gantt is the user's next action, so it clears the notice.
      // `pointerdown` runs before the `dblclick` below, so a second double-click on a refused cell
      // clears the old notice and then presents the new one.
      ctx.view.onDomEvent('pointerdown', () => editing.dismissNotice());

      /** The text a generic editor opens with. A Field that declares `parseValue` owns both
       *  directions of its own text. So the seed is the string the grid already painted. The user
       *  edits what they see, and `parseValue` reads it back. A Field without one stores a
       *  primitive, so the stored value is the text. Anything else opens empty. */
      function seedText(field: Field, fieldValue: unknown, cell: HTMLElement): string {
        if (field.parseValue !== undefined) return ctx.view.dom.cellText(cell);
        if (typeof fieldValue === 'string') return fieldValue;
        if (typeof fieldValue === 'number' || typeof fieldValue === 'boolean') return String(fieldValue);
        return '';
      }

      function openGeneric(pending: PendingOpen, entry: Entry, field: Field, cell: HTMLElement): void {
        const fieldValue = entry.read(field.key);
        const input = document.createElement('input');
        input.type = field.inputType ?? 'text';
        input.value = seedText(field, fieldValue, cell);

        pending.mount({
          element: input,
          read: (): CellEditorValue => {
            if (field.parseValue !== undefined) {
              const value = field.parseValue(input.value, { timeZone: ctx.dataset.timeZone }, entry);
              return value === undefined ? { ok: false, text: input.value } : { ok: true, value };
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
        });
      }

      function openDate(pending: PendingOpen, entry: Entry, field: Field): void {
        // `isDateField` already vouched for this Field's type; `read` types core keys only, so a
        // consumer-declared date Field reads back as `unknown` without this.
        // A blank cell (ADR 0012: the Entry does not hold this date) opens empty. This is the same
        // as any other empty cell — it is not broken, so nothing refuses it.
        const raw = entry.read(field.key) as Instant | undefined;
        const factory = options.dateInput;
        let dateInput: DateInput;
        if (factory !== undefined) {
          dateInput = factory({ zone: ctx.dataset.timeZone, locale: ctx.gantt.locale });
        } else {
          // Issue #137 F11: the default `<input type="date">` has no time-of-day control. An
          // Instant that is not local midnight would silently round-trip to midnight on an
          // unchanged Enter. So this refuses to open the *default* editor, rather than lose data. A
          // consumer's own `dateInput` factory (a `datetime-local` control, say) owns this instead.
          // A blank cell has no Instant to check, so it never trips this refusal.
          if (raw !== undefined && ctx.dataset.time.startOfDay(raw) !== raw) {
            pending.refuse('time-of-day');
            return;
          }
          dateInput = createDefaultDateInput(ctx.dataset.time);
        }
        if (raw !== undefined) dateInput.write(raw);

        pending.mount({
          element: dateInput.element,
          read: (): CellEditorValue => {
            const value = dateInput.read();
            return value === undefined ? { ok: false } : { ok: true, value };
          },
          bindCommitTriggers: (fire) => dateInput.onCommit(fire),
          onClosed: () => dateInput.destroy(),
        });
      }

      /** D-S5-19: the veto question fires *before the editor opens*, not before the write. A
       *  consumer's `beforeEntryEdit` handler opens its own dialog, and returns `false` to suppress
       *  the built-in editor entirely (U8). */
      function openFor(entry: Entry, field: Field, cell: HTMLElement): void {
        const edited: EditedCell = { entryId: entry.id, field: field.key };
        editing.dismissNotice();
        // Which refusals speak (`s5.8-inline-editing.md` §1). A cell that offers no editor at all
        // refuses silently. A cell that offers an editor it cannot open names its reason. #256 moved
        // that decision onto the verdict itself, so this file holds no list of which refusal is
        // which. Every refusal below the write check is about a cell that *does* offer an editor, so
        // each one names itself.
        // #256: one question, asked of the cell — the same answer that paints or hides the bar's
        // resize handles. A refusal that names a reason is one this cell must explain. A refusal
        // with none is already visible, so it stays silent (see the comment above).
        const write = ctx.interaction.canWrite(entry, field.key);
        if (!write.ok) {
          if (write.reason !== undefined) editing.refuse(edited, cell, write.reason);
          return;
        }
        if (writesSegmentEnvelope(entry, field)) {
          editing.refuse(edited, cell, 'segmented-entry');
          return;
        }
        const date = isDateField(field);
        if (!date && !canOpenGeneric(field)) {
          editing.refuse(edited, cell, 'no-parse-value');
          return;
        }

        // An open editor whose value the Field refuses declines to close. A second editor mounted
        // over it would orphan the first one, its listeners and its focus trap included (review C2).
        // The refusal lands on the cell the user asked for, and names the cell they must fix first.
        if (!editing.commit()) {
          editing.refuse(edited, cell, 'unsaved-value');
          return;
        }

        const pending = editing.beginOpen(edited, cell);
        const currentValue = entry.read(field.key);
        const payload: EntryFieldEdit = { entry, field: field.key, from: currentValue, to: currentValue };
        const result = ctx.interaction.proposeEntryEdit(payload);
        const openNow = (): void => {
          if (date) openDate(pending, entry, field);
          else openGeneric(pending, entry, field, cell);
        };
        if (result === false) return;
        if (result instanceof Promise) {
          void result.then((allowed) => {
            if (allowed !== false) openNow();
          });
          return;
        }
        openNow();
      }

      // Review A4: `ctx.view.onDomEvent` scopes this to this Gantt (I2), and resolves the node.
      // The whole "which cell, which entry, which Field" walk is one answer now, instead of four
      // hand-written `.fg-*` lookups.
      ctx.view.onDomEvent('dblclick', (_event, target) => {
        if (target?.kind !== 'cell') return;
        const { entry, field: fieldKey } = target;
        if (entry === undefined || fieldKey === undefined) return;
        const field = ctx.dataset.field(fieldKey);
        if (field === undefined) return;
        openFor(entry, field, target.element);
      });

      /** D-S3-13: `Enter` is reserved for opening the inline editor. It opens the **focused** cell
       *  (D-S5-39). `ctx.view.focusedCell()` is roving focus's own answer to "which cell", read
       *  through the same one capability resolution (`canWrite`, I14) every other write path already
       *  checks. `Enter` with focus anywhere else (a row, a bar, a header, the splitter) opens
       *  nothing. */
      const disposeEnter = ctx.interaction.registerKeyHandler('Enter', () => {
        const focused = ctx.view.focusedCell();
        if (focused === undefined) return;
        const { entryId, field: fieldKey } = focused;
        const entry = ctx.dataset.entries.get(entryId);
        if (entry === undefined) return;
        if (!ctx.interaction.canWrite(entry, fieldKey).ok) return;
        const cell = ctx.view.dom.cellFor(entryId, fieldKey);
        if (cell === undefined) return;
        const field = ctx.dataset.field(fieldKey);
        if (field === undefined) return;
        openFor(entry, field, cell);
      });

      // The two `onDomEvent` listeners above remove themselves through `ctx.disposables`, which
      // runs ahead of this disposer (S5.1, D-S5-3).
      return () => {
        editing.clear();
        ctx.dataset.off('change', onDatasetChange);
        disposeEnter();
      };
    },
  };
}
