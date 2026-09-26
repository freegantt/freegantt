import { describe, it, expect } from 'vitest';
import type {
  ColumnRenderer,
  ColumnRendererContext,
  Duration,
  GridColumn,
  GridColumnInput,
  Instant,
} from './index.js';

// Same compile-first style as entry-edit-types.test.ts: this file exists to compile, not to run —
// `it.skip` bodies never execute, so the assertions below are the type checker's job alone. A
// change that breaks one of these must be a deliberate, reviewed change to `GridColumn`.
//
// `meter` stands in for `layout/column-renderers.ts`'s shipped renderer: `model/` may import
// nothing else in `src/` (model-is-leaf), so this stub carries only the shape the real one has —
// a `ColumnRenderer` that reads any `fieldValue` through parameter contravariance.
// Stands in for `layout/column-renderers.ts`'s shipped renderer: `model/` may import nothing else
// in `src/` (model-is-leaf), so this returns a real `ColumnRenderer` rather than importing one.
function meter(): ColumnRenderer {
  return () => undefined;
}
declare function formatInstant(value: Instant): string;
declare function formatDuration(value: Duration): string;

type Props = { owner: string; cost?: number };

describe("GridColumn — a per-column renderer reads fieldValue from the column key's Field", () => {
  it('compiles: Ctx<Instant> on start, Ctx<Duration> on duration — the shipped date Fields', () => {
    const startCell = ({ fieldValue }: ColumnRendererContext<Instant>) => ({
      text: fieldValue === undefined ? '' : formatInstant(fieldValue),
    });
    const durationCell = ({ fieldValue }: ColumnRendererContext<Duration>) => ({
      text: fieldValue === undefined ? '' : formatDuration(fieldValue),
    });
    const columns: readonly GridColumnInput<Props>[] = [
      { field: 'start', columnRenderer: startCell },
      { field: 'duration', columnRenderer: durationCell },
    ];
    expect(columns).toBeDefined();
  });

  it('compiles: Ctx<string> on a declared props key', () => {
    const ownerCell = ({ fieldValue }: ColumnRendererContext<string>) => ({ text: fieldValue ?? '' });
    const column: GridColumn<Props> = { field: 'owner', columnRenderer: ownerCell };
    expect(column).toBeDefined();
  });

  it('compiles: meter() fits a core, a props and a plugin key — a renderer parameter is contravariant', () => {
    const columns: readonly GridColumnInput<Props>[] = [
      { field: 'progress', columnRenderer: meter() },
      { field: 'cost', columnRenderer: meter() },
      { field: 'pluginKey', columnRenderer: meter() },
    ];
    expect(columns).toBeDefined();
  });

  it('compiles: a GridColumn payload assigns to GridColumnInput<Props>', () => {
    const payload: readonly GridColumn[] = [{ field: 'name' }];
    const input: readonly GridColumnInput<Props>[] = payload;
    expect(input).toBeDefined();
  });

  it('compiles: a core-typed column under GridColumn<Record<string, unknown>>', () => {
    const startCell = ({ fieldValue }: ColumnRendererContext<Instant>) => ({
      text: fieldValue === undefined ? '' : formatInstant(fieldValue),
    });
    const column: GridColumn<Record<string, unknown>> = { field: 'start', columnRenderer: startCell };
    expect(column).toBeDefined();
  });

  it('does not compile: Ctx<string> on start — Instant is a branded number, not a string', () => {
    const ownerCell = ({ fieldValue }: ColumnRendererContext<string>) => ({ text: fieldValue ?? '' });
    // @ts-expect-error — start's Field value is Instant, never string
    const column: GridColumn<Props> = { field: 'start', columnRenderer: ownerCell };
    expect(column).toBeDefined();
  });

  it('does not compile: Ctx<Instant> on duration — duration is a Duration, never an Instant', () => {
    const startCell = ({ fieldValue }: ColumnRendererContext<Instant>) => ({
      text: fieldValue === undefined ? '' : formatInstant(fieldValue),
    });
    // @ts-expect-error — duration's Field value is Duration, never Instant
    const column: GridColumn<Props> = { field: 'duration', columnRenderer: startCell };
    expect(column).toBeDefined();
  });

  it('does not compile: Ctx<number> on a string props key', () => {
    const costCell = ({ fieldValue }: ColumnRendererContext<number>) => ({ text: String(fieldValue) });
    // @ts-expect-error — owner's declared type is string, never number
    const column: GridColumn<Props> = { field: 'owner', columnRenderer: costCell };
    expect(column).toBeDefined();
  });

  it('does not compile: Ctx<string> on owner in an untyped GridColumn — no TProps means no props type', () => {
    const ownerCell = ({ fieldValue }: ColumnRendererContext<string>) => ({ text: fieldValue ?? '' });
    // @ts-expect-error — an untyped GridColumn keeps a props key open (unknown), never string
    const column: GridColumn = { field: 'owner', columnRenderer: ownerCell };
    expect(column).toBeDefined();
  });

  it('does not compile: width and flex together (#249)', () => {
    // @ts-expect-error — a GridColumn states a width or a flex, never both
    const column: GridColumn<Props> = { field: 'owner', width: 80, flex: 1 };
    expect(column).toBeDefined();
  });

  it('compiles: a TProps key named start still reads as the core Instant type', () => {
    const startCell = ({ fieldValue }: ColumnRendererContext<Instant>) => ({
      text: fieldValue === undefined ? '' : formatInstant(fieldValue),
    });
    const column: GridColumn<{ start: string }> = { field: 'start', columnRenderer: startCell };
    expect(column).toBeDefined();
  });

  it('does not compile: Ctx<string> on start even when a TProps key of the same name is string', () => {
    const ownerCell = ({ fieldValue }: ColumnRendererContext<string>) => ({ text: fieldValue ?? '' });
    // @ts-expect-error — a name shared with a core key still reads as the core type, never TProps's
    const column: GridColumn<{ start: string }> = { field: 'start', columnRenderer: ownerCell };
    expect(column).toBeDefined();
  });
});
