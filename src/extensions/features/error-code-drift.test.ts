// #247 S3-4: `model/error-report.ts`'s `BuiltInReportCode` must list every refusal code the built-in
// cell editor raises. `model/` may not import `extensions/` (I1), and `model/` may carry no runtime
// beyond its id/brand helpers (plans/01 §1), so `BuiltInReportCode` stays a type — this file, on the
// `extensions/` side of the boundary, is where the two tables actually meet.
//
// `KNOWN_CODES` below is a `Record<BuiltInReportCode, true>` literal: TypeScript requires it to name
// every member of that type exactly once, so a code added to or removed from `BuiltInReportCode`
// fails to compile here until this list is edited to match. The two `it`s then check the other
// direction at runtime — every `REFUSAL_TEXT`/`COMMIT_REFUSAL_TEXT` key must already be one of
// `KNOWN_CODES`'s keys. Together the two directions are how three codes drifted before this file
// existed (T1-3): a key add to either table with no matching edit here now fails one check or the
// other, instead of compiling silently.
import { describe, expect, it } from 'vitest';
import type { BuiltInReportCode } from '../../model/error-report.js';
import { COMMIT_REFUSAL_TEXT, REFUSAL_TEXT } from './inline-editing.js';

const KNOWN_CODES: Record<BuiltInReportCode, true> = {
  'mutation-cancelled': true,
  'entry-move-cancelled': true,
  'entry-resize-cancelled': true,
  'entry-remove-refused': true,
  'entry-move-dropped': true,
  'entry-resize-dropped': true,
  'renderer-failed': true,
  'disposer-failed': true,
  'extender-preview-failed': true,
  'rollup-preview-failed': true,
  'gesture-commit-failed': true,
  'scale-options-ignored': true,
  'rollup-corrected': true,
  'unknown-parent': true,
  'hierarchy-cycle': true,
  'variant-matched-twice': true,
  'bar-renderer-shadowed': true,
  'unknown-variant-field': true,
  'unknown-row-source-field': true,
  'unknown-bar-label-field': true,
  'derived-value': true,
  'derived-values-dropped': true,
  'sibling-index-dropped': true,
  'no-parse-value': true,
  'no-date-value': true,
  'unsaved-value': true,
  'unreadable-value': true,
  'refused-write': true,
};

describe('BuiltInReportCode stays honest against the cell editor refusal tables', () => {
  it('lists every CellEditorRefusal code', () => {
    for (const code of Object.keys(REFUSAL_TEXT)) {
      expect(code in KNOWN_CODES).toBe(true);
    }
  });

  it('lists every CellEditorCommitRefusal code', () => {
    for (const code of Object.keys(COMMIT_REFUSAL_TEXT)) {
      expect(code in KNOWN_CODES).toBe(true);
    }
  });
});
