// Must trigger: B9 no-derived-in-json (a Row/Item/GeometryFrame type reference in serialization)
export interface Row {
  id: string;
}

export function writeRow(row: Row): string {
  return row.id;
}
