import { db } from "../db/db";
import type { DailyHistory, DailyTransaction, ID, Network } from "../db/types";
import { AppError } from "../lib/errors";
import { baseFields, nowMs, requireDateOrToday } from "../lib/ids";
import { money, round2 } from "../lib/validation";
import { newestFirst, owned, rw } from "./common";
import { listNetworks } from "./network";

export interface DailyRow {
  network: Network;
  record?: DailyTransaction;
}

/** One line per network for the chosen day. A day with no saved record yet shows zeros (the original reset to zero each day). */
export async function dailySheet(userId: ID, date: string): Promise<DailyRow[]> {
  const day = requireDateOrToday(date);
  const [nets, rows] = await Promise.all([
    listNetworks(userId),
    db.dailyTransactions.where("[userId+date]").equals([userId, day]).toArray(),
  ]);
  const byNet = new Map(rows.map((r) => [r.networkId, r]));
  return nets.map((n) => ({ network: n, record: byNet.get(n.id) }));
}

export interface DailyInput {
  opening: string | number;
  purchase: string | number;
  closing: string | number;
}

/** sales = opening + purchase - closing. Saves (create or update) and writes a history snapshot. */
export async function saveDaily(userId: ID, networkId: ID, dateIn: string, input: DailyInput): Promise<DailyTransaction> {
  const date = requireDateOrToday(dateIn);
  const opening = money(input.opening, "Opening balance");
  const purchase = money(input.purchase, "Purchase");
  const closing = money(input.closing, "Closing balance");
  if (closing > round2(opening + purchase)) throw new AppError("Closing balance cannot be more than opening + purchase.");
  const sales = round2(opening + purchase - closing);
  return rw([db.networks, db.dailyTransactions, db.dailyHistory], async () => {
    const net = await owned(db.networks, userId, networkId, "Network");
    const existing = await db.dailyTransactions.where("[userId+networkId+date]").equals([userId, networkId, date]).first();
    const rec: DailyTransaction = existing
      ? { ...existing, item: net.name, opening, purchase, closing, sales, updatedAt: nowMs() }
      : { ...baseFields(userId), networkId, item: net.name, date, opening, purchase, closing, sales };
    await db.dailyTransactions.put(rec);
    await db.dailyHistory.add({ ...baseFields(userId), dailyId: rec.id, networkId, item: net.name, opening, purchase, closing, sales, date });
    return rec;
  });
}

export async function deleteDaily(userId: ID, id: ID): Promise<void> {
  await rw([db.dailyTransactions, db.dailyHistory], async () => {
    await owned(db.dailyTransactions, userId, id, "Daily record");
    await db.dailyHistory.where("userId").equals(userId).filter((h) => h.dailyId === id).delete();
    await db.dailyTransactions.delete(id);
  });
}

export async function dailyHistory(userId: ID, from?: string, to?: string): Promise<DailyHistory[]> {
  return newestFirst(
    await db.dailyHistory.where("userId").equals(userId).filter((h) => (!from || h.date >= from) && (!to || h.date <= to)).toArray(),
  );
}
