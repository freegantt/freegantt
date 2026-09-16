// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
//
// One gate, three callers: an agent, `.githooks/pre-push`, and `.github/workflows/ci.yml`. All
// three run `pnpm verify:full`. Before #255 they ran different spellings, and the agent's spelling
// was the one that reported completion — `pnpm verify`, which starts no browser and could not see
// a fully red `e2e/resize.spec.ts`. Before the CI rewrite, the workflow held its own hand-written
// list of checks, which could fall behind `verify` in silence.
//
// So this file pins the one property that makes the gate trustworthy: nobody runs a subset. CI
// runs the whole gate command and no individual check beside it, `pre-push` runs the same command,
// and the command reads its check list out of `package.json` at run time. The red fixtures below
// prove the wrapper refuses a list it cannot run, instead of skipping a check.
//
// It also pins the draft rule (docs/04 §5.2): the workflow runs when a pull request asks for
// review, and never while it is a draft. A draft that spends minutes is the cost failure; a ready
// pull request that runs nothing is the proof failure.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCheckList } from '../../scripts/verify-full.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8');

/** The one command every caller runs. */
const GATE = 'pnpm verify:full';

/** `pnpm install` and `pnpm exec` are setup every runner repeats, not checks the gate owns. */
const SCAFFOLDING = new Set(['install', 'exec']);

/** The `pnpm <script>` steps the `verify` chain runs, in order. */
function scriptsChainedBy(verifyScript: string): string[] {
  return [...verifyScript.matchAll(/pnpm ([\w:-]+)/g)].map((m) => m[1]!);
}

/** Every `pnpm <script>` a workflow step runs. Reads any `run:` line, dashed or not, because a
 * step that carries an `id:` or an `if:` puts its `run:` on a line of its own. */
function pnpmScriptsRunBy(workflow: string): string[] {
  const names = [...workflow.matchAll(/^\s*(?:-\s*)?run:\s*pnpm\s+(?:run\s+)?([\w:-]+)/gm)].map((m) => m[1]!);
  return [...new Set(names)].filter((name) => !SCAFFOLDING.has(name));
}

describe('CI and pre-push run the same gate, and run all of it', () => {
  const workflow = read('.github/workflows/ci.yml');
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  const verify = pkg.scripts['verify'] ?? '';
  const prePush = read('.githooks/pre-push');

  it('CI runs the gate command, and no single check beside it', () => {
    // A workflow that runs `pnpm lint` directly has started keeping a second check list. That list
    // is what drifts from `verify`, and the drift always resolves as "CI was green, main is red".
    expect(pnpmScriptsRunBy(workflow)).toEqual(['verify:full']);
  });

  it('CI runs that command as a step, not as a name in a comment', () => {
    expect(workflow).toMatch(new RegExp(`^\\s*-\\s*run:\\s*${GATE}\\s*$`, 'm'));
  });

  it('pre-push invokes the same gate', () => {
    expect(prePush).toMatch(/^\s*pnpm verify:full\s*$/m);
  });

  it("the gate runs verify's chain, then the browser check", () => {
    expect(readCheckList(pkg)).toEqual([...scriptsChainedBy(verify), 'test:e2e']);
  });

  it('the gate refuses a verify step it cannot run', () => {
    const pkgWithRawStep = {
      scripts: { verify: 'pnpm lint && tsc --noEmit', lint: 'eslint .', 'test:e2e': 'playwright test' },
    };
    expect(() => readCheckList(pkgWithRawStep)).toThrow(/cannot run/);
  });

  it('the gate refuses an empty verify', () => {
    expect(() => readCheckList({ scripts: { verify: '  ', 'test:e2e': 'playwright test' } })).toThrow(
      /prove nothing/,
    );
  });

  it('the gate refuses a check that no script defines', () => {
    expect(() => readCheckList({ scripts: { verify: 'pnpm lint', lint: 'eslint .' } })).toThrow(
      /not a script/,
    );
  });

  it('every script verify chains actually exists in package.json', () => {
    const chained = scriptsChainedBy(verify);
    expect(chained.length).toBeGreaterThan(0);
    for (const script of chained) {
      expect(Object.keys(pkg.scripts)).toContain(script);
    }
  });
});

describe('the workflow runs for review, and never for a draft (#255)', () => {
  const workflow = read('.github/workflows/ci.yml');

  it('asks for the ready_for_review event', () => {
    // Not a default pull_request type. Without it, a pull request opened as a draft — which is
    // every pull request here — never runs the gate at all.
    expect(workflow).toMatch(/types:.*ready_for_review/);
  });

  it('skips the job while the pull request is a draft', () => {
    expect(workflow).toMatch(/if:.*github\.event\.pull_request\.draft == false/);
  });

  it('cancels a superseded run', () => {
    expect(workflow).toMatch(/cancel-in-progress: true/);
  });

  // Two event types reach this workflow for one branch, and both must land in one concurrency
  // group. Keying on `pull_request.number` gave `workflow_dispatch` no number, so it fell back to
  // `github.ref` and got a group of its own: one branch, two groups, nothing cancelled, the whole
  // gate run twice in parallel and billed twice. `workflow_dispatch` stays a human door, so the
  // shared group still has to hold.
  it('puts both event types for one branch in one concurrency group', () => {
    const group = /^\s*group:\s*(.+)$/m.exec(workflow)?.[1] ?? '';
    expect(group, 'the concurrency group must key on the branch').toContain('head.ref');
    expect(group, 'the concurrency group must key on the branch').toContain('ref_name');
    // `pull_request.number` is absent on `workflow_dispatch`, so it cannot key a shared group.
    expect(group, 'a number cannot key a group two event types share').not.toContain('pull_request.number');
  });
});

// A step that writes `$GITHUB_OUTPUT` must write exactly one `key=value` line. The Playwright
// version step piped `pnpm exec playwright --version` through `awk '{ print $NF }'`, and `pnpm
// exec` writes its own banner to stdout whenever it runs an install check — "Already up to date",
// then "Done in 351ms using pnpm v11.22.0". `awk` returns one last-field per line, so the file got
// three lines and the run died on the second: `Invalid format 'v11.22.0'`. The banner depends on
// whether the lockfile looks settled, so the step passed on most branches and failed on the one
// that changed dependencies (#355). A command wrapped in a package manager cannot promise one line.
describe('a workflow output step writes one key=value line', () => {
  const workflow = read('.github/workflows/ci.yml');

  /** Every `run:` line that writes to `$GITHUB_OUTPUT`. */
  const outputWriters = [...workflow.matchAll(/^\s*(?:-\s*)?run:\s*(.*\$GITHUB_OUTPUT.*)$/gm)].map(
    (match) => match[1]!,
  );

  it('has an output-writing step to guard', () => {
    expect(outputWriters.length).toBeGreaterThan(0);
  });

  it('never pipes a package-manager-wrapped command into $GITHUB_OUTPUT', () => {
    for (const step of outputWriters) {
      expect(step, `this step can emit a package manager banner: ${step}`).not.toMatch(
        /\$\((?:pnpm|npm|yarn)\s/,
      );
    }
  });

  it('reads the Playwright version from the installed package', () => {
    // The cache key still comes from the install, never from a second copy of the version here.
    expect(workflow).toMatch(/require\('@playwright\/test\/package\.json'\)\.version/);
  });
});

// An action declares its own Node runtime in its own `action.yml`, and GitHub deprecated node20 on
// 2025-09-19. At `@v4`, checkout, setup-node, cache and pnpm/action-setup all declared node20, so
// GitHub forced them onto node24 and annotated every run with a warning that named them. `.nvmrc`
// cannot answer that warning: it sets the Node this project runs on, never the Node an action runs
// on. Only a major bump does. So this pins the floor, and it refuses an action with no floor on
// record — an unguarded `uses:` is how the repo slides back to node20 without anybody reading a
// warning.
const FIRST_NODE24_MAJOR = new Map([
  ['actions/checkout', 5],
  ['actions/setup-node', 5],
  ['actions/cache', 5],
  ['pnpm/action-setup', 5],
]);

describe('every action runs on a supported Node runtime', () => {
  const workflow = read('.github/workflows/ci.yml');
  const pins = [...workflow.matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@v(\d+)/g)].map((match) => ({
    action: match[1]!,
    major: Number(match[2]),
  }));

  it('has actions to guard', () => {
    expect(pins.length).toBeGreaterThan(0);
  });

  it('records a Node floor for every action the workflow uses', () => {
    for (const { action } of pins) {
      expect(
        FIRST_NODE24_MAJOR.has(action),
        `${action} has no Node floor on record. Look up the first major whose action.yml says ` +
          `node24, then add it to FIRST_NODE24_MAJOR.`,
      ).toBe(true);
    }
  });

  it('pins no action below its first node24 major', () => {
    for (const { action, major } of pins) {
      const floor = FIRST_NODE24_MAJOR.get(action);
      if (floor === undefined) continue;
      expect(
        major,
        `${action}@v${major} declares node20, which GitHub deprecated. v${floor} is the first ` +
          `major that declares node24.`,
      ).toBeGreaterThanOrEqual(floor);
    }
  });
});
