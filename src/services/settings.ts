import { db } from "../db/db";
import type { ID } from "../db/types";
import { nowMs } from "../lib/ids";

/** Per-user (or "device") key/value settings stored in IndexedDB. */
export async function getSetting<T>(userId: ID | "device", key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(`${userId}:${key}`);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(userId: ID | "device", key: string, value: unknown): Promise<void> {
  await db.settings.put({ id: `${userId}:${key}`, userId, key, value, updatedAt: nowMs() });
}

export const SETTING_KEYS = {
  lastBackupAt: "lastBackupAt",
  backupReminderDays: "backupReminderDays",
  persistRequested: "persistRequested",
} as const;

export const DEFAULT_BACKUP_REMINDER_DAYS = 7;

/** Days since the last backup, or null when no backup was ever made. */
export async function daysSinceBackup(userId: ID): Promise<number | null> {
  const last = await getSetting<number | null>(userId, SETTING_KEYS.lastBackupAt, null);
  return last === null ? null : Math.floor((nowMs() - last) / 86_400_000);
}
