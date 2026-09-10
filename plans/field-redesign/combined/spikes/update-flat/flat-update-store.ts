/**
 * Improvement A — drop long form at update().
 * One spelling at update(): `{ cost }`. `props` stays on add, Document, ProposedEdit.
 */

import { CombinedStore } from '../combined-store/combined-store.js';
import type { FieldDecl, Write } from '../combined-store/types.js';

export class FlatUpdateStore extends CombinedStore {
  constructor(options: { fields: readonly FieldDecl[] }) {
    super(options);
  }

  override update(id: string, write: Write): ReturnType<CombinedStore['get']> {
    if (write.props !== undefined) {
      throw new Error(
        'entries.update: use declared-key shorthand. props stays on add and Document.',
      );
    }
    return super.update(id, write);
  }
}
