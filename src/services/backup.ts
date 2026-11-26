import { db } from "../db/db";
import { ORDER_STATUSES, SERVICE_STATUSES, TABLE_NAMES, type ID, type TableName } from "../db/types";
import { AppError } from "../lib/errors";
import { sha256Hex } from "../lib/crypto";
import { toCsv } from "../lib/csv";
import { nowMs } from "../lib/ids";
import { SETTING_KEYS, setSetting } from "./settings";
import { rw } from "./common";

export const BACKUP_APP = "srgpl-manager";
export const BACKUP_FORMAT = 1;
export const SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 150 * 1024 * 1024;

/* ----------------------------------------------------------- field specs */
/**
 * s = string, s? = optional string, n = finite number, n? = optional/null number, d = YYYY-MM-DD,
 * e:a|b = one of the listed strings, any = JSON value. Unknown fields in a backup are dropped on import.
 */
const BASE = { id: "s", userId: "s", createdAt: "n", updatedAt: "n" } as const;
const e = (...v: readonly string[]) => `e:${v.join("|")}`;

export const FIELD_SPEC: Record<TableName, Record<string, string>> = {
  users: {
    id: "s", email: "s", passwordHash: "s", salt: "s", iterations: "n", hashAlgo: e("PBKDF2-SHA256"), shopName: "s", mobile: "s",
    address: "s", pincode: "s", role: e("owner", "staff"), status: e("active", "pending"), createdAt: "n", updatedAt: "n", lastLoginAt: "n?",
  },
  customers: { ...BASE, code: "n", name: "s", mobile: "s", place: "s", remarks: "s", date: "d" },
  customerHistory: { ...BASE, customerId: "s", name: "s", place: "s", mobile: "s", remarks: "s", date: "d" },
  orders: { ...BASE, code: "n", name: "s", mobile: "s", particular: "s", remarks: "s", status: e(...ORDER_STATUSES), date: "d" },
  orderHistory: { ...BASE, orderId: "s", status: e(...ORDER_STATUSES), remarks: "s", date: "d" },
  purchases: { ...BASE, code: "n", shop: "s", particulars: "s", date: "d", balance: "n", status: e("new", "unpaid", "paid"), entryDate: "d" },
  purchaseHistory: {
    ...BASE, purchaseId: "s", shopName: "s", kind: e("purchase", "payment"), particular: "s", amount: "n", balance: "n",
    status: e("new", "unpaid", "paid"), date: "d", entryDate: "d",
  },
  stocks: { ...BASE, code: "n", name: "s", quantity: "n", price: "n" },
  stockHistory: {
    ...BASE, stockId: "s", type: e("opening", "restock", "adjustment", "sale", "return", "void-sale", "void-return"), quantity: "n",
    quantityAfter: "n", price: "n?", refId: "s?", date: "d",
  },
  items: { ...BASE, code: "n", kind: e("sale", "expense"), name: "s", rate: "n", stockId: "s?" },
  sales: { ...BASE, itemId: "s", itemName: "s", stockId: "s?", quantity: "n", price: "n", remarks: "s", date: "d" },
  expenses: { ...BASE, itemId: "s", itemName: "s", amount: "n", remarks: "s", date: "d" },
  returns: { ...BASE, itemId: "s", product: "s", stockId: "s?", quantity: "n", price: "n", remarks: "s", date: "d" },
  credits: { ...BASE, code: "n", name: "s", mobile: "s", particulars: "s", balance: "n", date: "d" },
  collections: { ...BASE, creditId: "s", kind: e("credit", "payment"), amount: "n", balance: "n", remarks: "s", date: "d" },
  services: {
    ...BASE, code: "n", name: "s", mobile: "s", place: "s", complaint: "s", advance: "n", final: "n", balance: "n",
    status: e(...SERVICE_STATUSES), remarks: "s", date: "d",
  },
  serviceHistory: {
    ...BASE, serviceId: "s", customerName: "s", advance: "n", final: "n", balance: "n", paid: "n", returnAmount: "n",
    status: e(...SERVICE_STATUSES), remarks: "s", date: "d",
  },
  networks: { ...BASE, code: "n", name: "s", type: e("mobile", "dth", "other") },
  recharges: {
    ...BASE, networkId: "s", network: "s", networkType: e("mobile", "dth", "other"), number: "s", amount: "n", oldBalance: "n",
    newBalance: "n", commission: "n", date: "d",
  },
  dailyTransactions: { ...BASE, networkId: "s", item: "s", date: "d", opening: "n", purchase: "n", closing: "n", sales: "n" },
  dailyHistory: { ...BASE, dailyId: "s", networkId: "s", item: "s", opening: "n", purchase: "n", closing: "n", sales: "n", date: "d" },
  upiAccounts: { ...BASE, code: "n", name: "s" },
  withdrawals: { ...BASE, upiId: "s", name: "s", amount: "n", commission: "n", way: e("bank", "hand"), remarks: "s", date: "d" },
  cashEntries: { ...BASE, amount: "n", date: "d" },
  settings: { id: "s", userId: "s", key: "s", value: "any", updatedAt: "n" },
};

const MAX_STR = 5000;

function checkField(type: string, v: unknown): { ok: boolean; value?: unknown } {
  const optional = type.endsWith("?");
  if (v === undefined || v === null) return optional ? { ok: true, value: v === null ? null : undefined } : { ok: false };
  const t = optional ? type.slice(0, -1) : type;
  if (t === "s") return typeof v === "string" && v.length <= MAX_STR ? { ok: true, value: v } : { ok: false };
  if (t === "n") return typeof v === "number" && Number.isFinite(v) ? { ok: true, value: v } : { ok: false };
  if (t === "d") return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? { ok: true, value: v } : { ok: false };
  if (t === "any") {
    return typeof v === "number" || typeof v === "string" || typeof v === "boolean" ? { ok: true, value: v } : { ok: false };
  }
  if (t.startsWith("e:")) return typeof v === "string" && t.slice(2).split("|").includes(v) ? { ok: true, value: v } : { ok: false };
  return { ok: false };
}

/* ---------------------------------------------------------------- export */

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  schemaVersion: number;
  exportedAt: string;
  scope: "user" | "device";
  checksum: string;
  tables: Partial<Record<TableName, Record<string, unknown>[]>>;
}

export interface BackupSummary {
  counts: Partial<Record<TableName, number>>;
  total: number;
}

/** Collect rows. scope "user" = one user's data + their account record; "device" = every user (owner only). */
async function collect(scope: "user" | "device", userId: ID): Promise<BackupFile["tables"]> {
  const tables: BackupFile["tables"] = {};
  for (const name of TABLE_NAMES) {
    const t = db.table(name);
    if (scope === "device") tables[name] = await t.toArray();
    else if (name === "users") tables[name] = await t.where("id").equals(userId).toArray();
    else if (name === "settings") tables[name] = await t.where("userId").equals(userId).toArray();
    else tables[name] = await t.where("userId").equals(userId).toArray();
  }
  return tables;
}

export async function createBackup(userId: ID, scope: "user" | "device" = "user"): Promise<{ json: string; filename: string; summary: BackupSummary }> {
  if (scope === "device") {
    const me = await db.users.get(userId);
    if (me?.role !== "owner") throw new AppError("Only the owner can back up every account on the device.");
  }
  // One read transaction => a consistent snapshot.
  const tables = await db.transaction("r", db.tables, () => collect(scope, userId));
  const file: BackupFile = {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    scope,
    checksum: await sha256Hex(JSON.stringify(tables)),
    tables,
  };
  const counts: BackupSummary["counts"] = {};
  let total = 0;
  for (const [k, v] of Object.entries(tables)) {
    counts[k as TableName] = v?.length ?? 0;
    total += v?.length ?? 0;
  }
  await setSetting(userId, SETTING_KEYS.lastBackupAt, nowMs());
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return { json: JSON.stringify(file), filename: `srgpl-backup-${scope}-${stamp}.json`, summary: { counts, total } };
}

/* ------------------------------------------------------------ validation */

export interface PreviewResult {
  ok: boolean;
  errors: string[];
  scope?: "user" | "device";
  exportedAt?: string;
  summary?: BackupSummary;
  /** Sanitised rows, ready to import (only set when ok). */
  rows?: Partial<Record<TableName, Record<string, unknown>[]>>;
  /** Number of records that already exist on this device (same id). */
  duplicates?: number;
  userEmails?: string[];
}

export async function validateBackup(text: string): Promise<PreviewResult> {
  const errors: string[] = [];
  const fail = (m: string): PreviewResult => ({ ok: false, errors: [m, ...errors].slice(0, 25) });
  if (text.length > MAX_BACKUP_BYTES) return fail("File is too large to be a backup of this app.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("This file is not valid JSON. Choose a backup file exported from this app.");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return fail("Unrecognised backup structure.");
  const f = data as Record<string, unknown>;
  if (f.app !== BACKUP_APP) return fail("This file was not created by this application.");
  if (typeof f.format !== "number" || f.format > BACKUP_FORMAT) return fail("This backup was created by a newer version of the app. Update the app and try again.");
  if (typeof f.schemaVersion !== "number" || f.schemaVersion > SCHEMA_VERSION) return fail("This backup uses a newer database version than this app supports.");
  if (typeof f.tables !== "object" || f.tables === null || Array.isArray(f.tables)) return fail("The backup has no data section.");
  if (typeof f.checksum !== "string") return fail("The backup is missing its integrity checksum.");
  if ((await sha256Hex(JSON.stringify(f.tables))) !== f.checksum) return fail("Integrity check failed: the file was modified or damaged. Nothing was imported.");
  if (f.scope !== "user" && f.scope !== "device") return fail("The backup scope is missing or invalid.");

  const tablesIn = f.tables as Record<string, unknown>;
  const rows: NonNullable<PreviewResult["rows"]> = {};
  const counts: BackupSummary["counts"] = {};
  let total = 0;
  let duplicates = 0;
  for (const key of Object.keys(tablesIn)) {
    if (!(TABLE_NAMES as readonly string[]).includes(key)) errors.push(`Unknown table "${key}" will be ignored.`);
  }
  const hardErrors: string[] = [];
  for (const name of TABLE_NAMES) {
    const arr = tablesIn[name];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) {
      hardErrors.push(`Table "${name}" is not a list.`);
      continue;
    }
    const spec = FIELD_SPEC[name];
    const clean: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    arr.forEach((raw, i) => {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        hardErrors.push(`${name} #${i + 1}: not a record.`);
        return;
      }
      const out: Record<string, unknown> = {};
      for (const [field, type] of Object.entries(spec)) {
        const r = checkField(type, (raw as Record<string, unknown>)[field]);
        if (!r.ok) {
          hardErrors.push(`${name} #${i + 1}: field "${field}" is missing or invalid.`);
          return;
        }
        if (r.value !== undefined) out[field] = r.value;
      }
      if (seen.has(out.id as string)) {
        hardErrors.push(`${name} #${i + 1}: duplicate id inside the file.`);
        return;
      }
      seen.add(out.id as string);
      clean.push(out);
    });
    rows[name] = clean;
    counts[name] = clean.length;
    total += clean.length;
    if (clean.length) {
      const existing = await db.table(name).bulkGet(clean.map((r) => r.id as string));
      duplicates += existing.filter(Boolean).length;
    }
  }
  if (hardErrors.length) {
    return { ok: false, errors: [...hardErrors.slice(0, 20), ...(hardErrors.length > 20 ? [`...and ${hardErrors.length - 20} more problems.`] : [])] };
  }
  const userEmails = (rows.users ?? []).map((u) => u.email as string);
  return { ok: true, errors, scope: f.scope, exportedAt: typeof f.exportedAt === "string" ? f.exportedAt : undefined, summary: { counts, total }, rows, duplicates, userEmails };
}

/* ---------------------------------------------------------------- import */

export type ImportMode = "skip" | "overwrite" | "replace";

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

/**
 * Import validated rows. Everything happens in ONE transaction: if anything fails nothing changes.
 *  - targetUserId set  : data is imported into that account (userId remapped, account record ignored).
 *  - targetUserId null : raw restore incl. accounts (only allowed on a device that has no accounts yet).
 * Modes: skip = keep existing records with the same id; overwrite = backup wins; replace = delete the target's data first.
 */
export async function importBackup(preview: PreviewResult, mode: ImportMode, targetUserId: ID | null): Promise<ImportResult> {
  if (!preview.ok || !preview.rows) throw new AppError("This backup did not pass validation.");
  const src = preview.rows;
  if (targetUserId === null && (await db.users.count()) > 0) {
    throw new AppError("Restoring accounts is only possible on a device with no accounts. Log in and import into your account instead.");
  }
  if (targetUserId !== null && preview.scope === "device" && (src.users?.length ?? 0) > 1) {
    throw new AppError("This is a full-device backup. Restore it on the setup screen of an empty device, or export a per-account backup.");
  }
  // Remap: a per-account backup contains a single source user id.
  const srcUserIds = new Set<string>();
  for (const [name, list] of Object.entries(src)) if (name !== "users" && name !== "settings") list?.forEach((r) => srcUserIds.add(r.userId as string));
  src.settings?.forEach((r) => r.userId !== "device" && srcUserIds.add(r.userId as string));
  if (targetUserId !== null && srcUserIds.size > 1) throw new AppError("This backup contains data for several accounts and cannot be imported into one account.");

  const result: ImportResult = { added: 0, updated: 0, skipped: 0 };
  const tableObjs = TABLE_NAMES.map((n) => db.table(n));
  await rw(tableObjs, async () => {
    if (mode === "replace" && targetUserId !== null) {
      for (const n of TABLE_NAMES) if (n !== "users") await db.table(n).where("userId").equals(targetUserId).delete();
    }
    for (const name of TABLE_NAMES) {
      if (name === "users" && targetUserId !== null) continue;
      const list = src[name];
      if (!list?.length) continue;
      const table = db.table(name);
      for (const original of list) {
        const row = { ...original };
        if (targetUserId !== null && name !== "users") {
          if (name === "settings") {
            if (row.userId === "device") continue;
            row.userId = targetUserId;
            row.id = `${targetUserId}:${row.key as string}`;
          } else {
            row.userId = targetUserId;
          }
        }
        const existing = await table.get(row.id as string);
        if (existing && name !== "users" && existing.userId !== row.userId) {
          throw new AppError("Some records in this backup already exist under another account on this device, so it cannot be imported here.");
        }
        // Unique-index conflicts that would abort the whole import are skipped instead.
        if (name === "users") {
          const clash = await db.users.where("email").equals(row.email as string).first();
          if (clash && clash.id !== row.id) {
            result.skipped++;
            continue;
          }
        }
        if (name === "dailyTransactions") {
          const clash = await db.dailyTransactions.where("[userId+networkId+date]").equals([row.userId as string, row.networkId as string, row.date as string]).first();
          if (clash && clash.id !== row.id) {
            result.skipped++;
            continue;
          }
        }
        if (name === "settings" && row.key === "nextCode") {
          // Never lower the ID counter.
          const cur = (await db.settings.get(row.id as string))?.value;
          if (typeof cur === "number" && typeof row.value === "number" && cur > row.value) row.value = cur;
          await table.put(row);
          existing ? result.updated++ : result.added++;
          continue;
        }
        if (existing && mode === "skip") {
          result.skipped++;
          continue;
        }
        await table.put(row);
        existing ? result.updated++ : result.added++;
      }
    }
  });
  return result;
}

/* ------------------------------------------------------------- CSV export */

export const CSV_TABLES: Array<{ table: TableName; label: string }> = [
  { table: "customers", label: "Customers" },
  { table: "orders", label: "Orders" },
  { table: "purchases", label: "Purchases (shops)" },
  { table: "purchaseHistory", label: "Purchase history" },
  { table: "stocks", label: "Stocks" },
  { table: "stockHistory", label: "Stock history" },
  { table: "items", label: "Items" },
  { table: "sales", label: "Sales" },
  { table: "expenses", label: "Expenses" },
  { table: "returns", label: "Sale returns" },
  { table: "credits", label: "Credit customers" },
  { table: "collections", label: "Credit history" },
  { table: "services", label: "Service jobs" },
  { table: "serviceHistory", label: "Service history" },
  { table: "networks", label: "Networks" },
  { table: "recharges", label: "Recharges" },
  { table: "dailyTransactions", label: "Daily transactions" },
  { table: "upiAccounts", label: "UPI accounts" },
  { table: "withdrawals", label: "Withdrawals" },
  { table: "cashEntries", label: "Cash in hand" },
];

export async function exportCsv(userId: ID, table: TableName): Promise<string> {
  if (table === "users") throw new AppError("Accounts cannot be exported as CSV.");
  const headers = Object.keys(FIELD_SPEC[table]).filter((h) => h !== "userId");
  const rows = await db.table(table).where("userId").equals(userId).toArray();
  rows.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  return toCsv(headers, rows.map((r) => headers.map((h) => (h === "createdAt" || h === "updatedAt" ? new Date(r[h]).toISOString() : r[h]))));
}

/* --------------------------------------------------------------- reset */

/** Delete every record of one user (not the account itself). Callers must confirm first. */
export async function clearUserData(userId: ID): Promise<void> {
  const tables = TABLE_NAMES.filter((n) => n !== "users").map((n) => db.table(n));
  await rw(tables, async () => {
    for (const t of tables) await t.where("userId").equals(userId).delete();
  });
}
