// data/ — one FieldRegistry per DatasetState (D-S4-1). Resolves Field types, stores the whole
// declaration (`column` included), and never formats or paints.
//
// A Dataset plugin declares Fields through `register`/`registerType`/`registerAggregator` (D-S5-21,
// D-S5-24). Those run while that plugin's `setup()` runs, which is before the construction Rollup —
// a Field must exist before the first Rollup (D-S5-4), which is also why `Dataset.plugins` is
// read-only where `Gantt.plugins` is not. `extensions/install-dataset-plugins.ts` closes each plugin's
// registration gate the moment its `setup()` returns, so a later call is `RegistrationClosedError`.
//
// Every declaration records who made it (D-S5-33): the library, the consumer, or one named plugin.
// `all` answers what this Dataset resolves against; `authored` answers what the consumer wrote, which
// is the only half `toJSON` writes. A plugin re-declares its own Fields the next time it is installed,
// so a Document that carried them would author a Field with no plugin behind it.

import type { Aggregator, Field, FieldKey, FieldSource, FieldType, PluginId } from '../../model/index.js';
import {
  DuplicateFieldKeyError,
  DuplicateFieldSourceError,
  IllegalCoreFieldOverrideError,
  UnknownAggregatorError,
  UnknownFieldTypeError,
} from '../../model/index.js';
import { SHIPPED_AGGREGATORS } from './aggregators.js';
import { CORE_FIELDS, isCoreFieldKey } from './core-fields.js';
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

/** #142: the only keys a consumer declaration may carry when it names a core Field's key. A core
 *  Field is the library's own — it cannot be redeclared — but this one key is a fact about the
 *  Dataset, not about the Field's identity, so a consumer may still state it. The next key added
 *  here is the whole change; nothing else in `#mergeCoreFieldOverride` needs to know its name. */
const CORE_FIELD_OVERRIDABLE_KEYS = ['editable'] as const;

/** The first key on `field`, other than `key` itself, that `CORE_FIELD_OVERRIDABLE_KEYS` does not
 *  name — `undefined` when every key `field` carries is legal to override. Reads the object's own
 *  keys, not `Field`'s full shape, so an override that states nothing beyond `key` (a no-op) passes. */
function illegalCoreOverrideKey(field: Field): string | undefined {
  return Object.keys(field).find(
    (key) => key !== 'key' && !(CORE_FIELD_OVERRIDABLE_KEYS as readonly string[]).includes(key),
  );
}

export class FieldRegistry {
  readonly #resolved: ResolvedField[] = [];
  readonly #byKey = new Map<string, ResolvedField>();
  /** D-S5-33: the plugin that declared each plugin-declared key. A key absent here came from the
   *  library (a core Field) or from the consumer's own `fields` option. */
  readonly #declaringPlugin = new Map<string, PluginId>();
  /** #142: every core key a consumer has already overridden (`#mergeCoreFieldOverride`) — a second
   *  declaration naming the same core key is a clash, same as two ordinary declarations sharing a
   *  key. */
  readonly #consumerOverriddenCoreKeys = new Set<string>();
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

  /** Call: `encodeFieldDocument(dataset.fields.authored)`. The Fields the consumer wrote, in
   *  declaration order — core Fields and every plugin-declared Field left out (D-S5-33). This is what
   *  a Document carries: a plugin declares its own Fields again on its next install, so writing them
   *  here would author a Field the reading application has nothing behind. The plugin's *values* are
   *  not affected — those sit in `Entry.meta`, which round-trips whether the Field is declared or not. */
  get authored(): readonly ResolvedField[] {
    return this.#resolved.filter(
      (field) => !isCoreFieldKey(field.key) && !this.#declaringPlugin.has(String(field.key)),
    );
  }

  get aggregators(): Readonly<Record<string, Aggregator>> {
    return this.#aggregators;
  }

  /** Call: `ctx.fields.register({ key: 'locked', rollUp: 'none' }, 'acme/locks')`. Same rules a
   *  constructor-time declaration obeys — a duplicate key, an unknown Field type, an unknown
   *  Aggregator and a taken `meta` slot each throw the error they already throw at construction.
   *  `declaredBy` is the calling plugin's own id, so this Field stays out of `authored` (D-S5-33). */
  register(field: Field, declaredBy: PluginId): void {
    this.#add(field, true);
    this.#declaringPlugin.set(String(field.key), declaredBy);
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
    if (fromConsumer && isCoreFieldKey(field.key)) {
      this.#mergeCoreFieldOverride(field, key);
      return;
    }
    if (this.#byKey.has(key)) throw new DuplicateFieldKeyError(key);
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

  /** #142: `field` names a core Field's key. A core Field cannot be redeclared, but one key of it
   *  may be overridden — `CORE_FIELD_OVERRIDABLE_KEYS` names which. Call: `fields: [{ key: 'start',
   *  editable: false }]` — "declare that `start` is not editable." Replaces the core entry in place,
   *  at its own position in declaration order, so `all`/`get` answer the merged Field from here on. */
  #mergeCoreFieldOverride(field: Field, key: string): void {
    if (this.#consumerOverriddenCoreKeys.has(key)) throw new DuplicateFieldKeyError(key);
    const illegalKey = illegalCoreOverrideKey(field);
    if (illegalKey !== undefined) {
      throw new IllegalCoreFieldOverrideError(key, illegalKey, CORE_FIELD_OVERRIDABLE_KEYS);
    }
    const core = this.#byKey.get(key);
    if (core === undefined) throw new DuplicateFieldKeyError(key); // unreachable: core Fields add first.
    const merged: ResolvedField = {
      ...core,
      ...(field.editable !== undefined ? { editable: field.editable } : {}),
    };
    this.#byKey.set(key, merged);
    this.#resolved[this.#resolved.indexOf(core)] = merged;
    this.#consumerOverriddenCoreKeys.add(key);
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
