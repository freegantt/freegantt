import type { PropsEdit } from './shape.js';
import type { Write } from '../combined-store/types.js';

// Q1a: #267 gap — with an index signature, undeclared `phase` compiles on PropsEdit.
const _undeclared: PropsEdit<{ cost: number }> = { phase: 3 };

// Q1b: CombinedStore Write has no `strat`. A typo fails in the editor, not only at runtime.
// @ts-expect-error unknown top-level key
const _strat: Write = { strat: 1 };

// Q1c: un-date compiles
const _undate: Write = { start: undefined, end: undefined };
