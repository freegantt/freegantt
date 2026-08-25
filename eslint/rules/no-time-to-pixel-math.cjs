// I12 (plans/01 §8.2, §11): ban time→pixel conversion outside TimeScale. Type-aware, partial
// (docs/01-invariant-guard-matrix.md §3): a conversion laundered through an untyped local is not
// caught — the layer graph makes the result useless, so the residue is small and review-visible.

'use strict';

const { ESLintUtils } = require('@typescript-eslint/utils');

const ARITHMETIC_OPS = new Set(['+', '-', '*', '/', '%']);
const PIXEL_NAME = /px|width|left|right|x|scale|zoom/i;
const ALLOWLIST = /[/\\]time[/\\]scale\.ts$/;

const createRule = ESLintUtils.RuleCreator(() => 'https://github.com/');

/** @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'timeToPixel', []>} */
module.exports = createRule({
  name: 'no-time-to-pixel-math',
  meta: {
    type: 'problem',
    docs: {
      description: 'ban time→pixel conversion outside TimeScale (plans/01 §8.2, invariant I12, partial)',
    },
    messages: {
      timeToPixel:
        'Time→pixel conversion outside TimeScale. Gantt instances bind to a TimeScale; nothing else may know px-per-ms. (plans/01 §8.2, D9)',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (ALLOWLIST.test(filename)) return {};

    const services = ESLintUtils.getParserServices(context, true);
    if (!services?.program) return {};
    const checker = services.program.getTypeChecker();

    function isTimeTyped(node) {
      const type = services.getTypeAtLocation(node);
      const name = type.getSymbol()?.getName() ?? checker.typeToString(type);
      return name === 'Instant' || name === 'Duration';
    }

    function looksLikePixelName(node) {
      if (node.type === 'Identifier') return PIXEL_NAME.test(node.name);
      if (node.type === 'MemberExpression' && node.property.type === 'Identifier') {
        return PIXEL_NAME.test(node.property.name);
      }
      return false;
    }

    return {
      BinaryExpression(node) {
        if (!ARITHMETIC_OPS.has(node.operator)) return;

        const leftIsTime = isTimeTyped(node.left);
        const rightIsTime = isTimeTyped(node.right);

        if (leftIsTime && rightIsTime && node.operator === '/') {
          context.report({ node, messageId: 'timeToPixel' });
          return;
        }

        if (leftIsTime && looksLikePixelName(node.right)) {
          context.report({ node, messageId: 'timeToPixel' });
          return;
        }

        if (rightIsTime && looksLikePixelName(node.left)) {
          context.report({ node, messageId: 'timeToPixel' });
        }
      },
    };
  },
});
