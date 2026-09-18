# Handoff — #421, coordinator session of 2026-09-18

**Read `README.md` for the build order and `BUILD-LOG.md`'s top table for the rulings. This file
holds only what a fresh coordinator cannot recover from those two.**

---

## Where the work stands

| Build | State |
|---|---|
| **C4** The Rollup fast path | **DONE** — commit `393d1bf`, `verify:full PASS` |
| **Q30** rename (a C1 prerequisite, pulled forward) | **DONE** — commit `8369074`, `verify:full PASS` |
| **C1** The rule | **NEXT. Not started.** Unblocked — every ruling it waited on is now made |
| C2, C3, C5, C6, C7 | Not started, in that order |

**Branch:** `Pawel-IT/a-bar-is-a-child-entry-its-own-name-values-varia`.
**Everything through `d810e4c` is pushed.** No pull request is open.
The user asked for **commit and push after each stage** — do that from here on.

**Baseline:** `verify:full PASS — all 16 checks green, test:e2e included` at `d810e4c`.

---

## What the author ruled on 2026-09-18

Full text is in `BUILD-LOG.md` as **Q29–Q33**. The short form:

- **Q29** — `reportUnknownFieldMatch` names a *variant*, and `childrenAsSegments` is not one. C1 adds
  a new `unknown-row-source-field` code to `BuiltInReportCode`.
- **Q30** — `VariantRule` → `EntryRule`, `VariantPredicate` → `EntryPredicate`. **Already done.**
- **Q31** — a `boolean` Field edits as a checkbox. `'checkbox'` joins `FieldType.inputType` and the
  cell editor reads `.checked`.
- **Q32** — `duration` should not be special at all. Filed as **#428**. C6 ships a stopgap the author
  called limited and inconsistent.
- **Q33** — nothing skips a claimed parent's subject; the producer answers. (Coordinator's call on a
  contradiction inside C2's own cell — Q26 and Q27 already pointed this way.)

---

## The five code facts that cost the most to establish

A later session will re-derive these otherwise. Each was checked against the file, not the plan.

1. **`RowPassInput.fieldContext` does NOT carry a Field's `equals`.** It is
   `{ readonly timeZone: string }` and `src/model/field.ts:247` says so on purpose. Sort reaches each
   Field's `compare` through a *separate* `fieldCompares: readonly FieldCompare[]` argument
   (`resolve-rows.ts:62`). **C1 must add a new `fieldFor: (key: FieldKey) => Field | undefined` port**
   — the shape `VariantRegistryPorts.fieldFor` already uses (`layout/items/variants.ts:206`).
   The plan's old sentence "the wire already exists" was wrong and is now corrected in place.

2. **`compileRule` and `valueMatches` are module-private** in `src/layout/items/variants.ts:375,391`.
   C1 has to share them with `layout/rows/entries-source.ts`. **DECIDED 2026-09-18 by the
   coordinator: extract them into their own module** — one match compiler, one syntax, which is what
   "an author learns one match syntax" promises. `.dependency-cruiser.cjs` puts no rule *inside*
   `layout/`, so `rows/` → `items/` would lint clean, but it points the wrong way: `items/` already
   imports `rows/row-source.js` (`produce-items.ts:10`), and `variants.ts` drags `BarRenderer` and
   `Capabilities` behind it. The new module depends on `model/` alone, and both sides import it.
   **A new file needs its row in `docs/architecture/files.md` or the `guards` check fails.**

3. **`UnknownFieldMatch.rule` is a `VariantClaimant`** (`{ variant: string; pluginId?: PluginId }`,
   `variants.ts:126,137`) and `GanttShell.#reportUnknownFieldMatch` (`view/gantt-shell.ts:1760`)
   hardcodes *"The variant rule 'X' matches on field 'k'"*. That is why Q29 needed a second code.
   `BuiltInReportCode` (`model/error-report.ts:40`) is checked against a `Record<BuiltInReportCode,
   true>` literal, so adding a code is a defined move and both tables must gain it (#333).

4. **`FieldType.inputType` is `'text' | 'number' | 'email' | 'tel' | 'url'`**
   (`model/field.ts:232`, and again at `:177`), and `extensions/features/inline-editing.ts:715` does
   `input.type = field.inputType ?? 'text'` then reads `.value`. Both spellings of the union need
   `'checkbox'`, and the editor needs a `.checked` branch. `SHIPPED_FIELD_TYPES` is the table to add
   `boolean` to (`data/fields/field-types.ts`, bottom of file); `FieldType` already allows `equals`.

5. **`measureEntryDuration` sums `entry.segments`** (`data/fields/field-access.ts:211-222`), and
   ingest mints one Segment over every spanning Entry. So `'segments'` measures a childless leaf's
   **own span** today. Q25's "rename" to `'children'` would make every childless leaf measure `0`.
   The C6 stopgap and #428 both exist because of this.

Also verified true as written: nine `entryIds[0]` reads in seven files; `resolveEntriesSource`
returns early in the flat branch and never builds `entryTreeIndex` (`entries-source.ts:44-46`);
`FieldTypeName` (`model/field.ts:14`) has no `boolean`; `field-registry.ts:230` refuses `rollUp` on a
`compute` Field; `EntryStore.#byParent` was already memoized, which is what made C4 cheap.

---

## What the spike already built for C1 (read 2026-09-18)

**Branch `spike/421-s4-child-entry` holds a working, measured version of C1's fold.** It is probe
code and does not ship, but a build that re-derives it wastes a day. Read it with:

```
git diff $(git merge-base main spike/421-s4-child-entry) spike/421-s4-child-entry \
  -- src/layout/rows/entries-source.ts src/layout/rows/row-source.ts
```

What it settles, with numbers behind it:

1. **The tuned fold shape.** One pass over `entries` builds *two* Sets — claimed parents, and the
   children they take off the row list — and both branches read them. Three measured constant-factor
   rules came out of it, and a rebuild that ignores them costs 2.7× on row resolution:
   - **Early-return before the tree index** when the rule is unset *and* `tree !== true`. The first
     cut built the index, ran the claim pass and allocated a `Set` for every consumer who never asked
     for the feature: today's shipped path went 0.09 ms → 0.24 ms. The early return gives it back.
   - **`childRowsOf.get(entry.id)` before the rule read.** Only a parent can be claimed, and the rule
     reads a Field — the most expensive question the pass asks. The Map lookup answers first, so the
     Field read runs once per parent, not once per Entry (10,000 children can never be claimed).
   - **Ask `claims()` once per Entry, not twice.** The first cut asked once to build the set and
     again per row.

   Result: `resolveRows` 6.9 ms → **3.9 ms** on 10,200 Entries, which is **0.38 µs/Entry against
   today's 0.45 µs/Entry** — row resolution is *cheaper per Entry* than the shipped path.

2. **Shape (a) works in running code.** `entryIds: [entryId(entry.id), ...claimedChildren]`. All nine
   `entryIds[0]` sites read the right answer with no rewrite.

3. **The tree branch drops claimed children from the walk stack** rather than filtering later — the
   same drop `collapse.ts:18-20` already does for a collapsed parent's descendants. `expandable` is
   `!isClaimed && children.length > 0` in the tree branch and `false` in the flat branch.

4. **The spike's one open worry is already answered.** Its `row-source.ts` comment says
   `ChildrenOnParentRowRule` had to restate the rule type rather than import `FieldMatch`, because
   `FieldMatch` is generic over `TProps` and row sources are not. **That is not a blocker:**
   `EntryRule<TProps = Record<string, unknown>>` carries a default, `FieldMatch` ends in
   `& { [key: string]: unknown }`, and `compileRule` (`variants.ts:375`) **already takes a
   non-generic `EntryRule`**. C1 imports the real type. It does not restate it.

5. **What the spike could NOT do is exactly what Q21/Q29 ruled C1 must do.** Its `claims()` matches
   with `Object.is` per key — no Field-typed `equals`, no unknown-key report — because it had no
   `fieldFor`. C1 adds the port and uses the real compiler.

**Rulings the spike pre-dates, and C1 follows over it:** the key is `childrenAsSegments`, not
`childrenOnParentRow` (Q24 — the spike's name was this plan's placeholder, and README §"the name is
ruled" rejects it by name: it says *where*, not *what*). The rule type is `EntryRule`, not a restated
union (Q30). The report code is `unknown-row-source-field` (Q29).

**The spike's `src/data/` half already shipped as C4** (`393d1bf`) — do not take it again.

### Do not copy the spike's shape — three things are better for the callers

Run against the `codebase-design` skill (deep module = small interface, lots behind it), 2026-09-18.

**Placement is right, and this is why.** The claim reads an **Entry**, not a row: `childrenAsSegments`
is an `EntryRule`. A post-pass beside `applyCollapse` — `applyClaim(rows, …)`, which is tempting
because a claim really is a collapse one level deeper (J-plan-I) — holds only ids and would have to
look every Entry back up, and in the flat branch there are no `parentRowId`s to walk. **Put a pass
where its inputs live.** The fold stays inside `resolveEntriesSource`.

Three corrections to the spike's shape:

1. **One ports object, not two flat keys.** C1 needs a `fieldFor` *and* a sink for the unknown key
   (Q29). Put both in **one** type that the shared compiler takes, the way `VariantRegistryPorts`
   already pairs `fieldFor` with `reportUnknownFieldMatch`:
   ```ts
   compileEntryRule(rule: EntryRule, ports: EntryRulePorts): EntryPredicate
   ```
   `RowPassInput` (`row-source.ts:149`) then gains **one** optional key carrying that object, and
   `resolveEntriesSource` takes **one** optional third parameter. Two flat keys would put four
   field-ish keys on `RowPassInput` beside `fieldCompares`/`fieldContext`, and C2 and C6 would add
   more. Run the name through the naming skill — read the call site aloud first.

   **Why not `resolveEntriesSource(input: RowPassInput)`, which `RowProducer` already declares?**
   It is the smaller interface on paper, but `input.source` is a `RowSource` and the entries producer
   would have to narrow it internally instead of at the one call site that knows
   (`resolve-rows.ts:29`), and it churns **20 test call sites** (`entries-source.test.ts`,
   `filter.test.ts`, `sort.test.ts`) that pass `(entries, source)` positionally. One optional ports
   parameter costs those tests nothing.

2. **One Map, not two Sets.** The spike builds `claimedParentIds` and `claimedChildIds`. Build one
   `Map<EntryId, readonly Entry[]>` of claimed parent → its children: it answers "is this parent
   claimed?" with `.has`, hands `entryRow` the children it needs, and the flat branch's skip becomes
   "is **my** parent claimed?" — `claimedChildrenOf.has(entry.parent()?.id)` — off the structure that
   already exists. One thing to build, one to read. Keep all three of the spike's measured
   constant-factor rules while you do it.

3. **`row.claimed` is a real flag, not `entryIds.length > 1`.** C2 reads
   `row.claimed && entry.id === row.entryIds[0]`. An **empty** claimed parent has one `entryId` and is
   still claimed — the "draws a blank row" gate. So the marker cannot be derived, which is the
   evidence for Q19 shape (a) carrying an explicit field. The spike never got here; it widened
   `entryIds` alone.

---

## What C1 has to do

The build cell in `README.md` is authoritative and now carries Q29/Q30/Q31. In summary:

- `childrenAsSegments` on `EntriesRowSource` and `ResolvedEntriesRowSource`, taking
  `true | FieldMatch | EntryPredicate`.
- The fold in `resolveEntriesSource` in **both** branches; `entryTreeIndex` in the flat branch;
  `expandable` cleared on a claimed parent; the claimed marker on `PlannedRow` (Q19 shape (a)); an
  early return so an unset rule costs what it costs today.
- The new `fieldFor` port, threaded `resolve-rows.ts` → `resolveEntriesSource`.
- The `boolean` Field type, with `'checkbox'`.
- The `unknown-row-source-field` code.
- `CONTEXT.md`'s *Segment* entry rewritten **in this build**, not in C7 — between C1 and C6 the word
  names two things, and that is the #7 fault class, bounded on purpose.
- `row-source.ts`'s own header comment ("no Field registry (D-S4-19, D-S4-21)") becomes false. Rewrite it.

**The gate list is in the C1 row of `README.md`'s build table. Do not shorten it.** The one that
matters most: *an unclaimed parent is unchanged, and no existing row snapshot moves.*

---

## Still open, for a later build

- **C6 will rename `ignoreSegments` → `wholeSpan` (Q26).** After C2 that producer returns `[]` for a
  claimed subject, so a name promising "the whole span" fails the naming test. **Pick the name against
  the behaviour it has after C2, not today's.** Use the naming skill.
- **`CHILD-ENTRY-DESIGN.md` line ~69 carries a vendor survey with the names stripped out.** CLAUDE.md
  allows the survey in an **ADR** (with names and links), not in a plan — an unverifiable survey is
  exactly what the rule forbids. Move it into C6's ADR and delete the paragraph. Low priority.
- **A browser measurement of the hot path is still owed** (spike's hover number is a Node proxy), and
  no numeric I5 budget exists to hold it against (`plans/03-slices.md:265` is still unchecked).

---

## How this session works

- Subagents: `implementer` on **sonnet** for builds, dispatched with the `subagents` skill's shape
  (goal, boundary, entry points, completion test, budget). Start
  `.agents/skills/subagents/watch-agent-context.sh` in the background with each wave and **kill it when
  the wave reports** — it exits 1 as an *alert*, not a failure.
- One build per dispatch. Never two agents on the same file. C4's agent respected its boundary cleanly.
- **Verify a subagent's claims yourself.** C4's report was accurate, checked against the diff.
- Gate: `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log`. Report the verdict line, never an
  exit code. A pipe makes `$?` read `tail`.
- **A public-surface change fails `api-report` (check 12 of 16) by design.** Run
  `pnpm exec api-extractor run --local`, commit `etc/freegantt.api.md`, and say so. A rename also
  fails `guards` (check 5) via `docs/architecture/files.md`'s export inventory — update that line too.
