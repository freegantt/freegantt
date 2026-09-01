// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
// Runs ESLint programmatically over test/fixtures/violations/*.ts and asserts the expected rule fires.

import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import type { Linter } from 'eslint';
import parser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import freegantt from '../../eslint/rules/index.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CASES: Array<{ file: string; ruleId: string }> = [
  { file: 'no-magic-time-constants.ts', ruleId: 'freegantt/no-magic-time-constants' },
  { file: 'no-date-outside-time.ts', ruleId: 'freegantt/no-date-outside-time' },
  { file: 'no-scroll-outside-scroll-model.ts', ruleId: 'freegantt/no-scroll-outside-scroll-model' },
  { file: 'no-derived-in-json-b9.ts', ruleId: 'freegantt/no-derived-in-json' },
];

describe('lint fixture violations', () => {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser },
        plugins: { freegantt },
        rules: {
          'freegantt/no-magic-time-constants': 'error',
          'freegantt/no-date-outside-time': 'error',
          'freegantt/no-scroll-outside-scroll-model': 'error',
          'freegantt/no-derived-in-json': 'error',
        },
      },
    ],
  });

  for (const { file, ruleId } of CASES) {
    it(`${file} triggers ${ruleId}`, async () => {
      const results = await eslint.lintFiles([path.join(root, 'test/fixtures/violations', file)]);
      const messages = results[0]?.messages ?? [];
      expect(messages.some((m) => m.ruleId === ruleId)).toBe(true);
    });
  }
});

// S2.7 §3: B7-B10 are built-in-rule (no-restricted-imports/syntax/globals) configurations, not
// freegantt/ custom rules — each gets its own override block, mirroring the shape (not the file
// scoping — these fixtures live outside src/, so every block matches '**/*.ts') of its
// eslint.config.js entry, since the real config ignores test/fixtures/violations/** entirely.
const BUILTIN_CASES: Array<{ file: string; ruleId: string; config: Linter.RulesRecord }> = [
  {
    file: 'no-restricted-imports-b7.ts',
    ruleId: 'no-restricted-imports',
    config: {
      'no-restricted-imports': ['error', { paths: [{ name: 'alien-signals', message: 'B7' }] }],
    },
  },
  {
    file: 'no-restricted-syntax-b8.ts',
    ruleId: 'no-restricted-syntax',
    config: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ThrowStatement NewExpression[callee.name='Error'] > Literal[value=/not.implemented|TODO|unsupported/i]",
          message: 'B8',
        },
      ],
    },
  },
  {
    file: 'raf-single-owner-b10.ts',
    ruleId: 'no-restricted-globals',
    config: {
      'no-restricted-globals': ['error', { name: 'requestAnimationFrame', message: 'B10' }],
    },
  },
];

describe('lint fixture violations (B7-B10 built-in rules)', () => {
  for (const { file, ruleId, config } of BUILTIN_CASES) {
    it(`${file} triggers ${ruleId}`, async () => {
      const eslint = new ESLint({
        cwd: root,
        overrideConfigFile: true,
        overrideConfig: [
          {
            files: ['**/*.ts'],
            languageOptions: { parser },
            rules: config,
          },
        ],
      });
      const results = await eslint.lintFiles([path.join(root, 'test/fixtures/violations', file)]);
      const messages = results[0]?.messages ?? [];
      expect(messages.some((m) => m.ruleId === ruleId)).toBe(true);
    });
  }
});
