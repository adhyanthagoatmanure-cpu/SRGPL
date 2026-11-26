import { db } from "../db/db";
import { ORDER_STATUSES, type ID, type Order, type OrderHistory, type OrderStatus } from "../db/types";
import { baseFields, nextCode, nowMs, today } from "../lib/ids";
import { clean, oneOf, optionalMobile, optionalText, requireText } from "../lib/validation";
import { newestFirst, owned, rw } from "./common";

export interface OrderInput {
  name: string;
  mobile: string;
  particular: string;
  remarks: string;
}

function parse(i: OrderInput) {
  return {
    name: requireText(i.name, "Customer name", 80),
    mobile: optionalMobile(i.mobile),
    particular: requireText(i.particular, "Order details", 300),
    remarks: optionalText(i.remarks, "Remarks"),
  };
}

export async function listOrders(userId: ID): Promise<Order[]> {
  return newestFirst(await db.orders.where("userId").equals(userId).toArray());
}

export async function createOrder(userId: ID, input: OrderInput): Promise<Order> {
  const v = parse(input);
  return rw([db.orders, db.orderHistory], async () => {
    const o: Order = { ...baseFields(userId), code: await nextCode(userId), ...v, status: "Pending", date: today() };
    await db.orders.add(o);
    await db.orderHistory.add({ ...baseFields(userId), orderId: o.id, status: o.status, remarks: o.remarks, date: o.date });
    return o;
  });
}

export async function updateOrderDetails(userId: ID, id: ID, input: OrderInput): Promise<void> {
  const v = parse(input);
  await rw([db.orders], async () => {
    await owned(db.orders, userId, id, "Order");
    await db.orders.update(id, { ...v, updatedAt: nowMs() });
  });
}

export async function setOrderStatus(userId: ID, id: ID, status: string, remarks: string): Promise<void> {
  const st = oneOf<OrderStatus>(status, ORDER_STATUSES, "Status");
  const r = optionalText(remarks, "Remarks");
  await rw([db.orders, db.orderHistory], async () => {
    const o = await owned(db.orders, userId, id, "Order");
    await db.orders.update(id, { status: st, remarks: r || o.remarks, updatedAt: nowMs() });
    await db.orderHistory.add({ ...baseFields(userId), orderId: id, status: st, remarks: clean(r), date: today() });
  });
}

export async function deleteOrder(userId: ID, id: ID): Promise<void> {
  await rw([db.orders, db.orderHistory], async () => {
    await owned(db.orders, userId, id, "Order");
    await db.orderHistory.where("[userId+orderId]").equals([userId, id]).delete();
    await db.orders.delete(id);
  });
}

export async function orderHistory(userId: ID, orderId: ID): Promise<OrderHistory[]> {
  return newestFirst(await db.orderHistory.where("[userId+orderId]").equals([userId, orderId]).toArray());
}

/** Every status change across all orders (the original "order history" page). */
export async function allOrderHistory(userId: ID): Promise<Array<OrderHistory & { order?: Order }>> {
  const [hist, orders] = await Promise.all([db.orderHistory.where("userId").equals(userId).toArray(), listOrders(userId)]);
  const map = new Map(orders.map((o) => [o.id, o]));
  return newestFirst(hist).map((h) => ({ ...h, order: map.get(h.orderId) }));
}
