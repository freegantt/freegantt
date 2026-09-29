'use strict';

const assert = require('node:assert/strict');
const { RuleTester } = require('eslint');
const rule = require('./editable-has-one-reader.cjs');

// `resolveFieldEditable` was inlined and retired (#473's follow-up); the bottom occupant a caller
// reaches once existence and `compute` are already checked is `fieldEditableRule` now. A message
// that still names the retired function sends a reader looking for code that no longer exists.
assert.doesNotMatch(rule.meta.messages.secondReader, /resolveFieldEditable/);
assert.match(rule.meta.messages.secondReader, /fieldEditableRule/);

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

const OWNER = '/repo/src/data/fields/field-registry.ts';
const OTHER = '/repo/src/view/capability.ts';

ruleTester.run('editable-has-one-reader', rule, {
  valid: [
    // The one shared resolver is what every other file asks.
    { code: 'const open = editableAnswerFor(field, declared, query, lockRule);', filename: OTHER },
    {
      code: "if (fieldEditableRule(fieldFor)(query, field) === 'never') throw new FieldNotEditableError(key, op);",
      filename: OTHER,
    },
    // A declaration is not a read: core Fields and Field types state the key in a literal.
    { code: "const field = { key: 'start', editable: 'anywhere' };", filename: OTHER },
    // The one owner resolves the aliases and the default.
    { code: 'const declared = field.editable;', filename: OWNER },
    { code: 'const { editable } = field;', filename: OWNER },
  ],
  invalid: [
    {
      code: 'const open = field.editable === true;',
      filename: OTHER,
      errors: [{ messageId: 'secondReader' }],
    },
    // #256's own spelling, in the file that shipped it.
    {
      code: "function rule(field) { return field.editable === 'anywhere' ? WRITABLE : NOT_WRITABLE; }",
      filename: OTHER,
      errors: [{ messageId: 'secondReader' }],
    },
    // Laundered through a computed key, and through a destructure.
    { code: "const open = field['editable'];", filename: OTHER, errors: [{ messageId: 'secondReader' }] },
    { code: 'const { editable } = field;', filename: OTHER, errors: [{ messageId: 'secondReader' }] },
    // `data/write-rule.ts` holds the thresholds, and still may not read the raw key.
    {
      code: 'const answer = field.editable;',
      filename: '/repo/src/data/write-rule.ts',
      errors: [{ messageId: 'secondReader' }],
    },
  ],
});

console.log('editable-has-one-reader: all cases passed.');
