/** CSV helpers. Cells starting with = + - @ are prefixed with ' to prevent spreadsheet formula injection. */
function cell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

/** Trigger a browser download. A UTF-8 BOM makes Excel read the rupee sign and Indic text correctly. */
export function downloadText(filename: string, text: string, mime: string, bom = false): void {
  const blob = new Blob([bom ? "\uFEFF" : "", text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
