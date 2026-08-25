'use strict';

const path = require('node:path');
const { RuleTester } = require('eslint');
const parser = require('@typescript-eslint/parser');
const rule = require('./no-time-to-pixel-math.cjs');

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

const TIME_TYPES =
  "type Instant = number & { readonly __brand: 'Instant' };\n" +
  "type Duration = number & { readonly __brand: 'Duration' };\n";

ruleTester.run('no-time-to-pixel-math', rule, {
  valid: [
    {
      code: `${TIME_TYPES}declare const width: number;\nconst next = width + 2;`,
      filename: path.join(fixturesDir, 'pixel-1.ts'),
    },
    {
      code: `${TIME_TYPES}declare function addMs(a: Instant, ms: number): Instant;\ndeclare const a: Instant;\naddMs(a, 5);`,
      filename: path.join(fixturesDir, 'pixel-2.ts'),
    },
    {
      // Allowlisted: time/scale.ts is the one file allowed to do this conversion.
      code: `${TIME_TYPES}declare const a: Instant;\ndeclare const b: Instant;\nconst pxPerMs = a / b;`,
      filename: path.join(fixturesDir, 'time', 'scale.ts'),
    },
  ],
  invalid: [
    {
      code: `${TIME_TYPES}declare const a: Instant;\ndeclare const left: number;\nconst x = left + a;`,
      filename: path.join(fixturesDir, 'pixel-3.ts'),
      errors: [{ messageId: 'timeToPixel' }],
    },
    {
      code: `${TIME_TYPES}declare const a: Instant;\ndeclare const b: Instant;\nconst pxPerMs = a / b;`,
      filename: path.join(fixturesDir, 'pixel-4.ts'),
      errors: [{ messageId: 'timeToPixel' }],
    },
    {
      code: `${TIME_TYPES}declare const d: Duration;\ndeclare const scale: number;\nconst px = d * scale;`,
      filename: path.join(fixturesDir, 'pixel-5.ts'),
      errors: [{ messageId: 'timeToPixel' }],
    },
  ],
});

console.log('no-time-to-pixel-math: all cases passed.');
