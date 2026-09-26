// api/ — the public command and keybinding contract (S5.2). Generic over `TGantt`
// here for the same reason `api/plugin-context.ts`'s `PluginContextOf` is (S5.1 file header):
// `api/gantt.ts` already imports this file for the generic shape, and if this file also imported
// `Gantt` the two would close an import cycle (`extensions/commands.ts` needs the generic form too,
// and `api/gantt.ts` imports `extensions/commands.ts` to build the real registry). `api/gantt.ts`
// binds the type argument once, locally — `export type CommandContext = CommandContextOf<Gantt>` —
// and `api/index.ts` re-exports the bound aliases alongside the generic shapes. A plugin author
// writing against `Gantt` names the bound `Command`/`CommandContext`/`CommandRegistry`/`KeyBinding`;
// code that parameterizes over its own Gantt type names the `*Of` forms declared here.

import type { Disposer, Entry, EntryId, FieldKey, KeyChord, TargetKind } from '../model/index.js';
import type { Dataset } from './dataset.js';

/** Every command id the library itself registers (#236). One place names them, so
 *  `gantt.commands.run('freegantt.discardCellEdit')` autocompletes.
 *
 *  Autocomplete on the way in, a compile error on the way out. `run` takes the open `CommandId`, so
 *  a plugin's own id stays legal and `run('gant.edit')` still compiles — a wrong id there throws
 *  `UnknownCommandError`. `view/core-commands.ts` registers against this closed union instead
 *  (#333), so a typo in a *registration* never compiles.
 *
 *  It is `BuiltInCommandId` and not `CommandId`, because a plugin's own id is a command id too
 *  (#7's lesson: one name for two concepts stalls a reader). `CommandId` below is the open one.
 *
 *  The typed registrations close catalog → union. `api/command.test.ts` closes union → catalog: a
 *  `Record<BuiltInCommandId, true>` names every member, and the test asks the core catalog for the
 *  same set, so a member nothing registers fails too. */
export type BuiltInCommandId =
  | 'freegantt.collapseAll'
  | 'freegantt.expandAll'
  | 'freegantt.collapseRow'
  | 'freegantt.expandRow'
  | 'freegantt.zoomIn'
  | 'freegantt.zoomOut'
  | 'freegantt.panToToday'
  | 'freegantt.panToStart'
  | 'freegantt.panToEnd'
  | 'freegantt.panRight'
  | 'freegantt.panLeft'
  | 'freegantt.panDown'
  | 'freegantt.panUp'
  | 'freegantt.pageDown'
  | 'freegantt.pageUp'
  | 'freegantt.selectAll'
  | 'freegantt.clearSelection'
  | 'freegantt.selectNextEntry'
  | 'freegantt.selectPreviousEntry'
  | 'freegantt.activateEntry'
  | 'freegantt.deleteSelection'
  | 'freegantt.discardCellEdit'
  | 'freegantt.editFocusedCell'
  | 'freegantt.undo'
  | 'freegantt.redo'
  | 'freegantt.resizeColumnWider'
  | 'freegantt.resizeColumnNarrower'
  | 'freegantt.moveColumnRight'
  | 'freegantt.moveColumnLeft';

/** Any command id: one the library ships, or one a plugin registers. The `string & {}` half keeps a
 *  consumer's own id legal and still lets an editor suggest the built-in ones — the same open shape
 *  `FieldKey` keeps over `CoreFieldKey`. */
export type CommandId = BuiltInCommandId | (string & {});

/** #262: the default chords a keyboard user can already do the same job through another door — a
 *  button, a menu item, or a public method — so an app author who wants that chord for something
 *  else may turn it off. `undo`/`redo` have Undo/Redo, `deleteSelection` has `entries.remove()`,
 *  `zoomIn`/`zoomOut`/`panToToday`/the pans have their own methods, `selectAll` has
 *  `gantt.selectedEntryIds = ...`. `Gantt.convenienceChords`'s per-command map takes only these ids.
 *  `api/command.test.ts`'s own `EVERY_CONVENIENCE_ID` — the same `Record<Id, true>` exhaustiveness
 *  shape `BuiltInCommandId`'s test above already uses — pins this list against
 *  `convenienceCommandIds` below, so the two can never drift.
 *
 *  Every other command's default chord is an **obligation chord**: `[S5-A4]` and WCAG 2.1.1 keep it
 *  bound no matter what this config says, because it is the only keyboard path to what it does —
 *  `clearSelection` (`Escape`), the column keys, `Mod+Arrow` reach, and `Enter`
 *  (`activateEntry` — the only keyboard path to click activation, #434). `plans/02` §4.1 states the
 *  full split next to the chord table. */
export type ConvenienceCommandId =
  | 'freegantt.undo'
  | 'freegantt.redo'
  | 'freegantt.selectAll'
  | 'freegantt.deleteSelection'
  | 'freegantt.zoomIn'
  | 'freegantt.zoomOut'
  | 'freegantt.panToToday'
  | 'freegantt.panRight'
  | 'freegantt.panLeft'
  | 'freegantt.panToStart'
  | 'freegantt.panToEnd';

/** `view/gantt-shell.ts` iterates this to resolve `Gantt.convenienceChords` once per assignment —
 *  the same "resolve once" posture `resolveViewportGestures` takes. A plain array, not derived from
 *  `ConvenienceCommandId` by `typeof` (api-extractor cannot document a public type built from a
 *  module-private symbol — an "ae-forgotten-export" warning, not a real gap): the type above is the
 *  source of truth, and `api/command.test.ts` is what keeps this list honest against it. Not itself
 *  public: a consumer types the per-command map against `ConvenienceCommandId` and never needs the
 *  list. */
export const convenienceCommandIds: readonly ConvenienceCommandId[] = [
  'freegantt.undo',
  'freegantt.redo',
  'freegantt.selectAll',
  'freegantt.deleteSelection',
  'freegantt.zoomIn',
  'freegantt.zoomOut',
  'freegantt.panToToday',
  'freegantt.panRight',
  'freegantt.panLeft',
  'freegantt.panToStart',
  'freegantt.panToEnd',
] as const;

/** What one invocation acts on (ADR 0010, ADR 0025, issue #212) — one set of Entry ids. A former
 *  Segment is an ordinary child Entry now, so there is no second reading to keep in step with this
 *  one. */
export interface ActedOn {
  entryIds: readonly EntryId[];
}

/** What focus a chord or a right-click landed on (issue #137) — S5.7's and S5.11's chord scoping
 *  ("on a focused header cell", "on a selected bar", "on the splitter") has nothing else in
 *  `CommandContext` to read a `when` against. Filled by the keymap resolver from view state; a menu
 *  or `run(id)` invocation with no meaningful target for this kind leaves it `undefined`.
 *
 *  It carries the same `entryIds` word `DomTarget` uses, but not always the same set (#199, #212). A
 *  `DomTarget` states a DOM fact: what the node stands for. This states what the command acts on,
 *  resolved from the Selection by `resolveActedOn` below — the Selection when the thing you clicked
 *  shares it (either one holds the other), and the thing you clicked when it does not. So a
 *  right-click on one of three selected bars names three, a right-click on an unselected row names
 *  every Entry that row owns, and a right-click on a row that owns a lone selected bar plus others
 *  names only that one bar — the narrower thing the user already picked, left alone (#212).
 *
 *  The id set is empty for a `'header'` or `'splitter'` target, and for a grouping header row. It
 *  is never `undefined`, so a `when` counts it with no fallback. */
export interface CommandTarget extends ActedOn {
  kind: TargetKind;
  /** Which Grid column this landed on, for a `'header'` or `'gridCell'` target. `field` names a column
   *  everywhere a column is named (#194) — the same word `DomTarget.field`,
   *  `GridColumn.field` and a renderer's `ctx.column.field` already use. */
  field?: FieldKey;
}

/** #212's single owner of "given what was right-clicked and the Selection, what does the command act
 *  on?" — `targetUnder` (`view/gantt-dom.ts`) already owns the sibling question, "what does this
 *  node stand for"; this is the one place its answer meets the Selection.
 *  `extensions/features/context-menu.ts` is the only caller: a keyboard chord has no separate
 *  "clicked" thing to reconcile with the Selection, so `view/gantt-shell.ts`'s
 *  `#buildCommandContext` fills the id set straight from the Selection, and a consumer's command
 *  `run` reads `ctx.target?.entryIds` (S5.2's contract) — never re-deriving it.
 *
 *  `clicked` either holds the Selection or is held by it — a bar inside a multi-bar Selection, or a
 *  row that owns a lone selected bar plus others — the command acts on the Selection, unchanged
 *  (#212: a right-click never silently widens what the user picked). Anywhere else — nothing
 *  selected, or `clicked` shares no such relation with the Selection — the command acts on
 *  `clicked` itself, so a right-click on an unselected row still acts on every Entry that row
 *  owns. */
export function resolveActedOn(clicked: ActedOn, selected: ActedOn): ActedOn {
  if (clicked.entryIds.length === 0) return clicked;
  const clickedIsInSelection = clicked.entryIds.every((id) => selected.entryIds.includes(id));
  const selectionIsInClicked =
    selected.entryIds.length > 0 && selected.entryIds.every((id) => clicked.entryIds.includes(id));
  return clickedIsInSelection || selectionIsInClicked ? selected : clicked;
}

/** What a `Command`'s `when`/`run` receives, once per invocation — a menu click, a chord, or
 *  `gantt.commands.run(id)`. S5.2 ships `dataset`/`gantt` (read the same way `PluginContext` does)
 *  plus `entry`/`target`; nothing here is privileged beyond the public `Gantt`/`Dataset` surface. */
/** `TDataset` defaults to the public, untyped `Dataset` the same way `TGantt` defaults to
 *  `unknown` — a plugin author binding their own `Dataset<TProps>` gets a typed
 *  `ctx.dataset` at every `when`/`run`; code with no reason to bind either type argument sees the
 *  exact surface it always has (#141 item #9). */
export interface CommandContextOf<TGantt = unknown, TDataset = Dataset> {
  /** The public Dataset. No privileged access, no second surface. */
  dataset: TDataset;
  /** The public Gantt, for reading live config and calling public methods. */
  gantt: TGantt;
  /** The Selection's first Entry — the subject a command acts on, not necessarily the node the user
   *  clicked or focused (`target` is that; see below). On a right-click outside the Selection, the
   *  click replaces the Selection first (`plans/02` §4.6), so `entry` reads as "the clicked bar" on
   *  that one path — but a right-click *inside* a multi-bar Selection, and every keyboard path
   *  (the menu key, `Mod+Arrow`), never click at all: `entry` is whichever Entry the
   *  Selection puts first, which can differ from what carries DOM focus on a segmented row.
   *  `undefined` when the Selection is empty. */
  entry?: Entry | undefined;
  /** The variant this Gantt resolved for `entry` (ADR 0018). `undefined` when the invocation names
   *  no Entry at all.
   *
   *  A command scoped to one variant reads it: `when: ({ variant }) => variant === MY_VARIANT`. That
   *  is the same answer the layout pass painted with, so a plugin never restates its own `when` rule
   *  here, and never keeps a list of the ids it owns.
   *
   *  This is not `entry.variant` under another name. A variant is per Gantt, so a row cannot answer
   *  it (I2). A command context **is** one Gantt's, and it runs off the hot path. */
  variant?: string | undefined;
  /** The node the user acted on — DOM focus, not the Selection. A command that means "the row
   *  under the pointer/focus", rather than "the Selection's subject", reads this instead of
   *  `entry`; the two can name different Entries on a segmented row. `CommandTarget.entryIds` names
   *  every Entry the target row owns, focused one first. */
  target?: CommandTarget;
}

/** A named, invokable action with a label and a condition. No `TArgs` generic — every
 *  invocation path in S5 is argument-less (issue #137 G); see the step file for why a generic here
 *  would be type-unsound at the registry boundary. */
export interface CommandOf<TGantt = unknown, TDataset = Dataset> {
  id: CommandId;
  /** Menu text; also the a11y name. */
  label: string;
  /** Static availability. Absent means always available. */
  when?(ctx: CommandContextOf<TGantt, TDataset>): boolean;
  run(ctx: CommandContextOf<TGantt, TDataset>): void;
}

/** Register once, run by id, list what a `CommandContext` currently allows. `run` throws
 *  `UnknownCommandError` for an id nothing owns; a registered command whose `when` declines is a
 *  silent no-op, the same posture `available`'s own filter takes. */
export interface CommandRegistryOf<TGantt = unknown, TDataset = Dataset> {
  /** #155: registering an id a command already holds stacks on top of it rather than replacing it.
   *  The newest registration answers `run`, and the returned `Disposer` removes exactly this one —
   *  the command underneath then answers again, which is how a plugin's override of a core command
   *  undoes itself when that plugin is uninstalled. */
  register(command: CommandOf<TGantt, TDataset>): Disposer;
  run(id: CommandId): void;
  /** Commands whose `when` passes for this context, in registration order. #160: `ctx` is optional —
   *  omit it and the registry builds the same live context `run(id)` already builds internally, so a
   *  caller never hand-assembles one just to answer "what can run right now?". */
  available(ctx?: CommandContextOf<TGantt, TDataset>): readonly CommandOf<TGantt, TDataset>[];
}

/** Newest-first resolution — the last registration gets first refusal, and a decline falls
 *  through to an older binding. `Mod` means `⌘` on Apple platforms and `Ctrl` elsewhere. */
export interface KeyBindingOf<TGantt = unknown, TDataset = Dataset> {
  chord: KeyChord;
  command: CommandId;
  /** Extra condition beyond the command's own `when`. */
  when?(ctx: CommandContextOf<TGantt, TDataset>): boolean;
  /** Fire even while the event's target is editable or mid-IME-composition. Default `false`
   *  (issue #137). */
  captureInEditable?: boolean;
}
