# Handoff — slice R3 (one plugin-to-DOM seam)

Plan: [`2026-09-04-s5-extensibility-fixes.md`](./2026-09-04-s5-extensibility-fixes.md) §R3.

## 1. State

**R3 is complete. Every box is ticked.** No box is part done. No box is untouched.

| Box | State | Note |
|---|---|---|
| N1 — split `Overlay` | done | `Overlay` is `{ present, render, onResize }`. |
| A3 — add the resolver | done | `ctx.view.dom` carries `owns`, `targetUnder`, `barFor`, `cellFor`, `cellText`, `bounds`, `paneBounds`. |
| A3 — delete the string literals | done | Read side is empty. See §5 for the write side. |
| A3 test | done | `src/view/gantt-dom.test.ts`, 13 tests, real frame. |
| A4 — add `ctx.view.onDomEvent` | done | In `view/plugin-ports.ts`. |
| A4 — convert the listeners | done | Nine of eleven. `popup.ts` keeps two on purpose (§4). |
| C3 — `PopupOptions.onDismiss` | done | Trigger is `DismissTrigger`. |
| C3 — drop the `isOpen` polls | done | `contextMenu()` detaches on dismissal. |
| H2 — the harness stops guessing | done | Both demos call `ctx.view.dom.barFor(id)`. |
| Docs + `api-report` | done | `CONTEXT.md`, `plans/01` §10, `plans/02` §4.5, `etc/`. |

## 2. Tree

Commits on `s5-review-fixes`:

- `645771d` — `view: one seam answers what a node is, and who owns the event (R3)`. It holds the
  whole slice: code, tests, `etc/freegantt.api.md`, the docs, and the ticked plan boxes.
- This file is the next commit.

Nothing is uncommitted. The build is green:

- `pnpm verify` exits 0. It runs format:check, typecheck, lint, boundaries, guards, test:node,
  test:dom, vendor-names, disables, build and api-report.
- `pnpm test:node` — 516 pass. `pnpm test:dom` — 649 pass. `pnpm typecheck` — clean.
- `pnpm test:e2e` — 63 pass. `e2e/column-reorder.spec.ts` flaked once under full parallel load and
  passed on retry and on two later full runs. It is a drag-timing flake. R3 touched no column
  gesture code.

## 3. Decisions already made

Do not re-open these.

### The shape of `ctx.view.dom`

`view/gantt-dom.ts` declares `GanttDom` and implements it as `ContainerDom`. `GanttShell` builds one
per Gantt and lends it through `GanttShellPorts.dom`. `buildPluginPorts` forwards it as
`ctx.view.dom`.

```ts
interface GanttDom {
  owns(node: Node): boolean;
  targetUnder(node: Node): DomTarget | undefined;
  barFor(id: EntryId): HTMLElement | undefined;
  cellFor(id: EntryId, field: FieldKey): HTMLElement | undefined;
  cellText(cell: HTMLElement): string;
  readonly bounds: DOMRect;
  readonly paneBounds: { grid: DOMRect; timeline: DOMRect };
}
```

Two members went past the review's list, and both paid for themselves:

- **`cellFor(id, field)`** replaced four things at once in `inline-editing.ts`: `findCellInRow`,
  `findOwnCell`, `rowUnder` and `entryIdOfRow`. It is also the one answer to "is my editor still
  anchored?", which is what the review asked for — `stillAnchored()` is now
  `cellFor(entryId, field) !== undefined`. `EditedCell` therefore lost its `row` member.
- **`cellText(cell)`** replaced `cellDisplayText`, which read `.fg-row-label-text` from plugin code.

`EditedCell` is `{ entryId, field }` now. `CellEditorPorts` gained `dom: Pick<GanttDom, 'bounds' |
'cellFor'>` and its `overlay` shrank to `Pick<Overlay, 'present' | 'onResize'>`.

### `DomTarget`

`{ kind, element, entry?, field? }`, frozen.

`kind` is **`TargetKind`**, a new union in `src/model/command.ts`:
`'row' | 'cell' | 'bar' | 'header' | 'splitter'`. `api/command.ts`'s `CommandTarget.kind` names the
same union now. It lives in `model/` because `view/` may not import `api/`, and `model/` is the only
layer both sides may read. This is why the review's "do not invent a second vocabulary" is
structural, not a convention.

`element` is the node the walk stopped on. A popup anchors to it and the cell editor positions over
it, so leaving it out would have forced every caller to walk again.

`contextMenu()` maps a `DomTarget` to a `CommandTarget` with `commandTargetOf`. That closed a real
hole: the menu never filled `CommandContext.target` before, so a command with
`when: (c) => c.target?.kind === 'header'` could never fire from a right-click.

### Names, after the naming test

Kept: `targetUnder` (it continues the retired `barUnder`/`rowUnder` reading, "what is under the
pointer"), `owns`, `barFor`, `onDomEvent`, `DismissTrigger` (it already existed in `popup.ts`).

New names chosen here:

- **`GanttDom`** — the interface. Call site: `ctx.view.dom.owns(event.target)`.
- **`ContainerDom`** — the class. Call site: `new ContainerDom(container, paneLayout, entryById)`.
  "Container" is a `CONTEXT.md` term, so check 1 passes on a glossary word.
- **`DomTarget`** — the resolved answer. `GanttTarget` was rejected: the member group is `dom`, so
  `DomTarget` is what a reader expects beside `targetUnder`.
- **`cellFor` / `cellText`** — they pair with `barFor` and read as sentences.
- **`PopupSurface`** — `createPopup`'s first parameter. Call site: `createPopup(ctx.view, keymap)`.
- **`DomEventHandler` / `DomEventOptions`** — `onDomEvent`'s two type parameters.

Rejected: renaming `Overlay`. The #7 fix was to retire the overloaded word, not to swap in a
synonym, so the concept split instead.

### How `targetUnder` stays off the allocation hot path

Two answers, and the first one matters most.

1. **No core hot path calls it.** Hover, selection and drag preview go through
   `render/dom`'s `hitTest` and `applyState`, which R3 did not touch. `targetUnder` runs only on
   plugin listeners. The busiest of those is `tooltips()`'s `pointerover`/`pointerout`, and those
   fire on node transitions, not per pointer move.
2. **A one-slot memo, validated by the stamps that can go stale.** `ContainerDom` keeps
   `#memoElement` plus `#memoItemId`, `#memoEntryId` and `#memoField`. A repeat read of the same
   node with the same three attributes returns the same frozen object and allocates nothing. The
   stamps are what makes recycling safe: virtualization reuses a row node under a new entry, and the
   `data-entry-id` stamp says so before the cached object goes out.
   `gantt-dom.test.ts` asserts both halves — same object on a repeat read, fresh object after the
   `data-entry-id` changes.

`barFor` and `cellFor` use index loops over a live `NodeList`, not `Array.from`. They are not hot,
but the loop is free.

### `bar-under.ts`

Deleted. It held `barUnder` and `rowUnder`, the half-step the review named. `targetUnder` covers both
walks and four more.

### How `Overlay` ended up split

`Overlay` is `{ present, render, onResize }` and `DomOverlay`'s constructor lost its `PaneLayout`
argument. `onResize` stayed on the Overlay because it observes the container that layer spans, and
its call site reads true.

`bounds`, `paneBounds`, `contains` and `elementForEntry` moved to `GanttDom` as `bounds`,
`paneBounds`, `owns` and `barFor`.

`createPopup(overlay, keymap)` became `createPopup(view, keymap)`, where `view` is `PopupSurface` —
`{ overlay: Pick<Overlay, …>, dom: Pick<GanttDom, 'bounds' | 'paneBounds'> }`. A plugin passes
`ctx.view` whole. `PopupSurface` is exported from `api/index.ts`, or api-extractor reports a
forgotten export.

## 4. Traps

- **`DisposableStore.disposeAll()` latches** (`src/extensions/disposables.ts:16`). A store that has
  disposed once fires every later `add()` at once. `contextMenu()`'s per-menu store must be
  reassigned after each close (`context-menu.ts:68`), the way `createPopup` already replaces its own.
  Missing this made four context-menu tests fail with "expected false to be true" — the listener was
  added and disposed in the same statement.
- **`extensions/popup.ts` must keep its two unscoped `document` listeners.** `outsidePointer` exists
  to hear a pointer *outside* this Gantt. Routing it through `onDomEvent` would filter away the only
  events it cares about. `scroll` scopes itself geometrically instead, by pane rect.
- **`onDomEvent`'s capture flag is part of the identity.** The removal uses the same flag the add
  used (`plugin-ports.ts`, `listenWhileInstalled`). `inlineEditing()`'s `scroll` and
  `contextMenu()`'s `keydown` both need `{ capture: true }`; `scroll` does not bubble.
- **A `[data-field="cost"]` query hits the header cell first.** The grid header is painted before the
  rows, so `container.querySelector` in a test must say `.fg-row [data-field="…"]`. This cost one
  red test in `gantt-dom.test.ts`.
- **`for (const x of nodeList)` types as `any` here** and trips
  `@typescript-eslint/no-unsafe-member-access`. Use an index loop or `Array.from`.
- **A module-level array or object literal trips `freegantt/no-module-level-state`.** `TARGET_SELECTOR`
  in `gantt-dom.ts` is a template string for that reason, not a `.map().join()` over an array.
- **The eslint pre-write hook runs on every Write and Edit.** A file that references a symbol you
  have not imported yet is refused, so add the import in the same edit.
- **`pnpm api-report` fails on any surface change.** Run `npx api-extractor run --local` after
  `pnpm build`, then commit `etc/freegantt.api.md`.
- **The review's count of twelve `document.addEventListener` calls is wrong.** There are eleven.
  See §5.

## 5. What the review got wrong, and what it did not ask for

- **"Twelve `document.addEventListener` calls."** There are eleven in `src/extensions/`: two in
  `popup.ts`, four in `tooltips.ts`, three in `context-menu.ts`, two in `inline-editing.ts`. The
  twelfth was probably one of the two `node.addEventListener('focusout', …)` calls, which are not
  document listeners.
- **"One of them forgets the guard entirely" — confirmed.** It was
  `inline-editing.ts`'s `document.addEventListener('scroll', onScroll, true)`. A scroll anywhere on
  the page reached it, including a second Gantt's.
- **`grep -rn "fg-" src/extensions harness --include=*.ts` does not return empty**, and it should not.
  What remains is:
  - classes a plugin **writes** and `view/styles.ts` styles: `.fg-popup`, `.fg-tooltip*`,
    `.fg-menu*`, `.fg-cell-editor*`. Each is named once, in the file that writes it
    (`menu-view.ts` gained `MENU_CLASS`/`MENU_ITEM_CLASS`; `CellEditorSession` now dresses the
    control, so `date-input.ts` and `openGeneric` stopped repeating the class);
  - the public `--fg-bar-fill` custom property the harness sets, which is a documented level-1
    styling contract;
  - comments.

  No plugin and no harness page **reads** a `.fg-*` selector or a `data-*` key of the rendered Gantt.
  That read side was the finding. Two harness classes that squatted the library prefix
  (`fg-mobilization-line`, `fg-toolbar`) are `demo-*` now.

## 6. Next steps

R3 needs nothing more. The next work is R4 and R5, which the plan says run in parallel.

What R4 and R5 must know:

1. **`inline-editing.ts` changed shape** (R4's file). `EditedCell` is `{ entryId, field }`.
   `openFor`, `openGeneric` and `openDate` take `(entry, field, cell)` — the `row` parameter is gone.
   The `dblclick` and `scroll` listeners are `ctx.view.onDomEvent` calls. `entryIdOfRow`'s hand-cast
   `id as EntryId` is gone with it, which closes one box the plan carries in R6.
2. **`inline-editing.ts` gained two constants**, `EDITOR_CLASS` and `EDITOR_CONTROL_CLASS`.
   `CellEditorSession`'s constructor adds the control class. SP1's `data-state="invalid"` still goes
   on `#wrapper`, through `#markInvalid()`.
3. **R5 owns `RendererRegistry` and the item producers.** R3 did not touch either.
   `plugin-ports.ts` gained one group member (`view.dom`) and one method (`view.onDomEvent`), so P6's
   `resolve<P>` fold has one more neighbour but no conflict.
4. **R6's ST1 comment pass now covers three new files**: `src/render/dom/dom-contract.ts`,
   `src/view/gantt-dom.ts` and the new blocks in `src/view/plugin-ports.ts` and
   `src/extensions/features/context-menu.ts`.
5. **R6's H1** (move the three demo plugins into `harness/plugins/`) must carry
   `popupDemoView: { popup, dom }` with `popupDemo()`. It is one stash, not two.

## 7. What I would do differently

Nothing about the shape. Two smaller notes:

- I put `cellFor` and `cellText` on `GanttDom` beyond the review's list. Without them
  `inline-editing.ts` would still have kept four DOM walks and a second answer to "is this mine?",
  which is the drift the review was actually complaining about. Keep them.
- The slice landed as one commit. The `Overlay` signature change touches `src/` and `harness/`
  together, and `pnpm typecheck` covers both, so no smaller split builds green on its own. A future
  slice that moves a public seam should expect the same.
