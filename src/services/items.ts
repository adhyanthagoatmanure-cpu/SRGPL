import { db } from "../db/db";
import type { ID, Item, ItemKind } from "../db/types";
import { AppError } from "../lib/errors";
import { baseFields, nextCode, nowMs } from "../lib/ids";
import { money, requireText } from "../lib/validation";
import { owned, rw } from "./common";

export const listItems = async (userId: ID, kind?: ItemKind): Promise<Item[]> => {
  const rows = kind
    ? await db.items.where("[userId+kind]").equals([userId, kind]).toArray()
    : await db.items.where("userId").equals(userId).toArray();
  return rows.sort((a, b) => a.name.localeCompare(b.name));
};

async function assertNameFree(userId: ID, kind: ItemKind, name: string, exceptId?: ID) {
  const dup = (await db.items.where("[userId+kind]").equals([userId, kind]).toArray()).find(
    (i) => i.name.toLowerCase() === name.toLowerCase() && i.id !== exceptId,
  );
  if (dup) throw new AppError(`An item named "${dup.name}" already exists.`);
}

/** Sale item without stock tracking (the original "add item with rate" flow). */
export async function createSaleItem(userId: ID, input: { name: string; rate: string | number }): Promise<Item> {
  const name = requireText(input.name, "Item name", 80);
  const rate = money(input.rate, "Rate");
  return rw([db.items], async () => {
    await assertNameFree(userId, "sale", name);
    const it: Item = { ...baseFields(userId), code: await nextCode(userId), kind: "sale", name, rate };
    await db.items.add(it);
    return it;
  });
}

export async function createExpenseItem(userId: ID, nameIn: string): Promise<Item> {
  const name = requireText(nameIn, "Expense name", 80);
  return rw([db.items], async () => {
    await assertNameFree(userId, "expense", name);
    const it: Item = { ...baseFields(userId), code: await nextCode(userId), kind: "expense", name, rate: 0 };
    await db.items.add(it);
    return it;
  });
}

/** Rename / re-rate an item and keep names in related records in sync (stock, sales, expenses, returns). */
export async function updateItem(userId: ID, id: ID, input: { name: string; rate?: string | number }): Promise<void> {
  const name = requireText(input.name, "Name", 80);
  await rw([db.items, db.stocks, db.sales, db.expenses, db.returns], async () => {
    const it = await owned(db.items, userId, id, "Item");
    await assertNameFree(userId, it.kind, name, id);
    const rate = it.kind === "sale" && input.rate !== undefined ? money(input.rate, "Rate") : it.rate;
    await db.items.update(id, { name, rate, updatedAt: nowMs() });
    if (it.stockId) {
      const s = await db.stocks.get(it.stockId);
      if (s && s.userId === userId) await db.stocks.update(s.id, { name, price: rate, updatedAt: nowMs() });
    }
    await db.sales.where("[userId+itemId]").equals([userId, id]).modify({ itemName: name });
    await db.expenses.where("[userId+itemId]").equals([userId, id]).modify({ itemName: name });
    await db.returns.where("userId").equals(userId).filter((r) => r.itemId === id).modify({ product: name });
  });
}

/** Items with a stock record must be removed from Stocks (so stock history is not orphaned). */
export async function deleteItem(userId: ID, id: ID): Promise<void> {
  await rw([db.items, db.stocks], async () => {
    const it = await owned(db.items, userId, id, "Item");
    if (it.stockId && (await db.stocks.get(it.stockId))) {
      throw new AppError("This item is linked to a stock record. Delete it from the Stocks page instead.");
    }
    await db.items.delete(id);
  });
}
