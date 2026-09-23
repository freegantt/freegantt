// Moved verbatim from api/entry-input.ts (D-S2-2): construction and `entries.add()` must read an
// `EntryInput` the same way, and the one place that happens is inside the store now.
//
// This file maps fields and nothing else. Every date decision — resolving a Plain time through the
// zone, and what a date-only `end` means against half-open storage — belongs to `time/input.ts`
// (I10); anything resembling date math here is a bug.

import { entryId, DuplicatePropsKeyError, InvertedSpanError, spansTime } from '../model/index.js';
import type {
  DateOnlyEndRule,
  StoredEntry,
  EntryEdit,
  EntryId,
  EntryInput,
  FieldLockRule,
  HierarchySource,
  Instant,
} from '../model/index.js';
import { addMs, diffMs, toEndInstant, toInstant } from '../time/index.js';
import type { EntryEdits, ProposedEdit, ProposedEdits } from './edit-extension.js';
import {
  completeProps,
  emptyProposedEdit,
  withProposedKeys,
  writeDeclaredPropsFields,
} from './fields/field-access.js';
import { isCoreFieldKey } from './fields/core-fields.js';
import type { FieldRegistry } from './fields/field-registry.js';
import { assertFieldTakesWrite, fieldLockQueryFor } from './write-rule.js';
import { parentIdFrom } from './hierarchy-source.js';

/** The Dataset context every entry is read against: one zone, one end rule, for the whole list. */
export interface EntryReadContext {
  timeZone: string;
  dateOnlyEnd: DateOnlyEndRule;
}

/** Which Entry a write targets, and which call wrote it — what an error message needs to name the
 *  caller's own door and the id the caller wrote (#237). `operation` is a plain call name:
 *  `entries.add`, `entries.update`, `construction`, or `edit extender`. */
interface EditOrigin {
  readonly entryId: EntryId;
  readonly operation: string;
}

/** The name a plugin author knows their own write by. `toEditReading` serves both
 *  `entries.update()` and an `EditExtender` cascade (D-S5-44), and a message that named the wrong one
 *  sent the reader to a call they never made (#239). Exported so `build-commit-change-set.ts` can
 *  name the same call when it diffs a body author's and an extender author's edits together (#232) —
 *  one label for the one boundary, not a second string that means the same thing. */
export const EXTENDER_OPERATION = 'edit extender';

/** Reads `input.start`/`input.end` into `Instant`s, one date at a time (ADR 0012: one date with no
 * other is legal, so this never demands the pair the way `toEntrySpan` used to). An unreadable date
 * is still refused by `toInstant`/`toEndInstant`; a pair that inverts is `InvertedSpanError`. */
function toEntryDates(
  input: EntryInput,
  context: EntryReadContext,
  owner: EditOrigin,
): { start?: Instant; end?: Instant } {
  const dates: { start?: Instant; end?: Instant } = {};
  if (input.start !== undefined) dates.start = toInstant(context.timeZone, input.start, owner.operation);
  if (input.end !== undefined) {
    dates.end = toEndInstant(context.timeZone, input.end, context.dateOnlyEnd, owner.operation);
  }
  // Only a pair can invert (`spansTime`, ADR 0012): one date alone has nothing to invert against.
  if (spansTime(dates) && dates.end < dates.start) {
    throw new InvertedSpanError(owner.entryId, dates, owner.operation);
  }
  return dates;
}

/** Every key `EntryInput` itself declares — the envelope this walk never treats as a `props`
 *  candidate, flat or nested. Frozen, not a `Set`: one array literal, read-only for the module's
 *  whole life, so it carries no state a second Gantt instance could share (I2). */
const ENTRY_INPUT_KEYS = Object.freeze(['id', 'parentId', 'name', 'start', 'end', 'props']);

function warnIngest(message: string): void {
  console.warn(`FreeGantt: ${message}`);
}

/**
 * `entry.props` at ingest (ADR 0011, Q15): declared Field keys may sit flat, at the top level of a
 * constructor record or an `add()` call, the same shape `update()` takes; a nested `props` stays
 * legal for passenger keys and for a bag a consumer already holds. A key named both ways throws
 * (`DuplicatePropsKeyError`) — the two spellings would silently disagree about which value wins.
 *
 * Two ingest warnings live here, and neither throws: an unknown top-level key (this Entry may come
 * from an API this consumer does not own), and a `props` key that names a core key (the core
 * definition wins; the value is carried nowhere and is unreachable through `read`).
 */
function propsFromInput(
  input: EntryInput,
  registry: FieldRegistry,
  id: EntryId,
): Readonly<Record<string, unknown>> {
  const props: Record<string, unknown> = {};
  const nested: Readonly<Record<string, unknown>> = input.props ?? {};
  for (const key of Object.keys(nested)) {
    if (isCoreFieldKey(key)) {
      warnIngest(`"${id}"'s "props.${key}" names a core field. The core value wins; this is ignored.`);
      continue;
    }
    props[key] = nested[key];
  }
  const flat = input as unknown as Readonly<Record<string, unknown>>;
  for (const key of Object.keys(flat)) {
    if (ENTRY_INPUT_KEYS.includes(key)) continue;
    if (!registry.has(key)) {
      warnIngest(`"${id}" carries an undeclared key "${key}". Declare it in "fields" to make it writable.`);
      continue;
    }
    if (key in props) throw new DuplicatePropsKeyError(key, id);
    props[key] = flat[key];
  }
  return props;
}

/** Optional fields are copied only when present: `exactOptionalPropertyTypes` makes an explicit
 * `undefined` a different thing from an absent key, and an `Entry` must not gain keys its input
 * never had. Exported for `entries.add()` (S2.3 §1.1), which reads one input the same way
 * construction reads every entry in `entries: EntryInput[]` — one function, both call sites. */
export function toEntry(
  input: EntryInput,
  context: EntryReadContext,
  registry: FieldRegistry,
  operation: string,
): StoredEntry {
  const id = entryId(input.id);
  const owner: EditOrigin = { entryId: id, operation };
  const dates = toEntryDates(input, context, owner);
  const entry: StoredEntry = {
    id,
    props: propsFromInput(input, registry, id),
  };
  if (input.name !== undefined) entry.name = input.name;
  if (dates.start !== undefined) entry.start = dates.start;
  if (dates.end !== undefined) entry.end = dates.end;
  if (input.parentId !== undefined) entry.parentId = entryId(input.parentId);
  return entry;
}

export function toEntries(
  inputs: readonly EntryInput[],
  context: EntryReadContext,
  registry: FieldRegistry,
  operation = 'construction',
): readonly StoredEntry[] {
  return inputs.map((input) => toEntry(input, context, registry, operation));
}

/**
 * The move a plugin's cascade is honest about (D-S5-44): `entry`'s whole span, translated rigidly by
 * `start - entry.start`. `layout/` and `data/` may not import each other (§1), so this is a second,
 * private copy of the rigid translate `layout/gesture-draft.ts`'s own `moveEdit` computes for a
 * whole-Entry drag, not a shared function.
 *
 * A public export (`api/dataset-plugin.ts`, `api/index.ts`), for the same reason `mergeEntryEdits` is:
 * it builds the `EntryEdits` map's value type, which only an extender produces, so it is a
 * plugin-author tool and not an app-author one.
 *
 * `start` is an `Instant`, not the loose `InstantInput` every way *in* takes. This is a builder, not a
 * way in: the way in is the extender's return, which `toEditsReading` normalizes. Taking a loose date here
 * would need a zone to read it, and asking a plugin author to hand back `ctx.dataset.timeZone` — a
 * zone core already holds — is the zone math core is supposed to fill for them (`plans/02`, "two
 * callers, two surfaces"). A caller who holds a loose date reads it with `time/`'s own helper first.
 */
export function moveEntryTo(entry: StoredEntry, start: Instant): EntryEdit {
  // Moving an Entry rigidly only makes sense for one that already spans (`spansTime`, ADR 0012): a
  // dateless or one-date Entry has no pair to translate.
  if (!spansTime(entry)) return {};
  const deltaMs = diffMs(start, entry.start);
  return { start: addMs(entry.start, deltaMs), end: addMs(entry.end, deltaMs) };
}

/** `toEditReading`'s result: the `ProposedEdit` `.stored` has always carried. Internal only — never
 *  returned from a public entry point. */
export interface EditReading {
  readonly stored: ProposedEdit;
}

/** `toEditsReading`'s result: `EditReading` widened from one Entry to the whole map an
 *  `EditExtender` cascade touches — what `DatasetState.extraEditsReadingFor` hands the commit path
 *  (#232). Internal only. */
export interface EditsReading {
  readonly stored: ProposedEdits;
}

/** Reads an `entries.update()` edit into `ProposedEdit` (S2.3 §1.1) — every present core date field
 * goes through `time/` the way `toEntry` reads a whole `Entry`. Declared Field keys fold through
 * `writeField` so the write set stays entry-shaped (D-S4-2). An update may set `start` without `end`.
 *
 * `start`/`end` are ordinary Fields here, same as any other: nothing derives one from the other any
 * more (ADR 0026 retired the Segment that used to pair them), so an edit that sets one and leaves the
 * other alone is checked for inversion against the Entry's existing value and then written as-is. */
export function toEditReading(
  edit: EntryEdit,
  context: EntryReadContext,
  entry: StoredEntry,
  registry: FieldRegistry,
  operation: string,
): EditReading {
  let stored: ProposedEdit = emptyProposedEdit();
  // Which Fields this edit writes. A key nobody states never reaches the changeset (#212).
  const proposed = new Set<string>(Object.keys(edit));
  if (edit.parentId !== undefined) stored.parentId = entryId(edit.parentId);
  if (edit.name !== undefined) stored.name = edit.name;
  // `'start' in edit` — not `edit.start !== undefined` — so `update(id, { start: undefined })` (the
  // un-date verb, ADR 0012) reaches `stored.start = undefined` rather than being read as "untouched".
  if ('start' in edit)
    stored.start = edit.start === undefined ? undefined : toInstant(context.timeZone, edit.start, operation);
  if ('end' in edit) {
    stored.end =
      edit.end === undefined
        ? undefined
        : toEndInstant(context.timeZone, edit.end, context.dateOnlyEnd, operation);
  }
  const effectiveStart = 'start' in stored ? stored.start : entry.start;
  const effectiveEnd = 'end' in stored ? stored.end : entry.end;
  if (effectiveStart !== undefined && effectiveEnd !== undefined && effectiveEnd < effectiveStart) {
    throw new InvertedSpanError(entry.id, { start: effectiveStart, end: effectiveEnd }, operation);
  }

  stored = writeDeclaredPropsFields(stored, edit, registry);
  return { stored: completeProps(entry, withProposedKeys(stored, proposed)) };
}

/**
 * Reads a whole map of `entries.update()` edits — the extension hook's writes (#209). One `toEditReading`
 * per Entry, so a plugin's cascade takes the exact road `dataset.entries.update(id, edit)` takes: the
 * dataset's zone resolves its dates, `DateOnlyEndRule` decides what a date-only `end` means, and core
 * derives `proposedKeys` from the edit's own keys. A plugin author writes none of that.
 *
 * Every Field key in every Entry's edit runs `write-rule.ts`'s `assertFieldTakesWrite` — the one check
 * `entries.update()` runs too (ADR 0015, folded from two copies by #473's ocr finding): an undeclared
 * key throws `UnknownFieldError` (#209 Q2, one rule on every way in — a silent drop is the fault #197
 * existed for), a `compute` Field throws `ComputedFieldCannotBeWrittenError`, and a locked cell — the
 * Field's own `'never'`, or a plugin's per-entry lock rule (#473) — throws `FieldNotEditableError`.
 * A cascade is a caller-side write, same as `entries.update()`, so it meets the same lock a person at
 * a keyboard meets (ADR 0015, "a third door"). The whole changeset is refused, nothing is staged, and
 * the loop below never reaches `stored.set` for any Entry in this map. A `props` key with no
 * declaration is carried at construction ingest only (ADR 0011) — it is never a live way in.
 *
 * An id nothing knows is skipped — there is no Entry to read the edit against, and `diffEdit` emits
 * no row for such an id either (#209 Q3, tracked as #235).
 */
export function toEditsReading(
  edits: EntryEdits,
  context: EntryReadContext,
  entryFor: (id: EntryId) => StoredEntry | undefined,
  registry: FieldRegistry,
  lockRule: FieldLockRule,
  hierarchySource: HierarchySource,
): EditsReading {
  const stored = new Map<EntryId, ProposedEdit>();
  for (const [id, edit] of edits) {
    // The Entry as this transaction's own body leaves it, not the pre-transaction snapshot: a cascade
    // onto an Entry the same transaction added has no committed state to read against, and one whose
    // span the body just rewrote would be read against the span the commit is replacing (D-S5-45,
    // #212 R2 finding A).
    const entry = entryFor(id);
    if (entry === undefined) continue;
    const query = fieldLockQueryFor(id, entryFor, (e) => parentIdFrom(hierarchySource, e));
    for (const key of Object.keys(edit)) {
      assertFieldTakesWrite(key, registry.get(key), query, lockRule, EXTENDER_OPERATION);
    }
    const reading = toEditReading(edit, context, entry, registry, EXTENDER_OPERATION);
    stored.set(id, reading.stored);
  }
  return { stored };
}
