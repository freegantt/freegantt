// Ambient type for Vite's own `?raw` asset-as-string import (no plugin, built in) — TS has no
// built-in knowledge of query-suffixed specifiers. Scoped to `.md?raw` because that is the one
// shape a harness page uses today (api-reference.ts, D-S5-29); widen the pattern if a second page
// needs a different raw asset rather than reaching for the blanket `vite/client` types, which pull
// in every Vite asset shape at once.
declare module '*.md?raw' {
  const content: string;
  export default content;
}
