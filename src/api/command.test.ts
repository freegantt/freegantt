import { describe, expect, it } from 'vitest';
import { entryId } from '../model/index.js';
import { registerCoreCommands } from '../view/core-commands.js';
import type { CoreCommandPorts } from '../view/core-commands.js';
import { resolveActedOn } from './command.js';
import type { ActedOn, BuiltInCommandId } from './command.js';

const A = entryId('a');
const B = entryId('b');
const C = entryId('c');

function actedOn(...entryIds: readonly (typeof A)[]): ActedOn {
  return { entryIds };
}

describe('resolveActedOn() (#212)', () => {
  it('acts on the Selection when the clicked node is part of it (#199)', () => {
    expect(resolveActedOn(actedOn(A), actedOn(A, B, C))).toEqual(actedOn(A, B, C));
  });

  it('acts on the Selection when the clicked node is a superset of it, instead of widening (#212)', () => {
    expect(resolveActedOn(actedOn(A, B, C), actedOn(A))).toEqual(actedOn(A));
  });

  it('acts on the clicked node when it shares nothing with the Selection', () => {
    expect(resolveActedOn(actedOn(B), actedOn(A))).toEqual(actedOn(B));
  });

  it('acts on the clicked node when nothing is selected', () => {
    expect(resolveActedOn(actedOn(A, B), actedOn())).toEqual(actedOn(A, B));
  });

  it('acts on the Selection when the two sets are equal', () => {
    expect(resolveActedOn(actedOn(A, B), actedOn(A, B))).toEqual(actedOn(A, B));
  });

  it('names nothing when the clicked node stands for no Entry', () => {
    expect(resolveActedOn(actedOn(), actedOn(A, B))).toEqual(actedOn());
  });
});

/** #236: the union an app author types against, spelled out once as data. The `Record` makes the
 *  compiler ask for every member, and the test below asks the core catalog for the same set. So an
 *  id added to `core-commands.ts` alone fails here, and a union member nothing registers fails too.
 *
 *  The ports are never called: registration only closes over them. */
const EVERY_BUILT_IN_ID: Record<BuiltInCommandId, true> = {
  'freegantt.collapseAll': true,
  'freegantt.expandAll': true,
  'freegantt.collapseRow': true,
  'freegantt.expandRow': true,
  'freegantt.zoomIn': true,
  'freegantt.zoomOut': true,
  'freegantt.panToToday': true,
  'freegantt.panToStart': true,
  'freegantt.panToEnd': true,
  'freegantt.panRight': true,
  'freegantt.panLeft': true,
  'freegantt.panDown': true,
  'freegantt.panUp': true,
  'freegantt.pageDown': true,
  'freegantt.pageUp': true,
  'freegantt.selectAll': true,
  'freegantt.clearSelection': true,
  'freegantt.selectNextEntry': true,
  'freegantt.selectPreviousEntry': true,
  'freegantt.deleteSelection': true,
  'freegantt.discardCellEdit': true,
  'freegantt.undo': true,
  'freegantt.redo': true,
  'freegantt.resizeColumnWider': true,
  'freegantt.resizeColumnNarrower': true,
  'freegantt.moveColumnRight': true,
  'freegantt.moveColumnLeft': true,
};

describe('BuiltInCommandId (#236)', () => {
  it('names exactly the ids the core catalog registers', () => {
    const registered: string[] = [];
    registerCoreCommands({ register: (command) => void registered.push(command.id) }, {} as CoreCommandPorts);

    expect(registered.sort()).toEqual(Object.keys(EVERY_BUILT_IN_ID).sort());
  });
});
