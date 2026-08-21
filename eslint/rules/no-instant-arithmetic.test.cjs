'use strict';

const path = require('node:path');
const { RuleTester } = require('eslint');
const parser = require('@typescript-eslint/parser');
const rule = require('./no-instant-arithmetic.cjs');

const fixturesDir = path.join(__dirname, 'fixtures');

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: {
      project: path.join(fixturesDir, 'tsconfig.json'),
      tsconfigRootDir: fixturesDir,
    },
  },
});

const INSTANT_TYPE = "type Instant = number & { readonly __brand: 'Instant' };\n";

ruleTester.run('no-instant-arithmetic', rule, {
  valid: [
    {
      code: `${INSTANT_TYPE}declare const a: Instant;\nconst plain: number = 1 + 2;\nvoid a;`,
      filename: path.join(fixturesDir, 'instant-1.ts'),
    },
    {
      code: `${INSTANT_TYPE}declare function addMs(a: Instant, ms: number): Instant;\ndeclare const a: Instant;\naddMs(a, 5);`,
      filename: path.join(fixturesDir, 'instant-2.ts'),
    },
  ],
  invalid: [
    {
      code: `${INSTANT_TYPE}declare const a: Instant;\nconst next = a + 1;`,
      filename: path.join(fixturesDir, 'instant-3.ts'),
      errors: [{ messageId: 'instantArithmetic' }],
    },
    {
      code: `${INSTANT_TYPE}declare const a: Instant;\ndeclare const b: Instant;\nconst delta = a - b;`,
      filename: path.join(fixturesDir, 'instant-4.ts'),
      errors: [{ messageId: 'instantArithmetic' }],
    },
  ],
});

console.log('no-instant-arithmetic: all cases passed.');
