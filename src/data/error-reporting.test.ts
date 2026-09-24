import { describe, expect, it } from 'vitest';
import { entryId } from '../model/index.js';
import type { FieldUpdated } from '../model/index.js';
import { buildSiblingIndexDroppedReport } from './error-reporting.js';

function droppedRow(id: string, from: number, to: number): FieldUpdated {
  return { store: 'entries', id: entryId(id), field: 'siblingIndex', from, to };
}

describe('buildSiblingIndexDroppedReport', () => {
  it('reports the code, severity and source of a dropped authored value', () => {
    const report = buildSiblingIndexDroppedReport([droppedRow('t1', 5, 0)]);

    expect(report.code).toBe('sibling-index-dropped');
    expect(report.severity).toBe('warning');
    expect(report.by).toBe('core');
  });

  it('names the count and every distinct entry id, up to three', () => {
    const report = buildSiblingIndexDroppedReport([droppedRow('t1', 5, 0), droppedRow('t2', 3, 1)]);

    expect(report.message).toContain('2 authored siblingIndex values');
    expect(report.message).toContain('"t1"');
    expect(report.message).toContain('"t2"');
  });

  it('says "was" and singular for exactly one dropped value', () => {
    const report = buildSiblingIndexDroppedReport([droppedRow('t1', 5, 0)]);

    expect(report.message).toContain('1 authored siblingIndex value was dropped');
  });
});
