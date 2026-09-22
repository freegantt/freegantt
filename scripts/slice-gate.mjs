#!/usr/bin/env node
// Reads the current slice from .slice and prints that gate's mechanical conditions plus the
// human-only checklist items (plans/00 §4, docs/04-hooks-and-ci.md §5.1). Bumping .slice is a
// reviewed commit — this script does not bump it, it only reports.

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function run(cmd, cwd = root) {
  try {
    execSync(cmd, { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** True iff a test title carrying `[<id>]` exists in the source — a fixed-string search, not a
 * regex, so `[S1-A2]`-shaped ids never get read as a character class (plans/s1.11-close-the-gate
 * README.md D-S1.11-1). Checked before anything runs: an id that was never written must fail loudly,
 * not pass because the filtered run matched zero tests and exited 0 anyway. `dirs`/`cwd` default to
 * the real tree; `test/guards/slice-gate.test.ts` overrides both to drive this against a fixture. */
export function idExistsInSource(id, { dirs = ['src', 'e2e'], cwd = root } = {}) {
  try {
    execSync(`grep -rlF "[${id}]" ${dirs.join(' ')}`, { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Runner name -> how to run the escaped, id-filtered slice of that runner. No `--project` flag on
 * vitest: an acceptance id may live in `pure` or `dom` and move between them with no gate edit
 * (D-S1.11-1). `pnpm test:e2e`, never a bare `playwright test`: the script carries the config, and
 * shelling past it is how the gate and CI drift apart. */
export const RUNNERS = {
  vitest: (id) => run(`pnpm vitest run -t "\\[${id}\\]"`),
  e2e: (id) => run(`pnpm test:e2e -g "\\[${id}\\]"`),
};

/** Builds one gate check for an acceptance id: (1) the id must exist in a test title, fixed-string
 * matched over `src` and `e2e`; (2) each named runner must then pass, filtered to the escaped
 * pattern. Every hand-written `run()` line that shells past this helper is a review finding
 * (plans/s1.11-close-the-gate README.md §5). `runnerImpls`/`existsOptions` are the test seam: real
 * gate checks never pass either, so production behaviour is unchanged. */
export function tagged(id, runners, label, { runnerImpls = RUNNERS, existsOptions } = {}) {
  return {
    label: `[${id}] ${label}`,
    run: () => {
      if (!idExistsInSource(id, existsOptions)) return false;
      return runners.every((runner) => runnerImpls[runner](id));
    },
  };
}

/** `[S5-A1]` is the dogfood gate (D-S5-5), and its claim has two halves that only mean something
 * together: the lint proves `extensions/` reaches nothing but `api/` and `model/`, and the feature
 * tests prove a built-in still does its whole job from that surface. A green lint over a plugin
 * that does nothing proves nothing, so the one line runs both. */
export function provenByLintAndTests(check, lint = () => run('pnpm boundaries')) {
  return { label: check.label, run: () => lint() && check.run() };
}

const GATES = {
  S0: {
    name: 'S0 → S1',
    checks: [
      {
        label: 'boundaries lint active and failing on violation (red test)',
        run: () => run('node scripts/guard-red-test.mjs'),
      },
      { label: 'layout tested headlessly (test:node)', run: () => run('pnpm test:node') },
    ],
    human: ['HUMAN: harness renders fixture bars — check before advancing .slice'],
  },
  S1: {
    name: 'S1 → S2',
    checks: [
      tagged('S1-A1', ['e2e'], '10,000-entry fixture: only windowed rows exist in the DOM'),
      tagged(
        'S1-A2',
        ['vitest'],
        'grid/timeline row tops pixel-identical under fractional zoom (I9) — gate condition 1',
      ),
      tagged('S1-A3', ['vitest', 'e2e'], 'preset switch + anchored zoom are live, no remount'),
      tagged('S1-A4', ['e2e'], 'two Gantt instances share one ScrollModel, x and y (D9) — gate condition 2'),
      tagged('S1-A5', ['vitest'], 'axis correct across a DST transition in the dataset zone'),
      {
        label: 'I9/I12 guards red-tested (no-flow-layout-rows, scroll rule, no-time-to-pixel-math)',
        run: () => run('node scripts/run-rule-tests.mjs'),
      },
    ],
    human: [],
  },
  S2: {
    name: 'S2 → S3',
    checks: [
      tagged(
        'S2-A1',
        ['vitest'],
        'random mutation sequences + undo-all restore byte-identical toJSON (I7) — gate condition 1',
      ),
      tagged('S2-A2', ['vitest'], 'fromJSON(toJSON(d)) round-trips byte-stable — gate condition 2'),
      tagged('S2-A3', ['vitest'], '500-entry bulk update: one changeset, one layout pass, one frame'),
      tagged('S2-A4', ['e2e'], 'changeset log shows from/to per field for every edit — gate condition 3'),
      {
        label:
          'S2 guards red-tested (store mutation, derived-in-json, rAF owner, module state, the four removable leaves)',
        // run-rule-tests.mjs covers the custom RuleTester rules (store mutation, module state);
        // guard-red-test.mjs covers the four dependency-cruiser *-is-removable leaves. Both run here
        // so the label's claim is true of the one check, not split across two gate rows.
        run: () => run('node scripts/run-rule-tests.mjs') && run('node scripts/guard-red-test.mjs'),
      },
    ],
    human: [],
  },
  'S1.12': {
    name: 'S1.12 → S3',
    checks: [
      tagged('S1-A6', ['e2e'], 'multi-year fixture at the day preset scrolls at the density floor'),
      tagged('S1-A7', ['vitest'], 'zoomIn/zoomOut step one preset, keep the anchor, no-op at the ends'),
      tagged(
        'S1-A8',
        ['vitest', 'e2e'],
        'three-band preset renders three full-height bands; grid spacer matches to the pixel',
      ),
      tagged('S1-A9', ['e2e'], 'header stays pinned while rows scroll under it'),
      tagged(
        'S1-A10',
        ['vitest', 'e2e'],
        'panToToday reveals the today line; locale re-labels with no remount',
      ),
    ],
    human: [],
  },
  'S1.13': {
    name: 'S1.13 → S3',
    checks: [
      tagged(
        'S1-A11',
        ['vitest'],
        "a labelled dateLines entry renders a .fg-date-line-label at the line's x; an unlabelled one renders no caption",
      ),
      tagged(
        'S1-A12',
        ['vitest'],
        '.fg-today-line is gone everywhere in the rendered DOM; .fg-date-line and --fg-date-line-color replace it',
      ),
      tagged(
        'S1-A13',
        ['vitest'],
        'a pinned todayLine Instant renders one uncaptioned .fg-date-line, no now() read',
      ),
      tagged(
        'S1-A14',
        ['vitest', 'e2e'],
        "a dateLines entry's className reaches the node's class list, and a consumer's dashed CSS actually renders",
      ),
    ],
    human: [],
  },
  S3: {
    name: 'S3 → S4',
    checks: [
      tagged(
        'S3-A1',
        ['vitest'],
        'before-event → one transaction → after-event (move, resize, nudge); selection event pair, no change',
      ),
      tagged('S3-A2', ['vitest'], 'Escape mid-drag restores store and paint'),
      tagged('S3-A3', ['vitest'], 'hover allocates nothing, no frame rebuild'),
      tagged('S3-A4', ['vitest'], 'extender preview ghosts extra entries'),
      tagged('S3-A5', ['vitest'], 'capability gates pointer and keyboard affordances'),
      tagged('S3-A6', ['vitest'], 'gesture + extender extras undo atomically'),
      tagged('S3-A7', ['vitest'], 'viewport gestures write nothing'),
      tagged('S3-A8', ['e2e'], 'cursor line during drag; drag + Ctrl+Z; veto demo'),
    ],
    human: ['HUMAN: harness/editing-and-data.html is pokeable — drag, resize, veto toast, Ctrl+Z'],
  },
  S4: {
    name: 'S4 → S5',
    checks: [
      tagged(
        'S4-A1',
        ['vitest'],
        'declared meta Field rolls up, shows in grid, edits and undoes with core fields, round-trips',
      ),
      tagged('S4-A2', ['vitest'], 'unregistered field key throws UnknownFieldError — never a silent write'),
      tagged('S4-A3', ['vitest', 'e2e'], 'switching rowSource re-resolves with no remount; scroll survives'),
      tagged('S4-A4', ['vitest'], 'segmented entry renders N bars; one segment drags transactionally'),
      tagged('S4-A5', ['vitest'], 'pack-mode rows change height; scroll offset re-clamped, not reset'),
      tagged('S4-A6', ['vitest'], 'collapse survives data edits and is independent per Gantt'),
      tagged('S4-A7', ['vitest'], 'filter with keep-ancestors shows a deep match under its parents'),
      tagged(
        'S4-A8',
        ['vitest'],
        "empty 'group' renders, accepts children, gains a span — no special-casing",
      ),
      tagged(
        'S4-A9',
        ['vitest'],
        'autoGroup promotes in one undo step; losing the last child demotes nothing',
      ),
      tagged('S4-A10', ['vitest'], 'filterPolicy matchOnly returns matching entries — no ancestor rows'),
      tagged('S4-A11', ['vitest'], "{ source: 'custom', resolve } produces the resolver's rows"),
    ],
    human: [
      'HUMAN: harness/hierarchy-and-timeline.html is pokeable — row sources, pack, filter, collapse, cost + undo',
    ],
  },
  S5: {
    name: 'S5 → S6',
    checks: [
      provenByLintAndTests(
        tagged('S5-A1', ['vitest'], 'every built-in feature is a plugin over the public surface alone'),
      ),
      tagged('S5-A2', ['e2e'], 'weekend shading draws, follows a pan, and clears when removed live'),
      tagged('S5-A3', ['vitest'], "a consumer's own kind renders and refuses resize; no src/ file names it"),
      tagged(
        'S5-A4',
        ['vitest', 'e2e'],
        'chord-map parity with the pointer; axe finds nothing on any gallery page',
      ),
      tagged(
        'S5-A5',
        ['vitest', 'e2e'],
        'a cell edit commits one transaction; beforeEntryEdit replaces the editor',
      ),
      {
        // The two halves of D-S5-28, and the reason there are two: the probe catches a built-in an
        // accidental import drags in, and the budget catches growth no single import causes. The
        // build runs first because both read `dist/`, the path a third party's bundler resolves.
        label: '[S5-A6] no unused built-in reaches a consumer bundle, and core does not grow past its budget',
        run: () => run('pnpm build') && run('pnpm bundle-probe') && run('pnpm size-limit'),
      },
    ],
    human: ['HUMAN: the gallery, opened cold, explains the library to someone who has never seen it'],
  },
};

// Guarded so `test/guards/slice-gate.test.ts` can import `tagged`/`idExistsInSource` without this
// script's own run-and-exit side effect firing.
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const slice = existsSync(path.join(root, '.slice'))
    ? readFileSync(path.join(root, '.slice'), 'utf8').trim()
    : 'S0';

  const gate = GATES[slice];
  if (!gate) {
    console.log(`gate: no automated checklist defined yet for slice ${slice}.`);
    process.exit(0);
  }

  console.log(`${gate.name} gate`);
  let allPassed = true;
  for (const check of gate.checks) {
    const ok = check.run();
    allPassed &&= ok;
    console.log(`  ${ok ? '✔' : '✗'} ${check.label}`);
  }
  for (const item of gate.human) {
    console.log(`  ☐ ${item}`);
  }

  process.exit(allPassed ? 0 : 1);
}
