# Build 3 — one plugin, one install site

**The ADR:** [`docs/adr/0019`](../../../docs/adr/0019-one-plugin-one-install-site.md). Read it first. It holds every decision here.

**Lands after Builds 1 and 2.** Those two join the row. This one joins the plugin that reads it.

**What lands.** `definePlugin({ id, requires, data, view })` replaces the `GanttPlugin` / `DatasetPlugin` pair. A plugin with a `data` half installs on the `Dataset`.

**Tick each box as you finish it.** Do not save the ticks for the end.

---

## Unit A — one plugin type, two halves

- [ ] Add `definePlugin({ id, requires, data, view })`. Copy the shape from the ADR's *Decision*.
- [ ] `data(ctx)` declares Fields, the edit hook and the store. It is DOM-free and runs as the `Dataset` constructs.
- [ ] `view(ctx)` registers variants, renderers, commands and keys. It runs as a `Gantt` mounts.
- [ ] **The install site is where the state lives.** A plugin with a `data` half installs on the `Dataset`, because a Field must exist before the first Rollup (D-S5-4).
- [ ] Every `Gantt` bound to that Dataset runs the `view` half **once, each with its own context**. One `view(ctx)` call is one Gantt's worth of state. I2 holds by construction.
- [ ] `requires` moves onto the one type and covers both halves.

**Do not** add a type parameter to the `Dataset` constructor. TypeScript stops inferring later type parameters once an earlier one is written, so a plugin generic there breaks `new Dataset<TaskProps>({ plugins: [...] })`. Module augmentation stays the route for a plugin's Field keys. This is refuted item 3 in [`field-redesign/shared/refuted.md`](../../field-redesign/shared/refuted.md) — *not* item 3 in `row-redesign/README.md`, which refuses rebuilding the live `Entry` per revision. The ADR restates it.

---

## Unit B — what keeps its current site

- [ ] A **chrome-only plugin** — no `data` half, such as `weekendShading()` — keeps installing on the `Gantt`.
- [ ] `gantt.plugins` stays live-reconfigurable.
- [ ] `dataset.plugins` stays read-only, for the reason it already is.

---

## Unit C — the failure mode gets a name

- [ ] A plugin with a `data` half, handed to a `Gantt`, **throws**. It has arrived too late to declare a Field.
- [ ] **A silent partial install is refused.** Installing the `view` half alone gives an author a Gantt that paints variants for a Field that was never declared, and every `entry.read(key)` answers `undefined`. That is the failure this ADR exists to remove.
- [ ] Use `PluginSetupError` unless the author rules otherwise. It already names a plugin id, and `extensions/install-dataset-plugins.ts:124` already unwinds the plugins installed before it. No new type is needed.
- [ ] The message must say **where to install it**, not only that it failed.
- [ ] **The `Q` entry exists — it is `Q4`.** Add to it in [`../BUILD-LOG.md`](../BUILD-LOG.md) if the error choice or its wording needs more than the recommendation there. Do not open a second one.

---

## Unit D — retire the pair

- [ ] `GanttPlugin` (39 refs, 12 files) and `DatasetPlugin` (27 refs, 9 files) retire into one `Plugin`.
- [ ] `PluginContextOf` and `DatasetPluginContextOf` become the two halves' context types. Each keeps the members it has.
- [ ] Migrate all nine plugins in `harness/plugins/`: `buffer-kind`, `lock-entries`, `log-everything`, `milestone-kind`, `popup-demo`, `risk-kind`, `selection-shortcuts`, `weekend-shading`, `write-log`. Build 2 already turned `milestone-kind` into page config, so expect eight.

---

## The hazard this build inherits, and does not repair

**A plugin may install over values it did not write.** Install a plugin on a `Dataset` whose `props` already carries that plugin's key, and the plugin declares the key over values with no recorded writer.

This was [#192](https://github.com/Pawel-IT/FreeGantt/issues/192)'s hazard one level down. The issue is **closed** — its `fromJSON` half died with ADR 0016. The live-install half did not die, and it had no owner between 2026-09-11 and this ADR.

- [ ] Do **not** plan a repair. The ADR names the owner and stops there.
- [ ] Two facts already bound it. The library never writes an undeclared key (ADR 0011). A duplicate *declaration* is already refused by the registry; a *value* the consumer wrote first is not.
- [ ] Do **not** enforce a plugin key prefix. A prefix is a convention a plugin follows (`scheduling:progress`, ADR 0008). Core enforces none. That enforcement was the withdrawn ADR's, and it is not coming back.

---

## Tests this build adds

- [ ] A plugin with both halves installs once on the `Dataset`, and its Fields exist before the first Rollup.
- [ ] Two Gantts on one Dataset each run `view(ctx)` once, with separate state (I2).
- [ ] A chrome-only plugin still installs on the `Gantt`, and `gantt.plugins` still reconfigures live.
- [ ] A plugin with a `data` half handed to a `Gantt` throws, and the message names the right install site.
- [ ] `requires` is honoured across both halves.
- [ ] A failed install unwinds the plugins set up before it.

---

## Gate

- [ ] `grep -rn '\bGanttPlugin\b\|\bDatasetPlugin\b' src/ harness/ | wc -l` → 0. Use the word boundaries: `PluginContextOf` and `DatasetPluginContextOf` survive as the two halves' context types.
- [ ] `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log` → report the verdict line.

---

## Locked-spec edits this build owes

- [ ] `plans/02` — add `definePlugin`; retire the `GanttPlugin` / `DatasetPlugin` pair.
- [ ] `docs/06-plugin-authoring.md` — delete the "Two contracts, two hosts" section and its table. A plugin author reads one row, not two. Every sample in this file must compile; `scripts/check-doc-examples.mjs` gates it.
- [ ] `plans/s5-extensibility-and-editing/s5.10-dataset-plugins.md` — check what it still says about the two contracts.
