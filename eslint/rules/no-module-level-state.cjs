// I2 (plans/01 §6, docs/02 §3.4): two Gantt instances must share no state. Module-level mutable
// state is the failure mode — this rule bans it in src/**.

'use strict';

// `freezePreset` (time/presets.ts): a local deep-freeze factory of the same shape as `Object.freeze`
// itself — every shipped preset is built by calling it, so it earns the same allowlist entry.
const ALLOWED_CALLEE_NAMES = new Set(['Symbol', 'defineRegistry', 'freezePreset']);
const MUTATOR_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'set',
  'add',
  'delete',
  'clear',
]);
const STRING_LITERAL_TYPES = new Set(['Literal', 'TemplateLiteral']);

function isFrozenOrPureFactory(node) {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'Object' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'freeze'
  ) {
    return true;
  }
  // A method called on a string literal/template always returns a fresh primitive — `` `...`.trim() ``
  // holds nothing to share, the same way a `const SNAP = 14` primitive holds nothing to share.
  if (callee.type === 'MemberExpression' && STRING_LITERAL_TYPES.has(callee.object.type)) return true;
  return callee.type === 'Identifier' && ALLOWED_CALLEE_NAMES.has(callee.name);
}

/** `as const` unwraps to nothing to flag; any other `as X` cast checks the expression it casts. */
function unwrapAsConst(init) {
  if (init.type !== 'TSAsExpression') return init;
  const t = init.typeAnnotation;
  if (t.type === 'TSTypeReference' && t.typeName.type === 'Identifier' && t.typeName.name === 'const') {
    return null;
  }
  return unwrapAsConst(init.expression);
}

/** Matches only the shape `new WeakMap(...)`. It does not check what the WeakMap is keyed on — ADR
 *  0007's instance-keyed pattern still needs its own `I2-ok:` reason next to the declaration, checked
 *  by `hasI2OkReason` below. */
function isWeakMapConstruction(node) {
  return node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'WeakMap';
}

/** ADR 0007's exemption needs a stated reason, not a shape match: a `// I2-ok: <reason>` comment
 *  leading the statement. `export const x = …` attaches its leading comment to the
 *  `ExportNamedDeclaration`, one level above the `VariableDeclaration` — so this checks whichever
 *  of the two is the outermost statement. */
function hasI2OkReason(sourceCode, declarationNode) {
  const statement =
    declarationNode.parent.type === 'ExportNamedDeclaration' ? declarationNode.parent : declarationNode;
  return sourceCode.getCommentsBefore(statement).some((comment) => /I2-ok:\s*\S/.test(comment.value));
}

function initializerIsMutableState(rawInit, declarationNode, sourceCode) {
  if (rawInit === null) return false;
  const init = unwrapAsConst(rawInit);
  if (init === null) return false;
  if (isWeakMapConstruction(init)) return !hasI2OkReason(sourceCode, declarationNode);
  if (init.type === 'NewExpression') return true;
  if (init.type === 'ArrayExpression' || init.type === 'ObjectExpression') return true;
  if (init.type === 'CallExpression') return !isFrozenOrPureFactory(init);
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'ban module-level mutable state in src/** (plans/01 §6, invariant I2)',
    },
    messages: {
      letOrVar:
        'Module-level mutable state makes two Gantt instances share it. Own it on the instance. (plans/01 §6, I2)',
      mutableInit:
        'Module-level mutable state makes two Gantt instances share it. Own it on the instance. (plans/01 §6, I2)',
      mutatedExport:
        'Module-level mutable state makes two Gantt instances share it. Own it on the instance. (plans/01 §6, I2)',
      weakMapNeedsReason:
        'A module-level WeakMap needs a leading `// I2-ok: <reason>` comment. State it, or own the map on the instance. (plans/01 §6, I2; ADR 0007)',
    },
    schema: [],
  },
  create(context) {
    const exportedNames = new Set();
    const sourceCode = context.sourceCode;

    function reportIfMutableState(node) {
      const init = node.init === null ? null : unwrapAsConst(node.init);
      if (initializerIsMutableState(node.init, node.parent, sourceCode)) {
        const messageId = init && isWeakMapConstruction(init) ? 'weakMapNeedsReason' : 'mutableInit';
        context.report({ node, messageId });
      }
    }

    return {
      'Program > VariableDeclaration[kind="let"], Program > VariableDeclaration[kind="var"]'(node) {
        context.report({ node, messageId: 'letOrVar' });
      },
      'ExportNamedDeclaration > VariableDeclaration[kind="let"], ExportNamedDeclaration > VariableDeclaration[kind="var"]'(
        node,
      ) {
        context.report({ node, messageId: 'letOrVar' });
      },
      'ExportNamedDeclaration > VariableDeclaration[kind="const"] > VariableDeclarator'(node) {
        if (node.id.type === 'Identifier') exportedNames.add(node.id.name);
        reportIfMutableState(node);
      },
      'Program > VariableDeclaration[kind="const"] > VariableDeclarator'(node) {
        reportIfMutableState(node);
      },
      'CallExpression[callee.type="MemberExpression"]'(node) {
        const callee = node.callee;
        if (callee.object.type !== 'Identifier' || !exportedNames.has(callee.object.name)) return;
        if (callee.property.type !== 'Identifier' || !MUTATOR_METHODS.has(callee.property.name)) return;
        context.report({ node, messageId: 'mutatedExport' });
      },
      'AssignmentExpression[left.type="MemberExpression"]'(node) {
        const object = node.left.object;
        if (object.type !== 'Identifier' || !exportedNames.has(object.name)) return;
        context.report({ node, messageId: 'mutatedExport' });
      },
    };
  },
};
