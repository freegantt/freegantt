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
**`git push` has not run since `393d1bf`.** Push `ccfd0cc` and `8369074`. No pull request is open.
The user asked for **commit and push after each stage** — do that from here on.

**Baseline:** `verify:full PASS — all 16 checks green, test:e2e included` at `8369074`.

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
   C1 has to share them with `layout/rows/entries-source.ts`. **This is an open implementation
   decision the plan does not make.** The clean answer is to extract the matcher into its own module
   both files import, so there is one match compiler and one syntax — which is what "an author learns
   one match syntax" promises. Check `layout/rows/` → `layout/items/` against
   `.dependency-cruiser.cjs` before choosing.

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
