// Flat config. Custom rules live in eslint/rules/ and encode invariants I1, I10, I12 (plans/01 §11).
// Type-aware linting is scoped to src/**/*.ts only — that's the one place I10's type-aware rule needs it,
// and it's what keeps `pnpm lint` fast as the codebase grows (docs/04-hooks-and-ci.md §6).

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import freegantt from './eslint/rules/index.cjs';

const LAYERS = [
  'model',
  'time',
  'data',
  'scheduling',
  'layout',
  'render',
  'view',
  'interaction',
  'extensions',
  'api',
];
const ALLOWED = {
  model: [],
  time: ['model'],
  layout: ['time', 'model'],
  scheduling: ['time', 'model'],
  // time: D-S2-1 (plans/s2-data-core/README.md) — serialization (Instant<->ISO) and mutation-time
  // input reading both need it; there is still no data/ --> scheduling static edge widened here.
  data: ['scheduling', 'model', 'time'],
  render: ['layout'],
  // model: Entry/Dependency types flow through view as type-only params (same rationale as api, above).
  view: ['render', 'layout', 'data', 'model'],
  interaction: ['view', 'data'],
  extensions: ['view', 'interaction'],
  // model and time are the type/primitive surface api/ re-exports (plans/01 §1: "api/ and model/
  // types are public", widened to time/'s public primitives and presets by #25, and to layout/'s
  // TimeScaleModel/ScrollModel by issue #91 §9-I — both are public, consumer-constructed objects
  // (D9), so laundering them through view/ was the same bug as #25's dayPreset); the layer diagram
  // doesn't draw these arrows because they're type-only/primitive re-exports, not behavioral ones.
  api: ['view', 'data', 'model', 'time', 'layout'],
};

// I1 backstop for editor feedback; dependency-cruiser (`pnpm boundaries`) is the enforced source of truth.
// One config block per layer: `files` scopes it to that layer, `patterns` bans importing any other layer
// not in its allow-list (relative-only, so `../render/...` is caught but bare specifiers like `vitest` aren't).
const boundaryBlocks = LAYERS.map((layer) => {
  const banned = LAYERS.filter((l) => l !== layer && !ALLOWED[layer].includes(l));
  return {
    files: [`src/${layer}/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: banned.map((l) => ({
            group: [`**/${l}/*`, `**/${l}`, `../${l}/*`, `../../${l}/*`],
            message: `plans/01 §1: src/${layer} may only import ${ALLOWED[layer].join(', ') || 'nothing in src/'}.`,
          })),
        },
      ],
    },
  };
});

export default tseslint.config(
  {
    // .agents/skills/** is vendored third-party skill content (installed via skills-lock.json),
    // not project source — it isn't ours to lint or reformat.
    //
    // dist-harness/** is `pnpm build`'s output (vite.config.ts). Build output is not source: linting
    // minified bundles fails on `no-undef`/`no-unused-expressions`, and since `pnpm verify` now runs
    // `build`, a second `verify` would otherwise lint the first one's output. `.gitignore` and
    // `.prettierignore` already exclude it; this closes the same gap for lint.
    //
    // .worktrees/** is a concurrent agent's own git worktree, checked out under the repo root
    // (`.gitignore` already keeps it out of git) — not ours to lint, and ESLint's flat config
    // walks the filesystem directly, so a git-only ignore rule does not stop it from being scanned.
    // Same gap `.prettierignore`'s own `.worktrees` entry closes.
    //
    // website/** is its own independent pnpm project (own pnpm-workspace.yaml, own tooling), not
    // a package of this one — same reasoning as `.prettierignore`'s `website` entry, closing the
    // same gap for lint that entry closes for format.
    //
    // NOTE: these are ignore paths for non-source artifacts. No lint rule, layer allow-list, or
    // severity is relaxed by this entry — the I1/I10/I12 rule set below is unchanged.
    ignores: [
      'dist/**',
      'dist-harness/**',
      'node_modules/**',
      'test/fixtures/violations/**',
      'eslint/rules/fixtures/**',
      '.agents/skills/**',
      '.worktrees/**',
      'website/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { freegantt },
    rules: {
      'freegantt/no-magic-time-constants': 'error',
      'freegantt/no-date-outside-time': 'error',
      'freegantt/no-scroll-outside-scroll-attachment': 'error',
      'freegantt/no-instant-arithmetic': 'error',
      'freegantt/no-time-to-pixel-math': 'error',
      'freegantt/no-flow-layout-rows': 'error',
      // S1.10, D-S1.10-6: pane-layout.ts's structural writes move to the base stylesheet; only
      // transform/width/height stay inline. Scoped to src/render/** + src/view/** (§3.3) — expected
      // to widen to src/interaction/** once gesture previews need the same allowance.
      'freegantt/no-inline-style-outside-geometry': 'error',
    },
  },
  ...boundaryBlocks,
  {
    // I10: time/ itself is exempt — it's the module allowed to do this arithmetic.
    files: ['src/time/**/*.ts'],
    rules: {
      'freegantt/no-magic-time-constants': 'off',
      'freegantt/no-date-outside-time': 'off',
      'freegantt/no-instant-arithmetic': 'off',
    },
  },
  {
    // I2, docs/02 §3.4: module-level mutable state, production code only. Test files legitimately
    // declare module-level fixture data (`const CASES = [...]`) that is never shared Gantt state —
    // scoping this to non-test files is what keeps the rule about I2 instead of about test style.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    plugins: { freegantt },
    rules: {
      'freegantt/no-module-level-state': 'error',
      // docs/02 §3.6, D-S2-18: belt to the TxToken type-gate; the rule's own allowlist names the
      // files it exempts, so no directory scoping is needed here.
      'freegantt/no-store-mutation-outside-transaction': 'error',
      // plans/04 §3.1, docs/02 §3.8: the rule's own HEADERS map is the real scope filter.
      'freegantt/require-invariant-header': 'error',
      // I14, ADR 0015: "may this value change" has one home. `Field.editable` is read in
      // `data/fields/field-registry.ts` alone, where `editableOf` resolves the aliases and the
      // default; every other file asks `isUserEditable` (the grid) or `isApiEditable`
      // (`entries.update()`) from `data/write-rule.ts`. A test legitimately reads the key back to
      // assert what a declaration stored, which is why this is scoped off test files.
      'freegantt/editable-has-one-reader': 'error',
    },
  },
  {
    // plans/01 §1, docs/02 §3.7: model/ is types only.
    files: ['src/model/**/*.ts'],
    ignores: ['src/model/**/*.test.ts'],
    plugins: { freegantt },
    rules: {
      'freegantt/model-is-types-only': 'error',
    },
  },
  {
    // CLAUDE.md entry-kinds rule, D-S2-22: the first kind-dependent behaviour in data/ (span
    // rollup) is the reason this lands now, scoped to the two layers with kind-aware code today.
    // Test files legitimately build fixtures by kind (`{ kind: 'group' }`) — that's scenario setup,
    // not the production behavior-per-kind chain the rule targets.
    files: ['src/data/**/*.ts', 'src/layout/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    plugins: { freegantt },
    rules: {
      'freegantt/no-kind-literal': 'error',
    },
  },
  {
    // B7 (docs/02 §2, plans/04 §1): the two runtime deps are each confined to one façade file.
    files: ['src/**/*.ts'],
    ignores: ['src/data/reactivity.ts', 'src/time/zone.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'alien-signals',
              message: 'plans/04 §1: alien-signals is confined to src/data/reactivity.ts.',
            },
            {
              name: 'temporal-polyfill',
              message: 'plans/04 §1: temporal-polyfill is confined to src/time/zone.ts.',
            },
          ],
          patterns: [
            {
              group: ['temporal-polyfill/*'],
              message: 'plans/04 §1: temporal-polyfill is confined to src/time/zone.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    // B8 (docs/02 §2, I11): a dishonest public surface — `throw new Error(/not implemented/i)` — is
    // banned everywhere except tests, which legitimately assert the message never appears.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ThrowStatement NewExpression[callee.name='Error'] > Literal[value=/not.implemented|TODO|unsupported/i]",
          message:
            'B8: nothing in the public surface throws "not implemented". Implement it or cut the surface. (I11)',
        },
      ],
    },
  },
  {
    // B9 (docs/02 §2, "authored vs. derived" plans/01 §8): serialization persists authored fields
    // only — a Row/Item/GeometryFrame type reference here would be derived data leaking into JSON.
    files: ['src/data/serialization/**/*.ts'],
    rules: {
      'freegantt/no-derived-in-json': 'error',
    },
  },
  {
    // B10 (docs/02 §2, plans/01 §8): one rAF pipeline. frame-scheduler.ts is that one file. Tests
    // legitimately `await new Promise((resolve) => requestAnimationFrame(resolve))` to wait for a
    // frame to settle — that's driving the clock, not a second scheduling implementation.
    files: ['src/**/*.ts'],
    ignores: ['src/view/frame-scheduler.ts', 'src/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'requestAnimationFrame',
          message: 'B10: requestAnimationFrame has one owner, src/view/frame-scheduler.ts.',
        },
        {
          name: 'cancelAnimationFrame',
          message: 'B10: cancelAnimationFrame has one owner, src/view/frame-scheduler.ts.',
        },
      ],
    },
  },
  {
    files: [
      'scripts/**/*.mjs',
      '.claude/skills/**/*.mjs',
      '*.config.js',
      'eslint/rules/**/*.cjs',
      '.dependency-cruiser.cjs',
    ],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // `scripts/measure-scale.mjs` runs part of itself inside the page, through `page.evaluate`. The
    // functions it hands over are written here but execute in Chromium, so they legitimately name
    // browser globals in a file Node runs. Both sets, because the file is genuinely both.
    files: ['scripts/measure-scale.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // #287, review finding F7: `harness-public-api-only` (.dependency-cruiser.cjs) matches
    // *resolved* paths, so it cannot tell a relative path naming `src/api/index.ts` from the
    // `freegantt` alias resolving to the same file — the exception that lets the alias through lets
    // a hand-written `'../src/api/index.js'` through with it. This rule reads the specifier *text*
    // an author wrote instead, which is the rule dependency-cruiser can't state: never a relative
    // path into src/, whatever position it appears in. Belt and braces with the cruiser rule, not a
    // replacement — the cruiser rule still catches an internal
    // (`'../src/layout/bars/variants.js'`) through a spelling this text match could miss.
    //
    // Three positions, because #287 shipped with one covered and two not: a value import and a
    // type import (`import type { X } from '../src/...'`) are the same `ImportDeclaration` node, so
    // `no-restricted-imports` already caught both. A type-position inline `import(...)` is a
    // different node (`TSImportType`) that neither the built-in rule nor
    // `@typescript-eslint/no-restricted-imports` visits — the exact shape
    // `e2e/variant-styles.spec.ts` shipped (`Window['__gantt']: import('../src/api/index.js').Gantt`
    // inside a `declare global` block). `no-restricted-syntax` reads the AST node text rule can't.
    files: ['harness/**/*.ts', 'e2e/**/*.ts', 'fixtures/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../src/**', '../../src/**', '../../../src/**'],
              message: "#287: import from 'freegantt', not a relative path into src/.",
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSImportType > Literal[value=/^(\\.\\.\\/)+src(\\/|$)/]',
          message:
            "#287: import from 'freegantt', not a relative path into src/ — including a type-position `import(...)`.",
        },
      ],
    },
  },
);
