# Build 2 — a variant is a rule, not an id list

**The ADR:** [`docs/adr/0018`](../../../docs/adr/0018-a-variant-is-a-rule-not-an-id-list.md). Read it first. It holds every decision here.

**Lands after Build 1.** A rule needs a row that answers questions. `when` receives the live `Entry`.

**What lands.** Four registrations become one object. Nothing stores a variant. The word "look" is retired everywhere, the DOM included.

**Tick each box as you finish it.** Do not save the ticks for the end.

---

## Unit A — one variant is one object

- [ ] Declare `EntryVariant`. Copy the member list from the ADR's *Decision*: `name`, `when?`, `items?`, `paint?`, `can?`.
- [ ] Ship `when` in **both** forms — the field-match shorthand (`{ milestone: true }`) and the predicate (`(entry) => …`). This is refuted item 7 in [`row-redesign/README.md`](../README.md): the shorthand serves the common case and core can index it; the predicate is the escape.
- [ ] Default `items` to one whole-entry Item. Both shipped examples hand-write that line today.
- [ ] Add `variants` to `GanttOptions`. An app author installs a variant with no plugin at all.
- [ ] Add `ctx.addVariant(variant)` as the plugin door. One type, two doors, one shape.
- [ ] Resolve per Gantt: **the first registered rule that answers yes wins.** There is no second source and no stored value.
- [ ] Register core's own two variants **last**, as ordinary `EntryVariant` objects with nothing special about them:
      `{ name: 'parent', when: (entry) => entry.hasChildren, paint: summaryBar }` and `{ name: 'leaf' }` with no `when`.

**Do not** store a variant. This is refuted item 9 in [`row-redesign/README.md`](../README.md), and the author refused it on 2026-09-11. A stored variant is ADR 0013's stored `kind` under a new word.
**Do not** add a reserved-name list, a write-door refusal or a core Field key for variants. All four died with the stored value.
**Do not** cache a variant on the Dataset. Variants are per Gantt (I2, refuted item 5 in [`row-redesign/README.md`](../README.md)).

---

## Unit B — retire the four registration seams

- [ ] `registerLookClaim` retires (18 refs, 6 files).
- [ ] `registerItemProducer` retires (27 refs, 7 files).
- [ ] `registerLookDefaults` retires (27 refs, 8 files).
- [ ] `RendererByLook` retires (22 refs, 7 files). `barRenderer: RendererByLook` leaves `GanttOptions` (`src/api/gantt.ts:154`) — it was a fifth site for the same name.
- [ ] `KindDefaults` retires (15 refs, 7 files). `Interactions` serves both levels.
- [ ] `LookClaim` becomes `VariantRule` (11 refs, 5 files).
- [ ] `resolveLook` becomes `resolveVariant` (10 refs, 5 files) and **loses its structural fallback** (`src/layout/items/produce-items.ts:249`). The `leaf` variant carries no `when`, so it answers when nothing earlier does.
- [ ] `CapabilityInputs` loses `lookOf` and `registeredDefaultsFor` (`src/view/capability.ts:113-115`). Build 1 removed the other three.
- [ ] **Keep `DoubleLookClaim`, `LookClaimant` and `ReportDoubleClaim`**, renamed. Two rules may still both answer yes. Registration order resolves it and the diagnostic reports it.

---

## Unit C — `can` takes predicates

- [ ] `KindDefaults` is boolean-only today for one stated reason: *"a registering plugin never sees an `entry`"* (`src/view/capability.ts:83-90`). Build 1 hands it one. Delete the mapped boolean type and let `Interactions` serve both levels.
- [ ] Keep the resolution order unchanged: consumer `interactions`, then the variant's `can`, then the library rule.
- [ ] Keep `Field.editable` and `interactions` as **two questions**. Merging them deletes the read-only view. This ADR reuses the type, not the seam. This is refuted item 6 in [`field-redesign/shared/refuted.md`](../../field-redesign/shared/refuted.md) — *not* item 6 in `row-redesign/README.md`, which refuses one object for the `Dataset` and the `Gantt`.

---

## Unit D — delete `EntryLook`, and take the word out of the DOM

- [ ] Delete `EntryLook` (`src/model/entry.ts:11`) — **47 references in 12 files**. Nothing replaces it. A variant name is a `string`. The alias already ended in `(string & {})`, so this widens no type.
- [ ] `Item.look` and `BarGeom.look` become `.variant`, typed `string` (`src/layout/items/produce-items.ts:35,76`, `src/layout/frame.ts:93`).
- [ ] Delete `BAR_SHAPE_CLASS` (`src/render/dom/index.ts:205-207`). The summary class comes from the `parent` variant's own `paint`, like every other variant's class.
- [ ] **`fg-bar-summary` keeps its name.** It is a CSS class. It moves to the `parent` variant's `paint`. `src/view/styles.ts` names it too.
- [ ] `data-kind` becomes `data-variant`. **The write site does not contain the string `data-kind`** — `src/render/dom/index.ts:1186` writes `node.dataset['kind']`. A grep for `data-kind` misses it. Change both.
- [ ] The literal `data-kind` sits in five `src/` files: `render/dom/index.ts`, `render/dom/index.test.ts`, `layout/items/produce-items.ts`, `model/entry.ts`, `api/gantt.test.ts`.
- [ ] `'look-claimed-twice'` becomes `'variant-claimed-twice'` (`src/view/gantt-shell.ts:1475`), in 3 files.
- [ ] `claimedLookFor` renames (`src/layout/items/produce-items.ts`, 4 refs).

**Plan the `fg-bar-summary` move and the `data-variant` rename together.** Seven e2e specs couple to this area — `data`, `parent-bar-drag`, `planner`, `plugins`, `row-hover`, `selection`, `theme` — plus `src/api/gantt.test.ts`. Most couple through `fg-bar-summary`, not the attribute. Move both in one step so those specs stay green.

---

## Unit E — migrate the consumers

- [ ] `harness/plugins/buffer-kind.ts` — 7 calls become one `ctx.addVariant`.
- [ ] `harness/plugins/risk-kind.ts` — 4 calls become one.
- [ ] `harness/plugins/milestone-kind.ts` — **becomes four lines of page config and no plugin.** The ADR says so.
- [ ] Delete the owned-id `Set` pattern. Each plugin casts `new Set<EntryId>(ownedIds as Iterable<EntryId>)` today, because a claim could not ask a question about the row. Now it can.

---

## What this build does not change

- **[ADR 0013](../../../docs/adr/0013-what-decides-that-a-row-derives-its-values.md) stands whole.** A variant never changes what an Entry derives. The Rollup is untouched. A parent that paints as `'milestone'` still rolls up like a parent. **Do not edit ADR 0013** — it is accepted, and an accepted ADR is superseded, never edited.
- **No `if (variant === …)` chain in core.** Core reads a variant to pick a row out of a registration table. It never branches on the name. Deleting `BAR_SHAPE_CLASS` pays this down further.
- **[ADR 0015](../../../docs/adr/0015-what-the-write-door-refuses.md) is owed nothing.** The earlier draft added two write-door refusals. Both died with the stored value.

---

## Tests this build adds

- [ ] The first registered rule that answers yes wins, and a later rule does not.
- [ ] A row added after install gets the variant. This is the bug the id set caused.
- [ ] `when` works in both forms — field match and predicate.
- [ ] A variant with no `when` is last-resort, and every row resolves.
- [ ] Two rules that both answer yes raise `'variant-claimed-twice'` once, not per read.
- [ ] Two Gantts on one Dataset install different variants and do not interfere (I2).
- [ ] The pin path: `update(id, { milestone: true })` lands in a `ChangeSet`, undoes, and repaints.

---

## Gate

- [ ] `grep -rn 'EntryLook\|registerLookClaim\|registerItemProducer\|registerLookDefaults\|RendererByLook\|KindDefaults' src/ harness/ | wc -l` → 0.
- [ ] `grep -rn "data-kind\|dataset\['kind'\]" src/ e2e/ | wc -l` → 0.
- [ ] `grep -rn "'look-claimed-twice'" src/ | wc -l` → 0.
- [ ] `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log` → report the verdict line.

---

## Locked-spec edits this build owes

- [ ] `CONTEXT.md` — add a **Variant** glossary entry, beside Field and Grid column. The naming skill requires the glossary entry before the name.
- [ ] `CONTEXT.md:517` — the `data-kind` State attribute becomes `data-variant`. The line still reads "the bar look a producer claimed", which quotes the retired word.
- [ ] `CONTEXT.md:47` — the **Hierarchy** entry says "draw the parent look". Change the word. Build 4 changes the rest of that entry.
- [ ] `CONTEXT.md:44` — the retired **Kind** entry says a plugin *"stores which ids it owns"*. That is the thing this ADR just removed: a variant is a rule, and nothing stores one. The sentence becomes a variant whose `when` claims the rows. Leave the rest of the entry, `_Avoid_` list included.
- [ ] `plans/01` §2.5 — "Seams key on structure or on plugin-owned ids" needs the variant rule's wording.
- [ ] `plans/02` — add `variants` to `GanttOptions`; retire `barRenderer: RendererByLook`.
- [ ] `docs/06-plugin-authoring.md` — it teaches the four seams and the owned-id `Set`. It is the **only** file `scripts/check-doc-examples.mjs` gates, so every sample in it must compile.
