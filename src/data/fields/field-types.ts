// data/ — the shipped Field type table (D-S4-3). A Field naming a seeded type needs no local
// declaration: `{ key: 'progress', type: 'percent' }` resolves on its own. `currency({ code })` is a
// factory, not a seeded name: pass the bundle inline, or register it under a name of your own.

import type { Duration, FieldType, FormatContext, Instant } from '../../model/index.js';
import { DATE_TIME_FORMAT, diffMs, formatDate, MS } from '../../time/index.js';

/** Stringifies a primitive Field value for display; anything else (undefined, object) renders empty. */
export function stringifyPrimitive(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

/** Reads trimmed text as a number. Refuses a non-finite result (`'abc'` → `undefined`) and never
 *  rounds. Does not guess a locale grouping character or a currency sign. */
function parseNumber(text: string): number | undefined {
  const parsed = Number(text.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatNumber(value: number | undefined, ctx: FormatContext): string {
  if (typeof value !== 'number') return '';
  return new Intl.NumberFormat(ctx.locale, { style: 'decimal' }).format(value);
}

function compareNumber(a: number | undefined, b: number | undefined): number {
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  return a - b;
}

/** Formats an Instant the way a date Field (and core `start`) shows it — zone-aware, with clock
 *  time. An absent value is a blank cell, not a guessed epoch. */
export function formatInstant(value: unknown, ctx: FormatContext): string {
  if (value === undefined || value === null) return '';
  return formatDate(ctx.timeZone, value as Instant, ctx.locale, DATE_TIME_FORMAT);
}

function compareInstant(a: Instant | undefined, b: Instant | undefined): number {
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  return diffMs(a, b);
}

/** Today's day formatter: a whole number of days is `12 d`; anything else keeps one decimal. The
 *  unit is always millisecond (`measureEntryDuration`), so this divide is correct by construction
 *  rather than by luck (#274). */
export function formatDuration(value: unknown): string {
  if (value === undefined || value === null) return '';
  const days = (value as Duration).value / MS.DAY;
  if (Number.isInteger(days)) return `${days} d`;
  return `${days.toFixed(1)} d`;
}

export function compareDuration(a: Duration | undefined, b: Duration | undefined): number {
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  return a.value - b.value;
}

/** A string Field. Ships `stringifyPrimitive` and a text input. No rollUp, no compare — a default
 *  aggregator would overwrite an authored parent value on every dataset naming this type. */
export const text: FieldType<string> = Object.freeze<FieldType<string>>({
  formatValue: stringifyPrimitive,
  inputType: 'text',
});

/** A numeric Field. Formats through `Intl.NumberFormat`'s decimal style, parses with `Number` after
 *  trim, and sorts numerically. Ships no `rollUp`: a default aggregator would overwrite an authored
 *  parent value on every dataset naming this type, with no per-Field escape (ADR 0008). */
export const number: FieldType<number> = Object.freeze<FieldType<number>>({
  formatValue: formatNumber,
  parseValue: (text) => parseNumber(text),
  compare: compareNumber,
  inputType: 'number',
  column: { align: 'end' },
});

/** Strips a trailing `%` and surrounding whitespace, then reads what remains as a number. Refuses a
 *  non-finite result (`'abc'` → `undefined`) and never rounds — `120` and `-5` both pass through. */
function parsePercent(text: string): number | undefined {
  const trimmed = text.trim().replace(/%\s*$/, '').trim();
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Formats through `Intl.NumberFormat`'s own `'percent'` style, which reads a fraction — so a
 *  stored `35` divides by 100 first. Locale-correct spacing and the percent sign both come from
 *  `ctx.locale` this way; a hand-rolled `${value}%` gets French's `35 %` and Arabic's `٪٣٥` wrong.
 *  No `maximumFractionDigits` override — the style's own default (`0`) rounds `33.5` to `34%` the
 *  same way it rounds `weightedMeanByDuration`'s raw quotient, with nothing this Field type does
 *  itself to make that happen. A caller who wants fraction digits states `formatValue` its own way. */
function formatPercent(value: number | undefined, ctx: FormatContext): string {
  if (typeof value !== 'number') return '';
  return new Intl.NumberFormat(ctx.locale, { style: 'percent' }).format(value / 100);
}

/** A percent reading, stored 0–100 (not 0–1, which is `Intl`'s own convention — the divide happens
 *  only inside `formatValue`). Ships with no `rollUp`: a default aggregator would overwrite an
 *  authored parent value on every dataset naming this type, with no per-Field escape (ADR 0008). A
 *  consumer who wants duration-weighted roll-up names `rollUp: 'weightedMeanByDuration'` on the
 *  Field itself — that Aggregator already ships (`aggregators.ts`).
 *
 *  Never clamps. `120` formats as `120%` and `parseValue('120')` returns `120` — a percent is a
 *  unit, and a reading over 100 is real data. Only a meter's paint clamps a percent for display; a
 *  Field type is not that seam. */
export const percent: FieldType<number> = Object.freeze<FieldType<number>>({
  formatValue: formatPercent,
  parseValue: (text) => parsePercent(text),
  inputType: 'number',
  column: { align: 'end' },
});

/** An Instant Field. Formats through `formatDate` with `DATE_TIME_FORMAT` — the same display core
 *  `start` uses. Ships no `parseValue` and no `inputType`: the inline editor routes `type: 'date'`
 *  through the `dateInput` seam (D-S5-20), not the generic `<input>`. No rollUp. */
export const date: FieldType<Instant> = Object.freeze<FieldType<Instant>>({
  formatValue: formatInstant,
  compare: compareInstant,
});

/** A Duration Field. Formats as days (`12 d` / one decimal) and sorts by the millisecond value.
 *  Ships no `parseValue`, no `inputType`, and no `rollUp` — a compute Field cannot take those, and
 *  this type is the same bundle that compute duration uses for display. */
export const duration: FieldType<Duration> = Object.freeze<FieldType<Duration>>({
  formatValue: formatDuration,
  compare: compareDuration,
});

/** True sorts after false — `0`/`1` through `Number`, the same trick `compareDuration` plays on a
 *  branded value. `undefined`/`null` sort last, matching every other `compare*` in this file. */
function compareBoolean(a: boolean | undefined, b: boolean | undefined): number {
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  return Number(a) - Number(b);
}

/** A boolean reading (Q22). Formats through `stringifyPrimitive` (`'true'`/`'false'`), sorts false
 *  before true, and opens a checkbox rather than a text `<input>` (Q31) — so it ships no
 *  `parseValue`: the checkbox editor reads and writes `.checked` directly
 *  (`extensions/features/inline-editing.ts`), never `.value`. Ships no `rollUp`, the same reason
 *  every other type in this file ships none: a default aggregator would overwrite an authored
 *  parent value on every dataset naming this type. */
export const boolean: FieldType<boolean> = Object.freeze<FieldType<boolean>>({
  formatValue: stringifyPrimitive,
  compare: compareBoolean,
  inputType: 'checkbox',
});

/** Call: `{ key: 'cost', type: currency({ code: 'EUR' }), rollUp: 'sum' }`. Also still works as a
 *  named type: `fieldTypes: { eur: currency({ code: 'EUR' }) }` then `type: 'eur'`.
 *
 *  The factory closes over `code`. A bad ISO code throws at this call, not at first format — one
 *  `NumberFormat` construct is the check. Ships no `rollUp`: the Field that wants a sum names it. */
export function currency(options: { code: string }): FieldType<number> {
  const { code } = options;
  new Intl.NumberFormat(undefined, { style: 'currency', currency: code });
  return Object.freeze<FieldType<number>>({
    formatValue: (value, ctx) => {
      if (typeof value !== 'number') return '';
      return new Intl.NumberFormat(ctx.locale, { style: 'currency', currency: code }).format(value);
    },
    parseValue: (text) => parseNumber(text),
    inputType: 'number',
    column: { align: 'end' },
  });
}

/** Every Field type the library ships, keyed by name. `FieldRegistry` seeds itself from this table
 *  before `options.fieldTypes` — a consumer name of the same key silently wins (`{ ...spread }`
 *  order), while `registerType` on an already-seeded name still throws (`DuplicateFieldKeyError`).
 *  `currency` is a factory, not a row in this table: a consumer names the bundle, or registers the
 *  returned bundle under a name of their own. */
export const SHIPPED_FIELD_TYPES: Readonly<Record<string, FieldType>> = Object.freeze({
  text,
  number,
  percent,
  date,
  duration,
  boolean,
});
