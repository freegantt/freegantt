'use strict';

const { RuleTester } = require('eslint');
const parser = require('@typescript-eslint/parser');
const rule = require('./no-kind-literal.cjs');

const ruleTester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-kind-literal', rule, {
  valid: [
    'kinds.has(entry.kind);',
    'const same = entry.kind === other.kind;',
    'if (entry.status === "done") {}',
    // The default-value carve-out (comparing against 'span' decides omission, not behavior).
    'const omit = entry.kind === "span";',
  ],
  invalid: [
    { code: 'if (entry.kind === "group") {}', errors: [{ messageId: 'kindLiteral' }] },
    { code: 'const isSpan = entry.kind !== "milestone";', errors: [{ messageId: 'kindLiteral' }] },
    {
      code: 'switch (entry.kind) { case "group": break; default: break; }',
      errors: [{ messageId: 'kindLiteral' }],
    },
  ],
});

console.log('no-kind-literal: all cases passed.');
