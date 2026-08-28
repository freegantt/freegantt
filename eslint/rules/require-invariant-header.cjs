// docs/02 §3.8, plans/04 §3.1: a file on this list carries an invariant a reader must meet before
// the code. Losing the header loses the explanation — this rule catches that silently happening.

'use strict';

/** Path suffix -> required substring in the file's leading comment (plans/04 §3.1 step 3,
 *  docs/02 §3.8). Substring match against the file's full text before the first non-comment,
 *  non-blank line — good enough for a sentence that is meant to be read, not parsed. */
const HEADERS = {
  'scheduling/propagate.ts': 'contains no recursive call; chain depth is unbounded by design',
  'render/dom/reconciler.ts': 'attribute/class/style/text diffing and keyed child recycling only',
  'scheduling/schedule.ts': 'never mutates its input',
  'data/reactivity.ts': 'the only file that sees the reactive dependency',
  'render/dom/apply-state.ts': '@hot-path',
};

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'require the invariant-statement header on files that carry one (plans/04 §3.1)',
    },
    messages: {
      missingHeader:
        'This file must open with a comment stating: "{{ required }}" (plans/04 §3.1, docs/02 §3.8)',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename.split(/[\\/]/).slice(-2).join('/');
    const required = Object.entries(HEADERS).find(([suffix]) => filename.endsWith(suffix))?.[1];
    if (required === undefined) return {};

    return {
      Program(node) {
        const leadingComments =
          node.body.length > 0
            ? context.sourceCode.getCommentsBefore(node.body[0])
            : context.sourceCode.getAllComments();
        const headerText = leadingComments.map((c) => c.value).join('\n');
        if (headerText.toLowerCase().includes(required.toLowerCase())) return;
        context.report({ node, messageId: 'missingHeader', data: { required } });
      },
    };
  },
};
