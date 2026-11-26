import { db } from "../db/db";
import type { ID } from "../db/types";
import { inRange } from "./common";
import { sum } from "../lib/format";
import { round2 } from "../lib/validation";
import { LOW_STOCK_LIMIT } from "./stocks";

export interface OverviewLine {
  key: string;
  label: string;
  amount: number;
  /** +1 adds to the total, -1 subtracts. */
  sign: 1 | -1;
}

export interface Overview {
  lines: OverviewLine[];
  total: number;
}

/**
 * Cash overview for a date range. Formula taken from the original overview.php (the "today" page):
 *   total = sales - expenses + service(received - refunded) - purchases paid + credit collected - credit given
 *           + cash in hand - sale returns + recharge amount + hand commission - bank commission - UPI withdrawals
 * The original overviewfilter.php (date-range page) used a slightly different, inconsistent formula; this app uses
 * one formula for every range (see README "Open questions").
 */
export async function computeOverview(userId: ID, from?: string, to?: string): Promise<Overview> {
  const [sales, expenses, services, purchases, collections, cash, returns, recharges, withdrawals] = await Promise.all([
    db.sales.where("userId").equals(userId).toArray(),
    db.expenses.where("userId").equals(userId).toArray(),
    db.serviceHistory.where("userId").equals(userId).toArray(),
    db.purchaseHistory.where("userId").equals(userId).toArray(),
    db.collections.where("userId").equals(userId).toArray(),
    db.cashEntries.where("userId").equals(userId).toArray(),
    db.returns.where("userId").equals(userId).toArray(),
    db.recharges.where("userId").equals(userId).toArray(),
    db.withdrawals.where("userId").equals(userId).toArray(),
  ]);
  const ok = (d: string) => inRange(d, from, to);
  const w = withdrawals.filter((x) => ok(x.date));
  const lines: OverviewLine[] = [
    { key: "sales", label: "Sales", amount: sum(sales.filter((x) => ok(x.date)), (x) => x.price), sign: 1 },
    { key: "expenses", label: "Expenses", amount: sum(expenses.filter((x) => ok(x.date)), (x) => x.amount), sign: -1 },
    { key: "serviceIn", label: "Service amount received", amount: sum(services.filter((x) => ok(x.date)), (x) => x.paid), sign: 1 },
    { key: "serviceOut", label: "Service refunds", amount: sum(services.filter((x) => ok(x.date)), (x) => x.returnAmount), sign: -1 },
    { key: "purchasePaid", label: "Purchases paid", amount: sum(purchases.filter((x) => x.kind === "payment" && ok(x.date)), (x) => x.amount), sign: -1 },
    { key: "creditCollected", label: "Credit collected", amount: sum(collections.filter((x) => x.kind === "payment" && ok(x.date)), (x) => x.amount), sign: 1 },
    { key: "creditGiven", label: "Credit given", amount: sum(collections.filter((x) => x.kind === "credit" && ok(x.date)), (x) => x.amount), sign: -1 },
    { key: "cash", label: "Cash in hand", amount: sum(cash.filter((x) => ok(x.date)), (x) => x.amount), sign: 1 },
    { key: "saleReturns", label: "Sale returns", amount: sum(returns.filter((x) => ok(x.date)), (x) => x.price), sign: -1 },
    { key: "recharge", label: "Recharge amount", amount: sum(recharges.filter((x) => ok(x.date)), (x) => x.amount), sign: 1 },
    { key: "handCommission", label: "Withdraw commission (cash)", amount: sum(w.filter((x) => x.way === "hand"), (x) => x.commission), sign: 1 },
    { key: "bankCommission", label: "Withdraw commission (bank)", amount: sum(w.filter((x) => x.way === "bank"), (x) => x.commission), sign: -1 },
    { key: "upi", label: "UPI withdrawals", amount: sum(w, (x) => x.amount), sign: -1 },
  ];
  const total = round2(lines.reduce((a, l) => a + l.sign * l.amount, 0));
  return { lines, total };
}

export interface DashboardStats {
  overview: Overview;
  salesToday: number;
  expensesToday: number;
  customers: number;
  pendingOrders: number;
  creditOutstanding: number;
  purchaseOwed: number;
  lowStock: number;
  openServices: number;
  hasAnyData: boolean;
}

export async function dashboardStats(userId: ID, date: string): Promise<DashboardStats> {
  const [overview, sales, expenses, customers, orders, credits, purchases, stocks, services] = await Promise.all([
    computeOverview(userId, date, date),
    db.sales.where("[userId+date]").equals([userId, date]).toArray(),
    db.expenses.where("[userId+date]").equals([userId, date]).toArray(),
    db.customers.where("userId").equals(userId).count(),
    db.orders.where("userId").equals(userId).toArray(),
    db.credits.where("userId").equals(userId).toArray(),
    db.purchases.where("userId").equals(userId).toArray(),
    db.stocks.where("userId").equals(userId).toArray(),
    db.services.where("userId").equals(userId).toArray(),
  ]);
  return {
    overview,
    salesToday: sum(sales, (s) => s.price),
    expensesToday: sum(expenses, (e) => e.amount),
    customers,
    pendingOrders: orders.filter((o) => o.status === "Pending" || o.status === "Success").length,
    creditOutstanding: sum(credits, (c) => c.balance),
    purchaseOwed: sum(purchases, (p) => p.balance),
    lowStock: stocks.filter((s) => s.quantity < LOW_STOCK_LIMIT).length,
    openServices: services.filter((s) => s.status === "New" || s.status === "Success" || s.status === "Return").length,
    hasAnyData: customers + orders.length + credits.length + purchases.length + stocks.length + services.length + sales.length > 0,
  };
}
