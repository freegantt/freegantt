// I12 (plans/01 §8.2, §11): ban scrollLeft/scrollTop/scrollTo outside the ScrollModel binding.
// ScrollModel itself lands in S1 (src/view/scroll-model.ts); this rule is in force from S0 per
// plans/04 §3.3 so it's already red-tested before there's real code to violate it.

'use strict';

const BANNED_PROPS = new Set(['scrollLeft', 'scrollTop']);

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'ban scrollLeft/scrollTop/scrollTo outside the ScrollModel binding (plans/01 §8.2, invariant I12)',
    },
    messages: {
      scrollProp:
        '`{{prop}}` is banned outside the ScrollModel binding (plans/01 §8.2, I12). Read/write scroll only through the bound ScrollModel.',
      scrollTo: '`scrollTo()` is banned outside the ScrollModel binding (plans/01 §8.2, I12).',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (/[/\\]view[/\\]scroll-model/.test(filename)) return {};

    return {
      MemberExpression(node) {
        if (node.property.type !== 'Identifier') return;
        if (BANNED_PROPS.has(node.property.name)) {
          context.report({ node, messageId: 'scrollProp', data: { prop: node.property.name } });
        }
      },
      'CallExpression[callee.type="MemberExpression"]'(node) {
        const prop = node.callee.property;
        if (prop.type === 'Identifier' && prop.name === 'scrollTo') {
          context.report({ node, messageId: 'scrollTo' });
        }
      },
    };
  },
};
