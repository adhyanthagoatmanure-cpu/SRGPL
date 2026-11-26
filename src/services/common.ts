import type { Table } from "dexie";
import { db } from "../db/db";
import type { ID } from "../db/types";
import { AppError } from "../lib/errors";

/** Read-write transaction. `settings` is always included because ID generation uses it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rw<T>(tables: Table<any, any>[], fn: () => Promise<T>): Promise<T> {
  return db.transaction("rw", [...tables, db.settings], fn);
}

/** Fetch a record and make sure it belongs to the given user. */
export async function owned<T extends { userId: ID }>(
  table: Table<T, string>,
  userId: ID,
  id: ID,
  label: string,
): Promise<T> {
  const row = await table.get(id);
  if (!row || row.userId !== userId) throw new AppError(`${label} was not found. It may have been deleted.`);
  return row;
}

export const byUser = <T extends { userId: ID }>(table: Table<T, string>, userId: ID) =>
  table.where("userId").equals(userId);

/** Newest first ordering by creation time. */
export const newestFirst = <T extends { createdAt: number }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => b.createdAt - a.createdAt);

export const inRange = (date: string, from?: string, to?: string): boolean =>
  (!from || date >= from) && (!to || date <= to);
