import { db } from "../db/db";
import type { ID, Stock, StockHistory, StockMovement } from "../db/types";
import { AppError } from "../lib/errors";
import { baseFields, nextCode, nowMs, today } from "../lib/ids";
import { money, optionalMoney, parseNumber, quantity, requireText, round2 } from "../lib/validation";
import { newestFirst, owned, rw } from "./common";

/** Stock is shown as "low" below this quantity (original app used 5). */
export const LOW_STOCK_LIMIT = 5;

export const listStocks = async (userId: ID): Promise<Stock[]> =>
  (await db.stocks.where("userId").equals(userId).toArray()).sort((a, b) => a.name.localeCompare(b.name));

export const stockHistory = async (userId: ID, stockId?: ID): Promise<StockHistory[]> => {
  const rows = stockId
    ? await db.stockHistory.where("[userId+stockId]").equals([userId, stockId]).toArray()
    : await db.stockHistory.where("userId").equals(userId).toArray();
  return newestFirst(rows);
};

/**
 * Change a stock quantity by `delta` and log it. Must run inside a transaction containing stocks + stockHistory.
 * Business rule (documented deviation): stock may not go below zero.
 */
export async function applyStock(
  userId: ID,
  stockId: ID,
  delta: number,
  type: StockMovement,
  opts: { refId?: ID; price?: number | null; date?: string } = {},
): Promise<Stock> {
  const s = await owned(db.stocks, userId, stockId, "Stock item");
  const after = round2(s.quantity + delta);
  if (after < 0) throw new AppError(`Not enough stock for "${s.name}": ${s.quantity} available, ${Math.abs(delta)} needed.`);
  await db.stocks.update(stockId, { quantity: after, updatedAt: nowMs() });
  await db.stockHistory.add({
    ...baseFields(userId), stockId, type, quantity: delta, quantityAfter: after, price: opts.price ?? null, refId: opts.refId, date: opts.date ?? today(),
  });
  return { ...s, quantity: after };
}

async function assertStockNameFree(userId: ID, name: string, exceptId?: ID) {
  const dup = (await db.stocks.where("userId").equals(userId).toArray()).find(
    (s) => s.name.toLowerCase() === name.toLowerCase() && s.id !== exceptId,
  );
  if (dup) throw new AppError(`A stock item named "${dup.name}" already exists.`);
}

/** Create a stock item and its matching sale item (so it can be sold), like the original. */
export async function createStock(userId: ID, input: { name: string; quantity: string | number; price: string | number }): Promise<Stock> {
  const name = requireText(input.name, "Item name", 80);
  const qty = parseNumber(input.quantity, "Quantity");
  const price = money(input.price, "Selling price");
  return rw([db.stocks, db.stockHistory, db.items], async () => {
    await assertStockNameFree(userId, name);
    const code = await nextCode(userId);
    const s: Stock = { ...baseFields(userId), code, name, quantity: qty, price };
    await db.stocks.add(s);
    await db.stockHistory.add({ ...baseFields(userId), stockId: s.id, type: "opening", quantity: qty, quantityAfter: qty, price, date: today() });
    await db.items.add({ ...baseFields(userId), code, kind: "sale", name, rate: price, stockId: s.id });
    return s;
  });
}

/** Add stock (purchase more). Optionally replace the selling price. */
export async function restock(userId: ID, id: ID, qtyIn: string | number, priceIn?: string | number): Promise<void> {
  const qty = quantity(qtyIn, "Quantity to add");
  const price = optionalMoney(priceIn ?? "", "Price", -1);
  await rw([db.stocks, db.stockHistory, db.items], async () => {
    await applyStock(userId, id, qty, "restock", { price: price >= 0 ? price : null });
    if (price >= 0) {
      await db.stocks.update(id, { price });
      await db.items.where("stockId").equals(id).modify({ rate: price, updatedAt: nowMs() });
    }
  });
}

/** Correct a stock quantity by a signed amount (e.g. damaged goods -2). */
export async function adjustStock(userId: ID, id: ID, deltaIn: string | number): Promise<void> {
  const delta = parseNumber(deltaIn, "Adjustment", { allowNegative: true, allowZero: false });
  await rw([db.stocks, db.stockHistory], async () => {
    await applyStock(userId, id, delta, "adjustment");
  });
}

export async function updateStock(userId: ID, id: ID, input: { name: string; price: string | number }): Promise<void> {
  const name = requireText(input.name, "Item name", 80);
  const price = money(input.price, "Selling price");
  await rw([db.stocks, db.items, db.sales, db.returns], async () => {
    await owned(db.stocks, userId, id, "Stock item");
    await assertStockNameFree(userId, name, id);
    await db.stocks.update(id, { name, price, updatedAt: nowMs() });
    const items = await db.items.where("stockId").equals(id).toArray();
    for (const it of items) {
      await db.items.update(it.id, { name, rate: price, updatedAt: nowMs() });
      await db.sales.where("[userId+itemId]").equals([userId, it.id]).modify({ itemName: name });
      await db.returns.where("userId").equals(userId).filter((r) => r.itemId === it.id).modify({ product: name });
    }
  });
}

/** Deletes the stock item and its history; the linked sale item stays (without stock tracking) so old sales still resolve. */
export async function deleteStock(userId: ID, id: ID): Promise<void> {
  await rw([db.stocks, db.stockHistory, db.items], async () => {
    await owned(db.stocks, userId, id, "Stock item");
    await db.stockHistory.where("[userId+stockId]").equals([userId, id]).delete();
    await db.items.where("stockId").equals(id).modify((it) => {
      delete it.stockId;
    });
    await db.stocks.delete(id);
  });
}
