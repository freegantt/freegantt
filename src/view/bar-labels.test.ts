// view/ — `resolveBarLabelText` pinned directly (#421). The happy path already reaches this
// through `api/gantt.test.ts`'s real DOM render; these are the two branches that do not: the
// `'none'` early return, and the unknown-field report-and-carry-on this file's own fix added.

import { describe, expect, it } from 'vitest';
import { DatasetState } from '../data/dataset-state.js';
import type { ResolveBarLabelBind, ResolveBarLabelPorts } from './bar-labels.js';
import { resolveBarLabelPolicy, resolveBarLabelText } from './bar-labels.js';

function dataset(): DatasetState {
  return new DatasetState({
    timeZone: 'UTC',
    entries: [{ id: 't1', name: 'Task 1', start: 0, end: 1 }],
  });
}

function bind(): ResolveBarLabelBind {
  return { timeZone: 'UTC' };
}

describe('resolveBarLabelText', () => {
  it("a merged placement of 'none' prints '', and looks nothing up", () => {
    const state = dataset();
    const entry = state.entries.get('t1')!;
    let looked = false;
    const ports: ResolveBarLabelPorts = {
      lookup: {
        get: (key) => {
          looked = true;
          return state.field(key);
        },
      },
      reportUnknownField: () => {
        throw new Error('must not report: placement is none, so the field is never resolved');
      },
    };

    const text = resolveBarLabelText(entry, 'none', undefined, ports, bind());

    expect(text).toBe('');
    expect(looked).toBe(false);
  });

  it("a variant's own 'none' placement wins over the Gantt's own field policy", () => {
    const state = dataset();
    const entry = state.entries.get('t1')!;
    const ports: ResolveBarLabelPorts = {
      lookup: { get: (key) => state.field(key) },
      reportUnknownField: () => {
        throw new Error('must not report');
      },
    };

    const text = resolveBarLabelText(entry, { field: 'name' }, 'none', ports, bind());

    expect(text).toBe('');
  });

  it('an unknown field reports once through the ports and prints no label, never throws', () => {
    const state = dataset();
    const entry = state.entries.get('t1')!;
    const reported: string[] = [];
    const ports: ResolveBarLabelPorts = {
      lookup: { get: (key) => state.field(key) },
      reportUnknownField: (field) => {
        reported.push(field);
      },
    };

    const text = resolveBarLabelText(entry, { field: 'notAField' }, undefined, ports, bind());

    expect(text).toBe('');
    expect(reported).toEqual(['notAField']);
  });

  it('the field lookup runs per call — the caller holds any dedupe, not this function', () => {
    const state = dataset();
    const entry = state.entries.get('t1')!;
    const reported: string[] = [];
    const ports: ResolveBarLabelPorts = {
      lookup: { get: (key) => state.field(key) },
      reportUnknownField: (field) => reported.push(field),
    };

    resolveBarLabelText(entry, { field: 'notAField' }, undefined, ports, bind());
    resolveBarLabelText(entry, { field: 'notAField' }, undefined, ports, bind());

    // Two calls, two reports: a caller-held dedupe (`GanttShell`'s own) is what keeps this to one
    // report per field key across a real Gantt's frames — not a promise this function makes on its
    // own (mirrors `compileEntryRule`'s own split: `entry-rule.test.ts` pins the same contract).
    expect(reported).toEqual(['notAField', 'notAField']);
  });

  it('a known field with no formatValue stringifies the primitive', () => {
    const state = dataset();
    const entry = state.entries.get('t1')!;
    const ports: ResolveBarLabelPorts = {
      lookup: { get: (key) => state.field(key) },
      reportUnknownField: () => {},
    };

    const text = resolveBarLabelText(entry, { field: 'name' }, undefined, ports, bind());

    expect(text).toBe('Task 1');
  });
});

describe('resolveBarLabelPolicy', () => {
  // #435 follow-up: `render/dom`'s own unit tests inject a policy directly, bypassing this
  // function and the `mergeBarLabels` shell it sits over — so the expert form's own route to
  // `'insideOrNone'` (`{ policy: 'insideOrNone' }`, not the plain string) went unpinned. This is
  // that route, through the real merge, not a stand-in for it.
  it("the expert form's own policy key reaches 'insideOrNone' through the merge shell", () => {
    const policy = resolveBarLabelPolicy({ field: 'name', policy: 'insideOrNone' }, undefined);

    expect(policy).toBe('insideOrNone');
  });

  it("a variant's own expert-form policy overrides the Gantt's 'insideOrNone'", () => {
    const policy = resolveBarLabelPolicy('insideOrNone', { policy: 'outside' });

    expect(policy).toBe('outside');
  });
});
