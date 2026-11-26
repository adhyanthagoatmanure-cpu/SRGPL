import { db } from "../db/db";
import type { Collection, CollectionKind, Credit, ID } from "../db/types";
import { AppError } from "../lib/errors";
import { baseFields, nextCode, nowMs, requireDateOrToday } from "../lib/ids";
import { money, optionalMobile, optionalMoney, optionalText, requireText, round2 } from "../lib/validation";
import { newestFirst, owned, rw } from "./common";

export const listCredits = async (userId: ID): Promise<Credit[]> =>
  newestFirst(await db.credits.where("userId").equals(userId).toArray());

export const collectionsFor = async (userId: ID, creditId?: ID): Promise<Collection[]> => {
  const rows = creditId
    ? await db.collections.where("[userId+creditId]").equals([userId, creditId]).toArray()
    : await db.collections.where("userId").equals(userId).toArray();
  return newestFirst(rows);
};

export interface CreditInput {
  name: string;
  mobile: string;
  particulars: string;
  openingBalance?: string | number;
}

/** New credit customer. An opening balance is recorded as the first "credit" entry (same as the original). */
export async function createCredit(userId: ID, input: CreditInput): Promise<Credit> {
  const name = requireText(input.name, "Customer name", 80);
  const mobile = optionalMobile(input.mobile);
  const particulars = optionalText(input.particulars, "Particulars", 300);
  const opening = optionalMoney(input.openingBalance ?? "", "Opening balance", 0);
  return rw([db.credits, db.collections], async () => {
    const date = requireDateOrToday();
    const c: Credit = { ...baseFields(userId), code: await nextCode(userId), name, mobile, particulars, balance: opening, date };
    await db.credits.add(c);
    if (opening > 0) {
      await db.collections.add({ ...baseFields(userId), creditId: c.id, kind: "credit", amount: opening, balance: opening, remarks: "Opening balance", date });
    }
    return c;
  });
}

export async function updateCredit(userId: ID, id: ID, input: Omit<CreditInput, "openingBalance">): Promise<void> {
  const patch = {
    name: requireText(input.name, "Customer name", 80),
    mobile: optionalMobile(input.mobile),
    particulars: optionalText(input.particulars, "Particulars", 300),
    updatedAt: nowMs(),
  };
  await rw([db.credits], async () => {
    await owned(db.credits, userId, id, "Credit customer");
    await db.credits.update(id, patch);
  });
}

/** kind "credit" = customer takes goods/money on credit (balance up); "payment" = customer pays (balance down). */
export async function addCollectionEntry(
  userId: ID,
  id: ID,
  input: { kind: CollectionKind; amount: string | number; remarks: string; date?: string },
): Promise<void> {
  const amount = money(input.amount, "Amount", { allowZero: false });
  const remarks = optionalText(input.remarks, "Remarks");
  const date = requireDateOrToday(input.date);
  if (input.kind !== "credit" && input.kind !== "payment") throw new AppError("Invalid entry type.");
  await rw([db.credits, db.collections], async () => {
    const c = await owned(db.credits, userId, id, "Credit customer");
    if (input.kind === "payment" && amount > c.balance) {
      throw new AppError(`Payment (${amount}) is more than the balance due (${c.balance}).`);
    }
    const balance = round2(input.kind === "payment" ? c.balance - amount : c.balance + amount);
    await db.credits.update(id, { balance, updatedAt: nowMs() });
    await db.collections.add({ ...baseFields(userId), creditId: id, kind: input.kind, amount, balance, remarks, date });
  });
}

export async function deleteCredit(userId: ID, id: ID): Promise<void> {
  await rw([db.credits, db.collections], async () => {
    await owned(db.credits, userId, id, "Credit customer");
    await db.collections.where("[userId+creditId]").equals([userId, id]).delete();
    await db.credits.delete(id);
  });
}
