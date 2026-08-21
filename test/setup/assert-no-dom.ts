// Guards D4/pure-layer claims by construction: the `pure` vitest project runs with no DOM env at all,
// and this setup throws if anything ever tries to reach for one (docs/04-hooks-and-ci.md §4).

if (typeof document !== 'undefined' || typeof window !== 'undefined') {
  throw new Error(
    'test/setup/assert-no-dom: a DOM global is present in the "pure" project. This must never happen.',
  );
}
