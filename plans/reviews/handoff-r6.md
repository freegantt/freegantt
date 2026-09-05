# Handoff — slice R6 (the cheap wins, and the one hard standard)

Plan: [`2026-09-04-s5-extensibility-fixes.md`](./2026-09-04-s5-extensibility-fixes.md) §R6.

## 1. State

**R6 is part done.** Every box is done except **ST1**, the comment pass. ST1 is untouched: no comment
in `src/` changed for it. The next agent owns ST1 alone.

| Box | State | Commit |
|---|---|---|
| Carried from R4 — `CONTEXT.md` gains **Refusal notice** | done | `e88b3ec` |
| Carried from R3 — ST1 covers three more files | open | see §3 |
| **ST1 — the comment pass** | **untouched** | — |
| P5 — group `GanttShellOptions`' wiring | done | `e88b3ec` |
| H1 — move the three demo plugins | done | `e831114` |
| A6 — index the resolved columns | done | `144bb0c` |
| A6 — collapse the column-gesture cascade | done | `144bb0c` |
| Carried from R1 — `entryIdOfRow`'s hand-cast | already ticked by R3 | — |
| A6 — name the seed | done | `144bb0c` |
| A6 — table the popup dismiss triggers | done | `144bb0c` |

## 2. Tree

Commits on `s5-review-fixes`, oldest first:

- `144bb0c` — `quality: four cheap wins on the S5 branch (R6, A6)`. All four A6 boxes.
  - `ColumnChrome` keeps `#columnByKey: ReadonlyMap<string, ResolvedColumn>` beside
    `#resolvedColumns`. `#adoptColumns(columns)` writes both and is the only writer.
    `resolvedColumn(key)` is a map read now. `GanttShellPorts` gained `resolvedColumn(field)`, so
    `plugin-ports.ts`'s `isColumnEditable` reads the index too. The two renderer resolvers in
    `gantt-shell.ts` call `this.#columnChrome.resolvedColumn(columnKey)`.
  - `interaction/column-gestures.ts` holds one `ColumnGesture` (`{ preview, commit, cancel }`)
    instead of a `grabbedKind` cascade in `move`, `commit` and `cancel`. `resizeGesture` and
    `reorderGesture` occupy it. `grabbedGesture` replaces `grabbedKind`. `widthFrom(dxPx)` holds the
    width math both `preview` and `commit` used to repeat.
  - `inline-editing.ts` names its four-arm nested ternary `seedText(field, fieldValue, cell)`.
  - `extensions/popup.ts` holds `DISMISS_LISTENERS`, one row per `DismissTrigger`, and
    `DismissContext` is what one row works from.
- `e88b3ec` — `view: the shell's wiring is one member, not seven (R6, P5)`. `GanttShellWiring` plus
  the required `GanttShellOptions.wiring`. 33 call sites. `CONTEXT.md` gained **Shell wiring** and
  **Refusal notice**.
- `e831114` — `harness: one copy of each demo plugin (R6, H1)`. Four new files in
  `harness/plugins/`. `main.ts` lost 63 lines, `plugins.ts` lost 70.

**The build is green at `e831114`.** `pnpm verify` exits 0: 92 guard tests, 519 node tests, 667 dom
tests, plus format, typecheck, lint, boundaries, vendor-names, build and api-report. `pnpm test:e2e`
passes 63 of 63. `pnpm api-report` is unmoved: R6 changed no public surface so far.

The working tree is clean.

---

## 3. ST1 — the real scope

This is the whole of the remaining work. Read it before you open a file.

### The rule, restated

`CLAUDE.md`: **20 words for an instruction, 25 for a description. One instruction per sentence.
Active voice. Simple tenses.** A doc comment is a description, so 25 words is the ceiling.

### How to find the offenders

I used a small script. Rebuild it — it pays for itself. It reads a file, joins each contiguous
comment block into one string, strips `//`, `/**`, ` * ` and `*/`, splits on sentence boundaries
(`(?<=[.!?])\s+(?=[A-Z\`(\[*_"]`), and prints every sentence over the word limit with its block's
start line. Put it in your scratchpad, not in the repo.

Two notes on the split. A sentence that ends in a code span (`` …(D-S5-4). `run`/`available` … ``)
splits correctly only if the lookahead accepts a backtick. And an em dash never ends a sentence, so
a 50-word clause chain joined by dashes shows up as one sentence — which is exactly the shape ST1
is about.

### Per-file counts, at the 25-word ceiling

Counted against `e831114`. The number is how many sentences break the rule.

| File | Over 25 words | Note |
|---|---|---|
| `src/view/gantt-shell.ts` | **79** | The bulk of the work. Most predate this branch. |
| `src/api/plugin.ts` | **30** | The review's own example file. Densest rationale. |
| `src/extensions/features/inline-editing.ts` | 26 | R1, R3 and R4 all reshaped it. |
| `src/view/gantt-dom.ts` | 11 | Carried from R3. |
| `src/extensions/features/context-menu.ts` | 8 | Carried from R3. |
| `src/view/plugin-ports.ts` | 7 | Carried from R3. |
| `src/extensions/features/date-input.ts` | 7 | |
| `src/extensions/features/inline-editing.test.ts` | 5 | |
| `src/extensions/features/tooltips.ts` | 3 | |
| `src/extensions/features/menu-view.ts` | 3 | |
| `src/extensions/features/context-menu.test.ts` | 3 | |
| `src/extensions/features/tooltips.test.ts` | 2 | |
| `src/render/dom/dom-contract.ts` | 1 | Carried from R3. One block, one sentence. |
| `src/extensions/features/date-input.test.ts` | 1 | |

The plan names `src/extensions/features/*.ts`, and that glob catches the four `.test.ts` files.
Their eleven sentences are cheap. Do them.

### The worst offenders, by file and block start line

Every one of these runs past 40 words in one sentence. Fix these first: they are the ones a reader
actually stumbles on.

**`src/api/plugin.ts`** — 7 blocks.

- line 1, file header, 53w. One sentence carries the whole `no-circular` argument.
- line 44 and line 50, the two re-export comments, 49w and 32w. Same shape: one sentence with a
  parenthetical inside a parenthetical.
- line 56 / line 61, `PluginContextOf`. **These are two stacked `/** */` blocks.** Only the second
  reaches tooling; the first is orphaned. Merging them into one block is the right fix, and it
  keeps every fact. Check `pnpm api-report` after — I did not verify whether api-extractor reads
  either block.
- line 86, `registerKeyHandler`, 50w then 56w back to back. Two ideas: what it binds, and how it
  differs from `registerKeybinding`. Split at that seam.
- line 99, `canEdit`, 47w.
- line 172, `resolveTooltipContent`, **76w — the single worst sentence in the branch.** It lists
  three cases where the method answers `undefined`. Make it "Three cases answer that way." followed
  by one sentence per case. Every case carries a fact you must keep: no renderer at either level;
  no `FrameBar` in the current frame; the renderer threw and this catches and dev-logs it.

**`src/view/gantt-shell.ts`** — the 40w-plus blocks start at lines 156, 179, 314, 402, 416, 516,
536, 631, 641, 648, 725, 754, 1052, 1281, 1393, 1474, 1542 and 1556. The worst three:

- line 1281, 62w. The `gridColumns` setter. One sentence covers reconfiguration, the cancelable
  commit sequence, and why a plain assignment is not special.
- line 725, 57w. Command and keymap attach order, and why it comes before
  `entryGestures`/`keyboardEditing`.
- line 156, 59w. `ROW_HEIGHT_PROPERTY`. `getComputedStyle` cost, when it is read, and why a resize
  is a good enough signal.

Also line 1052: I rewrote half that sentence in `e88b3ec` when `buildCommandContext` moved into
`wiring`. It is still 40w. It is mine, so it is fair game.

**`src/extensions/features/inline-editing.ts`** — the 40w-plus blocks are at lines 1 (the file
header, which the review calls out by name: one clause chain past 80 words across two sentences,
41w and 56w), 45 (`isDateField`), 61 (`fieldContextFor`), 384 (`openRequestId`, 53w) and 607.

**`src/extensions/features/context-menu.ts`** — lines 58, 81 and 151 (47w, 49w, 53w). All three
carry a "what broke without it" that must survive.

**`src/extensions/features/date-input.ts`** — line 43, 56w.

**`src/extensions/features/menu-view.ts`** — line 45, 55w, and line 68, 44w.

**`src/view/gantt-dom.ts`** — line 78, 45w, about why `paneBounds` exists beside `bounds`.

**`src/render/dom/dom-contract.ts`** — one block, one 31w sentence. Five minutes.

### What is already fine

`src/view/column-chrome.ts`, `src/interaction/column-gestures.ts`, `src/extensions/popup.ts` and
`harness/plugins/*` are **not** in ST1's named scope, and the blocks I wrote in R6 already obey the
rule. Do not widen the scope. The plan names four source areas plus the three carried files, and
that is the slice.

### What ST1 must not do

**The rule is sentence shape. The content stays.** The review is explicit, and the plan repeats it:

> These comments carry real design rationale — which decision, what broke without it, why the
> alternative was rejected. That is the good part and it should stay.

Concretely, keep every one of these:

- Every decision id (`D-S5-11`, `D-S4-24`), issue number (`#155`, `#137 F14`), invariant (`I2`,
  `I11`, `I14`) and review tag (`review P3`, `bug hunt B1`).
- Every "what broke without it". Examples you will meet: `context-menu.ts:81` explains that running
  a command against a rebuilt context targeted the wrong entry; `gantt-shell.ts:754` explains that
  an Escape reached two handlers and cleared the selection as a side effect; `api/plugin.ts`'s `dom`
  block explains that renaming a class broke every plugin with a green build.
- Every rejected alternative. `inline-editing.ts`'s file header rejects `createPopup` for the
  editor, and says exactly why: `Popup.content` is a static `ElementDescription` with no way to hand
  back a live, listener-attachable node.

**Three places where the rationale is easy to lose when you split.** I read these and they need
care:

1. `api/plugin.ts:86`, `registerKeyHandler`. The second half is a *contrast* — "unlike
   `registerKeybinding`" — and it states two differences with two separate reasons. If you split it
   into two flat sentences you can drop the pairing. Write "Two things differ from
   `registerKeybinding`." and then one sentence per difference, each keeping its own "because".
2. `inline-editing.ts:1`, the file header. The `Popup` clause chain names the primitive, the reason
   it does not fit, and what this file does instead. Three sentences, not one, and the middle one is
   the load-bearing fact.
3. `gantt-shell.ts:1281`, the `gridColumns` setter. The sentence's whole point is that a plain
   assignment and a drag take the *same* path. Splitting it can turn that into two unrelated
   statements. Keep one sentence that says they share the path.

**Do not reflow a comment into a bullet list to dodge the word count.** One instruction per sentence
is the rule; bullets are allowed where they read better, not as a way to keep a 50-word clause chain
with a dash in front of it.

### Suggested order

1. `src/render/dom/dom-contract.ts` — one block. Warm-up.
2. `src/view/gantt-dom.ts`, `src/view/plugin-ports.ts`, `src/extensions/features/context-menu.ts` —
   the three carried from R3, 26 sentences together.
3. `src/api/plugin.ts` — 30 sentences, and the review's own example. Highest value per line.
4. `src/extensions/features/*.ts` — the rest, 47 sentences including tests.
5. `src/view/gantt-shell.ts` — 79 sentences. Largest. Do it last, in passes down the file.

Commit these separately from anything else, and consider two or three commits by area. A 200-comment
diff in one commit is not reviewable either.

---

## 4. Decisions already made in R6

Do not re-open these.

### `GanttShellOptions.wiring` (P5)

```ts
export interface GanttShellWiring {
  entryGestures?: AttachEntryGestures;
  keyboardEditing?: AttachKeyboardEditing;
  columnGestures?: AttachColumnGestures;
  commitEntryEdits?: (edits: EntryEdits) => boolean;
  buildPluginContext?: (parts: PluginContextPorts) => unknown;
  buildCommandContext?: (parts: { entry?: Entry; target?: { kind: 'header'; columnKey: FieldKey } }) => unknown;
  now?: () => Instant;
}
```

`wiring` is **required** on `GanttShellOptions`. Its members stay **optional**. That pairing is the
whole design: `api/gantt.ts` supplies all seven, and a test says "this shell has no wiring" once, by
writing `wiring: {}`. Required members would force a test to write seven no-op stubs, and a stub is
not the same behaviour as an omitted seam — `gantt-shell.ts` branches on `options.wiring.now`,
`buildCommandContext` and `buildPluginContext` being undefined.

The three real test seams — `backend`, `itemProducerRegistry`, `editExtender` — stay on
`GanttShellOptions` itself. `api/gantt.ts` does not supply them, so they are not wiring.

**What it did to the tests.** 33 call sites. `src/view/gantt-shell.test.ts` (27 sites) and
`src/view/styles.test.ts` (4 sites) write `wiring: {}`. Four `gantt-shell.test.ts` sites that pass a
real `entryGestures` now nest it: `wiring: { entryGestures: … }`.
`src/interaction/extender-preview.test.ts` moved its `entryGestures` and `commitEntryEdits` inside
`wiring`, and kept its `...overrides` spread at the top level. No test assertion changed.

`view/index.ts` exports `GanttShellWiring` beside `GanttShellOptions`. `CONTEXT.md` gained **Shell
wiring**, with the avoid list: not Options, not config, not dependencies, not Ports.

### `ColumnGesture` (A6)

The interface takes `(key, dxPx, clientX)` on `preview` and `commit`, and nothing on `cancel`.
`resizeGesture` ignores `clientX`; `reorderGesture` names it `_dxPx` where it ignores that instead
(`argsIgnorePattern: '^_'` in `eslint.config.js`). `commit` answers `boolean`, and the state machine
runs `if (!grabbedGesture.commit(…)) grabbedGesture.cancel()` in one place.

`commit`'s early return is deliberate: `if (grabbedKey === undefined || grabbedGesture === undefined)
return;` **without** calling `clearGrabbedState()`. The original had that shape and I kept it byte
for byte. The branch is unreachable — `start()` refuses to arm with no grabbed gesture — but ST1's
rule is behaviour-neutral and so was this box.

### `DISMISS_LISTENERS` (A6)

Module-level and `Object.freeze`d, which `freegantt/no-module-level-state` allows (see
`eslint/rules/no-module-level-state.cjs`: `Object.freeze`, `Symbol`, `defineRegistry` and
`freezePreset` are the allowlist).

Named `DISMISS_LISTENERS`, not `ARM_DISMISS`. "Arm" already names a pointer drag passing its
movement threshold, in `pointer-gesture.ts` and `column-gestures.ts`. One word may not mean two
things (naming skill, check 4).

`DismissContext` carries `dom` — the object, never a captured rect. `paneBounds` reads live geometry
on every call, and the `scroll` listener depends on that.

The loop is `for (const trigger of new Set(options.dismissOn ?? DEFAULT_DISMISS_ON))`. The `Set` is
there because the old `includes` checks armed each trigger at most once.

`popup.ts` still keeps its two unscoped `document` listeners, and the table's own doc says why
neither may move to `ctx.view.onDomEvent` (R3 handoff §4).

### The column index (A6)

`#adoptColumns` is private and `setResolvedColumns` is its only caller, which is what keeps the array
and the map in step. `FieldKey` is `CoreFieldKey | (string & {})`, so the map is keyed on
`String(column.key)` and read with `String(columnKey)`. That matches what `gantt-shell.ts` did before
with `String(c.key) === columnKey`.

### H1 — how the harness ended up

Four new files in `harness/plugins/`, all importing `'freegantt'` alone, like the three files
already there:

- `write-log.ts` — one exported type, `WriteLog = (line: string) => void`. It exists because the two
  copies were **not** character-for-character identical after all: `plugins.ts` logged through its
  own `writeLog`, and `main.ts` through `prependLogLine(log, line)`. So each page passes its own
  writer.
- `log-everything.ts` — `logEverything(writeLog)`. Keeps its real disposer: it holds an event
  subscription `ctx.disposables` knows nothing about.
- `selection-shortcuts.ts` — `selectionShortcuts(writeLog)`. Returns nothing (R5's P4).
- `popup-demo.ts` — `popupDemo()` returns the `GanttPlugin`, and the **one** module-private
  `demoView: { popup, dom } | undefined` stash lives here. Beside it, `openDemoPopup(entry): boolean`
  opens the popup on that entry's bar and answers `false` when the plugin is not installed or the
  bar is not in the current frame. That second export is what stops each page rebuilding the
  15-line open call. One stash, one open call, two pages.

`main.ts` dropped `createPopup`, `Popup` and `GanttDom` from its imports. `plugins.ts` dropped those
plus `GanttPlugin`. `main.ts` added `const writeLog = (line: string): void => prependLogLine(log,
line);` — a page-local adapter, not a re-derivation of anything the library computes.

**Nothing in H1 exposed a library gap.** The three plugins already reached only public seams, and
R3's `ctx.view.dom.barFor(id)` had already closed the one real gap (H2). I looked for a fourth and
found none.

---

## 5. Traps

- **The eslint pre-write hook runs on every Write and Edit.** A file that references a symbol you
  have not imported yet is refused. Add the import in the same edit.
- **A module-level array or object literal trips `freegantt/no-module-level-state`.**
  `Object.freeze({…})` is the way through, and `popup.ts`'s `DISMISS_LISTENERS` and `OPPOSITE` both
  take it.
- **`pnpm verify` runs `build` and then `api-report`.** After any surface change run
  `pnpm build && npx api-extractor run --local`, then commit `etc/freegantt.api.md`.
- **`pnpm verify` takes about four minutes.** `npx vitest run --silent` alone takes three seconds
  and catches almost everything. Use it while iterating.
- **`npx prettier --check` fails on a rewrapped comment** more often than you expect. Run
  `npx prettier --write` on every file you touch before you commit; the pre-commit hook formats
  staged files anyway, but a failing `format:check` inside `pnpm verify` wastes a whole run.
- **Bash tool: keep git and shell commands simple.** A compound command that mixes a heredoc with
  other work was refused by this session's worktree guard. Write a script into the scratchpad and
  run it with `python3 <path>` instead.
- **`src/view/gantt-shell.ts` is 1,628 lines.** Do not read it whole into context. `sed -n` the
  block you are rewriting.
- **Do not grow `gantt-shell.ts`** (plan §5). ST1 will add lines, because splitting one 60-word
  sentence into three makes more lines. That is expected and allowed: §5's rule is about the code.
  Say so in the commit message.

## 6. Next steps, ordered

1. Rebuild the long-sentence script in your scratchpad (§3, "How to find the offenders").
2. Run ST1 file by file, in the order §3 gives. Keep every fact.
3. After each file: `npx prettier --write <file>` and `npx vitest run --silent`.
4. Commit ST1 in two or three commits by area. Do not mix it with anything else — the plan says the
   comment pass must not share a commit with a structural change.
5. Tick the two open R6 boxes in the same commits: **ST1** and **Carried from R3**.
6. Run the gate: `pnpm verify`, then `pnpm test:e2e`.
7. **Review `harness/main.ts` end to end**, as `CLAUDE.md` requires and R6's own Verify line asks.
   It is 553 lines now, down from 616. I read it after H1 and found no library-rule breach and no
   re-derivation. Read it again after ST1 and record your own answer.
8. Hand off to R7. R7 deletes `plans/reviews/2026-09-04-s5-extensibility-branch.html`, updates the
   S5 README status line and §12, and merges back to `s5-start`.

### What R7 must know

- R6 changed **no public surface**. `etc/freegantt.api.md` is untouched by `144bb0c`, `e88b3ec` and
  `e831114`.
- The fix plan's §4 spec-and-doc table lists no row for P5, H1 or A6, and none is needed:
  `GanttShellOptions` is internal to `view/`, and the harness is consumer code. `CONTEXT.md` gained
  two entries (**Shell wiring**, **Refusal notice**) and R7 may want to name them in the S5 README
  §12 list of spec edits.
- The S5 README status line should read "R1–R6 landed" once ST1 lands.

## 7. What I would do differently

- **I should have run the long-sentence count before planning the session.** 180 sentences over the
  limit is a session's work on its own, and the four A6 boxes plus P5 plus H1 are another. Splitting
  them was right; discovering it late was not.
- **P5's 33 call sites went in with a script.** That was correct — by hand it is 33 chances to typo
  — but I wrote the script twice, because the first version ran as an inline heredoc that the
  worktree guard refused. Write the script to a file first.
- I merged the **Refusal notice** glossary entry into P5's commit because both are `CONTEXT.md`
  additions. A reviewer looking for the R4 carry-over will not find it by subject line. The commit
  body names it, and this handoff names it, but a separate doc commit would have been cleaner.
