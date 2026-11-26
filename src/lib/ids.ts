import { db } from "../db/db";
import type { DateStr, ID } from "../db/types";
import { requireDate } from "./validation";

export const newId = (): ID => crypto.randomUUID();
export const nowMs = (): number => Date.now();

/** Local calendar date as YYYY-MM-DD (the original app used the server's local date). */
export function toDateStr(d: Date): DateStr {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export const today = (): DateStr => toDateStr(new Date());

export function monthStart(d = new Date()): DateStr {
  return toDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function addDays(date: DateStr, days: number): DateStr {
  const [y, m, d] = date.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
}

/** Validated date typed by the user, or today when left empty. */
export function requireDateOrToday(value?: string): DateStr {
  return value && value.trim() ? requireDate(value) : today();
}

export const FIRST_CODE = 1001;

/**
 * Next human friendly ID for a user. Must be called inside a read-write transaction that includes
 * `db.settings` so concurrent calls cannot produce duplicates. Codes are never re-used.
 */
export async function nextCode(userId: ID): Promise<number> {
  const id = `${userId}:nextCode`;
  const row = await db.settings.get(id);
  const code = typeof row?.value === "number" ? row.value : FIRST_CODE;
  await db.settings.put({ id, userId, key: "nextCode", value: code + 1, updatedAt: nowMs() });
  return code;
}

/** Fields common to every new record. */
export function baseFields(userId: ID) {
  const t = nowMs();
  return { id: newId(), userId, createdAt: t, updatedAt: t };
}
