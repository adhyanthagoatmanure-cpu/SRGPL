import { db } from "../db/db";
import type { CashEntry, ID, UpiAccount, WithdrawWay, Withdrawal } from "../db/types";
import { AppError } from "../lib/errors";
import { baseFields, nextCode, nowMs, requireDateOrToday } from "../lib/ids";
import { money, oneOf, optionalMoney, optionalText, requireText } from "../lib/validation";
import { inRange, newestFirst, owned, rw } from "./common";
import type { DateRange } from "./sales";

/* -------------------------------------------------------------------- UPI */

export const listUpi = async (userId: ID): Promise<UpiAccount[]> =>
  (await db.upiAccounts.where("userId").equals(userId).toArray()).sort((a, b) => a.name.localeCompare(b.name));

export async function createUpi(userId: ID, nameIn: string): Promise<UpiAccount> {
  const name = requireText(nameIn, "Account name", 60);
  return rw([db.upiAccounts], async () => {
    const dup = (await db.upiAccounts.where("userId").equals(userId).toArray()).find((u) => u.name.toLowerCase() === name.toLowerCase());
    if (dup) throw new AppError(`"${dup.name}" already exists.`);
    const u: UpiAccount = { ...baseFields(userId), code: await nextCode(userId), name };
    await db.upiAccounts.add(u);
    return u;
  });
}

export async function renameUpi(userId: ID, id: ID, nameIn: string): Promise<void> {
  const name = requireText(nameIn, "Account name", 60);
  await rw([db.upiAccounts, db.withdrawals], async () => {
    await owned(db.upiAccounts, userId, id, "Account");
    await db.upiAccounts.update(id, { name, updatedAt: nowMs() });
    await db.withdrawals.where("userId").equals(userId).filter((w) => w.upiId === id).modify({ name });
  });
}

/** Past withdrawals keep their account name, so deleting an account does not change history. */
export async function deleteUpi(userId: ID, id: ID): Promise<void> {
  await rw([db.upiAccounts], async () => {
    await owned(db.upiAccounts, userId, id, "Account");
    await db.upiAccounts.delete(id);
  });
}

/* ------------------------------------------------------------ withdrawals */

export const listWithdrawals = async (userId: ID, range: DateRange = {}): Promise<Withdrawal[]> =>
  newestFirst(await db.withdrawals.where("userId").equals(userId).filter((w) => inRange(w.date, range.from, range.to)).toArray());

export interface WithdrawalInput {
  upiId: ID;
  amount: string | number;
  commission: string | number;
  way: string;
  remarks: string;
  date?: string;
}

export async function addWithdrawal(userId: ID, input: WithdrawalInput): Promise<Withdrawal> {
  const amount = money(input.amount, "Amount", { allowZero: false });
  const commission = optionalMoney(input.commission, "Commission", 0);
  const way = oneOf<WithdrawWay>(input.way, ["bank", "hand"], "Commission received");
  const remarks = optionalText(input.remarks, "Remarks");
  const date = requireDateOrToday(input.date);
  return rw([db.upiAccounts, db.withdrawals], async () => {
    const u = await owned(db.upiAccounts, userId, input.upiId, "Account");
    const w: Withdrawal = { ...baseFields(userId), upiId: u.id, name: u.name, amount, commission, way, remarks, date };
    await db.withdrawals.add(w);
    return w;
  });
}

export async function updateWithdrawal(userId: ID, id: ID, input: Omit<WithdrawalInput, "upiId">): Promise<void> {
  const patch = {
    amount: money(input.amount, "Amount", { allowZero: false }),
    commission: optionalMoney(input.commission, "Commission", 0),
    way: oneOf<WithdrawWay>(input.way, ["bank", "hand"], "Commission received"),
    remarks: optionalText(input.remarks, "Remarks"),
    date: requireDateOrToday(input.date),
    updatedAt: nowMs(),
  };
  await rw([db.withdrawals], async () => {
    await owned(db.withdrawals, userId, id, "Withdrawal");
    await db.withdrawals.update(id, patch);
  });
}

export async function deleteWithdrawal(userId: ID, id: ID): Promise<void> {
  await rw([db.withdrawals], async () => {
    await owned(db.withdrawals, userId, id, "Withdrawal");
    await db.withdrawals.delete(id);
  });
}

/* ------------------------------------------------------------ cash in hand */

export const listCash = async (userId: ID, range: DateRange = {}): Promise<CashEntry[]> =>
  newestFirst(await db.cashEntries.where("userId").equals(userId).filter((c) => inRange(c.date, range.from, range.to)).toArray());

export async function addCash(userId: ID, input: { amount: string | number; date?: string }): Promise<CashEntry> {
  const amount = money(input.amount, "Cash in hand", { allowZero: false });
  const date = requireDateOrToday(input.date);
  const e: CashEntry = { ...baseFields(userId), amount, date };
  await db.cashEntries.add(e);
  return e;
}

export async function updateCash(userId: ID, id: ID, input: { amount: string | number; date?: string }): Promise<void> {
  const amount = money(input.amount, "Cash in hand", { allowZero: false });
  const date = requireDateOrToday(input.date);
  await rw([db.cashEntries], async () => {
    await owned(db.cashEntries, userId, id, "Cash entry");
    await db.cashEntries.update(id, { amount, date, updatedAt: nowMs() });
  });
}

export async function deleteCash(userId: ID, id: ID): Promise<void> {
  await rw([db.cashEntries], async () => {
    await owned(db.cashEntries, userId, id, "Cash entry");
    await db.cashEntries.delete(id);
  });
}
