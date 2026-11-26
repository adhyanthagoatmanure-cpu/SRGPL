import Dexie, { type Table } from "dexie";
import type {
  CashEntry,
  Collection,
  Credit,
  Customer,
  CustomerHistory,
  DailyHistory,
  DailyTransaction,
  Expense,
  Item,
  Network,
  Order,
  OrderHistory,
  Purchase,
  PurchaseHistory,
  Recharge,
  Sale,
  SaleReturn,
  Service,
  ServiceHistory,
  Setting,
  Stock,
  StockHistory,
  UpiAccount,
  User,
  Withdrawal,
} from "./types";

export const DB_NAME = "srgpl-manager";

/**
 * Schema version 1.
 *
 * UPGRADE RULES (to prevent data loss):
 *  1. NEVER edit an existing `SCHEMA_Vn` object. Add a new `SCHEMA_Vn+1` and a new `.version(n+1)` block.
 *  2. NEVER drop a table by setting it to `null` - old data would be destroyed.
 *  3. Put data transformations in `.upgrade(tx => ...)`; they run inside the upgrade transaction, so a failure
 *     rolls the whole upgrade back and the previous data remains untouched.
 *  4. Dexie only needs the indexes (not every field) in the schema string.
 */
export const SCHEMA_V1 = {
  users: "id, &email, mobile, status, role",
  customers: "id, userId, [userId+mobile], [userId+code], [userId+date]",
  customerHistory: "id, userId, [userId+customerId]",
  orders: "id, userId, [userId+code], [userId+status], [userId+date]",
  orderHistory: "id, userId, [userId+orderId]",
  purchases: "id, userId, [userId+code], [userId+entryDate]",
  purchaseHistory: "id, userId, [userId+purchaseId], [userId+entryDate]",
  stocks: "id, userId, [userId+code], [userId+quantity]",
  stockHistory: "id, userId, [userId+stockId], [userId+date]",
  items: "id, userId, [userId+kind], stockId",
  sales: "id, userId, [userId+date], [userId+itemId]",
  expenses: "id, userId, [userId+date], [userId+itemId]",
  returns: "id, userId, [userId+date]",
  credits: "id, userId, [userId+code], [userId+mobile]",
  collections: "id, userId, [userId+creditId], [userId+date]",
  services: "id, userId, [userId+code], [userId+date], [userId+status]",
  serviceHistory: "id, userId, [userId+serviceId], [userId+date]",
  networks: "id, userId, [userId+type]",
  recharges: "id, userId, [userId+date], [userId+networkType]",
  dailyTransactions: "id, userId, [userId+date], &[userId+networkId+date]",
  dailyHistory: "id, userId, [userId+networkId], [userId+date]",
  upiAccounts: "id, userId",
  withdrawals: "id, userId, [userId+date]",
  cashEntries: "id, userId, [userId+date]",
  settings: "id, userId, [userId+key]",
} as const;

export class AppDB extends Dexie {
  users!: Table<User, string>;
  customers!: Table<Customer, string>;
  customerHistory!: Table<CustomerHistory, string>;
  orders!: Table<Order, string>;
  orderHistory!: Table<OrderHistory, string>;
  purchases!: Table<Purchase, string>;
  purchaseHistory!: Table<PurchaseHistory, string>;
  stocks!: Table<Stock, string>;
  stockHistory!: Table<StockHistory, string>;
  items!: Table<Item, string>;
  sales!: Table<Sale, string>;
  expenses!: Table<Expense, string>;
  returns!: Table<SaleReturn, string>;
  credits!: Table<Credit, string>;
  collections!: Table<Collection, string>;
  services!: Table<Service, string>;
  serviceHistory!: Table<ServiceHistory, string>;
  networks!: Table<Network, string>;
  recharges!: Table<Recharge, string>;
  dailyTransactions!: Table<DailyTransaction, string>;
  dailyHistory!: Table<DailyHistory, string>;
  upiAccounts!: Table<UpiAccount, string>;
  withdrawals!: Table<Withdrawal, string>;
  cashEntries!: Table<CashEntry, string>;
  settings!: Table<Setting, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores(SCHEMA_V1);
    // Future versions go here, e.g.
    // this.version(2).stores({ newTable: "id, userId" }).upgrade(async (tx) => { ... });
  }
}

export const db = new AppDB();

/** Called when another tab upgrades the DB: close our connection so the upgrade is not blocked. */
db.on("versionchange", () => {
  db.close();
  if (typeof window !== "undefined") {
    window.alert("The application was updated in another tab. The page will reload.");
    window.location.reload();
  }
});
