// data/ — the shipped Field type table (D-S4-3). `percent` is the first entry, and a Field naming
// it needs no local declaration: `{ key: 'progress', type: 'percent' }` resolves on its own.

import type { FieldType, FormatContext } from '../../model/index.js';

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

/** Every Field type the library ships, keyed by name. `FieldRegistry` seeds itself from this table
 *  before `options.fieldTypes` — a consumer name of the same key silently wins (`{ ...spread }`
 *  order), while `registerType` on an already-seeded name still throws (`DuplicateFieldKeyError`).
 *  `percent` is the only entry today, and that is itself the precedent: the next shipped type joins
 *  this table, not a bespoke seed in the registry constructor. */
export const SHIPPED_FIELD_TYPES: Readonly<Record<string, FieldType>> = Object.freeze({
  percent,
});
