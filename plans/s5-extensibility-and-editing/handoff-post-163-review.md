# Handoff — FreeGantt, after the #163 branch review and its follow-ups

**Written:** 2026-09-05 · **Branch:** `s5-start` · **Gate at handoff:** `pnpm verify` exit 0 (104 guard / 584 node / 808 dom), `pnpm test:e2e` 68/68.

Read `CLAUDE.md` first. It overrides your defaults and this document assumes it.

## 1. Read this before you touch the repo

**Three Claude sessions commit to `s5-start`, in one shared clone at `/home/pawel/.polyscope/clones/d8643765/upper-crab`.** Take your own worktree outside that directory before any parallel work:

```
git -C .../upper-crab worktree add /home/pawel/.polyscope/clones/d8643765/<name> -b <branch> s5-start
cd .../<name> && pnpm install --frozen-lockfile
```

Nested inside `upper-crab/` it shows as untracked files in a peer's `git status` and gets swept by lint.

**Issue #203 is open and it bites silently.** `.githooks/pre-commit` runs `prettier --write` then `git add -- $staged_all`, re-staging every touched file **whole**. Partial staging (`git add -p`) is defeated, and `git diff --cached --stat` reads correct because the widening happens after every check you can run. **After every commit in that clone run `git show --stat <sha>` and confirm the file list is only yours.** Check the commit, not the index.

Never run `pnpm format` (rewrites the whole tree), `git stash`, `git checkout <branch>`, or `git reset --hard` while a peer is live. Commit with explicit pathspecs.

`etc/freegantt.api.md` is generated: `pnpm build` then `pnpm api-report`, never hand-edit. `unplugin-dts` hoists a bare `export type { X };` above the next declaration and detaches its doc comment — put such re-exports in an index file.

**A sentence-length gate is live.** `scripts/check-sentence-length.mjs`, 25 words per doc sentence, over a **declared 13-file list, not all of `src/**`**. The `src/**` backlog is 679 breaches across 130 of 246 files, which is why the list is declared. Adding a file to the list is how the scope grows; the script header says so.

## 2. The one job that is ready to start

### #199 — a row target names one Entry; it must name all of them

**The product decision is made and recorded on the issue (2026-09-05), so this is no longer blocked.** `needs grill` is removed.

> A right-click on a row acts on **every** Entry the row owns.

Verified against the command set: no first-party command is per-Entry at all — row commands act on the row, and the rest are viewport, selection or history. A third-party command may still want exactly one; the API must leave that expressible.

**The defect.** #185 made a grid-row click select every Entry a row owns. The DOM-target seam still resolves a row to one Entry, so left-click and right-click on the same row now mean different things: the menu runs on the first Entry while the visible selection holds three.

**Where.**
- `src/view/gantt-dom.ts:52` — `DomTarget.entry` is singular. This is the seam that has to grow first.
- `src/view/gantt-dom.ts:213`, `#entryOfRow` at `:226` — `ContainerDom.#resolve` reads the row's single `data-entry-id`.
- `src/extensions/features/context-menu.ts:32` — `commandTargetOf` maps `target.entry.id` into `CommandTarget.rowId`.
- `src/api/command.ts:20` — `CommandTarget`.

**Keep this.** `data-entry-id` on a row is **correct**: it names the row's *subject*, the Entry whose Fields the cells format, which `GanttDom.cellFor` and the inline editor anchor on. Do not repurpose it. The gap is that the target type cannot carry the others.

**Naming, which is half the work.** `CommandTarget.rowId?: EntryId` is wrong twice: it names a **row** while carrying an **Entry** id, and it is singular where a row owns several. This repo has a distinct `RowId` brand. Use the `naming` skill, write the `when` clause a command author types, and read it in English before settling. Constraint from the decision: a command acting on everything must reach every Entry **without re-deriving the row's contents**, and a command wanting one must still be able to say so.

`CommandTarget.columnKey` is already `field` (#194, `229c1c1`), so the issue's quoted interface is stale. Breaking it again is fine — nothing has shipped and CLAUDE.md permits it.

## 3. Open work, ranked

| # | What | Notes |
| --- | --- | --- |
| **199** | Above. Ready. | The only one with a decision already made |
| **203** | The pre-commit hook widens a partial commit | Infrastructure; bites every session in this clone |
| **201** | No public way to validate a time unit from user input | `harness/main.ts` casts `unit as TimeUnit`. Two shapes in the issue; A matches CLAUDE.md's loose-input rule |
| **202** | `harness/plugins.ts` teaches the retired spread/filter plugin form | Gallery page, so it teaches the old call. Judge per line — batch installs are fair long form |
| **196**-class | — | closed, but see §5 |

Also open and **not** from this work: #142, #143 (span invariants — both sit in the editing code just refactored), #159, #160, #161, #158.

## 4. Decisions already made — do not silently re-open

Each is one revertible commit. Argue with evidence if you disagree; do not quietly undo.

- **D-S5-33 (#162/#181)** — *a registration records its declarer; the consumer's surfaces report consumer declarations only; data outlives its plugin, a declaration does not.* No schema bump: a compatible narrowing of what `schema: 3` writes.
- **D-S5-34 (#184)** — `hideGridColumn`/`showGridColumn`/`hiddenGridColumns`, backed by `hidden?: boolean` on the stored declaration. `show` deletes the key rather than writing `false`.
- **D-S5-35 (#195)** — `setCapabilityRule`/`clearCapabilityRule`. Set/clear not boolean, because a capability has **three** states and only the third lets the per-kind table answer.
- **D-S5-36 (#195)** — `installPlugin`/`uninstallPlugin`/`hasPlugin`, strict where assignment was quiet.
- **#195 rule, in `plans/02` §2** — *assignment replaces the whole value; a verb writes one key — and a verb never merges and never mutates.* This reconciles with #187's *a config value is a value, not a mutable object*. A merging setter was considered and rejected: it makes assignment mean two things and leaves no way to remove a key.
- **#187** — `FrameSettings` keeps its `Object.is` skip, so `map['x'] = fn; gantt.barRenderer = map` does **not** repaint. Deliberate and documented.
- **#189** — a plugin owns its own column geometry; the library stores it for nobody, the consumer included. `PluginStore` cannot hold it (per-Entry data on a *Dataset* plugin; a column is registered by a *Gantt* plugin, which has no store).
- **#192** — a pre-D-S5-33 document holding a plugin's Field is **unsupported**, not repaired. A repair would discard a live consumer declaration to serve a document that cannot exist.
- **#194** — *a Field has a `key`; a Grid column carries the `field` it shows.* `CellItem.key` is unchanged — the keyed-children key is a different job.
- **#183** — `PluginContextParts`, public. The export is load-bearing: without it api-extractor prints only `Omit<…>` and every plugin-surface member vanishes from the report, so a breaking removal would produce no diff.
- **#177** — `onDomEvent(…, { outside: true })` declined. It inverts `dom.owns` ("outside my Gantt"); `outsidePointer` needs "outside my node".
- **#178** — not an API gap. A plugin factory returns the plugin *plus its own calls*; `pluginById<T>(id)` would be a lie generic.
- **I9 / `MountLayer.bounds`** — kept the injected `readBounds` reader rather than widening `no-flow-layout-rows`' exemption list. `mount-layer.ts` is the `src/view/` file most likely to grow a row measurement by accident.

## 5. Traps found the hard way

- **A review finding is not a spec.** Five of #163's twenty findings asserted behaviour the code did not have. Verify before implementing, and argue back with evidence rather than implementing something worse.
- **Mutation-check any test you claim pins something.** `#186` exists because replacing `api/gantt.ts:213`'s read-live arrow with a snapshot left **all 1334 tests green**. Break the guard, confirm red, restore.
- **`api/gantt.ts:213` must stay an arrow**: `editExtender: (request) => options.dataset.editExtender(request)`. A stored value pins the occupant that existed at construction — invisible today, wrong the moment S7 lands. There is now a test that fails on the snapshot.
- **Line numbers in issues drift**, and at least one issue pointed at the wrong file entirely (#175's per-cell map is in `render/dom/index.ts`, not `gantt-shell.ts`).
- **`model/` forbids helper functions and local consts** (eslint `model-is-types-only`), so an error message is built inline in the constructor.
