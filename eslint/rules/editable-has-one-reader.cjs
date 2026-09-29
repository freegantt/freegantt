// I14 (plans/01 §11, ADR 0015): "may this value change" has one home. `Field.editable` is read in
// exactly one file — src/data/fields/field-registry.ts, where `editableOf` resolves the aliases and
// the default. Every other reader asks `editableAnswerFor`/`fieldEditableRule` instead (#473: a
// plugin's per-entry lock rule is the other input, not a second Field-level threshold), both in
// src/data/write-rule.ts.
//
// This is the check that would have caught #256: `view/capability.ts` read `field.editable === true`
// while `entries.update()` read nothing at all, so one key had two answers and the grid hid a handle
// over a write that still landed. A second reader is how that split comes back.

'use strict';

const KEY = 'editable';
const OWNER = /[/\\]data[/\\]fields[/\\]field-registry\.ts$/;

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'read Field.editable in one file only; every other caller asks editableAnswerFor/fieldEditableRule (plans/01 §11, invariant I14, ADR 0015)',
    },
    messages: {
      secondReader:
        '`Field.editable` is read in `data/fields/field-registry.ts` only (I14, ADR 0015). Ask `editableAnswerFor(field, declared, query, lockRule)` (or `fieldEditableRule` once existence and `compute` are already checked) — one resolver, every reader. A second reading of the raw key is how the readers start to disagree.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (OWNER.test(filename)) return {};

    const report = (node) => context.report({ node, messageId: 'secondReader' });

    return {
      // `field.editable`, and the laundered spelling `field['editable']`.
      MemberExpression(node) {
        if (!node.computed && node.property.type === 'Identifier' && node.property.name === KEY) {
          report(node);
        }
        if (node.computed && node.property.type === 'Literal' && node.property.value === KEY) {
          report(node);
        }
      },
      // `const { editable } = field` is the same read, written differently.
      'ObjectPattern > Property'(node) {
        if (node.key.type === 'Identifier' && node.key.name === KEY) report(node);
      },
    };
  },
};
