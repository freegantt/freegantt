# Combined spike NOTES — 0011–0015

Branch: `spike/0011-0015-combined`. Throwaway code only. No `src/` edits.

**Overruled after this spike, 2026-09-10.** Decision 26 shipped **no** `followChildren`. A parent with children always derives, and `kind` left the record. Every line below that names `followChildren` or a live `kind` is marked **overruled** where it sits. Do not copy either into the 0013 build.

A spike reports. The author rules.

Parent re-opened every seam after the first store landed. Several composition bugs were real. The fixes below are the second pass.

## Test counts (2026-09-10, second pass)

| Folder | Tests |
|---|---|
| `combined-store/` | 31 |
| `type-probes/` | 1 (+ tsc) |
| `brand-whole/` | 1 (+ tsc) |
| `update-flat/` | 2 |
| `plugin-write/` | 3 |
| **Total** | **38** |

## Questions 1–17

1. **PropsEdit vs runtime (#267).** Index-signature `PropsEdit` accepts `{ phase: 3 }`; runtime throws `UndeclaredPropsKeyError`. CombinedStore `Write` **refuses** top-level `strat` at compile time (`@ts-expect-error`). `update({ start: undefined, end: undefined })` compiles.
2. **Brand placement.** Inner bag and whole `ProposedEdit` both refuse the spread. Whole `ProposedEdit` keeps `PropsEdit` clean. The first store branded the inner bag while the probe branded the whole edit. Second pass landed whole-edit brand on the recommended extender.
3. **Drop long form at `update()`?** `FlatUpdateStore` scores the call: one spelling at `update()`, `props` on `add`/Document. Double-name throw disappears. The write door and the record door then disagree — decision 1 spent its table keeping them together. Optional; do not fold into the recommended store.
4. **Per-key props merge.** `mergeEntryEdits` and `mergeStoredEdits` both call `mergeProps`. `{ cost }` + `{ owner }` keeps both. `{ cost: undefined }` **deletes** the key. First pass used `{ ...prev, ...next }`, which leaves `cost: undefined` on the bag.
5. **Sort hole asc + desc.** `compareInstant` puts holes last in both directions in one test. No `direction * order` multiply.
6. **Biconditional survives 0013.** `toJSON` omits derived parent dates **and** segments. Reload + child rollup restores both. Dates iff Segments holds in memory and on the Document (neither, or both).
7. **Rollup over dateless children.** HEAD keep-stale leaves last rolled envelope. `clear-when-all-dateless` clears parent dates. Default on the recommended store.
8. **Old Document `rollUpKinds: []`.** `fromJSON` raises `DocumentMigrationReport`. The consumer cannot act on the report alone. ~~Only `followChildren: false` per parent opts out.~~ **Overruled** — 26 ships no opt-out, and the ADR accepts the migration with no mitigation.
9. ~~**`followChildren: false`.**~~ **Overruled — 26 ships no flag.** The spike asked where the flag lives, and found the Entry rather than `props`. There is no flag to home.
10. **`hierarchy.autoGroup`.** Deleted from the façade. First pass kept a no-op setter "to prove it is worse." That is the mistake the 0013 review named. Delete it. Do not accept-and-ignore.
11. **Empty group cost cell.** Writable before children; first child drops typed value. That is the fix for the two-predicate trap.
12. **Plugin writes need `PropsEdit<TProps & PluginEntryProps>`.** Bare `scheduling:progress` fails on `PropsEdit<PlannerProps>` alone; intersection compiles. Runtime shorthand and `props` path both work when the Field is declared.
13. **Prefix vs typed dot.** Honest sentence: share `props` for one storage home, not for the typed dot. Bare `progress` throws `PluginFieldCollisionError` naming the plugin. First pass hardcoded `progress`. Second pass reads declared `plugin:key` suffixes.
14. **Extender composition.** Runtime `composeExtenders` merges per-key; two plugins on one Field throws `PluginWriteCollisionError`. Return `undefined` for nothing.
15. **Core override JSON round-trip.** Spike encodes `{ key: 'end', editable: false }` in `fields`. `src/authored` still drops core keys. Harness `data.ts:39-40` stays false until core lands encoding. Not patched in the harness.
16. **Three field shapes.** `{ key: 'start', editable: false }` constructs; `{ key: 'start' }` no-op; `{ key: 'start', column }` throws `IllegalCoreFieldOverrideError`.
17. **Absent `editable` / I14.** Split: `update({ parentId })` writes; grid says no for absent column Fields; explicit `false` throws. I14 claimed with **change**, not write. **Decision 18 is held, not ruled** — the author refused a three-way boolean. The `kind` half of this row is **overruled**: 26 deleted the Field, so 18's table is two rows.

**Decision 13 (four read doors).** Align names after 9/12; `durationOf` implements `duration` — settle with [#274](https://github.com/Pawel-IT/FreeGantt/issues/274). No store spent on a rename.

## New composition findings (second pass)

| ID | Finding | Result |
|---|---|---|
| **I** | Un-date of locked `start` | First store exempted envelope-clear from the lock so the demo call stayed green. That is mud. Un-date is a **change**. Lock-doors C refuses it. Demo call no longer mixes a locked `start` with un-date. |
| **J** | ~~`followChildren` home~~ | **Overruled — 26 ships no flag.** |
| **K** | `autoGroup` no-op | Deleted from `CombinedStoreOptions`. |
| **L** | Brand on recommended extender | Whole `ProposedEdit`, matching the winning probe. |
| **M** | Plugin collision | Declared `plugin:suffix` owns the bare suffix. |
| **O** | Replay door | `store.replay(id, write)` writes a locked `start`. Named, not a hole. |
| **P** | Child-add widen | Throws the whole add. First store had the throw and no test. |

## Improvements A–H

| ID | Verdict | One sentence |
|---|---|---|
| A | **Optional, not recommended** | Flat `update()` reads cleaner; it splits the write door from the record door that decision 1 kept together. |
| B | **Wins over inner bag** | Whole `ProposedEdit` brand refuses spread without polluting `PropsEdit`. |
| C | **Wins** | Hole-last needs a direction-aware compare; `direction * order` on `defaultCompareStored` puts the hole first on `desc`. |
| D | **Wins over HEAD stale** | `clear-when-all-dateless` beats keeping a rolled envelope when all children lose dates. |
| E | ~~**Wins as 26 cost**~~ | **Overruled.** The spike scored `followChildren: false` as 26's price. The author took 26 without it: a parent with children always derives. |
| F | **Wins** | Per-key merge must use `mergeProps` (delete on `undefined`), not object spread. |
| G | **Wins** | Plugin prefix + collision error at the write door ship together. |
| H | **Wins, with a leftover** | One `resolveWrite` for compute / derived / editable. Exists still lives in `assertTopLevelClosed`. Grid still has a hardcoded column set for the I14 split. |

## Remaining mud (not dissolved)

- Exists arm is still a second function (`assertTopLevelClosed`), not `UnknownFieldError` inside `resolveWrite`.
- `gridCanWrite` hardcodes `GRID_COLUMN_KEYS`. That is the split 18 already named, not a third predicate to ship.
- Spike `Write` hardcodes `cost` / `owner` / `'scheduling:progress'`. Production needs `EntryEdit<TProps>`.
- `get()` re-applies rollup on every read. Production stores the rolled value.

## API gaps (not patched)

- Harness `data.ts:39-40` claims a core `editable` lock round-trips in the Document.
- `PropsEdit` vs registry remains #267.
- Grid vs API on absent `editable` cannot claim I14. Document the two-surface rule.

## Re-run

**The code is not in this folder.** `69d76b1` took it back off the dev branch, so only these notes stay here. Check the branch out first:

```
git worktree add /tmp/FreeGantt-spikes/combined spike/0011-0015-combined
```

Then, from the repo root of that worktree, so `tsc.test.ts` finds `node_modules/.bin/tsc`:

```
./node_modules/.bin/vitest run --config vitest.config.ts \
  --workspace plans/field-redesign/combined/spikes/<name>/vitest.workspace.ts \
  plans/field-redesign/combined/spikes/<name>
```

Names: `combined-store`, `type-probes`, `brand-whole`, `update-flat`, `plugin-write`.
