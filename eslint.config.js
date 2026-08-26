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
  data: ['scheduling', 'model'],
  render: ['layout'],
  // model: Entry/Dependency types flow through view as type-only params (same rationale as api, above).
  view: ['render', 'layout', 'data', 'model'],
  interaction: ['view', 'data'],
  extensions: ['view', 'interaction'],
  // model and time are the type/primitive surface api/ re-exports (plans/01 §1: "api/ and model/
  // types are public", widened to time/'s public primitives and presets by #25); the layer diagram
  // doesn't draw either arrow because they're type-only/primitive re-exports, not behavioral ones.
  api: ['view', 'data', 'model', 'time'],
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
    // NOTE: these are ignore paths for non-source artifacts. No lint rule, layer allow-list, or
    // severity is relaxed by this entry — the I1/I10/I12 rule set below is unchanged.
    ignores: [
      'dist/**',
      'dist-harness/**',
      'node_modules/**',
      'test/fixtures/violations/**',
      'eslint/rules/fixtures/**',
      '.agents/skills/**',
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
      'freegantt/no-scroll-outside-scroll-model': 'error',
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
    files: ['scripts/**/*.mjs', '*.config.js', 'eslint/rules/**/*.cjs', '.dependency-cruiser.cjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
