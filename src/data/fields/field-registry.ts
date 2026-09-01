// data/ — one FieldRegistry per DatasetState (D-S4-1). Resolves Field types, stores the whole
// declaration (`column` included), and never formats or paints.

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
  readonly all: readonly ResolvedField[];
  readonly aggregators: Readonly<Record<string, Aggregator>>;
  readonly #byKey: ReadonlyMap<string, ResolvedField>;

  constructor(options: FieldRegistryOptions = {}) {
    const aggregators: Record<string, Aggregator> = { ...SHIPPED_AGGREGATORS, ...options.aggregators };
    this.aggregators = aggregators;
    const fieldTypes = options.fieldTypes ?? {};
    const resolved: ResolvedField[] = [];
    const byKey = new Map<string, ResolvedField>();
    const metaSlots = new Map<string, string>();

    const add = (field: Field, fromConsumer: boolean): void => {
      const key = String(field.key);
      if (byKey.has(key)) throw new DuplicateFieldKeyError(key);
      if (fromConsumer && CORE_FIELDS.some((core) => core.key === field.key)) {
        throw new DuplicateFieldKeyError(key);
      }
      if (field.type !== undefined && fieldTypes[field.type] === undefined) {
        throw new UnknownFieldTypeError(field.type);
      }
      const merged = mergeField(field, field.type === undefined ? undefined : fieldTypes[field.type]);
      if (merged.rollUp !== undefined && aggregators[merged.rollUp] === undefined) {
        throw new UnknownAggregatorError(merged.rollUp);
      }
      const slot = metaSlot(merged.source);
      if (slot !== undefined) {
        const owner = metaSlots.get(slot);
        if (owner !== undefined) throw new DuplicateFieldSourceError(slot);
        metaSlots.set(slot, merged.key);
      }
      byKey.set(key, merged);
      resolved.push(merged);
    };

    for (const field of CORE_FIELDS) add(field, false);
    for (const field of options.fields ?? []) add(field, true);

    this.all = resolved;
    this.#byKey = byKey;
  }

  get(key: FieldKey): ResolvedField | undefined {
    return this.#byKey.get(key);
  }

  has(key: FieldKey): boolean {
    return this.#byKey.has(key);
  }

  aggregator(name: string): Aggregator | undefined {
    return this.aggregators[name];
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
