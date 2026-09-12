# Build 1 — the harness meets the sealed `exports` map

**The issue:** [#287](https://github.com/Pawel-IT/FreeGantt/issues/287). No ADR. This is a guard, not
a decision.

**Lands first.** Build 3 makes `harness/planner.ts` the acceptance test for the shipped factories. A
harness that reaches past the `exports` map proves nothing, because a workaround inside it reads the
same as a working public surface.

---

## What is true at HEAD

- `vite.config.ts` aliases `freegantt` to `src/api/index.ts`. `tsconfig.json:24` carries the matching
  `paths` entry. Both landed at S5.6 as `[S5-A2]`.
- Every rule in `.dependency-cruiser.cjs` is scoped `^src/`. The harness is scanned for circular
  imports and nothing else.
- `pnpm boundaries` runs `depcruise --config .dependency-cruiser.cjs src harness`. `e2e/` and
  `fixtures/` are not scanned at all.
- Every file in `harness/plugins/` already imports `from 'freegantt'`.
- 33 import statements across 21 files still read `from '../src/…'`. 32 of them name
  `../src/api/index.js`. One names `../src/api/dataset.js` — `fixtures/empty-group-dataset.ts:5`.
- No file under `e2e/` imports `src/` today. The rule guards the future there.
- `Dataset` is exported from `src/api/index.ts`, so the one non-index import needs no new export.

---

## The work

### 1. Every consumer import reads the published specifier

- [ ] Switch all 33 imports to `from 'freegantt'`. Find them with:
      ```bash
      grep -rn "from '\.\./src/" harness e2e fixtures --include=*.ts
      ```
- [ ] `fixtures/empty-group-dataset.ts:5` reads `from 'freegantt'` as well. It names `Dataset`, and
      the index already exports it.
- [ ] Run `pnpm typecheck`. The `paths` entry resolves the alias, so nothing else moves.
- [ ] **If a file needs something `src/api/index.ts` does not export, stop.** That is an API gap.
      Report it and log a **Q** entry. Do not keep the relative path, and do not add the export
      without an answer.

### 2. The lint rule

- [ ] Add `harness-public-api-only` to `.dependency-cruiser.cjs`, beside `extensions-public-only`.
      #287 holds the rule verbatim, comment included. Use it as written.
- [ ] `tsConfig: { fileName: 'tsconfig.json' }` already sits in the options block, so the cruiser
      resolves the alias to `src/api/index.ts` and an aliased import passes the rule.

### 3. The script sees the other two folders

- [ ] `package.json`'s `boundaries` script becomes:
      `depcruise --config .dependency-cruiser.cjs src harness e2e fixtures`.
- [ ] `scripts/guard-red-test.mjs`'s `depcruiseFails()` runs the same four paths. It hardcodes
      `['…', 'src', 'harness']` today, and a red test the runner cannot see is no guard.

### 4. The red test

- [ ] Add a red case to `scripts/guard-red-test.mjs`, in the shape the file already uses:
      a `checkRedTestFile` call that writes one deliberate violation, asserts `depcruise` fails, then
      deletes the file.
- [ ] The fixture imports a relative path into `src/` from `harness/` — an internal, not the index,
      so the rule and not a typo is what blocks it. `import '../src/layout/items/variants.js';` is
      the case #287 names.
- [ ] Name the case so the output says what it proves. The other calls set the shape.

### 5. Documentation

- [ ] `docs/03-boundaries-and-config.md` gains the new rule, beside the rules it already lists.
- [ ] `docs/04-hooks-and-ci.md` §4 lists the red-test cases. Add this one.

---

## Gate

- [ ] `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log`
- [ ] Report the verdict line.
- [ ] Confirm by hand that the guard fires: write the violating import, run `pnpm boundaries`, see it
      fail, delete the file. A guard with no failing fixture is presumed broken.

## Close the issue

- [ ] Close [#287](https://github.com/Pawel-IT/FreeGantt/issues/287). Name the count of imports switched, and the red case that proves the rule fires.
- [ ] Apply the labels with the `label-issues` skill.

## Done when

- No file under `harness/`, `e2e/` or `fixtures/` names a path inside `src/`.
- `pnpm boundaries` scans four folders.
- `pnpm guards` proves the new rule blocks a violation.
