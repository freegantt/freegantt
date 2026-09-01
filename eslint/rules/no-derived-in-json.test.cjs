'use strict';

const { RuleTester } = require('eslint');
const parser = require('@typescript-eslint/parser');
const rule = require('./no-derived-in-json.cjs');

const ruleTester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-derived-in-json', rule, {
  valid: [
    'type X = { id: string };',
    "import type { Entry } from '../../model/entry.js';",
    'function write(entry: Entry): string { return entry.id; }',
  ],
  invalid: [
    {
      code: 'function writeRow(row: Row): string { return row.id; }',
      errors: [{ messageId: 'derivedType' }],
    },
    {
      code: "import type { Row } from '../../layout/row.js';",
      errors: [{ messageId: 'derivedImport' }],
    },
  ],
});

console.log('no-derived-in-json: all cases passed.');
