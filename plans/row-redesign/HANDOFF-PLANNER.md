# Handoff — write the build plan for ADRs 0017–0020

**You are a planner.** Write the build plan. Do not build. Do not edit `src/`.

---

## 1. The job

Produce `plans/row-redesign/build/` — a README plus one file per build — that an implementer agent can work from with no further design work. Model it on [`plans/field-redesign/build/README.md`](../field-redesign/build/README.md), which is the shape this project has already proven: per-unit files, checkboxes ticked as you go, reasoning stays in the ADR.

Four ADRs are drafted and none is built. No line of `src/` has changed for them.

---

## 2. Read these, in this order

| # | File | Why |
|---|---|---|
| 1 | [`README.md`](README.md) | the rulings table, the refuted list, the problem each ADR answers |
| 2 | [`docs/adr/0017`](../../docs/adr/0017-the-entry-answers-questions-about-itself.md) | `Entry` and `StoredEntry`. Everything else reads questions off the row |
| 3 | [`docs/adr/0018`](../../docs/adr/0018-a-look-is-a-rule-not-an-id-list.md) | a look is a rule, and nothing stores one |
| 4 | [`docs/adr/0019`](../../docs/adr/0019-one-plugin-one-install-site.md) | `definePlugin({ data, view })`, one install site |
| 5 | [`docs/adr/0020`](../../docs/adr/0020-a-plugin-may-own-the-hierarchy.md) | a data plugin may state what the parent of each Entry is |
| 6 | [`harness/docs/plugin-authoring.html`](../../harness/docs/plugin-authoring.html) | the author-facing surface all four produce, already reviewed |
| 7 | [`plans/field-redesign/build/README.md`](../field-redesign/build/README.md) | the format of your deliverable, and rules 1–12 you must carry over |
| 8 | [`plans/field-redesign/shared/refuted.md`](../field-redesign/shared/refuted.md) | fourteen approaches already refused |

**An ADR's account of the code is a claim. Open the file before you plan against it.** `CLAUDE.md` states this, and #244 is why.

---

## 3. Repo state

- Branch `field-redesign-build`. **Nothing is committed** for these four ADRs.
- Untracked: `docs/adr/0017`–`0020`, `harness/docs/plugin-authoring.html`, `plans/row-redesign/`.
- `pnpm verify:full` is green at handoff: *verify:full PASS — all 16 checks green, test:e2e included (71s)*.
- All four ADRs are `status: proposed`. The build flips each to `accepted`.

---

## 4. What is decided — do not re-open

The full list is the rulings table in [`README.md`](README.md). These four drive the most work:

1. **`Entry` is the live row; `StoredEntry` is the stored values.** Two types. No derived type reads `keyof Entry`. A seam that asks a question about now takes an `Entry`; a seam that describes a change carries `StoredEntry` values.
2. **Nothing stores a look.** A look is a rule, resolved per Gantt, first registered yes wins. `EntryLook` is deleted; a look name is a `string` naming a DOM identity. Core's `'parent'` and `'leaf'` become two ordinary looks registered last.
3. **One plugin, one install site.** A plugin with a `data` half installs on the `Dataset`. A chrome-only plugin keeps its `Gantt` install site, and `gantt.plugins` stays live-reconfigurable.
4. **A data plugin may own the hierarchy.** `HierarchySource` is a pure one-Entry function, `(entry: StoredEntry) => EntryId | undefined`. Core inverts it. `parentId` stays stored.

---

## 5. What is open — raise it, do not invent it

| Open question | Where it is recorded |
|---|---|
| Which rule wins when two plugins both answer yes. Registration order decides it today; nothing rules on what sets that order across plugins | ADR 0018 `open:` |
| Whether the renderer contexts become generic over `TProps` | ADR 0017 `open:` |
| What happens when a plugin with a `data` half is handed to a `Gantt` | ADR 0019 `open:` |
| The hierarchy seam's name | ADR 0020 `open:` |

File each as a **Q** entry the way `plans/field-redesign/BUILD-LOG.md` does. A call you make alone gets a **J** entry so a reviewer can reverse it.

---

## 6. Scope inventory — measured 2026-09-11

Counts are `grep -rn '\bSYMBOL\b' src/ | wc -l`. Treat them as scale, not as a work list.

### ADR 0017 — the Entry

| Symbol | refs | files | Fate |
|---|---|---|---|
| `fieldValue` | 77 | 14 | becomes `entry.read(key)` — see §7, this collides with ADR 0014 |
| `EntryStoreView.childrenOf` | — | — | deleted; `entry.children()` replaces it |
| `CapabilityInputs` | — | `src/view/capability.ts:92-118` | five injected functions collapse into one `Entry` |

**Four sites outside the store stop reading `.parentId`:** `layout/rows/entries-source.ts:16`, `layout/frame-memory.ts:77`, `view/tree-collapse.ts:111,153`, `data/rollup.ts:46,52`. `data/entry-reader.ts:229,567` **write** `parentId` and stay.

### ADR 0018 — the look

| Symbol | refs | files | Fate |
|---|---|---|---|
| `EntryLook` | 47 | 12 | deleted; a look name is `string` |
| `registerLookClaim` | 18 | 6 | retires |
| `registerItemProducer` | 27 | 7 | retires |
| `registerLookDefaults` | 27 | 8 | retires |
| `RendererByLook` | 22 | 7 | retires |
| `KindDefaults` | 15 | 7 | retires; `Interactions` serves both levels |
| `LookClaim` | 11 | 5 | becomes `LookRule` |
| `DoubleLookClaim` | 7 | 3 | survives — two rules may still both answer yes |
| `resolveLook` | 10 | 5 | loses its structural fallback |
| `claimedLookFor` | 4 | 1 | `src/layout/items/produce-items.ts` |
| `BAR_SHAPE_CLASS` | 2 | 1 | `src/render/dom/index.ts:205-207` — deleted; the class comes from the `parent` look's own `paint` |

**Consumers to migrate:** `harness/plugins/buffer-kind.ts` (7 calls), `risk-kind.ts` (4), `milestone-kind.ts` (3). ADR 0018 says `milestone-kind.ts` becomes four lines of page config and no plugin.

**`data-kind` is public DOM surface** (`CONTEXT.md:517`) and seven e2e specs plus `src/api/gantt.test.ts` select on it or on `fg-bar-summary`. The attribute keeps its name and its meaning. Plan the `fg-bar-summary` move so those specs stay green.

### ADR 0019 — one install site

| Symbol | refs | files |
|---|---|---|
| `GanttPlugin` | 39 | 12 |
| `DatasetPlugin` | 27 | 9 |

Nine plugins live in `harness/plugins/`. Each one is a consumer of the new `definePlugin` shape.

### ADR 0020 — the hierarchy

`parentId` appears 228 times in 41 files, but ADR 0020 §Context names the six that matter and separates the four reads from the two writes. Use that table, not the raw count.

---

## 7. The one sequencing decision you must make

**ADR 0014 is still `proposed`, and Build 4 of the field redesign has not landed.** HEAD ships `dataset.entries.fieldValue(id, key)`. `entries.read` does not exist (`src/api/dataset.ts:198`).

ADR 0017 publishes `entry.read('duration')`, and its Consequences say ADR 0014 is **not** a precondition (P7).

So: does the row redesign land its own `read`, or does it wait for `plans/field-redesign/build/build-4-0014-plugin-surface.md`? Both builds rename the same 77 references. **Decide it, state the reason, and put the rename in exactly one build.** A rename planned into two builds is a merge conflict with a spec argument attached.

---

## 8. Landing order

The ADRs declare it in their own "Lands after" lines:

```
0017  →  0018  →  0019  →  0020
```

0017 first: a look rule, a capability predicate and a hierarchy source all read questions off the row, and none can be written until the row answers them. Change the order only with a stated reason.

---

## 9. Hard rules the plan must carry

Copy these from [`plans/field-redesign/build/README.md`](../field-redesign/build/README.md) rules 1–12 and adapt. These matter most here:

1. **`pnpm verify:full` is the gate, and its last line is the answer.** Capture with a redirect, never a pipe: `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log`. Report the verdict line. Never `EXIT: $?`.
2. **Each build lands as one change.** Do not stage a rename behind the old interface. This library has never shipped.
3. **Rename with a word-boundary replace (`\bOldName\b`), then `pnpm typecheck`.** Read each hit. Never a blind text replace.
4. **Never work around a gap in `src/` from `harness/`.** Stop, report the gap, ask whether core closes it. Harness code that compensates for the library is an API gap that no lint catches.
5. **Review `harness/main.ts` on every commit, changed or not.**
6. **Edit `plans/**` freely, then report it.** `.claude/hooks/protect-spec.sh` warns and exits 0. Two arms still block: a new runtime dependency, and a loosened `eslint.config.js` or `.dependency-cruiser.cjs`.
7. **Work deferred to a later build goes in that build's file**, with its gate assertion. A defer nobody receives is a deletion.

---

## 10. Locked-spec edits these builds will owe

None of these is done. Name the owning build for each.

| What is owed | Likely owner |
|---|---|
| `plans/01` §2.5 — "Seams key on structure or on plugin-owned ids" needs the look rule's wording | 0018 |
| `plans/02` — `looks` on `GanttOptions`, and `barRenderer: RendererByLook` retiring (`api/gantt.ts:154`) | 0018 |
| `plans/02` — `definePlugin`, and the `GanttPlugin`/`DatasetPlugin` pair retiring | 0019 |
| `CONTEXT.md` — `Entry` and `StoredEntry` as two glossary terms; `CONTEXT.md:37`'s *Avoid* list still bans "record" | 0017 |
| `CONTEXT.md:517` — `data-kind`'s description still says "the bar look the producer claimed" | 0018 |
| `docs/06-plugin-authoring.md` — teaches the four seams and the owned-id `Set`. It is the **only** file `scripts/check-doc-examples.mjs` gates, so every sample in it must compile | 0018, 0019 |
| ADR 0013 `status: accepted` — **do not edit it.** An accepted ADR is superseded, never edited. ADR 0018 supersedes the registration seams and leaves derivation alone | — |

---

## 11. Traps

- **The O(n²) hierarchy shape.** ADR 0020's source is a pure one-Entry function on purpose, so `#childrenOfWriteSet` keeps its O(children + edits) cost. #212 and slice S1 already killed the O(n²) shape once. Do not plan a source that takes the whole dataset.
- **The circularity in ADR 0020.** The hierarchy source takes a `StoredEntry`, never a live `Entry`, because it computes the very answers the live row exposes. This is load-bearing, not a style choice.
- **The two-shallow-spread trap.** `props` merges per key, never whole-object (`data/fields/field-access.ts:65-78`, ADR 0011). `entryAfterEdit` spreads `StoredEntry` on the drag path, which is why a prototype getter cannot live on the stored type (ADR 0017 P2).
- **`sentence-length` covers 15 declared files in `src/` only.** ADRs and specs are not gated. ASD-STE100 still applies to every line you write.
- **`check-vendor-names.mjs`** scans 496 files. An ADR may name a vendor Gantt; a spec, `CONTEXT.md` and `src/**` may not.
- **The refuted list.** Fourteen items in `plans/field-redesign/shared/refuted.md`, nine more in [`README.md`](README.md). Read both before proposing an alternative.

---

## 12. Deliverable

```
plans/row-redesign/build/
  README.md                     landing order, hard rules, who owns which seam, close-every-build checklist
  build-1-0017-the-entry.md
  build-2-0018-looks.md
  build-3-0019-install-site.md
  build-4-0020-hierarchy.md
```

Each build file states: the ADR it obeys, the work as checkboxes, the files it touches, the tests it adds, its gate assertion, and the locked-spec edits it owes. A reader must be able to stop halfway and show where.

Add `plans/row-redesign/BUILD-LOG.md` for the **Q** and **J** entries, the way the field redesign does.

**Report what you wrote, and list every question you filed.**
