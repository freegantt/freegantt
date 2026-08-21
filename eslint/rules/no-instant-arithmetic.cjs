// I10 (plans/01 §5, §11): ban arithmetic on Instant-typed values outside time/. Type-aware.

'use strict';

const { ESLintUtils } = require('@typescript-eslint/utils');

const ARITHMETIC_OPS = new Set(['+', '-', '*', '/', '%']);

const createRule = ESLintUtils.RuleCreator(() => 'https://github.com/');

/** @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'instantArithmetic', []>} */
module.exports = createRule({
  name: 'no-instant-arithmetic',
  meta: {
    type: 'problem',
    docs: {
      description: 'ban arithmetic on Instant-typed values outside time/ (plans/01 §5, invariant I10)',
    },
    messages: {
      instantArithmetic:
        'Arithmetic directly on an Instant is banned outside time/ (plans/01 §5, I10). Use addMs/diffMs/etc. from time/.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context, true);
    if (!services?.program) return {};
    const checker = services.program.getTypeChecker();

    function isInstant(node) {
      const type = services.getTypeAtLocation(node);
      return type.getSymbol()?.getName() === 'Instant' || checker.typeToString(type) === 'Instant';
    }

    return {
      BinaryExpression(node) {
        if (!ARITHMETIC_OPS.has(node.operator)) return;
        if (isInstant(node.left) || isInstant(node.right)) {
          context.report({ node, messageId: 'instantArithmetic' });
        }
      },
    };
  },
});
