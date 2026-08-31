// data/ — Field data half of the Document (D-S4-15). readDocument and toJSON call this codec.

import type { Field, FieldSource, FieldType, GridColumn } from '../../model/index.js';
import type { SerializedField } from '../../model/index.js';
import type { DatasetStateOptions } from '../dataset-state.js';
import { CORE_FIELDS } from '../fields/core-fields.js';

/** The code half a reader supplies. Same three keys `Dataset.fromJSON` already picks. */
export type FromJSONOptions = Pick<DatasetStateOptions, 'fields' | 'fieldTypes' | 'aggregators'>;

function isCoreFieldKey(key: string): boolean {
  return CORE_FIELDS.some((field) => String(field.key) === key);
}

/** A `compute` source in JSON is not a schema-2 Field — drop it (D-S4-15). */
function decodeDeclaredField(row: SerializedField): Field | undefined {
  const source = row.source;
  if (source !== undefined && source.from !== 'entry' && source.from !== 'meta') return undefined;
  return {
    key: row.key,
    ...(row.type !== undefined ? { type: row.type } : {}),
    source: source ?? { from: 'meta', key: String(row.key) },
    ...(row.rollUp !== undefined ? { rollUp: row.rollUp } : {}),
    ...(row.column !== undefined ? { column: row.column } : {}),
  };
}

/** Same-key merge (D-S4-15): Document wins `source` / `rollUp` / `type` / `column`; options win functions. */
function takeDocumentDataWithOptionFunctions(documentField: Field, optionField: Field): Field {
  return {
    key: documentField.key,
    ...(documentField.type !== undefined ? { type: documentField.type } : {}),
    ...(documentField.source !== undefined ? { source: documentField.source } : {}),
    ...(documentField.rollUp !== undefined ? { rollUp: documentField.rollUp } : {}),
    ...(documentField.column !== undefined ? { column: documentField.column } : {}),
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Field callbacks are declaration values.
    ...(optionField.equals !== undefined ? { equals: optionField.equals } : {}),
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Field callbacks are declaration values.
    ...(optionField.compare !== undefined ? { compare: optionField.compare } : {}),
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Field callbacks are declaration values.
    ...(optionField.formatValue !== undefined ? { formatValue: optionField.formatValue } : {}),
  };
}

function mergeDocumentAndOptionFields(
  documentFields: readonly Field[],
  optionFields: readonly Field[] | undefined,
): Field[] {
  if (optionFields === undefined || optionFields.length === 0) return [...documentFields];
  const optionByKey = new Map(optionFields.map((field) => [String(field.key), field]));
  const used = new Set<string>();
  const merged: Field[] = [];
  for (const documentField of documentFields) {
    const key = String(documentField.key);
    used.add(key);
    const optionField = optionByKey.get(key);
    merged.push(
      optionField === undefined
        ? documentField
        : takeDocumentDataWithOptionFunctions(documentField, optionField),
    );
  }
  for (const optionField of optionFields) {
    if (!used.has(String(optionField.key))) merged.push(optionField);
  }
  return merged;
}

/** Keep a Document `type` name constructible when the reading app omitted that Field type.
 *  Construction without a Document still throws `UnknownFieldTypeError` (D-S4-5). */
function seedMissingFieldTypes(
  fields: readonly Field[],
  optionTypes: Readonly<Record<string, FieldType>> | undefined,
): Readonly<Record<string, FieldType>> | undefined {
  const next: Record<string, FieldType> = { ...optionTypes };
  let seeded = false;
  for (const field of fields) {
    if (field.type !== undefined && next[field.type] === undefined) {
      next[field.type] = {};
      seeded = true;
    }
  }
  if (optionTypes !== undefined) return next;
  if (seeded) return next;
  return undefined;
}

function sourceForWrite(field: Field): FieldSource {
  const source = field.source;
  if (source === undefined) return { from: 'meta', key: String(field.key) };
  if (source.from === 'meta') return { from: 'meta', key: source.key ?? String(field.key) };
  return source;
}

function writeStoredSource(source: FieldSource): SerializedField['source'] | undefined {
  if (source.from === 'compute') return undefined;
  if (source.from === 'entry') return { from: 'entry', field: source.field };
  if (source.key === undefined) return undefined;
  return { from: 'meta', key: source.key };
}

function writeColumn(column: Omit<GridColumn, 'field'>): Omit<GridColumn, 'field'> {
  return {
    ...(column.header !== undefined ? { header: column.header } : {}),
    ...(column.width !== undefined ? { width: column.width } : {}),
    ...(column.flex !== undefined ? { flex: column.flex } : {}),
    ...(column.align !== undefined ? { align: column.align } : {}),
  };
}

function encodeDeclaredField(field: Field): SerializedField | undefined {
  if (isCoreFieldKey(String(field.key))) return undefined;
  const stored = writeStoredSource(sourceForWrite(field));
  if (stored === undefined) return undefined;
  const column = field.column === undefined ? undefined : writeColumn(field.column);
  return {
    key: field.key,
    ...(field.type !== undefined ? { type: field.type } : {}),
    source: stored,
    ...(field.rollUp !== undefined ? { rollUp: field.rollUp } : {}),
    ...(column !== undefined && Object.keys(column).length > 0 ? { column } : {}),
  };
}

/** Call: `encodeFieldDocument(dataset.fields.all)`. Core Fields, compute sources, and functions stay out. */
export function encodeFieldDocument(all: readonly Field[]): SerializedField[] | undefined {
  const rows: SerializedField[] = [];
  for (const field of all) {
    const row = encodeDeclaredField(field);
    if (row !== undefined) rows.push(row);
  }
  return rows.length === 0 ? undefined : rows;
}

/** Call: `decodeFieldDocument(doc.fields, options)`. Merge table and empty-type seed live here. */
export function decodeFieldDocument(
  documentRows: readonly SerializedField[] | undefined,
  options?: FromJSONOptions,
): {
  fields: Field[];
  fieldTypes: Readonly<Record<string, FieldType>> | undefined;
} {
  const decoded = (documentRows ?? [])
    .map(decodeDeclaredField)
    .filter((field): field is Field => field !== undefined);
  const fields = mergeDocumentAndOptionFields(decoded, options?.fields);
  return { fields, fieldTypes: seedMissingFieldTypes(fields, options?.fieldTypes) };
}
