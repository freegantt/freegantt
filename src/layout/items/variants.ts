// layout/ — a variant is a rule, and this file is where a row meets one (ADR 0018). One object
// answers five questions about a row's shape: which rows wear it (`when`), what shape it draws
// (`bars`), how it looks (`paint`), what you can do to it (`can`), and what rules its look needs
// (`css`, ADR 0022 §5). Before this, each question was its own registration, and the variant's name
// was repeated at every one.
//
// Nothing stores a variant. It is resolved per Gantt, every layout pass, from the rules installed on
// that Gantt (I2). An Entry carries no stored classification, which is what ADR 0013 decided and
// this file does not spend.

import type {
  Disposer,
  Entry,
  EntryId,
  ElementDescription,
  Field,
  FieldKey,
  Capabilities,
  PluginId,
} from '../../model/index.js';
import type { BarLabels, BarRenderer } from '../renderer.js';
import type { EntryPredicate, EntryRule } from '../entry-rule.js';
import { compileEntryRule } from '../entry-rule.js';
export type { EntryPredicate, EntryRule, FieldMatch } from '../entry-rule.js';
import type { DrawnVariant, BarProducer, VariantBars } from './item.js';
import { fixedWidthBar, unclaimedSpan } from './item.js';

/** One row's variant, as the rule that won answered it. Every seam reads its five answers off this
 *  one object, so what a row draws, how it looks, what you can do to it and what rules its look
 *  needs always come from the same registration — never from a second lookup by name, which can
 *  answer with a different rule that happens to share the name (`F3`). */
/** **Not generic over `TProps` (F18).** `Gantt<TProps>.variants` keeps the consumer's prop typing on
 *  `when`, but `paint`'s type, `BarRenderer`, takes a plain `Entry` regardless of `TProps` — the same
 *  gap `GanttOptionsBase.barRenderer` and `EntryVariant.paint` already carry, not one this type
 *  introduces. A `ResolvedVariant<TProps>` would add a type parameter nothing inside actually reads,
 *  which is a lie generic (CLAUDE.md). Typing `paint`/`can` over `TProps` needs `BarRenderer` and
 *  `Capabilities` to become generic first — a wider surface change, owed separately. */
export interface ResolvedVariant extends DrawnVariant {
  /** How it looks, or `undefined` for the library's own bar. */
  readonly paint: BarRenderer | undefined;
  /** What you can do to it, or `undefined` for no opinion at this level. */
  readonly capabilities: Capabilities | undefined;
  /** The rules this look needs, as CSS text, or `undefined` for none (ADR 0022 §5). The same string
   *  the variant's own `css` carried at registration — copied here so every seam answers `bars` /
   *  `paint` / `can` / `css` off this one object, and never looks the name up a second time (`F1`). */
  readonly css: string | undefined;
  /** What this variant's own bars print, and where — merged key by key over the Gantt's own
   *  `barLabels` (`mergeBarLabels`, #421 C5), or `undefined` for no opinion at this level. */
  readonly barLabels: BarLabels | undefined;
}

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
  /** Which rows wear it. Omit it to write a last resort, which answers for every row **no rule
   *  claims** — core's own `leaf` is the shipped one, and omitting `when` is how a plugin re-skins
   *  it. A last resort never outranks a rule that states a claim, core's own `summary` included, so
   *  a variant that means "every row, whatever else claims it" says `when: () => true`. */
  when?: EntryRule<TProps>;
  /** What shape it draws. Default: one Bar over the entry's whole span (`unclaimedSpan`, ADR 0023,
   *  ADR 0026). */
  bars?: BarProducer;
  /** How it looks. A paint that names no content of its own — `class`, `style` or `attrs` alone —
   *  decorates the library's own bar and keeps its label (`J34`). */
  paint?: BarRenderer;
  /** What you can do to it. One level under the consumer's own `capabilities`, one level over the
   *  library rule. Answer `undefined` from a predicate for "no opinion" (`J13`). */
  capabilities?: Capabilities;
  /** The rules this look needs, as CSS text — verbatim, no scoping done for you. A variant owns
   *  `bars`, `paint` and `can` already; this is the fifth answer, the rules behind the class
   *  `paint` names (ADR 0022 §5, Q6). `view/` wraps every installed variant's `css` once in
   *  `@layer freegantt` and writes it after the base sheet, so a variant's own rule cancels
   *  `.fg-bar`'s background and state ring at equal specificity, and an unlayered consumer rule
   *  still beats it (ADR 0021).
   *
   *  Not `rules` — `when` is already the rule (ADR 0018's title). Not `styles` — that is
   *  `ElementDescription.style`'s own word, and `view/styles.ts`'s. Not `stylesheet` — a variant
   *  carries one fragment, and the library holds one sheet. */
  css?: string;
  /** What this variant's own bars print, and where. Merges key by key over the Gantt's own
   *  `barLabels` (#421 C5): `{ policy: 'outside' }` alone keeps the Gantt's own `field`,
   *  and `{ field: 'hours' }` alone keeps the Gantt's own policy. Omit it for no opinion — every
   *  bar this variant draws then prints exactly what the Gantt's own `barLabels` says. */
  barLabels?: BarLabels;
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

/** A `when` names a key no Field declares. The rule claims no row — the match answers no rather
 *  than taking the layout pass down — and this names the rule and the key, so the typo is visible
 *  instead of silent (`J59`). A plugin that means to match on its own key declares it from its
 *  `data` half. */
export interface UnknownFieldMatch {
  /** The rule that names the key. */
  rule: VariantClaimant;
  key: FieldKey;
}

/** Where an `UnknownFieldMatch` goes — `GanttShell` supplies one, the same way it supplies
 *  `ReportDoubleClaim`. Which keys are declared is **live**: a Gantt rebound to another Dataset
 *  declares a different set, so this is asked at match time and never at registration.
 *
 *  One report per rule and key. The rule holds that set itself, so a rule that names a missing key
 *  allocates once at its first row and nothing on any row after — the hover path's own budget (I5).
 *  The cost of holding it there is that a rebind which un-declares a key already reported stays
 *  quiet; the first report already said the sentence. */
export type ReportUnknownFieldMatch = (match: UnknownFieldMatch) => void;

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
  /** What every seam reads once this registration wins. Built once here, so the walk allocates
   *  nothing and no seam looks a second answer up by name. */
  readonly resolved: ResolvedVariant;
  /** `variant.when`, compiled to one predicate. Absent on the last-resort variant, which claims
   *  nothing and therefore never collides with anything. */
  readonly claim: EntryPredicate | undefined;
  readonly rank: number;
  readonly seq: number;
  readonly pluginId: PluginId | undefined;
}

export interface VariantRegistry extends VariantBars {
  /** The variant this row wears, as one object. Walks newest-first, over the consumer's rules, then
   *  every plugin's, then core's two, and stops at the first rule that answers yes (`Q5`). Every row
   *  resolves, because core's `leaf` carries no `when`.
   *
   *  It answers with the registration that won, never with its name alone. Two registrations may
   *  share one name — a consumer's own rule over a plugin's of the same name is the shipped case —
   *  and a second lookup by name can land on the other one (`F3`). */
  resolveFor(entry: Entry): ResolvedVariant;
  /** `ctx.variants.add(variant)` — a plugin's own. It wins over core's two and loses to the
   *  consumer's. The returned `Disposer` removes exactly this registration. */
  addPluginVariant(variant: EntryVariant, pluginId?: PluginId): Disposer;
  /** `GanttOptions.variants` — the consumer's own. It wins over every plugin's, whatever order the
   *  plugins installed in, which is the posture every other consumer/plugin pair already takes
   *  (D-S5-11). */
  addConsumerVariant(variant: EntryVariant): Disposer;
  /** Every installed variant's own `css`, in registration-ladder order — core, then every plugin,
   *  then the consumer's (ADR 0022 §5). `view/` reads this to build the one `<style>` node a Gantt
   *  writes for its variants, wraps it once in `@layer freegantt`, and writes it after the base
   *  sheet. A variant with no `css` contributes nothing. Not the walk order `resolveFor` uses —
   *  that one is newest-first, for paint priority; this one is rank-first, for cascade order. */
  installedCss(): readonly string[];
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
  reportUnknownFieldMatch?: ReportUnknownFieldMatch | undefined;
}

/** The summary rail's class, and nothing else — no text, no children. So the library keeps painting
 *  this bar's own label, and `fg-bar-summary` is an ordinary variant class rather than a core
 *  lookup table keyed by a variant name (ADR 0018). One frozen object: the hover path allocates
 *  nothing. */
const SUMMARY_BAR: ElementDescription = Object.freeze({
  class: Object.freeze({ 'fg-bar-summary': true }),
});

const SUMMARY_VARIANT_NAME = 'summary';
const LEAF_VARIANT_NAME = 'leaf';

/** `.fg-bar-summary`'s own rules (ADR 0022 §5, Q6). Moved out of the always-shipped base sheet: a
 *  page that never installs `summary()` no longer pays for them (they still do here, because
 *  `CORE_VARIANTS` seeds `summary()` unconditionally — but a consumer who re-skins the floor with
 *  a different `summary` no longer inherits a class the base sheet still defined behind it).
 *
 *  DESIGN-FACTS §2.4: a group bar is a solid rail 10px high in the row's own label ink, with a 4px
 *  downward cap at each end — not an outline box at full bar height, which shouted over every span
 *  bar under it. The box keeps the full bar height because that is the hit target; only the glyph
 *  inside it is ink, so both pieces read --fg-group-bar-ink and a state can swap that one value.
 *  --fg-group-bar-height is an undeclared knob with a default, the shape --fg-bar-radius takes.
 *
 *  A group bar's box is its hit target, not its ink: the shared outline and the shared inset ring
 *  would both frame a full-height rectangle of empty pane around a 10px rail. So the state paints
 *  on the rail. Selected swaps the rail's own ink for the selection colour — a group bar wears no
 *  outer border at all — and hovered rings the rail alone. Both need the box's own state paint
 *  cancelled first, and document order inside this one fragment resolves that (the layer does not
 *  change it — the normal cascade still applies inside one layer). */
const SUMMARY_CSS = `
.fg-bar-summary { --fg-group-bar-ink: var(--fg-row-label-color); background: transparent; border: none; color: var(--fg-group-bar-ink); }
.fg-bar-summary::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: var(--fg-group-bar-height, 10px); transform: translateY(-50%); background: var(--fg-group-bar-ink); border-radius: 1px; }
.fg-bar-summary::after { content: ''; position: absolute; left: 0; right: 0; top: calc(50% + var(--fg-group-bar-height, 10px) / 2); height: 4px; background: conic-gradient(from 315deg at 50% 100%, var(--fg-group-bar-ink) 0deg 90deg, transparent 90deg) left top / 8px 4px no-repeat, conic-gradient(from 315deg at 50% 100%, var(--fg-group-bar-ink) 0deg 90deg, transparent 90deg) right top / 8px 4px no-repeat; }
.fg-bar-summary[data-state~="hovered"], .fg-bar-summary[data-state~="selected"] { outline: none; box-shadow: none; }
.fg-bar-summary[data-state~="selected"] { --fg-group-bar-ink: var(--fg-selection-color); }
.fg-bar-summary[data-state~="hovered"]::before { outline: 1px solid var(--fg-hover-ring); }
`;

const DIAMOND_VARIANT_NAME = 'diamond';

/** The diamond's own fixed box, in content pixels. `harness/planner.html` measured and shipped
 *  13px, so that is what core's own default carries (ADR 0022 Q3).
 *
 *  Declared here, beside `diamond()`'s only reader — never in `src/layout/frame.ts`, which holds
 *  the two Gantt-wide numbers `barSpan` and `frame-settings.ts` share (`DEFAULT_MIN_BAR_WIDTH_PX`).
 *  This one belongs to one variant, not to the Gantt. */
const DIAMOND_WIDTH_PX = 13;

/** The diamond's class, and nothing else — the same shape `SUMMARY_BAR` takes. One frozen object:
 *  the hover path allocates nothing. */
const DIAMOND_BAR: ElementDescription = Object.freeze({
  class: Object.freeze({ 'fg-bar-diamond': true }),
});

/** `.fg-bar-diamond`'s own rules (ADR 0022 §5, Q6). The box `fixedWidthBar` sizes is the hit
 *  target; the `::before` is the ink, turned 45° into the familiar diamond.
 *
 *  **Restates no size.** The ink is `width: 100%; aspect-ratio: 1` on the `::before`, so it follows
 *  whatever box the Bar states. A literal `13px` here would leave a 20px hit box around a 13px
 *  glyph the moment an author writes `diamond({ bars: fixedWidthBar(20) })` (Q3).
 *
 *  The box's own background and state ring are cancelled first, so the glyph — not a square bar
 *  sitting behind it — wears the hover ring and the selection outline. */
const DIAMOND_CSS = `
.fg-bar-diamond { background: transparent; }
.fg-bar-diamond::before { content: ''; position: absolute; inset: 0; margin: auto; width: 100%; aspect-ratio: 1; background: var(--fg-bar-fill-painted); transform: rotate(45deg); }
.fg-bar-diamond[data-state~="hovered"] { box-shadow: none; }
.fg-bar-diamond[data-state~="hovered"]::before { outline: 1px solid var(--fg-hover-ring); outline-offset: 1px; }
.fg-bar-diamond[data-state~="selected"]:not(:focus-visible) { outline: none; }
.fg-bar-diamond[data-state~="selected"]::before { outline: 2px solid var(--fg-selection-color); outline-offset: 2px; }
`;

/** `bar()` — core's plain look, and the shipped floor every unclaimed row wears. Carries
 *  `unclaimedSpan` — the same producer a variant with no `bars` key gets from the registry.
 *  `bar()`'s own shape and the default shape always agree (ADR 0023, ADR 0026).
 *
 *  Carries no `css`. Its look **is** `.fg-bar`, the element class every look wears — diamonds
 *  included — so that stays structure, in the always-shipped base sheet, not one look's own rule.
 *
 *  Every key on `overrides` wins, `name` included: `bar({ name: 'phase', when: myRule })` keeps
 *  `unclaimedSpan` and answers for the rows `myRule` claims instead of every row nothing else
 *  claimed.
 *
 *  **`bar` and `summary` keep their plain names (F13).** `import { bar } from 'freegantt'` reads as
 *  a generic word at a package's top level, and a `*Variant` suffix would read further from a call
 *  site: `variants: [bar(), summary(), diamond()]` reads as one family, and `barVariant()` names the
 *  pipeline that builds the answer, not the job an author is doing (`CLAUDE.md`'s call-site-first
 *  rule). The collision risk is accepted for that reason, not overlooked. */
export function bar(overrides: Partial<EntryVariant> = {}): EntryVariant {
  return {
    name: LEAF_VARIANT_NAME,
    bars: unclaimedSpan,
    ...overrides,
  };
}

/** `summary()` — core's rail for a row with children. Claims on structure
 *  (`entry.hasChildren`), never on a stored word (ADR 0013's own rule, narrowed by ADR 0022, not
 *  spent): a consumer who wants the rail on a different rule passes their own `when`.
 *
 *  **States its own `bars` explicitly.** `unclaimedSpan` is the shape a summary needs whatever its
 *  children do — one rail. It says so, rather than trusting the registry's default to agree (ADR
 *  0023, ADR 0026). */
export function summary(overrides: Partial<EntryVariant> = {}): EntryVariant {
  return {
    name: SUMMARY_VARIANT_NAME,
    when: (entry: Entry) => entry.hasChildren,
    bars: unclaimedSpan,
    paint: () => SUMMARY_BAR,
    css: SUMMARY_CSS,
    ...overrides,
  };
}

/** `diamond()` — a marker for a zero-duration span (`start === end`), not a core default.
 *  Its default `when` reads `start`/`end` directly rather than `entry.duration()`: this runs on the
 *  hover path (I5, `EntryPredicate`'s
 *  own "keep it cheap"), and `entry.duration()` allocates a fresh `{ value, unit }` on every call
 *  (`measureEntryDuration`) — one object per row per resolve for what is otherwise a plain equality
 *  check. The trade: this spelling answers by structure, never a stored word (ADR 0013's "core does
 *  not ship a diamond" is narrowed by this factory, not spent), but it ignores
 *  `measureDuration: 'children'` — a row with `start === end` and children that net to zero total
 *  time still claims here. An author whose rows need the children-aware zero passes their own
 *  `when: (entry) => entry.duration()?.value === 0`.
 *
 *  **Not in `CORE_VARIANTS`.** No row wears `diamond()` until an author installs it — this
 *  factory's own default rule, or a consumer's own `{ bars: fixedWidthBar(...) }`.
 *
 *  **What you can do to it: no resize.** A resize commits a real duration, and this factory's own
 *  `when` stops matching the moment `start !== end` — the row would turn into a bar under the
 *  pointer that dragged it. `diamond({ can: { resize: true } })` opts back in for an author who
 *  wants that. */
export function diamond(overrides: Partial<EntryVariant> = {}): EntryVariant {
  return {
    name: DIAMOND_VARIANT_NAME,
    when: (entry: Entry) => entry.start !== undefined && entry.start === entry.end,
    bars: fixedWidthBar(DIAMOND_WIDTH_PX),
    paint: () => DIAMOND_BAR,
    capabilities: { resize: false },
    css: DIAMOND_CSS,
    ...overrides,
  };
}

/** Core's two, seeded from the factories every consumer reads (ADR 0022 §1). They register
 *  **first**, and at the lowest rank, because core is the floor every plugin and every consumer
 *  overrides. `bar()` carries no `when`, so it answers for every row no rule claims, and the floor
 *  is total.
 *
 *  **The order inside this list decides nothing** (`J60` supersedes `J37`). `statesAClaim` sorts
 *  every claiming rule ahead of every last resort, so `summary()` is asked before `bar()` whichever
 *  way round they are written here. It reads floor-first anyway, because that is the order the walk
 *  ends up in and a reader should not have to derive it from a comparator. */
const CORE_VARIANTS: readonly EntryVariant[] = Object.freeze([bar(), summary()]);

function claimantOf(registration: VariantRegistration): VariantClaimant {
  return claimant(registration.variant.name, registration.pluginId);
}

function claimant(variant: string, pluginId: PluginId | undefined): VariantClaimant {
  return pluginId === undefined ? { variant } : { variant, pluginId };
}

/** Does this registration say which rows it claims? A `1` sorts before a `0`, so every rule that
 *  states a claim is asked before any last resort — core's own `leaf` included. */
function statesAClaim(registration: VariantRegistration): number {
  return registration.claim === undefined ? 0 : 1;
}

/** Does this rule answer yes for this row? A last-resort variant carries no rule, so it answers
 *  yes for every row nothing claimed. */
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
  const reportUnknownFieldMatch = ports.reportUnknownFieldMatch;
  let nextSeq = 0;
  const live: VariantRegistration[] = [];
  /** The walk order, held between registration changes (#188's pattern): `resolveFor` runs on every
   *  hover change, where the budget is zero allocation. */
  let ordered: readonly VariantRegistration[] | undefined;
  /** `installedCss()`'s own sorted, mapped, filtered copy, held the same way `ordered` is (F15):
   *  invalidated on the same registration edge, so a call between edges re-sorts nothing. */
  let installedCssCache: readonly string[] | undefined;

  const register = (variant: EntryVariant, rank: number, pluginId: PluginId | undefined): Disposer => {
    const registration: VariantRegistration = {
      variant,
      resolved: {
        name: variant.name,
        bars: variant.bars ?? unclaimedSpan,
        paint: variant.paint,
        capabilities: variant.capabilities,
        css: variant.css,
        barLabels: variant.barLabels,
      },
      claim:
        variant.when === undefined
          ? undefined
          : compileEntryRule(variant.when, {
              fieldFor,
              reportUnknownKey: (key) =>
                reportUnknownFieldMatch?.({ rule: claimant(variant.name, pluginId), key }),
            }),
      rank,
      seq: nextSeq++,
      pluginId,
    };
    live.push(registration);
    ordered = undefined;
    installedCssCache = undefined;
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const index = live.indexOf(registration);
      if (index !== -1) live.splice(index, 1);
      ordered = undefined;
      installedCssCache = undefined;
    };
  };

  /** Newest first: the consumer's rules, then every plugin's, then core's `summary` — and after all
   *  of those, the floors, in the same order.
   *
   *  **A rule with no `when` is a last resort, and a last resort never outranks a claim** (`P2-3`).
   *  Rank alone put a plugin's floor over core's `summary`, so `ctx.variants.add({ name: 'leaf',
   *  paint })` — the re-skin this file documents — answered for every row and every summary rail in
   *  the Gantt stopped drawing. Sorting the floors last makes that registration re-skin the floor
   *  and leave every claim standing. */
  const walkOrder = (): readonly VariantRegistration[] =>
    (ordered ??= [...live].sort(
      (a, b) => statesAClaim(b) - statesAClaim(a) || b.rank - a.rank || b.seq - a.seq,
    ));

  for (const variant of CORE_VARIANTS) register(variant, CORE_RANK, undefined);
  /** Core's `leaf`, as the answer for a row no rule claimed. Nothing can dispose it. */
  const coreFloor = live[0]!.resolved;

  return {
    resolveFor(entry) {
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
      // floor is stated rather than asserted, so the answer stays total without a `!`.
      return painted?.resolved ?? coreFloor;
    },
    addPluginVariant: (variant, pluginId) => register(variant, PLUGIN_RANK, pluginId),
    addConsumerVariant: (variant) => register(variant, CONSUMER_RANK, undefined),
    installedCss() {
      // Rank ascending, not `walkOrder`'s newest-first: this answers cascade order, not paint
      // priority. `live`'s own order already puts core first (the `for` loop above this function
      // seeds it before any plugin or consumer registers), so the sort only has to settle two
      // registrations that share a rank. Cached the same way `ordered` is (F15): a call between
      // registration edges re-sorts nothing.
      return (installedCssCache ??= [...live]
        .sort((a, b) => a.rank - b.rank || a.seq - b.seq)
        .map((registration) => registration.variant.css)
        .filter((css): css is string => css !== undefined));
    },
  };
}
