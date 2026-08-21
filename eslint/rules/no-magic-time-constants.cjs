// I10 (plans/01 §5, §11): no magic time constants outside time/. See docs/04-hooks-and-ci.md §4.

'use strict';

const BANNED = new Set([60000, 3600000, 86400000, 604800000]);

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'ban magic time-duration constants outside time/ (plans/01 §5, invariant I10)',
    },
    messages: {
      magicTime:
        'Magic time constant {{value}} is banned outside time/ (plans/01 §5, I10). Use a helper from time/ instead.',
    },
    schema: [],
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value !== 'number') return;
        if (!BANNED.has(node.value)) return;
        context.report({ node, messageId: 'magicTime', data: { value: String(node.value) } });
      },
    };
  },
};
