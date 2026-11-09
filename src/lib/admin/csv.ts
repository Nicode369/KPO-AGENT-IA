export type CsvColumn = {
  key: string;
  label: string;
};

export function escapeCsvValue(value: unknown): string {
  if (value == null) return "";
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n;]/.test(normalized)) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }
  return normalized;
}

export function buildCsv(
  columns: CsvColumn[],
  rows: Record<string, unknown>[],
): string {
  const header = columns.map((column) => escapeCsvValue(column.label)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvValue(row[column.key])).join(","),
  );

  return [header, ...body].join("\r\n");
}
