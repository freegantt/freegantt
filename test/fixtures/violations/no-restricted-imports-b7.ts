// Must trigger: B7 no-external-runtime-import (a runtime dep import outside its one façade file)
import { signal } from 'alien-signals';
export const s = signal;
