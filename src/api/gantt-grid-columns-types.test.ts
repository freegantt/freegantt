import { describe, it, expect } from 'vitest';
import { Gantt } from './gantt.js';
import { Dataset } from './dataset.js';
import type { ColumnRendererContext } from './index.js';

// Same compile-first style as dataset-options-types.test.ts: this file exists to compile, not to
// run — the assertions below are the type checker's job alone. It names the real `Gantt`/`Dataset`
// from `api/gantt.ts`/`api/dataset.ts`, so a narrower `gridColumns` fails this file, not a copy of it.
describe("Gantt.gridColumns — a renderer types from the Dataset's props on write, erased on read", () => {
  it('compiles: a Ctx<string> owner cell, through the constructor and through the setter', () => {
    const container = document.createElement('div');
    const dataset = new Dataset<{ owner: string; cost: number }>({
      timeZone: 'UTC',
      entries: [],
      fields: [
        { key: 'owner', column: { header: 'Owner' } },
        { key: 'cost', column: { header: 'Cost' } },
      ],
    });
    const ownerCell = ({ fieldValue }: ColumnRendererContext<string>) => ({ text: fieldValue ?? '' });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name', { field: 'owner', columnRenderer: ownerCell }],
    });
    gantt.gridColumns = [{ field: 'owner', columnRenderer: ownerCell }];
    expect(gantt).toBeDefined();
    gantt.destroy();
  });

  it('does not compile: a number renderer on a string props key, through the constructor', () => {
    const container = document.createElement('div');
    const dataset = new Dataset<{ owner: string; cost: number }>({
      timeZone: 'UTC',
      entries: [],
      fields: [
        { key: 'owner', column: { header: 'Owner' } },
        { key: 'cost', column: { header: 'Cost' } },
      ],
    });
    const numberCell = ({ fieldValue }: ColumnRendererContext<number>) => ({ text: String(fieldValue) });
    const gantt = new Gantt({
      container,
      dataset,
      // @ts-expect-error — owner's declared type is string, never number
      gridColumns: [{ field: 'owner', columnRenderer: numberCell }],
    });
    expect(gantt).toBeDefined();
    gantt.destroy();
  });

  it('does not compile: the same wrong renderer through the setter', () => {
    const container = document.createElement('div');
    const dataset = new Dataset<{ owner: string; cost: number }>({
      timeZone: 'UTC',
      entries: [],
      fields: [
        { key: 'owner', column: { header: 'Owner' } },
        { key: 'cost', column: { header: 'Cost' } },
      ],
    });
    const numberCell = ({ fieldValue }: ColumnRendererContext<number>) => ({ text: String(fieldValue) });
    const gantt = new Gantt({ container, dataset });
    // @ts-expect-error — owner's declared type is string, never number
    gantt.gridColumns = [{ field: 'owner', columnRenderer: numberCell }];
    expect(gantt).toBeDefined();
    gantt.destroy();
  });

  it('compiles: gantt.gridColumns = [...gantt.gridColumns, "cost"] — the erased read rides straight back into the typed write', () => {
    const container = document.createElement('div');
    const dataset = new Dataset<{ owner: string; cost: number }>({
      timeZone: 'UTC',
      entries: [],
      fields: [
        { key: 'owner', column: { header: 'Owner' } },
        { key: 'cost', column: { header: 'Cost' } },
      ],
    });
    const gantt = new Gantt({ container, dataset });
    gantt.gridColumns = [...gantt.gridColumns, 'cost'];
    expect(gantt.gridColumns).toBeDefined();
    gantt.destroy();
  });

  it('compiles: gantt.on("gridColumnsChange", ...) hands the erased payload straight back to the typed setter', () => {
    const container = document.createElement('div');
    const dataset = new Dataset<{ owner: string; cost: number }>({
      timeZone: 'UTC',
      entries: [],
      fields: [
        { key: 'owner', column: { header: 'Owner' } },
        { key: 'cost', column: { header: 'Cost' } },
      ],
    });
    const gantt = new Gantt({ container, dataset });
    gantt.on('gridColumnsChange', ({ to }) => {
      gantt.gridColumns = to;
    });
    expect(gantt).toBeDefined();
    gantt.destroy();
  });

  it('compiles: a Gantt<TProps> still widens to a plain Gantt — the getter stays erased so this keeps working', () => {
    const container = document.createElement('div');
    const dataset = new Dataset<{ hours: number }>({
      timeZone: 'UTC',
      entries: [],
      fields: [{ key: 'hours', column: { header: 'Hours' } }],
    });
    const typed = new Gantt<{ hours: number }>({ container, dataset });
    const widened: Gantt = typed;
    expect(widened).toBeDefined();
    typed.destroy();
  });
});
