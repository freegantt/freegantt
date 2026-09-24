# #529 — `'api'` means code only: no gesture writes it, and no capability rule reopens it

**Reported:** 2026-09-23. **Status:** planned, no code. Labels: `api change`. Blocks #528.
Base: `origin/main` at `d9073e67`. Line numbers below are for that commit.

## Problem

`Field.editable: 'api'` says "the app writes it, the user does not". The grid honours it by default.
But `canWrite` refuses only `'never'` before it asks the consumer and variant rules. So
`capabilities: { edit: true }`, or a variant's `edit: true`, reopens an `'api'` cell, a bar move and
a resize. An `'api'` `start` can be dragged. #528 depends on `'api'` to stop drag-reorder.

## Rulings (owner, 2026-09-23)

- R1. `'never'`: no write. `'api'`: `entries.update()` only. `'anywhere'`: code and gestures.
- R2. A gesture is any interaction write: grid cell, drag, resize, keyboard nudge, Delete on a bar.
- R3. `capabilities.edit` and a variant's `edit` only narrow `'anywhere'`. They never widen `'api'` or `'never'`.
- R4. A per-entry lock rule (`ctx.edits.setLockRule`) may still reopen a cell. Every view sees it, so it stays.

## Decisions (⚠️ = the owner confirms)

- D1 ⚠️ **A new ADR, not an edit to ADR 0015.** `docs/adr/README.md` says an accepted record is never rewritten. ADR 0015 changes only its `status:` line and its index row, to "amended by 0032". That is the same edit 0031 makes to 0020. This replaces the issue's work item 3 ("update decision 18's sentence"). Number 0032 assumes #533 lands 0031 first. Check `ls docs/adr` at commit time.
- D2 ⚠️ **Keep `edit: true` in `WriteRule`.** After the fix it still has one meaning: it beats a variant's `edit: false` (consumer over variant, `capability.test.ts:344-350`). Its docs say "no narrowing from this Gantt", never "turn editing on".
- D3 ⚠️ **Refuse a derived cell before the consumer rule too (step 3).** Today `edit: true` also opens a rolling-up parent's `start`/`end` (`capability.test.ts:250-256`, `:429-434`). The resize handle then paints, and the commit throws `DerivedFieldNotWritableError`. This widens a cell, so it breaks R3's "only narrow". Step 3 is its own commit, so the owner can drop it. If it is dropped, file a follow-up, and the docs say "never widens the effective editable" rather than "only narrows".
- D4 ⚠️ **An `EditExtender` cascade still writes an `'api'` Field**, also when a drag starts it. A cascade is plugin code, so it counts as code (ADR 0015's cascade ruling). No change.
- D5 ⚠️ **A refusal of `'api'` or `'never'` returns `libraryWriteRule`'s verdict, not a bare `NOT_WRITABLE`.** For an `'api'` cell with no consumer rule, the verdict stays exactly the same (a derived parent cell still says `'derived-value'`). One side effect: a `'never'` rolling-up cell on a parent now gives the `'derived-value'` reason, where today it refuses with no reason. No test pins the old answer.

## Facts found (origin/main)

**The gap**
- `src/view/capability.ts:183`: `if (effectiveEditable === 'never') return NOT_WRITABLE;` is the only refusal before the rules.
- `capability.ts:184-187`: the consumer answer, then the variant answer. Either one returns `WRITABLE`.
- `capability.ts:190` and `src/data/write-rule.ts:166-173`: `libraryWriteRule` refuses a derived cell, and every value that is not `'anywhere'`. It runs last.

**Comments that state the old rule**
- `capability.ts:67-72`, `:160-172` and `:179-181` say "'never' refuses, 'api'/'anywhere' leave room".
- `capability.ts:98-103` and `view/gesture-pipeline.ts` (`#draftedEntries` doc) describe the derived-resize trade-off that D3 closes.
- `src/model/capabilities.ts:56-61`: `edit` is "the one override above `Field.editable`". That is now false.
- `src/model/field.ts:16-21` and `:118-125`: `'api'` means "the grid cell is dead". This says nothing about drag or about the rules.
- `src/api/gantt.ts:928-934` (`setCapabilityRule` doc): shows only a narrowing example. No change.

**Every gesture path goes through the one resolver.** Each row below was checked.

| Path | Asks | Reaches |
|---|---|---|
| Cell editor, double-click | `inline-editing.ts:779` `ctx.interaction.canWrite` | `plugin-ports.ts:488` → `gantt-shell.ts:1875` |
| Cell editor, Enter | `inline-editing.ts:844`; `gantt-shell.ts:2204` reuses that `when` | same |
| Bar move, pointer | `entry-gestures.ts:187` `ctx.can('move')` | `gantt-shell.ts:1042` |
| Resize, pointer | `entry-gestures.ts:183` `ctx.can('resize', e, edge)` | same |
| Pipeline arm, multi-select | `gesture-pipeline.ts:264` `canGesture` | `gantt-shell.ts:2144` |
| Parent move subtree | `gesture-pipeline.ts:335` `entriesMovedBy` | `capability.ts:237` (calls `canWrite`) |
| Keyboard nudge and resize | `keyboard-editing.ts:27` `ctx.session()` | pipeline `canGesture` |
| Handles, grab cursor | `affordance-projection.ts:46,70-71` | `canGesture` |
| Delete on a bar (clears dates) | `core-commands.ts:183` → `gantt-shell.ts:2049-2055` | `canWrite` |
| Context menu | runs commands only (`context-menu.ts:105`); `deleteSelection` is the only one that writes data | as above |
| Drag preview | `extraEditsFor` previews and never writes | D4 |

- No dependency handle and no progress handle exist. `GestureCapability` is `'move' | 'resize' | 'select' | 'activate'` (`model/capabilities.ts:41`). `src/scheduling/` holds only `index.ts`. A future `linkCreate` must name its writes (`capability.ts:138-140`).
- These do not ask `canWrite`, and `editable` never governs them: Delete on a row (`entries.remove`), undo/redo (replay, ADR 0015 decision 19), column resize and reorder, collapse (view state).

**Consumers**
- `harness/main.ts:435-437` answers only `false`/`undefined`. `harness/e2e/data.ts:51` (`end: 'api'`) and `harness/plugins/lock-entries.ts:80` use no `edit` rule. No harness page, doc or e2e test opens an `'api'` Field with `capabilities.edit`. The harness needs no change.
- `src/data/fields/core-fields.ts:65`: `parentId` ships `'api'`.

**Tests that pin today's behaviour**
- `capability.test.ts:161-164`: `'api'` is refused with no rule. This test stays.
- `capability.test.ts:243-248` and `:354-357`: the `'never'` versions of the new tests. Copy them.

**Docs**
- `CONTEXT.md:609` (Writability) says "default `'api'`". That is wrong: the default is `'anywhere'`. The entry also says nothing about the rules narrowing only.
- `CONTEXT.md:605` (Capability) needs no change.
- `plans/02-public-api.md:435`: "the one override above `Field.editable`".
- `plans/02-public-api.md:441`: "to open that, … or answer `edit` for the cell". This becomes false.
- `plans/02-public-api.md:558` and `plans/01-domain-architecture.md:977` (I14 row): "the grid writes at `'anywhere'`" must say "every gesture".
- ADR 0015:21 (decision 18) and ADR 0015:59-65 (the `capabilities.edit` ruling covers `'never'` only).
- `docs/06-plugin-authoring.md:275`: the `'api'` sentence names the cell editor only.

## Steps

Each step is one commit, green on `pnpm verify:full`. In each code step, write the test first and see it fail.

**0. Plan file (XS, docs only).**
- Save this file.
- In `plans/issues/open/README.md`, change the #529 row from "No plan file" to a link to this file.

**1. ADR 0032, "An `'api'` Field takes no gesture" (S, ~70 lines, docs only; it may lead the code).**
- New file `docs/adr/0032-an-api-field-takes-no-gesture.md`:
  - Context: the gap above, with `file:line`.
  - Decision: R1–R4, and the order `canWrite` reads (one step per line):
    1. Is there a stored home?
    2. The effective editable (lock rule, then `Field.editable`).
    3. The library refusal (derived; not `'anywhere'`).
    4. The consumer's rule.
    5. The variant's rule.
  - Why: a capability that opens a door the write door shuts is a bug (ADR 0015's own reasoning). Each level means one thing. #528 depends on `'api'`.
  - Consequences: D2, D4 and D5, and "Delete on a bar passes over an `'api'` date".
  - Out of scope: the `parentId` risk below.
  - Include D3's text only if the owner confirms it. Otherwise record it under "open".
- ADR 0015 frontmatter `status:` becomes "amended by 0032 — …". The body stays as it is.
- In `docs/adr/README.md`, the 0015 row becomes "amended by 0032". Add a row for 0032.

**2. Refuse `'api'` before the rules (M, ~15 src, ~70 test, ~40 doc lines). Depends on 1.**
- `src/view/capability.ts` `canWrite`: replace line 183 with
  `if (effectiveEditable !== 'anywhere') return libraryWriteRule(entry.hasChildren, declared, effectiveEditable);`.
- Rewrite the comments at `:67-72`, `:160-172` and `:179-181`. State the rule once: "The data layer refuses first. The consumer and variant rules only narrow an `'anywhere'` cell. Only a per-entry lock rule reopens one."
- `src/view/capability.test.ts`, a new `describe("an 'api' Field takes no gesture")` with five tests:
  1. `edit: true` does not open an `'api'` cell, move or resize (`canWrite`, `can('move')`, `can('resize', e, 'start')`).
  2. A variant `edit: true` does not either.
  3. `edit: () => true` does not either.
  4. A lock rule (`editableOf` input answers `'anywhere'` over an `'api'` declaration) opens the cell, and the gestures with it.
  5. A consumer `edit: false` still narrows that reopened cell.
- `src/api/gantt.test.ts`, in `describe('Gantt entryMove …')`: "an 'api' start cannot be dragged, even when capabilities.edit answers true".
  - Setup: `fields: [{ key: 'start', editable: 'api' }]`, `capabilities: { edit: () => true }`.
  - Drive the drag with the pointer sequence that test uses.
  - Expect: no `beforeEntryMove`, dates unchanged, `canUndo` false.
  - Then expect `dataset.entries.update(id, { start })` to commit.
- Docs, in this commit:
  - `model/capabilities.ts:56-61` and `model/field.ts:16-21,118-125`: `'api'` means no gesture, and no rule reopens it.
  - `CONTEXT.md:609`: fix the default, and add "narrows only".
  - `plans/02:435,441,558`.
  - `plans/01:977`.
  - `docs/06-plugin-authoring.md:275`.

**3. ⚠️ D3: refuse a derived cell before the rules too (M, ~10 src, ~25 test, ~15 doc lines). After 2. Drop this step if the owner declines.**
- `canWrite` computes `libraryWriteRule(...)` once, right after the effective editable, and returns it when `!ok`. The consumer and variant rules follow. The last line becomes `return WRITABLE`. The `!== 'anywhere'` arm from step 2 folds into this.
- Tests: flip `capability.test.ts:250-256` to `{ ok: false, reason: 'derived-value' }`. At `:429-434`, the cell now refuses and the move stays `true`. Add: `edit: true` paints no resize handle on a deriving parent.
- Remove the trade-off text at `capability.ts:98-103` and in `gesture-pipeline.ts`'s `#draftedEntries` doc.
- Update ADR 0032's D3 line if step 1 left it open.

**4. Close-out (XS).** After merge, move this file to `plans/issues/closed/`. Then update the README rows for #529 and #528.

Order: 0 → 1 → 2 → 3 → 4. Nothing runs in parallel, because steps 2 and 3 edit the same function.

## Risks

- ⚠️ **`parentId` ships `'api'`.** After this change, no gesture may write it. A future drag-to-reparent (#528 area) is refused unless core ships `parentId` as `'anywhere'`. #528 Q1 covers `siblingIndex` only, so the owner rules on `parentId` before drag-reorder lands.
- A consumer who used `edit: true` to open an `'api'` Field loses the gesture. The fix is `'anywhere'`. Nothing has shipped, and no in-repo consumer does this.
- #533 is in flight on `CONTEXT.md`, `plans/02` and `docs/adr/README.md`. It edits different sections, but the README index rows sit next to each other. Rebase step 1 on #533 if #533 merges first.
- `sentence-length` and `check-doc-examples` run in `verify`. Keep new doc sentences at 25 words or fewer.
- A cell refusal can change from silent to spoken (D5, and D3). The cell editor then shows a notice where it showed none. The step 2 and step 3 tests pin both.

## Out of scope

- Delete on a row, undo/redo, and column gestures. `editable` does not govern them.
- The cascade door (D4). `entries.update()`'s thresholds. `write-rule.ts` does not change.
- `docs/architecture/files.md:171`. It describes `capability.ts` with retired names (`Interactions`, per-kind table). It is stale, but it does not mention `edit`.

## Coordinator review (2026-09-23, approved with amendments)

- **E1 — The ADR number is set at commit time.** The #533 Gantt PR also plans a new ADR, and the two
  PRs run at the same time. Whichever commits first takes 0032; the other takes the next free number
  (`ls docs/adr` on the branch, after merging `main`). Every "0032" above means "the new ADR".
- **E2 — No rebase.** Where the plan says "rebase", merge `main` into the branch instead.
- **E3 — Step 3 (D3) stays in tonight.** It follows R3: a rule only narrows. It is its own commit, so the
  owner can revert it. ⚠️ The owner confirms.
- **E4 — Spec labels** (R1–R4, D1–D5) stay in this plan. Code comments, test names, docs and the harness
  state the rule itself (`CLAUDE.md`).
- **E5 — ⚠️ `parentId` ships `'api'`,** so after this fix no gesture can reparent an entry. The owner
  rules on `parentId` before a drag-to-reparent gesture lands. Nothing tonight adds one.
- The ⚠️ calls D1, D2, D4 and D5 stand for tonight. The owner confirms them in the morning.

## Coordinator note (after #533 PR 1 merged)

- ADR numbers are fixed now, so parallel branches do not clash: #533 PR 2 writes 0032. **This PR writes
  ADR 0033.** Read every "0032" above as 0033. #528 writes 0034.
- Line numbers above are for `d9073e67`. The branch starts at `b7d71aa4` (#533 PR 1 merged). Check each
  line before you edit it.
