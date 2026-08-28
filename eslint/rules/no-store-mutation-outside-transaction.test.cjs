'use strict';

const { RuleTester } = require('eslint');
const parser = require('@typescript-eslint/parser');
const rule = require('./no-store-mutation-outside-transaction.cjs');

const ruleTester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-store-mutation-outside-transaction', rule, {
  valid: [
    {
      code: 'this.stageAdd(token, entry);',
      filename: '/repo/src/data/entry-store.ts',
    },
    {
      code: 'state.entries.stageUpdate(token, id, edit);',
      filename: '/repo/src/data/transaction.test.ts',
    },
    {
      // Unrelated method name on any file — not gated.
      code: 'this.add(entry);',
      filename: '/repo/src/data/dataset-state.ts',
    },
  ],
  invalid: [
    {
      code: 'entries.stageUpdate(token, id, edit);',
      filename: '/repo/src/view/gantt-shell.ts',
      errors: [{ messageId: 'gatedMutation' }],
    },
    {
      code: 'store.stageRemove(token, id);',
      filename: '/repo/src/data/history.ts',
      errors: [{ messageId: 'gatedMutation' }],
    },
  ],
});

console.log('no-store-mutation-outside-transaction: all cases passed.');
