// I10 (plans/01 §5, §11): ban Date construction and Date.now outside time/.

'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'ban `new Date()` / `Date.now()` outside time/ (plans/01 §5, invariant I10)',
    },
    messages: {
      dateConstruct: '`new Date()` is banned outside time/ (plans/01 §5, I10). Use instant() from time/.',
      dateNow: '`Date.now()` is banned outside time/ (plans/01 §5, I10). Use now() from time/.',
    },
    schema: [],
  },
  create(context) {
    return {
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'Date') {
          context.report({ node, messageId: 'dateConstruct' });
        }
      },
      'CallExpression[callee.type="MemberExpression"]'(node) {
        const callee = node.callee;
        if (
          callee.object.type === 'Identifier' &&
          callee.object.name === 'Date' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'now'
        ) {
          context.report({ node, messageId: 'dateNow' });
        }
      },
    };
  },
};
