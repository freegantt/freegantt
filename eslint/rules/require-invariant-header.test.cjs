'use strict';

const { RuleTester } = require('eslint');
const parser = require('@typescript-eslint/parser');
const rule = require('./require-invariant-header.cjs');

const ruleTester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('require-invariant-header', rule, {
  valid: [
    {
      code: '// The only file that sees the reactive dependency (plans/04 §1).\nexport const x = 1;',
      filename: '/repo/src/data/reactivity.ts',
    },
    {
      // Not a header-required file — nothing to check.
      code: 'export const x = 1;',
      filename: '/repo/src/data/other.ts',
    },
    {
      code: '// Never mutates its input.\nexport function schedule() {}',
      filename: '/repo/src/scheduling/schedule.ts',
    },
  ],
  invalid: [
    {
      code: '// Some other comment.\nexport const x = 1;',
      filename: '/repo/src/data/reactivity.ts',
      errors: [{ messageId: 'missingHeader' }],
    },
    {
      code: 'export const x = 1;',
      filename: '/repo/src/data/reactivity.ts',
      errors: [{ messageId: 'missingHeader' }],
    },
  ],
});

console.log('require-invariant-header: all cases passed.');
