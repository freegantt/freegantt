# Worklist — #197, #198, #202: the composition seam, and two sweeps behind it

**Owner:** the `s5-compose` agent · **Branch:** `s5-compose` · **Base:** `s5-start`

Three independent jobs, **three separate commits**, in this order. Tick each box **in the commit that
earns it**, not at the end.

---

## 1. #197 — the plugin contract publishes a `merge` the library never exports (`critical`)

The full statement is `plans/03-slices.md:270`. In short: the contract's own example composes
extenders with `merge(next(request), mine(request))` (`src/model/plugin.ts:23`,
`src/data/dataset-state.ts:194`), and the library exports no `merge`. The legal one is internal —
`mergeEntryEdits`, `src/data/fields/field-access.ts:37`.

**Why the tests stay green and still lie.** Every doc example and every composition test uses a `Map`
spread. They pass only because each wrapper writes a *different* entry id. Two extenders writing one
entry lose the earlier `StoredEdit` outright, and lose `proposedKeys` with it — which is how a
`meta`-sourced Field is recognized, so the Rollup then overwrites a value a plugin proposed.
`plans/01` §7 forbids exactly that.

S7 is the first slice with a second occupant on the hook (`scheduling()` composes over
`entryDependencies()`, D-S5-30/D-S5-31), and a cascade that moves an entry is the colliding case. Fix
the seam before the first real consumer stands on it.

- [x] `mergeEntryEdits` reaches the public surface — decide *where* first: it is a plugin-author tool,
      and CLAUDE.md's "two callers, two surfaces" says an app author must never meet it.
      **Where:** `src/api/dataset-plugin.ts`, beside `DatasetEditHook` — the contract that hands a
      plugin the occupant it has to merge with — and one re-export line in `src/api/index.ts`
- [x] Run the `naming` skill on the exported name. Write the plugin author's call site down and read
      it in English. `merge` alone is almost certainly too generic for this codebase (#7's lesson).
      **Kept `mergeEntryEdits`:** `EntryEdits` is the glossary term (`CONTEXT.md`), the call site
      reads true, and a search for `merge` alone finds three other things
- [x] Every doc example that composes with a `Map` spread now uses the exported function —
      `src/model/plugin.ts`, `src/data/dataset-state.ts`, and any `plans/` example
- [x] **The law test:** two extenders that write the **same** entry keep both writes, and both
      `proposedKeys` survive. Mutation-check it — break the merge, confirm red, restore
      (handoff-post-163 §5)
- [x] ~~A second test pins that the Rollup does not overwrite a `meta`-sourced value a plugin proposed
      through a composed extender~~ **The box was wrong.** `plans/s4-hierarchy-and-rows/s4.2-rollup.md`
      §"Precedence is unchanged" states the opposite, and it is D-S2-22: *the Rollup yields to a Field
      the body proposed, and wins over one the extension hook proposed.* A test pinning the box as
      written would pin the reverse of a locked decision. The real Rollup damage the broken merge did
      is that the Rollup reads effective **child** values from the merged edits, so a dropped write
      made a parent roll up from a stale child. That is what the second test pins now, on a
      `meta`-sourced Field, in `src/api/dataset.test.ts`
- [x] `plans/03-slices.md:270` updated to say the prerequisite is met

**Do not touch `plans/00-overview.md`.** Its S6 → S7 gate row holds an uncommitted line on this exact
subject, by an unidentified author, and the repo owner has been asked who owns it (#197). Leave it.

---

## 2. #198 — `canSelect` builds an Item id from an Entry id (`quickie`)

The sixth guess site. #185's list did not name it, so it survived four commits of removing exactly
this belief.

`src/interaction/entry-gestures.ts:115` does `ctx.entryFor(itemId(id))`. `entryIdOfItem(itemId(id, 0))`
returns `id` again, so it is **correct today and produces no defect**. It is dead weight that reads as
if Item ids and Entry ids convert freely.

Its one caller filters a list `selectableEntriesInRowOrder()` has already capability-filtered, so the
filter is redundant too.

- [x] Delete `canSelect`; `selectRange` returns the slice unfiltered
- [x] Check whether `itemId` is still imported in `entry-gestures.ts` at all; drop the import if not.
      It was not used anywhere else, so the import is gone too
- [x] Fix the test fake in `entry-gestures.test.ts`. **The box named the wrong member.** `entryFor`
      already resolves through `entryIdOfItem`, and nothing about it kept `canSelect` alive. The fake
      member that did is `selectableEntriesInRowOrder`, which answered `ORDER` unfiltered while the
      real `gantt-shell.ts#selectableEntriesInRowOrder` filters by the `select` capability. One test
      therefore made an Entry incapable and expected `interaction/` to filter a second time. The fake
      now answers the question the shell answers, and that test pins the range over the filtered
      order instead

**Do not** replace the filter with a second capability call. The capability resolves once, in the
shell (I14).

---

## 3. #202 — `harness/plugins.ts` teaches the retired spread/filter install form

`harness/` is the library's first consumer and a gallery page, so it teaches whatever it shows. It
shows the call form that #195's `installPlugin`/`uninstallPlugin`/`hasPlugin` (D-S5-36) replaced.

- [ ] Every install in `harness/plugins.ts` uses the verb form
- [ ] Judge per line: a **batch** install is fair long form and may stay. Do not mechanically rewrite
      what is already the clearer call
- [ ] Read the file as a consumer afterwards. Anything left that re-derives what the library computes
      is a new API gap — file it against S5, do not tidy it away (CLAUDE.md)

---

## Do not touch, all three jobs

`etc/freegantt.api.md` (generated; the coordinator regenerates it at merge), `plans/00-overview.md`,
`src/view/gantt-dom.ts`, `src/api/command.ts`, `src/extensions/features/context-menu.ts` (the
`s5-row-target` agent owns those), and the `s5-errors` agent's file list.

`src/api/index.ts` is shared with both peers. Add your one export and nothing else — a textual
conflict there is expected and cheap; a reformat of the file is not.

## Done means

`pnpm verify` green and `pnpm test:e2e` green, on the branch, before you report.
