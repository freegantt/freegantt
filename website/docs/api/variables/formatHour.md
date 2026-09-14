# Variable: formatHour

> `const` **formatHour**: [`HeaderFormat`](../type-aliases/HeaderFormat.md)

Defined in: time/format.ts:114

`9:00`, never `09:00`. The escape-hatch callback for the hour header band: `Intl.DateTimeFormat`
 has an `hour` field, but en-US's own CLDR data zero-pads its 24-hour ("h23") numeric pattern —
 `{ hour: 'numeric', hour12: false }` still renders "09:00" in that locale, so no combination of
 `Intl.DateTimeFormatOptions` gets an unpadded 24-hour clock everywhere (header readability
 follow-up to S1.12). Same manual-string-building precedent as `formatWeekNumber` above.
