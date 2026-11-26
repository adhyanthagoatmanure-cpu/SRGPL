import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import type { User } from "../db/types";
import { addCollectionEntry, createCredit, listCredits } from "../services/credits";
import { dailySheet, saveDaily } from "../services/daily";
import { addExpense } from "../services/expenses";
import { createExpenseItem, createSaleItem, deleteItem } from "../services/items";
import { createService, deliver, listServices, markReturn, markSuccess, returnDelivery } from "../services/jobs";
import { addRecharge, commissionReport, createNetwork } from "../services/network";
import { setOrderStatus, createOrder, listOrders } from "../services/orders";
import { computeOverview } from "../services/overview";
import { addPurchase, payPurchase, purchaseHistory } from "../services/purchases";
import { addReturn, addSale, deleteReturn, deleteSale, listSales, updateSale } from "../services/sales";
import { createStock, listStocks, restock, stockHistory } from "../services/stocks";
import { addCash, addWithdrawal, createUpi } from "../services/withdrawals";
import { today } from "../lib/ids";
import { makeUser, resetDb } from "./helpers";

let u: User;
beforeEach(async () => {
  await resetDb();
  u = await makeUser("owner@x.com", "9000000001");
});

describe("stocks and sales", () => {
  it("creating stock creates a sale item and opening history; codes increase from 1001", async () => {
    const s = await createStock(u.id, { name: "Cable", quantity: 10, price: 50 });
    const s2 = await createStock(u.id, { name: "Charger", quantity: 3, price: 200 });
    expect(s.code).toBe(1001);
    expect(s2.code).toBe(1002);
    expect(await db.items.where("stockId").equals(s.id).count()).toBe(1);
    expect((await stockHistory(u.id, s.id))[0].type).toBe("opening");
    await expect(createStock(u.id, { name: "cable", quantity: 1, price: 1 })).rejects.toThrow(/already exists/);
  });

  it("sale reduces stock, defaults price to qty x rate, and cannot oversell", async () => {
    const s = await createStock(u.id, { name: "Cable", quantity: 10, price: 50 });
    const item = (await db.items.where("stockId").equals(s.id).first())!;
    const sale = await addSale(u.id, { itemId: item.id, quantity: 3, remarks: "" });
    expect(sale.price).toBe(150);
    expect((await listStocks(u.id))[0].quantity).toBe(7);
    await expect(addSale(u.id, { itemId: item.id, quantity: 8, remarks: "" })).rejects.toThrow(/Not enough stock/);
    expect((await listStocks(u.id))[0].quantity).toBe(7); // failed sale rolled back completely
    expect(await listSales(u.id)).toHaveLength(1);
  });

  it("editing and deleting a sale keeps stock consistent", async () => {
    const s = await createStock(u.id, { name: "Cable", quantity: 10, price: 50 });
    const item = (await db.items.where("stockId").equals(s.id).first())!;
    const sale = await addSale(u.id, { itemId: item.id, quantity: 3, remarks: "" });
    await updateSale(u.id, sale.id, { quantity: 5, price: 240, remarks: "disc" });
    expect((await listStocks(u.id))[0].quantity).toBe(5);
    await deleteSale(u.id, sale.id);
    expect((await listStocks(u.id))[0].quantity).toBe(10);
  });

  it("restock adds quantity and optionally replaces the price on stock and item", async () => {
    const s = await createStock(u.id, { name: "Cable", quantity: 1, price: 50 });
    await restock(u.id, s.id, 4, 60);
    const [row] = await listStocks(u.id);
    expect(row.quantity).toBe(5);
    expect(row.price).toBe(60);
    expect((await db.items.where("stockId").equals(s.id).first())!.rate).toBe(60);
    await expect(restock(u.id, s.id, 0)).rejects.toThrow(/greater than zero/);
  });

  it("returns add stock back; deleting a return is blocked if stock would go negative", async () => {
    const s = await createStock(u.id, { name: "Cable", quantity: 2, price: 50 });
    const item = (await db.items.where("stockId").equals(s.id).first())!;
    const r = await addReturn(u.id, { itemId: item.id, quantity: 2, price: 100, remarks: "" });
    expect((await listStocks(u.id))[0].quantity).toBe(4);
    await addSale(u.id, { itemId: item.id, quantity: 4, remarks: "" });
    await expect(deleteReturn(u.id, r.id)).rejects.toThrow(/Not enough stock/);
  });

  it("items linked to stock cannot be deleted; unlinked items can", async () => {
    const s = await createStock(u.id, { name: "Cable", quantity: 2, price: 50 });
    const linked = (await db.items.where("stockId").equals(s.id).first())!;
    await expect(deleteItem(u.id, linked.id)).rejects.toThrow(/Stocks page/);
    const plain = await createSaleItem(u.id, { name: "Lamination", rate: 10 });
    const sale = await addSale(u.id, { itemId: plain.id, quantity: 2, price: 20, remarks: "" });
    expect(sale.stockId).toBeUndefined();
    await deleteItem(u.id, plain.id);
  });

  it("rejects negative / invalid numbers", async () => {
    await expect(createStock(u.id, { name: "X", quantity: -1, price: 5 })).rejects.toThrow(/negative/);
    await expect(createStock(u.id, { name: "X", quantity: "abc", price: 5 })).rejects.toThrow(/valid number/);
  });
});

describe("purchases", () => {
  it("accumulates balance per shop, supports partial payments, rejects overpayment", async () => {
    const p = await addPurchase(u.id, { shop: "Mega", particular: "SIM", amount: 1000 });
    await addPurchase(u.id, { shop: "mega", particular: "Cards", amount: 500 });
    await payPurchase(u.id, p.id, 600, "part");
    let row = (await db.purchases.get(p.id))!;
    expect(row.balance).toBe(900);
    expect(row.status).toBe("unpaid");
    await expect(payPurchase(u.id, p.id, 901, "")).rejects.toThrow(/more than the balance/);
    await payPurchase(u.id, p.id, 900, "");
    row = (await db.purchases.get(p.id))!;
    expect(row.balance).toBe(0);
    expect(row.status).toBe("paid");
    expect(await db.purchases.count()).toBe(1);
    expect(await purchaseHistory(u.id, p.id)).toHaveLength(4);
  });
});

describe("credits", () => {
  it("opening balance, credit and payment entries; overpayment rejected", async () => {
    const c = await createCredit(u.id, { name: "Ravi", mobile: "9111111111", particulars: "", openingBalance: 300 });
    await addCollectionEntry(u.id, c.id, { kind: "credit", amount: 200, remarks: "" });
    await addCollectionEntry(u.id, c.id, { kind: "payment", amount: 150, remarks: "" });
    expect((await listCredits(u.id))[0].balance).toBe(350);
    await expect(addCollectionEntry(u.id, c.id, { kind: "payment", amount: 351, remarks: "" })).rejects.toThrow(/more than the balance/);
    expect(await db.collections.count()).toBe(3);
  });
});

describe("orders", () => {
  it("starts pending and records every status change", async () => {
    const o = await createOrder(u.id, { name: "Ravi", mobile: "", particular: "SIM", remarks: "" });
    expect(o.status).toBe("Pending");
    await setOrderStatus(u.id, o.id, "Delivered", "done");
    expect((await listOrders(u.id))[0].status).toBe("Delivered");
    expect(await db.orderHistory.count()).toBe(2);
    await expect(setOrderStatus(u.id, o.id, "Bogus", "")).rejects.toThrow(/not valid/);
  });
});

describe("services", () => {
  it("success -> delivery flow computes balances", async () => {
    const s = await createService(u.id, { name: "Ravi", mobile: "", place: "", complaint: "Screen", advance: 200, remarks: "" });
    await markSuccess(u.id, s.id, 1000, "fixed");
    expect((await listServices(u.id))[0].balance).toBe(800);
    await expect(deliver(u.id, s.id, 900, "")).rejects.toThrow(/more than the balance/);
    await deliver(u.id, s.id, 800, "");
    const done = (await listServices(u.id))[0];
    expect(done.status).toBe("Success Delivery");
    expect(done.balance).toBe(0);
    await expect(markReturn(u.id, s.id, "")).rejects.toThrow(/currently/);
  });

  it("return flow refunds advance", async () => {
    const s = await createService(u.id, { name: "Ravi", mobile: "", place: "", complaint: "Screen", advance: 200, remarks: "" });
    await markReturn(u.id, s.id, "cannot repair");
    await expect(returnDelivery(u.id, s.id, 250, "")).rejects.toThrow(/more than the advance/);
    await returnDelivery(u.id, s.id, 200, "");
    const row = (await listServices(u.id))[0];
    expect(row.advance).toBe(0);
    expect(row.status).toBe("Return Delivery");
  });
});

describe("networks, recharge, daily", () => {
  it("commission = new balance + amount - old balance, summed per network, 'other' excluded", async () => {
    const jio = await createNetwork(u.id, { name: "Jio", type: "mobile" });
    const oth = await createNetwork(u.id, { name: "Bill", type: "other" });
    await addRecharge(u.id, { networkId: jio.id, number: "9999999999", amount: 100, oldBalance: 1000, newBalance: 904 });
    await addRecharge(u.id, { networkId: jio.id, number: "9999999998", amount: 200, oldBalance: 904, newBalance: 706 });
    await addRecharge(u.id, { networkId: oth.id, number: "1", amount: 50, oldBalance: 100, newBalance: 50 });
    const rep = await commissionReport(u.id, {});
    expect(rep).toHaveLength(1);
    expect(rep[0].commission).toBe(4 + 2);
    await expect(createNetwork(u.id, { name: "jio", type: "mobile" })).rejects.toThrow(/already exists/);
  });

  it("daily sheet: sales = opening + purchase - closing, one row per network per day", async () => {
    const net = await createNetwork(u.id, { name: "Airtel", type: "mobile" });
    expect((await dailySheet(u.id, today()))[0].record).toBeUndefined();
    const rec = await saveDaily(u.id, net.id, today(), { opening: 1000, purchase: 500, closing: 700 });
    expect(rec.sales).toBe(800);
    await saveDaily(u.id, net.id, today(), { opening: 1000, purchase: 500, closing: 600 });
    expect(await db.dailyTransactions.count()).toBe(1);
    expect(await db.dailyHistory.count()).toBe(2);
    await expect(saveDaily(u.id, net.id, today(), { opening: 10, purchase: 0, closing: 20 })).rejects.toThrow(/Closing balance/);
  });
});

describe("overview", () => {
  it("applies the original overview formula", async () => {
    const sItem = await createSaleItem(u.id, { name: "Lam", rate: 10 });
    await addSale(u.id, { itemId: sItem.id, quantity: 1, price: 1000, remarks: "" });
    const eItem = await createExpenseItem(u.id, "Tea");
    await addExpense(u.id, { itemId: eItem.id, amount: 100, remarks: "" });
    const p = await addPurchase(u.id, { shop: "Mega", particular: "", amount: 500 });
    await payPurchase(u.id, p.id, 200, "");
    const c = await createCredit(u.id, { name: "Ravi", mobile: "", particulars: "", openingBalance: 0 });
    await addCollectionEntry(u.id, c.id, { kind: "credit", amount: 50, remarks: "" });
    await addCollectionEntry(u.id, c.id, { kind: "payment", amount: 20, remarks: "" });
    await addCash(u.id, { amount: 300 });
    const upi = await createUpi(u.id, "PhonePe");
    await addWithdrawal(u.id, { upiId: upi.id, amount: 400, commission: 10, way: "hand", remarks: "" });
    await addWithdrawal(u.id, { upiId: upi.id, amount: 100, commission: 5, way: "bank", remarks: "" });
    const ov = await computeOverview(u.id, today(), today());
    // 1000 - 100 - 200 + 20 - 50 + 300 + 10 - 5 - 500(upi)
    expect(ov.total).toBe(475);
  });

  it("is limited to the date range", async () => {
    const eItem = await createExpenseItem(u.id, "Tea");
    await addExpense(u.id, { itemId: eItem.id, amount: 100, remarks: "", date: "2020-01-01" });
    expect((await computeOverview(u.id, today(), today())).total).toBe(0);
    expect((await computeOverview(u.id, "2020-01-01", "2020-01-31")).total).toBe(-100);
  });
});
