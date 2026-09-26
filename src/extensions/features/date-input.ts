// extensions/features/ — the default `dateInput` seam. `plans/04` §1 budgets two
// runtime dependencies and a picker is not one of them, so this wraps the platform's own
// `<input type="date">`. `extensions/` may import only `api/` and `model/`. `time/` is
// sealed from here the same way it is from a third-party plugin, so this file does no zone math of
// its own.
//
// `createDefaultDateInput` instead takes a small structural subset of `time/`'s `ZonedTime`
// as a plain argument. A real `ZonedTime` already satisfies it. So `inlineEditing()` can
// pass `ctx.dataset.time` straight through, with no import of `ZonedTime`'s own type.
//
// The *public* `DateInputFactory` a consumer writes stays narrower still — `{ zone, locale }` only,
// A consumer's own factory owns its own zone math, outside `src/`'s I10
// scope.

import type { Disposer, Instant, PlainParts } from '../../model/index.js';

/** What the inline editor mounts in a date cell. */
export interface DateInput {
  /** The control to mount in the cell. */
  readonly element: HTMLElement;
  /** Reads what the user entered, in the dataset's zone. `undefined` means "not a date". */
  read(): Instant | undefined;
  /** Called when the editor opens. */
  write(at: Instant): void;
  /** The editor calls this to learn when the user is done (Enter, or the control's own commit). */
  onCommit(handler: () => void): Disposer;
  destroy(): void;
}

/** `inlineEditing({ dateInput: myPickerFactory })` — a consumer's own zone math, not `time/`'s. */
export type DateInputFactory = (ctx: { zone: string; locale?: Intl.LocalesArgument }) => DateInput;

/** The structural slice of `time/`'s `ZonedTime` this file needs — not that type itself (sealed from
 *  `extensions/`, see file header). `PlainParts` is `model/`'s (#144). The wall-clock shape is
 *  domain vocabulary, so `model/` names it once rather than this file hand-copying it. A later
 *  field added to a hand-copied shape would never have reached this file.
 *  `time/` re-exports the same type; its optional `dayOfWeek` is
 *  derived on read, which this control neither reads nor writes. */
export interface ZoneDateMath {
  toPlain(at: Instant): PlainParts;
  fromPlain(plain: PlainParts): Instant;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** `<input type="date">`'s own value shape (`YYYY-MM-DD`), read and written through `time`'s zone
 *  math. Never `Date` parsing, and never an inline `end - 1`. The inclusive-display rule
 *  (`plans/01` §5) stays out of scope here. A date-only field's `end` is already the entry's own
 *  stored value by the time this control opens. That is `inlineEditing()`'s job, not this one's.
 *
 *  Callable only for an Instant already known to fall at local midnight. `inlineEditing()` checks
 *  that before it ever calls `write` (issue #137). So this control assumes a valid date-only
 *  value throughout. */
export function createDefaultDateInput(time: ZoneDateMath): DateInput {
  const input = document.createElement('input');
  input.type = 'date';

  return {
    element: input,
    read(): Instant | undefined {
      if (input.value === '') return undefined;
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.value);
      if (!match) return undefined;
      const [, y, m, d] = match;
      return time.fromPlain({
        year: Number(y),
        month: Number(m),
        day: Number(d),
        hour: 0,
        minute: 0,
        second: 0,
      });
    },
    write(at: Instant): void {
      const plain = time.toPlain(at);
      input.value = `${pad(plain.year, 4)}-${pad(plain.month, 2)}-${pad(plain.day, 2)}`;
    },
    onCommit(handler: () => void): Disposer {
      // `change` covers the native picker and a typed-then-blurred value. `keydown` Enter covers a
      // typed value the browser has not yet turned into a `change`. Some browsers fire `change`
      // only on blur. Both can fire for one keystroke. `inlineEditing()`'s own commit closes its
      // `CellEditorSession`, so the second call finds no open editor and writes nothing — this
      // control does not de-duplicate.
      const onKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Enter') handler();
      };
      input.addEventListener('keydown', onKeydown);
      input.addEventListener('change', handler);
      return () => {
        input.removeEventListener('keydown', onKeydown);
        input.removeEventListener('change', handler);
      };
    },
    destroy(): void {
      input.remove();
    },
  };
}
