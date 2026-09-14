# Type Alias: BuiltInErrorCode

> **BuiltInErrorCode** = `"mutation-cancelled"` \| `"entry-move-cancelled"` \| `"entry-resize-cancelled"` \| `"renderer-failed"` \| `"disposer-failed"` \| `"extender-preview-failed"` \| `"plugin-reconfigure-dropped"` \| `"scale-options-ignored"` \| `"rollup-corrected"` \| `"unknown-parent"` \| `"hierarchy-cycle"` \| `"variant-claimed-twice"` \| `"unknown-variant-field"` \| `"derived-values-dropped"` \| `"derived-value"` \| `"no-parse-value"` \| `"no-date-value"` \| `"time-of-day"` \| `"unsaved-value"` \| `"segmented-entry"` \| `"unreadable-value"` \| `"refused-write"`

Defined in: model/error-report.ts:40

Every built-in code an Error report's `code` can carry, one closed union (T1-3, #247 S3-4). The
 built-in cell editor owns the last eight — its own `REFUSAL_TEXT`/`COMMIT_REFUSAL_TEXT` tables
 (`extensions/features/inline-editing.ts`) hold the words the user reads for each one.
 `error-code-drift.test.ts`, on the `extensions/` side of the boundary `model/` may not cross,
 checks every one of those table keys against this union through a `Record<BuiltInErrorCode,
 true>` literal — a code missing there fails to compile, and a code missing here fails that
 literal too, so the two tables cannot drift apart in either direction (I11). A `type`, not a
 runtime tuple: `model/` carries zero runtime beyond its id/brand helpers (`plans/01` §1).
