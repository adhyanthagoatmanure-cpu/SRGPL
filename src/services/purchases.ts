import { db } from "../db/db";
import type { ID, Purchase, PurchaseHistory } from "../db/types";
import { AppError } from "../lib/errors";
import { baseFields, nextCode, nowMs, requireDateOrToday } from "../lib/ids";
import { money, optionalText, requireText, round2 } from "../lib/validation";
import { newestFirst, owned, rw } from "./common";

export const listPurchases = async (userId: ID): Promise<Purchase[]> =>
  newestFirst(await db.purchases.where("userId").equals(userId).toArray());

export const purchaseHistory = async (userId: ID, purchaseId?: ID): Promise<PurchaseHistory[]> => {
  const rows = purchaseId
    ? await db.purchaseHistory.where("[userId+purchaseId]").equals([userId, purchaseId]).toArray()
    : await db.purchaseHistory.where("userId").equals(userId).toArray();
  return newestFirst(rows);
};

export interface PurchaseInput {
  shop: string;
  particular: string;
  amount: string | number;
  date?: string;
}

/** Add a purchase (amount owed). Creates the supplier shop record if it does not exist yet (match by name, case-insensitive). */
export async function addPurchase(userId: ID, input: PurchaseInput): Promise<Purchase> {
  const shop = requireText(input.shop, "Shop name", 80);
  const particular = optionalText(input.particular, "Particulars", 300);
  const amount = money(input.amount, "Amount", { allowZero: false });
  const date = requireDateOrToday(input.date);
  const entryDate = requireDateOrToday();
  return rw([db.purchases, db.purchaseHistory], async () => {
    const existing = (await db.purchases.where("userId").equals(userId).toArray()).find(
      (p) => p.shop.toLowerCase() === shop.toLowerCase(),
    );
    let p: Purchase;
    if (existing) {
      p = { ...existing, particulars: particular, date, balance: round2(existing.balance + amount), status: "unpaid", entryDate, updatedAt: nowMs() };
      await db.purchases.put(p);
    } else {
      p = { ...baseFields(userId), code: await nextCode(userId), shop, particulars: particular, date, balance: amount, status: "unpaid", entryDate };
      await db.purchases.add(p);
    }
    await db.purchaseHistory.add({
      ...baseFields(userId), purchaseId: p.id, shopName: p.shop, kind: "purchase", particular, amount, balance: p.balance, status: "unpaid", date, entryDate,
    });
    return p;
  });
}

/** Pay a supplier. Paying more than the balance owed is rejected (same rule as the original). */
export async function payPurchase(userId: ID, id: ID, amountIn: string | number, remarks: string): Promise<void> {
  const amount = money(amountIn, "Payment amount", { allowZero: false });
  const particular = optionalText(remarks, "Remarks");
  await rw([db.purchases, db.purchaseHistory], async () => {
    const p = await owned(db.purchases, userId, id, "Purchase");
    if (amount > p.balance) throw new AppError(`Payment (${amount}) is more than the balance owed (${p.balance}).`);
    const balance = round2(p.balance - amount);
    const status = balance === 0 ? "paid" : "unpaid";
    const entryDate = requireDateOrToday();
    await db.purchases.update(id, { balance, status, entryDate, updatedAt: nowMs() });
    await db.purchaseHistory.add({
      ...baseFields(userId), purchaseId: id, shopName: p.shop, kind: "payment", particular, amount, balance, status: "paid", date: entryDate, entryDate,
    });
  });
}

export async function renamePurchaseShop(userId: ID, id: ID, name: string): Promise<void> {
  const shop = requireText(name, "Shop name", 80);
  await rw([db.purchases, db.purchaseHistory], async () => {
    await owned(db.purchases, userId, id, "Purchase");
    await db.purchases.update(id, { shop, updatedAt: nowMs() });
    await db.purchaseHistory.where("[userId+purchaseId]").equals([userId, id]).modify({ shopName: shop });
  });
}

/** Deleting a shop also deletes its history. Callers must confirm first. */
export async function deletePurchase(userId: ID, id: ID): Promise<void> {
  await rw([db.purchases, db.purchaseHistory], async () => {
    await owned(db.purchases, userId, id, "Purchase");
    await db.purchaseHistory.where("[userId+purchaseId]").equals([userId, id]).delete();
    await db.purchases.delete(id);
  });
}
