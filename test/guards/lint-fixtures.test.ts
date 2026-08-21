// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
// Runs ESLint programmatically over test/fixtures/violations/*.ts and asserts the expected rule fires.

import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import parser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import freegantt from '../../eslint/rules/index.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CASES: Array<{ file: string; ruleId: string }> = [
  { file: 'no-magic-time-constants.ts', ruleId: 'freegantt/no-magic-time-constants' },
  { file: 'no-date-outside-time.ts', ruleId: 'freegantt/no-date-outside-time' },
  { file: 'no-scroll-outside-scroll-model.ts', ruleId: 'freegantt/no-scroll-outside-scroll-model' },
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
