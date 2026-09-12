// api/ — the public command and keybinding contract (S5.2, D-S5-6, D-S5-7). Generic over `TGantt`
// here for the same reason `api/plugin.ts`'s `GanttPluginOf`/`PluginContextOf` are (S5.1 file header):
// `api/gantt.ts` already imports this file for the generic shape, and if this file also imported
// `Gantt` the two would close an import cycle (`extensions/commands.ts` needs the generic form too,
// and `api/gantt.ts` imports `extensions/commands.ts` to build the real registry). `api/gantt.ts`
// binds the type argument once, locally — `export type CommandContext = CommandContextOf<Gantt>` —
// and `api/index.ts` re-exports the bound aliases alongside the generic shapes. A plugin author
// writing against `Gantt` names the bound `Command`/`CommandContext`/`CommandRegistry`/`KeyBinding`;
// code that parameterizes over its own Gantt type names the `*Of` forms declared here.

import type { Disposer, Entry, EntryId, FieldKey, KeyChord, SegmentId, TargetKind } from '../model/index.js';
import type { Dataset } from './dataset.js';

/** Every command id the library itself registers (#236). One place names them, so
 *  `gantt.commands.run('freegantt.discardCellEdit')` autocompletes and a typo is a compile error
 *  rather than a runtime `UnknownCommandError`.
 *
 *  It is `BuiltInCommandId` and not `CommandId`, because a plugin's own id is a command id too
 *  (#7's lesson: one name for two concepts stalls a reader). `CommandId` below is the open one.
 *
 *  `view/core-commands.ts` registers all of these, and its own test holds the two lists together. */
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
  | 'freegantt.selectNextSegment'
  | 'freegantt.selectPreviousSegment'
  | 'freegantt.deleteSelection'
  | 'freegantt.discardCellEdit'
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

/** What one invocation acts on (ADR 0010, issue #212) — the two readings of one set. `entryIds` is a
 *  projection of `segmentIds`: the Entries those Segments belong to, deduped, in row order. Both are
 *  always present, so a command reads whichever one it needs and the two can never disagree. No
 *  command declares its reach: Delete reads `segmentIds`, and Lock reads `entryIds`, because a lock
 *  is a property of the record and not of one drawing of it. */
export interface ActedOn {
  segmentIds: readonly SegmentId[];
  entryIds: readonly EntryId[];
}

/** What focus a chord or a right-click landed on (issue #137 F6) — S5.7's and S5.11's chord scoping
 *  ("on a focused header cell", "on a selected bar", "on the splitter") has nothing else in
 *  `CommandContext` to read a `when` against. Filled by the keymap resolver from view state; a menu
 *  or `run(id)` invocation with no meaningful target for this kind leaves it `undefined`.
 *
 *  It carries the same `entryIds` word `DomTarget` uses, but not always the same set (#199, #212). A
 *  `DomTarget` states a DOM fact: what the node stands for. This states what the command acts on,
 *  resolved from the Selection by `resolveActedOn` below — the Selection when the thing you clicked
 *  shares it (either one holds the other), and the thing you clicked when it does not. So a
 *  right-click on one of three selected bars names three, a right-click on an unselected row names
 *  every Segment that row owns, and a right-click on a row that owns a lone selected bar plus others
 *  names only that one bar — the narrower thing the user already picked, left alone (#212).
 *
 *  Both id sets are empty for a `'header'` or `'splitter'` target, and for a grouping header row.
 *  Neither is ever `undefined`, so a `when` counts them with no fallback. */
export interface CommandTarget extends ActedOn {
  kind: TargetKind;
  /** Which Grid column this landed on, for a `'header'` or `'cell'` target. `field` names a column
   *  everywhere a column is named (D-S5-37, #194) — the same word `DomTarget.field`,
   *  `GridColumn.field` and a renderer's `ctx.column.field` already use. */
  field?: FieldKey;
}

/** #212's single owner of "given what was right-clicked and the Selection, what does the command act
 *  on?" — `targetUnder` (`view/gantt-dom.ts`) already owns the sibling question, "what does this
 *  node stand for"; this is the one place its answer meets the Selection.
 *  `extensions/features/context-menu.ts` is the only caller: a keyboard chord has no separate
 *  "clicked" thing to reconcile with the Selection, so `view/gantt-shell.ts`'s
 *  `#buildCommandContext` fills both id sets straight from the Selection, and a consumer's command
 *  `run` reads `ctx.target?.segmentIds` or `ctx.target?.entryIds` either way (S5.2's contract) —
 *  never re-deriving either one.
 *
 *  Each side arrives with both readings already paired, so this never turns a Segment into an Entry
 *  itself: a `DomTarget` carries the clicked pair, and the `Gantt` carries the selected pair.
 *
 *  `clicked` either holds the Selection or is held by it — a bar inside a multi-bar Selection, or a
 *  row that owns a lone selected bar plus others — the command acts on the Selection, unchanged
 *  (#212: a right-click never silently widens what the user picked). Anywhere else — nothing
 *  selected, or `clicked` shares no such relation with the Selection — the command acts on
 *  `clicked` itself, so a right-click on an unselected row still acts on every Segment that row
 *  owns. */
export function resolveActedOn(clicked: ActedOn, selected: ActedOn): ActedOn {
  if (clicked.segmentIds.length === 0) return clicked;
  const clickedIsInSelection = clicked.segmentIds.every((id) => selected.segmentIds.includes(id));
  const selectionIsInClicked =
    selected.segmentIds.length > 0 && selected.segmentIds.every((id) => clicked.segmentIds.includes(id));
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
  /** The one Entry the invocation is *about*: the right-clicked bar, or the subject of the row the
   *  right-click landed in — the Entry whose Fields that row's cells show. A row that owns several
   *  names them all in `target.entryIds`; this stays the one. `undefined` when the invocation
   *  landed on no Entry at all. */
  entry?: Entry;
  target?: CommandTarget;
}

/** A named, invokable action with a label and a condition (D-S5-6). No `TArgs` generic — every
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

/** D-S5-6: register once, run by id, list what a `CommandContext` currently allows. `run` throws
 *  `UnknownCommandError` for an id nothing owns; a registered command whose `when` declines is a
 *  silent no-op, the same posture `available`'s own filter takes. */
export interface CommandRegistryOf<TGantt = unknown, TDataset = Dataset> {
  /** #155: registering an id a command already holds stacks on top of it rather than replacing it.
   *  The newest registration answers `run`, and the returned `Disposer` removes exactly this one —
   *  the command underneath then answers again, which is how a plugin's override of a core command
   *  undoes itself when that plugin is uninstalled (D-S5-7). */
  register(command: CommandOf<TGantt, TDataset>): Disposer;
  run(id: CommandId): void;
  /** Commands whose `when` passes for this context, in registration order. #160: `ctx` is optional —
   *  omit it and the registry builds the same live context `run(id)` already builds internally, so a
   *  caller never hand-assembles one just to answer "what can run right now?". */
  available(ctx?: CommandContextOf<TGantt, TDataset>): readonly CommandOf<TGantt, TDataset>[];
}

/** D-S5-7: newest-first resolution — the last registration gets first refusal, and a decline falls
 *  through to an older binding. `Mod` means `⌘` on Apple platforms and `Ctrl` elsewhere. */
export interface KeyBindingOf<TGantt = unknown, TDataset = Dataset> {
  chord: KeyChord;
  command: CommandId;
  /** Extra condition beyond the command's own `when`. */
  when?(ctx: CommandContextOf<TGantt, TDataset>): boolean;
  /** Fire even while the event's target is editable or mid-IME-composition. Default `false`
   *  (issue #137 F7). */
  captureInEditable?: boolean;
}
