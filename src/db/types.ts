/**
 * Domain types for the local IndexedDB database.
 *
 * Conventions
 *  - `id`        : random UUID (crypto.randomUUID) - globally unique, safe to merge between devices.
 *  - `code`      : human friendly numeric ID (1001, 1002 ...) per user, shown in the UI. Same idea as
 *                  the "shared ID pool" of the original PHP application, but never re-used.
 *  - `userId`    : owner of the record. Every business record belongs to exactly one local user.
 *  - `date`      : business date as local "YYYY-MM-DD" string (sortable / range-queryable).
 *  - `createdAt` / `updatedAt` : epoch milliseconds.
 */

export type ID = string;
export type DateStr = string; // YYYY-MM-DD

export interface Base {
  id: ID;
  userId: ID;
  createdAt: number;
  updatedAt: number;
}

/* ------------------------------------------------------------------ users */

export type UserRole = "owner" | "staff";
export type UserStatus = "active" | "pending";

export interface User {
  id: ID;
  email: string; // lower-case, unique
  passwordHash: string; // base64 PBKDF2 output
  salt: string; // base64
  iterations: number;
  hashAlgo: "PBKDF2-SHA256";
  shopName: string;
  mobile: string;
  address: string;
  pincode: string;
  role: UserRole;
  status: UserStatus;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
}

/* -------------------------------------------------------------- customers */

/** original: customerdetails */
export interface Customer extends Base {
  code: number;
  name: string;
  mobile: string;
  place: string;
  remarks: string;
  date: DateStr;
}

/** original: customerdetailshistory */
export interface CustomerHistory extends Base {
  customerId: ID;
  name: string;
  place: string;
  mobile: string;
  remarks: string;
  date: DateStr;
}

/* ----------------------------------------------------------------- orders */

export const ORDER_STATUSES = ["Pending", "Success", "Delivered", "Failed", "Cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order extends Base {
  code: number;
  name: string;
  mobile: string;
  particular: string;
  remarks: string;
  status: OrderStatus;
  date: DateStr;
}

export interface OrderHistory extends Base {
  orderId: ID;
  status: OrderStatus;
  remarks: string;
  date: DateStr;
}

/* -------------------------------------------------------------- purchases */

export type PurchaseStatus = "new" | "unpaid" | "paid";

/** original: purchase. One record per supplier shop with a running balance owed. */
export interface Purchase extends Base {
  code: number;
  shop: string;
  particulars: string; // last purchase particulars
  date: DateStr; // last purchase date
  balance: number; // amount still owed to the shop
  status: PurchaseStatus;
  entryDate: DateStr; // date of last entry
}

export type PurchaseEntryKind = "purchase" | "payment";

/** original: purchasehistory (unpaid column = purchase, paid column = payment) */
export interface PurchaseHistory extends Base {
  purchaseId: ID;
  shopName: string;
  kind: PurchaseEntryKind;
  particular: string;
  amount: number;
  balance: number; // balance after this entry
  status: PurchaseStatus;
  date: DateStr;
  entryDate: DateStr;
}

/* ---------------------------------------------------------------- stocks */

export interface Stock extends Base {
  code: number;
  name: string;
  quantity: number;
  price: number; // selling rate
}

export type StockMovement = "opening" | "restock" | "adjustment" | "sale" | "return" | "void-sale" | "void-return";

export interface StockHistory extends Base {
  stockId: ID;
  type: StockMovement;
  quantity: number; // signed change
  quantityAfter: number;
  price: number | null;
  refId?: ID;
  date: DateStr;
}

/* ------------------------------------------------------ items/sales/expense */

export type ItemKind = "sale" | "expense";

/** original: details (item catalogue) */
export interface Item extends Base {
  code: number;
  kind: ItemKind;
  name: string;
  rate: number; // default selling rate (sale items)
  stockId?: ID; // sale item backed by a stock record
}

/** original: detailshistory where saleOrpurchase = 'sale' */
export interface Sale extends Base {
  itemId: ID;
  itemName: string;
  stockId?: ID;
  quantity: number;
  price: number; // total amount received
  remarks: string;
  date: DateStr;
}

/** original: detailshistory where saleOrpurchase = 'expense' */
export interface Expense extends Base {
  itemId: ID;
  itemName: string;
  amount: number;
  remarks: string;
  date: DateStr;
}

/** original: salereturn */
export interface SaleReturn extends Base {
  itemId: ID;
  product: string;
  stockId?: ID;
  quantity: number;
  price: number;
  remarks: string;
  date: DateStr;
}

/* --------------------------------------------------------------- credits */

/** original: customers (credit customers with outstanding balance) */
export interface Credit extends Base {
  code: number;
  name: string;
  mobile: string;
  particulars: string;
  balance: number;
  date: DateStr;
}

export type CollectionKind = "credit" | "payment";

/** original: customerhistory */
export interface Collection extends Base {
  creditId: ID;
  kind: CollectionKind; // credit = given on credit, payment = collected
  amount: number;
  balance: number; // balance after this entry
  remarks: string;
  date: DateStr;
}

/* -------------------------------------------------------------- services */

export const SERVICE_STATUSES = ["New", "Success", "Success Delivery", "Return", "Return Delivery"] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export interface Service extends Base {
  code: number;
  name: string;
  mobile: string;
  place: string;
  complaint: string;
  advance: number;
  final: number;
  balance: number;
  status: ServiceStatus;
  remarks: string;
  date: DateStr;
}

export interface ServiceHistory extends Base {
  serviceId: ID;
  customerName: string;
  advance: number;
  final: number;
  balance: number;
  paid: number;
  returnAmount: number;
  status: ServiceStatus;
  remarks: string;
  date: DateStr;
}

/* ------------------------------------------------- recharge / daily / UPI */

export type NetworkType = "mobile" | "dth" | "other";

export interface Network extends Base {
  code: number;
  name: string;
  type: NetworkType;
}

export interface Recharge extends Base {
  networkId: ID;
  network: string;
  networkType: NetworkType;
  number: string;
  amount: number;
  oldBalance: number;
  newBalance: number;
  commission: number; // newBalance + amount - oldBalance
  date: DateStr;
}

/** original: daily - one row per network per day (a fresh row replaces the old "zero.php" reset). */
export interface DailyTransaction extends Base {
  networkId: ID;
  item: string;
  date: DateStr;
  opening: number;
  purchase: number;
  closing: number;
  sales: number; // opening + purchase - closing (calculated when closing is saved)
}

export interface DailyHistory extends Base {
  dailyId: ID;
  networkId: ID;
  item: string;
  opening: number;
  purchase: number;
  closing: number;
  sales: number;
  date: DateStr;
}

export interface UpiAccount extends Base {
  code: number;
  name: string;
}

export type WithdrawWay = "bank" | "hand";

export interface Withdrawal extends Base {
  upiId: ID;
  name: string;
  amount: number;
  commission: number;
  way: WithdrawWay;
  remarks: string;
  date: DateStr;
}

/** original: cashinhand */
export interface CashEntry extends Base {
  amount: number;
  date: DateStr;
}

/* -------------------------------------------------------------- settings */

export interface Setting {
  id: string; // `${userId}:${key}`
  userId: string; // user id or "device"
  key: string;
  value: unknown;
  updatedAt: number;
}

/** Names of every Dexie table - single source of truth used by backup/restore. */
export const TABLE_NAMES = [
  "users",
  "customers",
  "customerHistory",
  "orders",
  "orderHistory",
  "purchases",
  "purchaseHistory",
  "stocks",
  "stockHistory",
  "items",
  "sales",
  "expenses",
  "returns",
  "credits",
  "collections",
  "services",
  "serviceHistory",
  "networks",
  "recharges",
  "dailyTransactions",
  "dailyHistory",
  "upiAccounts",
  "withdrawals",
  "cashEntries",
  "settings",
] as const;
export type TableName = (typeof TABLE_NAMES)[number];
