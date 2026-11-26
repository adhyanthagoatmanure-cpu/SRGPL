import { db } from "../db/db";
import type { ID, Sale, SaleReturn } from "../db/types";
import { AppError } from "../lib/errors";
import { baseFields, requireDateOrToday } from "../lib/ids";
import { money, optionalText, quantity, round2 } from "../lib/validation";
import { inRange, newestFirst, owned, rw } from "./common";
import { applyStock } from "./stocks";

export interface SaleInput {
  itemId: ID;
  quantity: string | number;
  /** Total amount received. Empty = quantity x item rate (the original "price fixer"). */
  price?: string | number;
  remarks: string;
  date?: string;
}

export interface DateRange {
  from?: string;
  to?: string;
}

export async function listSales(userId: ID, range: DateRange = {}): Promise<Sale[]> {
  const rows = await db.sales.where("userId").equals(userId).filter((s) => inRange(s.date, range.from, range.to)).toArray();
  return newestFirst(rows);
}

async function stockStillExists(userId: ID, stockId?: ID): Promise<ID | undefined> {
  if (!stockId) return undefined;
  const s = await db.stocks.get(stockId);
  return s && s.userId === userId ? stockId : undefined;
}

export async function addSale(userId: ID, input: SaleInput): Promise<Sale> {
  const qty = quantity(input.quantity);
  const remarks = optionalText(input.remarks, "Remarks");
  const date = requireDateOrToday(input.date);
  return rw([db.items, db.sales, db.stocks, db.stockHistory], async () => {
    const item = await owned(db.items, userId, input.itemId, "Item");
    if (item.kind !== "sale") throw new AppError("Choose a sale item.");
    const price = String(input.price ?? "").trim() === "" ? round2(qty * item.rate) : money(input.price, "Price");
    const stockId = await stockStillExists(userId, item.stockId);
    const sale: Sale = { ...baseFields(userId), itemId: item.id, itemName: item.name, stockId, quantity: qty, price, remarks, date };
    if (stockId) await applyStock(userId, stockId, -qty, "sale", { refId: sale.id, price, date });
    await db.sales.add(sale);
    return sale;
  });
}

/** Edit quantity / price / remarks / date. The stock difference is applied automatically. */
export async function updateSale(userId: ID, id: ID, input: Omit<SaleInput, "itemId">): Promise<void> {
  const qty = quantity(input.quantity);
  const price = money(input.price, "Price");
  const remarks = optionalText(input.remarks, "Remarks");
  const date = requireDateOrToday(input.date);
  await rw([db.sales, db.stocks, db.stockHistory], async () => {
    const old = await owned(db.sales, userId, id, "Sale");
    const stockId = await stockStillExists(userId, old.stockId);
    if (stockId && qty !== old.quantity) await applyStock(userId, stockId, round2(old.quantity - qty), "adjustment", { refId: id, date });
    await db.sales.update(id, { quantity: qty, price, remarks, date, stockId, updatedAt: Date.now() });
  });
}

/** Deleting a sale puts the quantity back into stock. */
export async function deleteSale(userId: ID, id: ID): Promise<void> {
  await rw([db.sales, db.stocks, db.stockHistory], async () => {
    const s = await owned(db.sales, userId, id, "Sale");
    const stockId = await stockStillExists(userId, s.stockId);
    if (stockId) await applyStock(userId, stockId, s.quantity, "void-sale", { refId: id });
    await db.sales.delete(id);
  });
}

/* ---------------------------------------------------------------- returns */

export interface ReturnInput {
  itemId: ID;
  quantity: string | number;
  price: string | number;
  remarks: string;
  date?: string;
}

export async function listReturns(userId: ID, range: DateRange = {}): Promise<SaleReturn[]> {
  return newestFirst(await db.returns.where("userId").equals(userId).filter((r) => inRange(r.date, range.from, range.to)).toArray());
}

/** A sale return adds the quantity back to stock; `price` is the money refunded to the customer. */
export async function addReturn(userId: ID, input: ReturnInput): Promise<SaleReturn> {
  const qty = quantity(input.quantity);
  const price = money(input.price, "Refund amount");
  const remarks = optionalText(input.remarks, "Remarks");
  const date = requireDateOrToday(input.date);
  return rw([db.items, db.returns, db.stocks, db.stockHistory], async () => {
    const item = await owned(db.items, userId, input.itemId, "Item");
    const stockId = await stockStillExists(userId, item.stockId);
    const r: SaleReturn = { ...baseFields(userId), itemId: item.id, product: item.name, stockId, quantity: qty, price, remarks, date };
    if (stockId) await applyStock(userId, stockId, qty, "return", { refId: r.id, price, date });
    await db.returns.add(r);
    return r;
  });
}

export async function updateReturn(userId: ID, id: ID, input: Omit<ReturnInput, "itemId">): Promise<void> {
  const qty = quantity(input.quantity);
  const price = money(input.price, "Refund amount");
  const remarks = optionalText(input.remarks, "Remarks");
  const date = requireDateOrToday(input.date);
  await rw([db.returns, db.stocks, db.stockHistory], async () => {
    const old = await owned(db.returns, userId, id, "Return");
    const stockId = await stockStillExists(userId, old.stockId);
    if (stockId && qty !== old.quantity) await applyStock(userId, stockId, round2(qty - old.quantity), "adjustment", { refId: id, date });
    await db.returns.update(id, { quantity: qty, price, remarks, date, stockId, updatedAt: Date.now() });
  });
}

export async function deleteReturn(userId: ID, id: ID): Promise<void> {
  await rw([db.returns, db.stocks, db.stockHistory], async () => {
    const r = await owned(db.returns, userId, id, "Return");
    const stockId = await stockStillExists(userId, r.stockId);
    if (stockId) await applyStock(userId, stockId, -r.quantity, "void-return", { refId: id });
    await db.returns.delete(id);
  });
}
