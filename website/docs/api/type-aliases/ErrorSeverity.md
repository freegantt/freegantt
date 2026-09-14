# Type Alias: ErrorSeverity

> **ErrorSeverity** = `"error"` \| `"warning"` \| `"info"`

Defined in: model/error-report.ts:30

How bad an Error report is (D-S5-41).

 `'info'` — a Refusal: the library said no on purpose and nothing is broken.
 `'warning'` — degraded but recovered, such as a renderer that threw and fell back.
 `'error'` — something broke and nothing caught it.

 Three levels rather than a `'refusal' | 'fault'` pair: those are two different things and not two
 levels, and a field named `severity` whose values are not severities would cover two concepts
 with one word. Telemetry routes on `severity !== 'info'`; a toast styles on all three.
