import { describe, it, expect } from 'vitest';
import { Dataset } from './dataset.js';
import { createGridColumnHelper } from './grid-column-helper.js';
import type { ColumnRendererContext, GridColumnInput, Instant } from './index.js';

interface CostProps {
  owner?: string;
  cost: number;
}

function costDataset(): Dataset<CostProps> {
  return new Dataset<CostProps>({
    timeZone: 'UTC',
    entries: [],
    fields: [{ key: 'owner' }, { key: 'cost' }],
  });
}

describe('createGridColumnHelper — column() returns the plain column object', () => {
  it('returns the key as `field`, with every option as given', () => {
    const columnHelper = createGridColumnHelper(costDataset());
    const columnRenderer = ({ fieldValue }: ColumnRendererContext<number>) => ({ text: String(fieldValue) });

    expect(columnHelper.column('cost', { header: 'Cost', width: 80, columnRenderer })).toEqual({
      field: 'cost',
      header: 'Cost',
      width: 80,
      columnRenderer,
    });
  });

  it('returns `{ field }` alone when it gets no options', () => {
    const columnHelper = createGridColumnHelper(costDataset());

    expect(columnHelper.column('start')).toEqual({ field: 'start' });
  });
});

// The cases below exist to compile. The type checker makes the assertions, and a wrong type fails
// `pnpm typecheck` at the `@ts-expect-error` line.
describe('createGridColumnHelper — column() types the renderer from the key', () => {
  it('compiles: an inline renderer reads a core key and a props key as their own types', () => {
    const columnHelper = createGridColumnHelper(costDataset());
    const columns: readonly GridColumnInput[] = [
      'name',
      columnHelper.column('start', {
        columnRenderer: ({ fieldValue }) => ({ text: fieldValue === undefined ? '' : fieldValue.toString() }),
      }),
      columnHelper.column('owner', { columnRenderer: ({ fieldValue }) => ({ text: fieldValue ?? '' }) }),
      columnHelper.column('cost', {
        columnRenderer: ({ fieldValue }) => ({ text: (fieldValue ?? 0).toFixed(2) }),
      }),
      { field: 'scheduling:progress', columnRenderer: ({ fieldValue }) => ({ text: String(fieldValue) }) },
    ];
    expect(columns).toHaveLength(5);
  });

  it('compiles: a named renderer typed on the key, and an untyped one', () => {
    const columnHelper = createGridColumnHelper(costDataset());
    const startCell = ({ fieldValue }: ColumnRendererContext<Instant>) => ({ text: String(fieldValue) });
    const textCell = ({ value }: ColumnRendererContext) => ({ text: value });
    expect(columnHelper.column('start', { columnRenderer: startCell })).toBeDefined();
    expect(columnHelper.column('owner', { columnRenderer: textCell })).toBeDefined();
  });

  it('does not compile: a renderer for another type', () => {
    const columnHelper = createGridColumnHelper(costDataset());
    const numberCell = ({ fieldValue }: ColumnRendererContext<number>) => ({ text: String(fieldValue) });
    // @ts-expect-error — owner is a string, never a number
    expect(columnHelper.column('owner', { columnRenderer: numberCell })).toBeDefined();
  });

  it('does not compile: a key that is neither a core key nor a props key', () => {
    const columnHelper = createGridColumnHelper(costDataset());
    // @ts-expect-error — the props type names no `budget`; a plain column object shows that key
    expect(columnHelper.column('budget')).toBeDefined();
  });

  it('does not compile: both `width` and `flex`', () => {
    const columnHelper = createGridColumnHelper(costDataset());
    // @ts-expect-error — a column states a width or a flex, never both
    expect(columnHelper.column('cost', { width: 80, flex: 1 })).toBeDefined();
  });
});
