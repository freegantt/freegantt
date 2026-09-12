// layout/ — a variant is a rule, and this file is where a row meets one (ADR 0018). One object
// answers four questions about a row's shape: which rows wear it (`when`), what shape it draws
// (`items`), how it looks (`paint`), and what you can do to it (`can`). Before this, each question
// was its own registration, and the variant's name was repeated at every one.
//
// Nothing stores a variant. It is resolved per Gantt, every layout pass, from the rules installed on
// that Gantt (I2). An Entry carries no stored classification, which is what ADR 0013 decided and
// this file does not spend.

import type {
  CoreFieldValues,
  Disposer,
  Entry,
  EntryId,
  ElementDescription,
  Field,
  FieldKey,
  Interactions,
  PluginId,
} from '../../model/index.js';
import type { BarRenderer } from '../renderer.js';
import type { Item, ItemProducer, VariantItems } from './item.js';
import { wholeEntryItem, entryItem } from './item.js';

/** A rule that reads the whole row. Call: `when: (entry) => entry.duration()?.value === 0`. It runs
 *  on the hover path, so keep it cheap: it answers a question and draws nothing. */
export type VariantPredicate<TProps = Record<string, unknown>> = (entry: Entry<TProps>) => boolean;

/** Every named Field equals the value beside it, and several keys are AND (`J6`).
 *
 *  **A match is equality, never "has a value".** `{ 'demo:phaseId': true }` claims the rows whose
 *  `demo:phaseId` **is** `true` — not the rows that carry a phase id. Ask that with a predicate:
 *  `(entry) => entry.read('demo:phaseId') !== undefined`.
 *
 *  **A key no Field declares matches no row.** The match reads through the Field registry, so a
 *  typo claims nothing rather than taking the layout pass down. A plugin that matches on its own
 *  key declares that key from its `data` half (`ctx.fields.register`).
 *
 *  Each key reads through `entry.read(key)` and compares with that Field's own `equals`
 *  (`model/field.ts`), so `{ start: someInstant }` and `{ status: 'blocked' }` compare the way a
 *  Grid comparison does. With no `equals` declared, the comparison is `Object.is`. */
export type FieldMatch<TProps = Record<string, unknown>> = Partial<CoreFieldValues> & {
  [K in keyof TProps]?: TProps[K];
} & { [key: string]: unknown };

/** What `EntryVariant.when` takes: the field-match shorthand, or a predicate. Both ship (refuted
 *  item 7 in `plans/row-redesign/README.md`). The shorthand is what core can index — it names its
 *  keys — and the predicate answers everything the shorthand cannot. */
export type VariantRule<TProps = Record<string, unknown>> = FieldMatch<TProps> | VariantPredicate<TProps>;

/** One variant, as one object. A consumer installs it through `GanttOptions.variants`; a plugin
 *  installs the same shape through `ctx.variants.add(variant)`. One type, two doors.
 *
 *  ```ts
 *  variants: [{ name: 'milestone', when: { milestone: true }, paint: milestoneBar, can: { resize: false } }]
 *  ```
 *
 *  Nothing here is stored on the Entry. A variant is a function of the row, resolved per Gantt, so
 *  two Gantts on one Dataset may paint the same row differently (I2). */
export interface EntryVariant<TProps = Record<string, unknown>> {
  /** This variant's identity — the `data-variant` a consumer styles, and the registry key. It names
   *  a DOM identity, never a stored value. */
  name: string;
  /** Which rows wear it. Omit it on the last-resort variant, which answers for every row nothing
   *  newer claims — core's own `leaf` is the shipped one. */
  when?: VariantRule<TProps>;
  /** What shape it draws. Default: one whole-entry Item (`wholeEntryItem`). */
  items?: ItemProducer;
  /** How it looks. A paint that names no content of its own — `class`, `style` or `attrs` alone —
   *  decorates the library's own bar and keeps its label (`J34`). */
  paint?: BarRenderer;
  /** What you can do to it. One level under the consumer's own `interactions`, one level over the
   *  library rule. Answer `undefined` from a predicate for "no opinion" (`J13`). */
  can?: Interactions;
}

/** Two rules from one source both claimed one Entry. The newest paints; the older one is reported
 *  and draws nothing. The library never arbitrates between plugins — the consumer chose which ones
 *  to install, so core names both sides and carries on. */
export interface DoubleVariantClaim {
  entryId: EntryId;
  /** The rule that wins and paints. */
  painted: VariantClaimant;
  /** The rule that also answered yes, and draws nothing. */
  ignored: VariantClaimant;
}

/** One side of a `DoubleVariantClaim`. `pluginId` is absent for a variant the consumer installed
 *  through `GanttOptions.variants`, or for one a test registered outside a plugin. */
export interface VariantClaimant {
  variant: string;
  pluginId?: PluginId;
}

/** Where a `DoubleVariantClaim` goes. `GanttShell` supplies one — see its `#reportDoubleClaim`,
 *  which raises the `'variant-claimed-twice'` report and holds the one-per-pair rule. A registry
 *  built without one resolves a double claim silently to the newest rule, and never asks a second
 *  question. That keeps `layout/` clear of error plumbing, and it is what a test registry gets. */
export type ReportDoubleClaim = (collision: DoubleVariantClaim) => void;

/** Who installed a rule, and therefore which rules it can lose to. The consumer's own `variants`
 *  win over every plugin's, and every plugin's win over core's two — the same ladder `plans/02` §4
 *  already states for a renderer (D-S5-11). Within one rank, the newest registration wins (`Q5`). */
const CORE_RANK = 0;
const PLUGIN_RANK = 1;
const CONSUMER_RANK = 2;

interface VariantRegistration {
  readonly variant: EntryVariant;
  /** `variant.items`, or the whole-entry default, bound to this variant's name once here. */
  readonly items: ItemProducer;
  /** `variant.when`, compiled to one predicate. Absent on the last-resort variant, which claims
   *  nothing and therefore never collides with anything. */
  readonly claim: VariantPredicate | undefined;
  readonly rank: number;
  readonly seq: number;
  readonly pluginId: PluginId | undefined;
}

export interface VariantRegistry extends VariantItems {
  /** The variant this row wears. Walks newest-first, over the consumer's rules, then every plugin's,
   *  then core's two, and stops at the first rule that answers yes (`Q5`). Every row resolves,
   *  because core's `leaf` carries no `when`. */
  variantFor(entry: Entry): string;
  /** What `variant` draws — its own `items`, or the whole-entry default. */
  itemsFor(variant: string): ItemProducer | undefined;
  /** How `variant` looks, or `undefined` for the library's own bar. */
  paintFor(variant: string): BarRenderer | undefined;
  /** What `variant` allows, or `undefined` for no opinion at this level. */
  interactionsFor(variant: string): Interactions | undefined;
  /** `ctx.variants.add(variant)` — a plugin's own. It wins over core's two and loses to the
   *  consumer's. The returned `Disposer` removes exactly this registration. */
  addPluginVariant(variant: EntryVariant, pluginId?: PluginId): Disposer;
  /** `GanttOptions.variants` — the consumer's own. It wins over every plugin's, whatever order the
   *  plugins installed in, which is the posture every other consumer/plugin pair already takes
   *  (D-S5-11). */
  addConsumerVariant(variant: EntryVariant): Disposer;
}

/** What a `VariantRegistry` reads outside itself. Both are live: a Gantt may be rebound to another
 *  Dataset, and the reporter is the shell's own. */
export interface VariantRegistryPorts {
  /** `dataset.field` — the Field registry a field match reads. It answers which keys are declared
   *  and carries each one's own `equals`.
   *
   *  **Required, because "no port" and "no Field" are two different answers.** A registry with no
   *  way to look a Field up cannot tell a declared key from a typo, and a registry that guesses
   *  either reads an undeclared key (which throws) or refuses a declared one. A registry built
   *  outside a Dataset says so with `() => undefined`: no key is declared. */
  fieldFor: (key: FieldKey) => Field | undefined;
  reportDoubleClaim?: ReportDoubleClaim | undefined;
}

/** The summary rail's class, and nothing else — no text, no children. So the library keeps painting
 *  this bar's own label, and `fg-bar-summary` is an ordinary variant class rather than a core
 *  lookup table keyed by a variant name (ADR 0018). One frozen object: the hover path allocates
 *  nothing. */
const SUMMARY_BAR: ElementDescription = Object.freeze({
  class: Object.freeze({ 'fg-bar-summary': true }),
});

const PARENT_VARIANT_NAME = 'parent';
const LEAF_VARIANT_NAME = 'leaf';

/** Core's two, as ordinary `EntryVariant` objects with nothing special about them. They register
 *  **first**, and at the lowest rank, because core is the floor every plugin and every consumer
 *  overrides. `leaf` carries no `when`, so it answers for every row and the floor is total.
 *
 *  **`leaf` registers before `parent`, and the order inside this list is load-bearing** (`J37`).
 *  The walk is newest-first, and a variant with no `when` claims every row. Put `leaf` second and
 *  it answers before `parent` ever runs, so no row is ever a summary. The floor registers first,
 *  and every rule — core's own `parent` included — stands on it. */
const CORE_VARIANTS: readonly EntryVariant[] = Object.freeze([
  {
    name: LEAF_VARIANT_NAME,
    items: produceLeafItems,
  },
  {
    name: PARENT_VARIANT_NAME,
    when: (entry: Entry) => entry.hasChildren,
    paint: () => SUMMARY_BAR,
  },
]);

/** A leaf draws one Item per Segment, or one over its whole span when it has none. The only shipped
 *  producer that is not the whole-entry default.
 *
 *  Fallback branch, reached only for a spanning Entry with no Segments of its own (the plain
 *  start/end case). Same load-bearing cast as `wholeEntryItem` — `produceItemsForRow` never calls
 *  this producer for a non-spanning Entry (ADR 0012, Build 1, J2). */
function produceLeafItems(entry: Entry): readonly Item[] {
  const segments = entry.segments;
  if (segments !== undefined && segments.length > 0) {
    return segments.map((segment, index) =>
      entryItem(entry, index, segment.start, segment.end, LEAF_VARIANT_NAME, segment.id),
    );
  }
  return [wholeEntryItem(entry, LEAF_VARIANT_NAME)];
}

/** `when`, as one predicate. A field match reads each named key off the row and compares it with
 *  that Field's own `equals`. The Field is looked up per read rather than at registration: a Gantt
 *  may be rebound to another Dataset, and a match names one or two keys, so the lookup is a Map
 *  read per key per row. */
function compileRule(rule: VariantRule, fieldFor: VariantRegistryPorts['fieldFor']): VariantPredicate {
  if (typeof rule === 'function') return rule;
  const keys = Object.keys(rule);
  return (entry) => keys.every((key) => valueMatches(entry, key, rule[key], fieldFor));
}

function valueMatches(
  entry: Entry,
  key: FieldKey,
  expected: unknown,
  fieldFor: VariantRegistryPorts['fieldFor'],
): boolean {
  // The lookup comes first, and a key no Field declares answers no. `entry.read` throws on such a
  // key, and this runs on every row of every layout pass, so reading first would take the frame
  // down for a typo — or for the one rule a chrome plugin cannot help itself with, because it
  // installs after the Dataset closes its Field gate.
  const field = fieldFor(key);
  if (field === undefined) return false;
  const actual = entry.read(key);
  // Called on the Field, never detached: a consumer's own `equals` may read `this`.
  return field.equals !== undefined ? field.equals(actual, expected) : Object.is(actual, expected);
}

function claimantOf(registration: VariantRegistration): VariantClaimant {
  return registration.pluginId === undefined
    ? { variant: registration.variant.name }
    : { variant: registration.variant.name, pluginId: registration.pluginId };
}

/** Does this rule answer yes for this row? The last-resort variant carries no rule, so it answers
 *  yes for every row nothing newer claimed. */
function answersYes(registration: VariantRegistration, entry: Entry): boolean {
  return registration.claim === undefined || registration.claim(entry);
}

/** Is a second yes worth reporting? Two rules from one source that both claim one row are siblings
 *  with no order between them, and that is an authoring error worth naming (`Q5`). Everything else
 *  is a deliberate override: a consumer's rule over a plugin's, anything over core's floor, or the
 *  last-resort variant, which claims nothing at all. */
function canCollide(painted: VariantRegistration, next: VariantRegistration): boolean {
  return painted.claim !== undefined && painted.rank !== CORE_RANK && next.rank === painted.rank;
}

/** Call: `createVariantRegistry({ fieldFor, reportDoubleClaim })` once in the Gantt constructor; a
 *  registry outside a Dataset passes `fieldFor: () => undefined` and adds its own variants. Core's
 *  two are seeded here, so the registry is never empty and every row resolves. */
export function createVariantRegistry(ports: VariantRegistryPorts): VariantRegistry {
  const { fieldFor } = ports;
  /** A `const` copy, so the walk below narrows it once instead of on every pass. */
  const report = ports.reportDoubleClaim;
  let nextSeq = 0;
  const live: VariantRegistration[] = [];
  /** The walk order, held between registration changes (#188's pattern): `variantFor` runs on every
   *  hover change, where the budget is zero allocation. */
  let ordered: readonly VariantRegistration[] | undefined;
  let byName: Map<string, VariantRegistration> | undefined;

  const register = (variant: EntryVariant, rank: number, pluginId: PluginId | undefined): Disposer => {
    const registration: VariantRegistration = {
      variant,
      items: variant.items ?? ((entry) => [wholeEntryItem(entry, variant.name)]),
      claim: variant.when === undefined ? undefined : compileRule(variant.when, fieldFor),
      rank,
      seq: nextSeq++,
      pluginId,
    };
    live.push(registration);
    ordered = undefined;
    byName = undefined;
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const index = live.indexOf(registration);
      if (index !== -1) live.splice(index, 1);
      ordered = undefined;
      byName = undefined;
    };
  };

  /** Newest first: the consumer's rules, then every plugin's, then core's two. */
  const walkOrder = (): readonly VariantRegistration[] =>
    (ordered ??= [...live].sort((a, b) => b.rank - a.rank || b.seq - a.seq));

  /** The registration that answers for one name, at the same precedence `variantFor` walks. Two
   *  variants may share a name — a plugin re-skinning `leaf` is the case — and the winner is the
   *  one that would also have claimed the row. */
  const registrationFor = (name: string): VariantRegistration | undefined => {
    if (byName === undefined) {
      byName = new Map();
      for (const registration of walkOrder()) {
        if (!byName.has(registration.variant.name)) byName.set(registration.variant.name, registration);
      }
    }
    return byName.get(name);
  };

  for (const variant of CORE_VARIANTS) register(variant, CORE_RANK, undefined);

  return {
    variantFor(entry) {
      let painted: VariantRegistration | undefined;
      for (const registration of walkOrder()) {
        if (painted !== undefined && !canCollide(painted, registration)) break;
        if (!answersYes(registration, entry)) continue;
        if (painted === undefined) {
          painted = registration;
          // Nothing is watching for a collision, so the first yes is the whole answer.
          if (report === undefined) break;
          continue;
        }
        report?.({
          entryId: entry.id,
          painted: claimantOf(painted),
          ignored: claimantOf(registration),
        });
        break;
      }
      // Core's `leaf` carries no `when` and nothing can dispose it, so `painted` is always set. The
      // name is stated rather than asserted, so the answer stays total without a `!`.
      return painted?.variant.name ?? LEAF_VARIANT_NAME;
    },
    itemsFor: (variant) => registrationFor(variant)?.items,
    paintFor: (variant) => registrationFor(variant)?.variant.paint,
    interactionsFor: (variant) => registrationFor(variant)?.variant.can,
    addPluginVariant: (variant, pluginId) => register(variant, PLUGIN_RANK, pluginId),
    addConsumerVariant: (variant) => register(variant, CONSUMER_RANK, undefined),
  };
}
