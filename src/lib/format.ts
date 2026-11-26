const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const formatMoney = (n: number | undefined | null): string => `\u20B9${inr.format(n ?? 0)}`;
export const formatNumber = (n: number | undefined | null): string => inr.format(n ?? 0);

export function formatDate(d: string | undefined): string {
  if (!d) return "\u2014";
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

export function formatDateTime(ms: number | undefined): string {
  if (!ms) return "\u2014";
  return new Date(ms).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "\u2014";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Case-insensitive "contains" search across several fields. */
export function matches(query: string, ...fields: Array<string | number | undefined | null>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => String(f ?? "").toLowerCase().includes(q));
}

export const sum = <T,>(rows: T[], pick: (r: T) => number): number =>
  Math.round(rows.reduce((a, r) => a + pick(r), 0) * 100) / 100;
