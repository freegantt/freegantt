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

/** ADR 0007: a module-private `WeakMap<Instance, State>` keyed by instance is the sanctioned way to
 *  attach friend-only state to a class without a public method — each instance's entry is invisible
 *  to every other instance, so nothing is shared across two Gantts the way I2 forbids. */
function isInstanceKeyedWeakMap(node) {
  return node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'WeakMap';
}

function initializerIsMutableState(rawInit) {
  if (rawInit === null) return false;
  const init = unwrapAsConst(rawInit);
  if (init === null) return false;
  if (isInstanceKeyedWeakMap(init)) return false;
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
    },
    schema: [],
  },
  create(context) {
    const exportedNames = new Set();

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
        if (initializerIsMutableState(node.init)) context.report({ node, messageId: 'mutableInit' });
      },
      'Program > VariableDeclaration[kind="const"] > VariableDeclarator'(node) {
        if (initializerIsMutableState(node.init)) context.report({ node, messageId: 'mutableInit' });
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
