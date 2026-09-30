// view/ — a toggle column: how its cell looks, and what one click or key press does. `GanttShell`
// wires the click and the key. This file owns the look and the write, so both stay in one place.

import type { ColumnToggle, ElementDescription, Entry, EntryId, FieldKey } from '../model/index.js';
import { MutationCancelledError } from '../model/index.js';
import type { WriteVerdict } from './capability.js';
import type { EntryFieldEdit } from './event-bus.js';

/** The toggle a column declares, in one shape. `toggle: true` is the default toggle, `{}`.
 *  Call: `toggleOf(column)`. */
export function toggleOf(column: { toggle?: true | ColumnToggle }): ColumnToggle | undefined {
  return column.toggle === true ? {} : column.toggle;
}

/** Class names the default checkbox look uses. `view/styles.ts` draws them. */
const TOGGLE_CLASS = 'fg-toggle';
const TOGGLE_ICON_CLASS = 'fg-toggle-icon';
const TOGGLE_BOX_CLASS = 'fg-toggle-box';
const TOGGLE_BOX_CHECKED_CLASS = 'fg-toggle-box-checked';

/** What the toggle cell draws. Call: `toggleCellContent(column.toggle, column.header, true)`.
 *
 *  The cell holds one checkbox. The column header names it, and the icon stays out of the
 *  accessibility tree, so a screen reader hears "Done, checkbox, checked" for any icon. */
export function toggleCellContent(
  toggle: ColumnToggle,
  header: string,
  checked: boolean,
): ElementDescription {
  const icon = checked ? toggle.on : toggle.off;
  const look: ElementDescription = icon ?? {
    tag: 'span',
    class: { [TOGGLE_BOX_CLASS]: true, [TOGGLE_BOX_CHECKED_CLASS]: checked },
  };
  return {
    class: { [TOGGLE_CLASS]: true },
    attrs: { role: 'checkbox', 'aria-checked': String(checked), 'aria-label': header },
    children: [
      {
        tag: 'span',
        class: { [TOGGLE_ICON_CLASS]: true },
        attrs: { 'aria-hidden': 'true' },
        children: [look],
      },
    ],
  };
}

/** What a toggle asks its Gantt. Each member is one seam the shell already owns. */
export interface CellTogglePorts {
  toggleOf(field: FieldKey): ColumnToggle | undefined;
  entryById(id: EntryId): Entry | undefined;
  canWrite(entry: Entry, field: FieldKey): WriteVerdict;
  proposeEntryEdit(payload: EntryFieldEdit): boolean | Promise<boolean>;
  announceEntryEdit(payload: EntryFieldEdit): void;
  write(id: EntryId, field: FieldKey, value: boolean): void;
}

/** Switches one toggle cell. Call: `switchToggleCell(ports, entry, 'done')`.
 *
 *  A closed toggle does nothing. `beforeEntryEdit` may veto the switch. The column's `onToggle`
 *  replaces the write when it exists. Otherwise the write is one `update`, so one undo step, and
 *  `beforeChange` may refuse it. */
export function switchToggleCell(ports: CellTogglePorts, entry: Entry, field: FieldKey): void {
  const toggle = ports.toggleOf(field);
  if (toggle === undefined || !ports.canWrite(entry, field).ok) return;
  const from = entry.read(field);
  const nextValue = from !== true;
  const answer = ports.proposeEntryEdit({ entry, field, from, to: nextValue });
  if (answer instanceof Promise) {
    void answer.then((allowed) => {
      if (allowed !== false) carryOut(ports, toggle, entry, { field, from, nextValue });
    });
    return;
  }
  if (answer !== false) carryOut(ports, toggle, entry, { field, from, nextValue });
}

function carryOut(
  ports: CellTogglePorts,
  toggle: ColumnToggle,
  entry: Entry,
  { field, from, nextValue }: { field: FieldKey; from: unknown; nextValue: boolean },
): void {
  // An async veto can answer after another call removed the Entry. Then no cell is left to switch.
  if (ports.entryById(entry.id) === undefined) return;
  if (toggle.onToggle !== undefined) {
    let announced = false;
    toggle.onToggle({
      entry,
      field,
      nextValue,
      announceEdit: () => {
        // One switch is one `entryEdit`. A gone Entry has no edit left to announce.
        if (announced || ports.entryById(entry.id) === undefined) return;
        announced = true;
        ports.announceEntryEdit({ entry, field, from, to: entry.read(field) });
      },
    });
    return;
  }
  try {
    ports.write(entry.id, field, nextValue);
  } catch (error) {
    // A `beforeChange` refusal is a normal outcome. Core has already reported it.
    if (error instanceof MutationCancelledError) return;
    throw error;
  }
  ports.announceEntryEdit({ entry, field, from, to: entry.read(field) });
}
