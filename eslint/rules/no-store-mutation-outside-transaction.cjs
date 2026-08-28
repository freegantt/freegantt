// docs/02 §3.6, plans/01 §6: every store mutation goes through a transaction. `EntryStore`'s
// `stageAdd`/`stageUpdate`/`stageRemove` each take a `TxToken` that only `data/transaction.ts` can
// mint (belt); this rule is the braces — a clearer message than a type error, and a guard against a
// token threaded around by a determined caller.
//
// Allowed callers: `entry-store.ts` itself — its own public `add`/`update`/`remove` wrappers call
// these inside the token their own `#mutate` helper obtains from `runTransaction` (S2.3 §1.1) — and
// `transaction.test.ts`, which drives a transaction body directly with a real token. Neither
// `transaction.ts` nor `history.ts` calls these methods by name in the shipped code (S2.7 correction
// to the plan's own guess at this row — `transaction.ts` calls through the structural
// `TransactionalEntryStore`/`pendingEdits` seam, never `stageX` by name).

const GATED_METHODS = new Set(['stageAdd', 'stageUpdate', 'stageRemove']);
const ALLOWED_FILENAMES = new Set(['entry-store.ts', 'transaction.test.ts']);

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'ban calls to TxToken-gated store mutators outside data/transaction.ts and data/history.ts (plans/01 §6, D10)',
    },
    messages: {
      gatedMutation:
        'Every mutation goes through dataset.transaction(): one scheduling pass, one changeset. (plans/01 §6, D10)',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename.split(/[\\/]/).pop() ?? '';
    if (ALLOWED_FILENAMES.has(filename)) return {};

    return {
      'CallExpression[callee.type="MemberExpression"]'(node) {
        const property = node.callee.property;
        if (property.type !== 'Identifier' || !GATED_METHODS.has(property.name)) return;
        context.report({ node, messageId: 'gatedMutation' });
      },
    };
  },
};
