import { db } from "../db/db";
import type { Customer, CustomerHistory, ID } from "../db/types";
import { AppError } from "../lib/errors";
import { baseFields, nextCode, nowMs, today } from "../lib/ids";
import { optionalText, requireMobile, requireText } from "../lib/validation";
import { newestFirst, owned, rw } from "./common";

export interface CustomerInput {
  name: string;
  mobile: string;
  place: string;
  remarks: string;
}

function parse(input: CustomerInput) {
  return {
    name: requireText(input.name, "Name", 80),
    mobile: requireMobile(input.mobile),
    place: requireText(input.place, "Place", 120),
    remarks: optionalText(input.remarks, "Remarks"),
  };
}

export async function listCustomers(userId: ID): Promise<Customer[]> {
  return newestFirst(await db.customers.where("userId").equals(userId).toArray());
}

async function assertMobileFree(userId: ID, mobile: string, exceptId?: ID) {
  const dup = await db.customers.where("[userId+mobile]").equals([userId, mobile]).first();
  if (dup && dup.id !== exceptId) throw new AppError(`A customer with mobile ${mobile} already exists (${dup.name}).`);
}

export async function createCustomer(userId: ID, input: CustomerInput): Promise<Customer> {
  const v = parse(input);
  return rw([db.customers, db.customerHistory], async () => {
    await assertMobileFree(userId, v.mobile);
    const c: Customer = { ...baseFields(userId), code: await nextCode(userId), ...v, date: today() };
    await db.customers.add(c);
    await db.customerHistory.add({ ...baseFields(userId), customerId: c.id, name: c.name, place: c.place, mobile: c.mobile, remarks: c.remarks, date: c.date });
    return c;
  });
}

export async function updateCustomer(userId: ID, id: ID, input: CustomerInput): Promise<void> {
  const v = parse(input);
  await rw([db.customers, db.customerHistory], async () => {
    const old = await owned(db.customers, userId, id, "Customer");
    await assertMobileFree(userId, v.mobile, id);
    await db.customers.update(id, { ...v, updatedAt: nowMs() });
    if (old.remarks !== v.remarks) {
      await db.customerHistory.add({ ...baseFields(userId), customerId: id, name: v.name, place: v.place, mobile: v.mobile, remarks: v.remarks, date: today() });
    }
  });
}

export async function deleteCustomer(userId: ID, id: ID): Promise<void> {
  await rw([db.customers, db.customerHistory], async () => {
    await owned(db.customers, userId, id, "Customer");
    await db.customerHistory.where("[userId+customerId]").equals([userId, id]).delete();
    await db.customers.delete(id);
  });
}

export async function customerHistory(userId: ID, customerId: ID): Promise<CustomerHistory[]> {
  return newestFirst(await db.customerHistory.where("[userId+customerId]").equals([userId, customerId]).toArray());
}
