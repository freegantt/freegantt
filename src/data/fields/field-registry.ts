// data/ — one FieldRegistry per DatasetState (D-S4-1). Resolves Field types, stores the whole
// declaration (`column` included), and never formats or paints.
//
// A Dataset plugin declares Fields through `register`/`registerType`/`registerAggregator` (D-S5-21,
// D-S5-24). Those run while that plugin's `setup()` runs, which is before the construction Rollup —
// a Field must exist before the first Rollup (D-S5-4), which is also why `Dataset.plugins` is
// read-only where `Gantt.plugins` is not. `extensions/install-dataset-plugins.ts` closes each plugin's
// registration gate the moment its `setup()` returns, so a later call is `RegistrationClosedError`.

import type { Aggregator, Field, FieldKey, FieldSource, FieldType } from '../../model/index.js';
import {
  DuplicateFieldKeyError,
  DuplicateFieldSourceError,
  UnknownAggregatorError,
  UnknownFieldTypeError,
} from '../../model/index.js';
import { SHIPPED_AGGREGATORS } from './aggregators.js';
import { CORE_FIELDS } from './core-fields.js';
import { storedSourceOf } from './normalize-source.js';

export interface ResolvedField extends Field {
  readonly source: FieldSource;
}

export interface RollingUpField extends ResolvedField {
  readonly rollUp: Exclude<string, 'none'>;
}

export interface FieldRegistryOptions {
  fields?: readonly Field[];
  fieldTypes?: Readonly<Record<string, FieldType>>;
  aggregators?: Readonly<Record<string, Aggregator>>;
}

function metaSlot(source: FieldSource): string | undefined {
  if (source.from !== 'meta') return undefined;
  return source.key ?? undefined;
}

function mergeField(field: Field, bundle: FieldType | undefined): ResolvedField {
  const merged: Field = bundle === undefined ? { ...field } : { ...bundle, ...field };
  return { ...merged, source: storedSourceOf(field) };
}

export class FieldRegistry {
  readonly #resolved: ResolvedField[] = [];
  readonly #byKey = new Map<string, ResolvedField>();
  readonly #metaSlots = new Map<string, string>();
  readonly #aggregators: Record<string, Aggregator>;
  readonly #fieldTypes: Record<string, FieldType>;

  constructor(options: FieldRegistryOptions = {}) {
    this.#aggregators = { ...SHIPPED_AGGREGATORS, ...options.aggregators };
    this.#fieldTypes = { ...options.fieldTypes };

    for (const field of CORE_FIELDS) this.#add(field, false);
    for (const field of options.fields ?? []) this.#add(field, true);
  }

  /** Declaration order, core Fields first. One array identity for this registry's whole life: every
   *  `register` call runs during construction, before anything reads a Field, so no reader ever sees
   *  this array grow. */
  get all(): readonly ResolvedField[] {
    return this.#resolved;
  }

  get aggregators(): Readonly<Record<string, Aggregator>> {
    return this.#aggregators;
  }

  /** Call: `ctx.fields.register({ key: 'locked', rollUp: 'none' })`. Same rules a constructor-time
   *  declaration obeys — a duplicate key, an unknown Field type, an unknown Aggregator and a taken
   *  `meta` slot each throw the error they already throw at construction. */
  register(field: Field): void {
    this.#add(field, true);
  }

  /** Call: `ctx.fields.registerType('money', { rollUp: 'sum' })`. Register a type before the Field
   *  that names it — `register` resolves the name at the moment it runs. */
  registerType(name: string, type: FieldType): void {
    if (this.#fieldTypes[name] !== undefined) throw new DuplicateFieldKeyError(name);
    this.#fieldTypes[name] = type;
  }

  /** Call: `ctx.fields.registerAggregator('busiestDay', pickBusiestDay)`. An Aggregator is always
   *  referenced by a registered name, never passed inline — a name serializes into a Document and a
   *  function does not (CLAUDE.md, Vocabulary). */
  registerAggregator(name: string, fn: Aggregator): void {
    if (this.#aggregators[name] !== undefined) throw new DuplicateFieldKeyError(name);
    this.#aggregators[name] = fn;
  }

  #add(field: Field, fromConsumer: boolean): void {
    const key = String(field.key);
    if (this.#byKey.has(key)) throw new DuplicateFieldKeyError(key);
    if (fromConsumer && CORE_FIELDS.some((core) => core.key === field.key)) {
      throw new DuplicateFieldKeyError(key);
    }
    if (field.type !== undefined && this.#fieldTypes[field.type] === undefined) {
      throw new UnknownFieldTypeError(field.type);
    }
    const merged = mergeField(field, field.type === undefined ? undefined : this.#fieldTypes[field.type]);
    if (merged.rollUp !== undefined && this.#aggregators[merged.rollUp] === undefined) {
      throw new UnknownAggregatorError(merged.rollUp);
    }
    const slot = metaSlot(merged.source);
    if (slot !== undefined) {
      const owner = this.#metaSlots.get(slot);
      if (owner !== undefined) throw new DuplicateFieldSourceError(slot);
      this.#metaSlots.set(slot, merged.key);
    }
    this.#byKey.set(key, merged);
    this.#resolved.push(merged);
  }

  get(key: FieldKey): ResolvedField | undefined {
    return this.#byKey.get(key);
  }

  has(key: FieldKey): boolean {
    return this.#byKey.has(key);
  }

  aggregator(name: string): Aggregator | undefined {
    return this.#aggregators[name];
  }

  /** Fields that participate in the Rollup after type merge (D-S4-3). */
  rollingUpFields(): readonly RollingUpField[] {
    return this.all.filter(
      (field): field is RollingUpField => field.rollUp !== undefined && field.rollUp !== 'none',
    );
  }

  valuesEqual(key: string, from: unknown, to: unknown): boolean {
    const field = this.get(key);
    if (field?.equals) return field.equals(from, to);
    return Object.is(from, to);
  }
}
