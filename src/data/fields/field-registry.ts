// data/ — one FieldRegistry per DatasetState (D-S4-1). Resolves Field types, stores the whole
// declaration (`column` included), and never formats or paints.
//
// A Dataset plugin declares Fields through `register`/`registerType`/`registerAggregator` (D-S5-21,
// D-S5-24). Those run while that plugin's `setup()` runs, which is before the construction Rollup —
// a Field must exist before the first Rollup (D-S5-4), which is also why `Dataset.plugins` is
// read-only where `Gantt.plugins` is not. `extensions/install-dataset-plugins.ts` closes each plugin's
// registration gate the moment its `setup()` returns, so a later call is `RegistrationClosedError`.
//
// `all` answers what this Dataset resolves against, core Fields, the consumer's own, and a plugin's,
// in one declaration order (D-S5-33). No door singles out who declared which — a declaration is code
// the caller already holds, not data the library owes a reader (ADR 0016).

import type {
  Aggregator,
  AggregatorName,
  Field,
  FieldEditable,
  FieldKey,
  FieldType,
} from '../../model/index.js';
import {
  ComputedFieldCannotBeWrittenError,
  FreeGanttError,
  UnknownFieldError,
  ReservedFieldKeyError,
  DuplicateFieldKeyError,
  IllegalCoreFieldOverrideError,
  UnknownAggregatorError,
  UnknownFieldTypeError,
} from '../../model/index.js';
// Not re-exported from `model/index.ts` — a code a consumer cannot reach stays off its barrel too (#380).
import type { InternalThrownCode } from '../../model/errors.js';
import { SHIPPED_AGGREGATORS } from './aggregators.js';
import { CORE_FIELDS, isCoreFieldKey } from './core-fields.js';
import { SHIPPED_FIELD_TYPES } from './field-types.js';
import { sizingOfColumn } from './column-sizing.js';

/** A Field after its `type` bundle merges in — the shape every reader beyond declaration holds
 *  (ADR 0011: the union above is a declaration-site aid, so this stays a plain `Field`, not a second
 *  shape narrowed to one arm). */
export type ResolvedField = Field;

export type RollingUpField = ResolvedField & { rollUp: Exclude<string, 'none'> };

export interface FieldRegistryOptions {
  fields?: readonly Field[];
  fieldTypes?: Readonly<Record<string, FieldType>>;
  aggregators?: Readonly<Record<string, Aggregator>>;
}

/** #142/percent-shipped: `field.column` and `bundle.column` merge one level deep, not whole-object.
 *  A shallow `{ ...bundle, ...field }` lets a Field naming only `column: { header }` drop the type's
 *  whole `column` bundle — its alignment included — the moment it wants to keep its own header.
 *  `width`/`flex` still merge as the one pair they are (#249): a Field that sizes itself at all
 *  replaces the type's sizing whole, never key by key. `sizingOfColumn` picks that pair; take it off
 *  whichever declaration owns the sizing — never that declaration itself, or the loser's header and
 *  alignment ride in behind it. */
function mergeColumn(field: Field, bundle: FieldType | undefined): Field['column'] {
  const from = bundle?.column;
  const own = field.column;
  if (from === undefined) return own;
  if (own === undefined) return from;
  const { width: _fromWidth, flex: _fromFlex, ...fromRest } = from;
  const { width: _ownWidth, flex: _ownFlex, ...ownRest } = own;
  return { ...fromRest, ...ownRest, ...sizingOfColumn(own, from) };
}

/** Call: `typeBundleOf(field, types)` — the bundle this Field names, or the object it passed as
 *  `type`. A string looks up the table; an unknown string is `UnknownFieldTypeError`. An object is
 *  the bundle itself. */
function typeBundleOf(field: Field, types: Readonly<Record<string, FieldType>>): FieldType | undefined {
  const declared = field.type;
  if (declared === undefined) return undefined;
  if (typeof declared !== 'string') return declared;
  const named = types[declared];
  if (named === undefined) throw new UnknownFieldTypeError(declared);
  return named;
}

/** An inline `type` bundle must not stay on the resolved Field — it is a function object, not a
 *  name. Drop it before the spread so `{ ...bundle, ...field }` cannot write it back. */
function fieldWithoutInlineType(field: Field): Field {
  if (typeof field.type === 'string' || field.type === undefined) return field;
  const { type: _inline, ...rest } = field;
  return rest;
}

function mergeField(field: Field, bundle: FieldType | undefined): ResolvedField {
  const declared = fieldWithoutInlineType(field);
  const merged = bundle === undefined ? { ...declared } : { ...bundle, ...declared };
  const column = mergeColumn(field, bundle);
  return toStoredEditable({ ...merged, ...(column !== undefined ? { column } : {}) });
}

/** #142/#470: the only keys a consumer declaration may carry when it names a core Field's key. A
 *  core Field is the library's own — it cannot be redeclared — but these keys are facts about the
 *  Dataset, not about the Field's identity, so a consumer may still state them. `#mergeCoreFieldOverride`
 *  iterates this list; a key added here needs no other line changed, and no key names itself twice. */
/** Does this Field take part in the Rollup? `'none'` is a declared opt-out, not an absent key
 *  (`register({ key: 'locked', rollUp: 'none' })`), so an absent key and an opted-out one both
 *  answer `false`. One predicate, because two readers ask: the Rollup pass itself, and #256's
 *  `canWrite`, which refuses a roll-up parent's rolling-up cell and must refuse exactly the set the
 *  pass would overwrite. Two spellings of this test disagreed on `'none'`, and the cell then said
 *  "this value comes from its children" about a value nothing rolls up. */
export function rollsUp(field: Field): boolean {
  return field.rollUp !== undefined && field.rollUp !== 'none';
}

/** How far may this Field's value change (ADR 0015)? One accessor, because the alias table and the
 *  default belong in one place: `data/write-rule.ts` reads it at both thresholds, and a Field
 *  declared by hand — a test's own literal, a `FieldLookup` a consumer wrote — still reaches those
 *  thresholds carrying the boolean the public type accepts.
 *
 *  An **absent** key answers `'anywhere'`: a declared value is editable until the consumer locks it
 *  (decision 18, grill 2026-09-10). The default lives here and nowhere else, so no core Field and no
 *  spec sentence restates it. */
export function editableOf(field: Field): FieldEditable {
  const declared = field.editable;
  if (declared === undefined || declared === true) return 'anywhere';
  if (declared === false) return 'never';
  return declared;
}

/** The stored spelling of one declaration's `editable`. `true`/`false` are input-only aliases, the
 *  way an ISO string is an input alias for an `Instant`, so `dataset.fields.all` reads back one
 *  word. An absent key stays absent — `editableOf` owns the default (ADR 0015). */
function toStoredEditable(field: Field): Field {
  if (typeof field.editable !== 'boolean') return field;
  return { ...field, editable: field.editable ? 'anywhere' : 'never' };
}

/** Where `target` sits in `resolved`, or a thrown `FreeGanttError` when it is nowhere in the array
 *  (#260). A silent `-1` write turns `resolved[resolved.indexOf(target)] = …` into `resolved["-1"] =
 *  …` — a new property, not an element — and desyncs `#resolved` from `#byKey` with no throw and no
 *  type error. Pulled out of `#mergeCoreFieldOverride` so the guard runs against a plain array in a
 *  test, not only through the class's own private state. */
export function requireResolvedIndex(
  resolved: readonly ResolvedField[],
  target: ResolvedField,
  key: string,
): number {
  const index = resolved.indexOf(target);
  if (index === -1) {
    throw new FreeGanttError(
      'field-registry-resolved-key-missing' satisfies InternalThrownCode,
      `FieldRegistry: core Field "${key}" is declared but missing from the resolved list. This is an internal error; report it.`,
    );
  }
  return index;
}

const CORE_FIELD_OVERRIDABLE_KEYS = ['editable', 'rollUp'] as const;
type CoreFieldOverridableKey = (typeof CORE_FIELD_OVERRIDABLE_KEYS)[number];

/** The first key on `field`, other than `key` itself, that `CORE_FIELD_OVERRIDABLE_KEYS` does not
 *  name — `undefined` when every key `field` carries is legal to override. Reads the object's own
 *  keys, not `Field`'s full shape, so an override that states nothing beyond `key` (a no-op) passes. */
function illegalCoreOverrideKey(field: Field): string | undefined {
  return Object.keys(field).find(
    (key) => key !== 'key' && !(CORE_FIELD_OVERRIDABLE_KEYS as readonly string[]).includes(key),
  );
}

export class FieldRegistry {
  #resolved: ResolvedField[] = [];
  readonly #byKey = new Map<string, ResolvedField>();
  /** #142: every core key a consumer has already overridden (`#mergeCoreFieldOverride`) — a second
   *  declaration naming the same core key is a clash, same as two ordinary declarations sharing a
   *  key. */
  readonly #consumerOverriddenCoreKeys = new Set<string>();
  readonly #aggregators: Record<string, Aggregator>;
  readonly #fieldTypes: Record<string, FieldType>;

  constructor(options: FieldRegistryOptions = {}) {
    this.#aggregators = { ...SHIPPED_AGGREGATORS, ...options.aggregators };
    // Seed first so a consumer can override a shipped name at construction (#264). `registerType`
    // on that same name still throws DuplicateFieldKeyError — the two doors are meant to disagree.
    // The cost: core `start` and `end` name `type: 'date'`, so replacing `date` rewrites `start`'s
    // formatValue and compare, and `end`'s compare only (`end` keeps formatEnd because mergeField
    // is `{ ...bundle, ...declared }`). The Field-key door stays locked:
    // `{ key: 'start', type: 'text' }` still throws IllegalCoreFieldOverrideError.
    this.#fieldTypes = { ...SHIPPED_FIELD_TYPES, ...options.fieldTypes };

    for (const field of CORE_FIELDS) this.#add(field, false);
    for (const field of options.fields ?? []) this.#add(field, true);
  }

  /** Declaration order, core Fields first. The array never grows after construction: every
   *  `register` call runs there, before anything reads a Field. `setEditable` replaces it with a
   *  copy of the same length, so a reader that cached it by identity sees the new `editable` and a
   *  reader mid-pass keeps a list that stays true (#187). */
  get all(): readonly ResolvedField[] {
    return this.#resolved;
  }

  get aggregators(): Readonly<Record<string, Aggregator>> {
    return this.#aggregators;
  }

  /** Call: `ctx.fields.register({ key: 'locked', rollUp: 'none' })`. Same rules a constructor-time
   *  declaration obeys — a duplicate key, an unknown Field type, an unknown Aggregator and a
   *  `compute` Field naming `rollUp`/`editable` each throw the error they already throw at
   *  construction. */
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
    // ADR 0011: `props` is the one reserved key — it names the whole bag a `props`-addressed Field
    // lives inside, so a Field cannot claim that name for itself.
    if (key === 'props') throw new ReservedFieldKeyError(key);
    if (fromConsumer && isCoreFieldKey(field.key)) {
      this.#mergeCoreFieldOverride(field, key);
      return;
    }
    if (this.#byKey.has(key)) throw new DuplicateFieldKeyError(key);
    const merged = mergeField(field, typeBundleOf(field, this.#fieldTypes));
    this.#refuseComputeConflict(key, merged);
    this.#refuseUnknownAggregator(merged.rollUp);
    this.#byKey.set(key, merged);
    this.#resolved.push(merged);
  }

  /** ADR 0011: a `compute` Field has no stored home, so `rollUp`/`editable` beside it is refused
   *  here — before `editable`, or the surviving message tells a consumer to declare an `editable`
   *  this door already rejects. A fresh Field and a core Field override both reach this: an
   *  override can name `rollUp`/`editable` on a core `compute` Field (`duration`) just as easily
   *  as a fresh declaration can. */
  #refuseComputeConflict(key: string, merged: ResolvedField): void {
    if ('compute' in merged && (merged.rollUp !== undefined || merged.editable !== undefined)) {
      throw new ComputedFieldCannotBeWrittenError(key, 'fields');
    }
  }

  /** Does `rollUp` name an Aggregator this registry knows? A fresh Field and a core Field override
   *  both reach this: neither may name an Aggregator nobody registered. */
  #refuseUnknownAggregator(rollUp: AggregatorName | undefined): void {
    if (rollUp !== undefined && this.#aggregators[rollUp] === undefined) {
      throw new UnknownAggregatorError(rollUp);
    }
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
    // `field` cross-declares `editable`/`rollUp` on both `Field` arms (one real, one `never`), so
    // both keys read off it without a cast.
    const declared: Pick<Field, CoreFieldOverridableKey> = field;
    const overrides: Partial<Pick<Field, CoreFieldOverridableKey>> = {};
    if (declared.editable !== undefined) overrides.editable = declared.editable;
    if (declared.rollUp !== undefined) overrides.rollUp = declared.rollUp;
    const merged = toStoredEditable({ ...core, ...overrides });
    this.#refuseComputeConflict(key, merged);
    this.#refuseUnknownAggregator(merged.rollUp);
    const coreIndex = requireResolvedIndex(this.#resolved, core, key);
    this.#byKey.set(key, merged);
    this.#resolved[coreIndex] = merged;
    this.#consumerOverriddenCoreKeys.add(key);
  }

  /** Call: `dataset.setFieldEditable('start', 'never')` — the one Field attribute that may change
   *  after setup (ADR 0015, Q16). It changes a declared Field; it never adds one, so an unknown key
   *  is `UnknownFieldError`.
   *
   *  It copies the Field and replaces `all`'s array identity, because a config value is a value
   *  (#187): a reader caches that array by identity, and a poke at `dataset.field('start').editable`
   *  would change nothing it can see. The Field a caller already holds keeps the answer it had — it
   *  is a resolved snapshot, not a signal. */
  setEditable(key: FieldKey, editable: FieldEditable | boolean): void {
    const field = this.get(key);
    if (field === undefined) throw new UnknownFieldError(key, 'dataset.setFieldEditable');
    // `compute` first, and for the reason the register door checks it first: a compute Field has no
    // stored home, so opening it would promise a write that lands nowhere (ADR 0015).
    if ('compute' in field)
      throw new ComputedFieldCannotBeWrittenError(String(key), 'dataset.setFieldEditable');
    const next = toStoredEditable({ ...field, editable });
    this.#byKey.set(String(key), next);
    this.#resolved = this.#resolved.map((declared) => (declared === field ? next : declared));
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
    return this.all.filter((field): field is RollingUpField => rollsUp(field));
  }

  valuesEqual(key: string, from: unknown, to: unknown): boolean {
    const field = this.get(key);
    if (field?.equals) return field.equals(from, to);
    return Object.is(from, to);
  }
}
