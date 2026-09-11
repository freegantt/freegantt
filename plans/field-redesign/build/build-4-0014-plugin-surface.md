# Build 4 — ADR 0014, the plugin-author surface

**The one question it answers.** Where do a plugin's values live, and what are the read doors called?

**Read first.** [`docs/adr/0014`](../../../docs/adr/0014-the-plugin-author-surface.md). Then [`README.md`](README.md) in this folder.

**Lands after.** Build 2, for `props`. Nothing else. This build blocks nothing, and nothing blocks it.

**Tick each box as you finish it.** Do not batch the ticks.

---

## Target state

**The rule, once.** A plugin's Field values share `props`. A plugin key carries a required prefix that names the plugin.

The stored bag widens additively to `Readonly<Partial<TProps & PluginEntryProps>>`. Core and consumer keys stay bare.

```ts
export const SCHEDULING_PROGRESS = 'scheduling:progress'

dataset.entries.read('t1', 'owner')
ctx.read(entry, 'duration')
dataset.entries.update('t1', { [SCHEDULING_PROGRESS]: 60 })
gantt.gridColumns = ['name', SCHEDULING_PROGRESS]

gridColumns: [
  { field: 'cost', cellRenderer: ({ text, value }) => ({ tag: 'span', text }) },
]
```

**The prefix is not a serialization argument.** It exists because two writers share one bag at runtime.

**Composition.** The runtime owns composition, merging and branding. The extender returns extras, or nothing. Non-overlapping keys on one Entry combine. The same Field on the same Entry is a collision: neither value applies, and one warning names both plugins and the Field, per **Entry** and not per Field globally. **Do not throw** — install order must not pick a winner.

**Known hole, accepted.** Install the scheduling plugin on a Dataset whose `props` already carries a legacy `progress`, and the plugin registers `progress` over values it did not write. No ADR gives a value a provenance record.

---

## Work

- [ ] Rename the renderer payload `value` → `text` **first**, on both context types.
- [ ] Then rename `fieldValue` → `value` on both context types.
- [ ] Rename `entries.fieldValue` → `entries.read`. Keep the signature and the return type.
- [ ] Rename `#fieldValueForCell` → `#cellValueFor`.
- [ ] Delete `FieldContext.durationOf`.
- [ ] Point the `duration` core Field's `compute` arm at the guarded helper from Build 1.
- [ ] Make `weightedMeanByDuration` read `ctx.read(entry, 'duration')`, and skip an `undefined`.
- [ ] Stop `fieldContextFor` supplying `durationOf` (`src/extensions/features/inline-editing.ts:113`). The whole-day approximation goes with it.
- [ ] Drop the two stub keys. Rewrite `src/data/fields/field-access.test.ts:75`. **Leave `src/layout/rows/sort.test.ts:28` alone** — it is a local helper, not a `FieldContext` key.
- [ ] Require a prefix on a plugin-declared Field key. Keep core and consumer keys bare.
- [ ] Publish the reserved core key list.
- [ ] Make the plugin export its key as a string const.
- [ ] Give the runtime composition, merging and branding.
- [ ] Drop a contested Field on one Entry, apply neither value, and warn naming both plugins.
- [ ] Drop `durationOf` and `fieldValue` from `etc/freegantt.api.md`. I11 gates it.
- [ ] Close the build — see [`README.md#close-every-build`](README.md). Link [`../reviews/2026-09-10-0011-to-0015-combined/`](../reviews/) as the verdict report — ADR 0014 was never spiked on its own, and the combined report covers decisions 9, 12, 13 and 16. **Do not run a new spike wave to satisfy the gate.**

**Slices it touches.** S4 (the Field registry, the grid column renderer), S5 (plugins, the plugin runtime, inline editing), S7 (the scheduling plugin's key prefix — not built yet, so this is a contract for it). **Re-run the S4 and S5 slice gates.**

---

## Do not

- **Do not do the two renames out of order.** `value` → `text` goes first. Reverse the order and the names collide mid-rename.
- **Do not blind text-replace.** Match whole identifiers (`OldName`), then run `pnpm typecheck`. Read each hit: a rename must not reach a same-named string in a comment or a doc. It must reach `harness/` and `e2e/`, HTML included.
- **Do not let the `duration` compute arm call `ctx.read(entry, 'duration')`.** That is a cycle.
- **Do not keep two units.** Millisecond is the one unit. The inline editor's whole-day approximation goes.
- **Do not ship a bare alias for a prefixed key.** App code writes the prefixed key. There is no plugin-only write door.
- **Do not replace the `Map` container.** An object keyed by Entry id reorders the cascade.

---

## Gate

```bash
pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log

# Returns 82 today. Must return 0.
grep -rn '\bfieldValue\b' src/ harness/ e2e/ etc/
# Returns 13 today. Must return 0.
grep -rn 'durationOf' src/ harness/ e2e/ etc/
```

---

## Issues

| Issue | What this build does to it |
|---|---|
| [#274](https://github.com/Pawel-IT/FreeGantt/issues/274) | **Closes.** One compute arm, one unit, one door. |
| [#267](https://github.com/Pawel-IT/FreeGantt/issues/267) | Gives the renderer `value`. A Field-aware renderer read is still owed. Do not close it. |
| [#214](https://github.com/Pawel-IT/FreeGantt/issues/214) | Nothing. The `read` doors inherit the limit. A `compute` Field still cannot ask *am I a parent?* |
