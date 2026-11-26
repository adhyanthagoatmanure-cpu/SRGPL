import { db } from "../db/db";
import type { ID, Service, ServiceHistory, ServiceStatus } from "../db/types";
import { AppError } from "../lib/errors";
import { baseFields, nextCode, nowMs, requireDateOrToday } from "../lib/ids";
import { money, optionalMobile, optionalMoney, optionalText, requireText, round2 } from "../lib/validation";
import { newestFirst, owned, rw } from "./common";

export const listServices = async (userId: ID): Promise<Service[]> =>
  newestFirst(await db.services.where("userId").equals(userId).toArray());

export const serviceHistory = async (userId: ID, serviceId?: ID): Promise<ServiceHistory[]> => {
  const rows = serviceId
    ? await db.serviceHistory.where("[userId+serviceId]").equals([userId, serviceId]).toArray()
    : await db.serviceHistory.where("userId").equals(userId).toArray();
  return newestFirst(rows);
};

export interface ServiceInput {
  name: string;
  mobile: string;
  place: string;
  complaint: string;
  advance?: string | number;
  remarks: string;
}

function histRow(userId: ID, s: Service, patch: Partial<ServiceHistory> & { paid: number; returnAmount: number }): ServiceHistory {
  return {
    ...baseFields(userId), serviceId: s.id, customerName: s.name, advance: s.advance, final: s.final, balance: s.balance,
    status: s.status, remarks: s.remarks, date: requireDateOrToday(), ...patch,
  };
}

export async function createService(userId: ID, input: ServiceInput): Promise<Service> {
  const name = requireText(input.name, "Customer name", 80);
  const mobile = optionalMobile(input.mobile);
  const place = optionalText(input.place, "Place", 120);
  const complaint = requireText(input.complaint, "Complaint / job details", 300);
  const advance = optionalMoney(input.advance ?? "", "Advance", 0);
  const remarks = optionalText(input.remarks, "Remarks");
  return rw([db.services, db.serviceHistory], async () => {
    const s: Service = {
      ...baseFields(userId), code: await nextCode(userId), name, mobile, place, complaint, advance, final: 0, balance: 0, status: "New", remarks, date: requireDateOrToday(),
    };
    await db.services.add(s);
    await db.serviceHistory.add(histRow(userId, s, { paid: advance, returnAmount: 0 }));
    return s;
  });
}

export async function updateServiceDetails(userId: ID, id: ID, input: Pick<ServiceInput, "name" | "mobile" | "place" | "complaint">): Promise<void> {
  const patch = {
    name: requireText(input.name, "Customer name", 80),
    mobile: optionalMobile(input.mobile),
    place: optionalText(input.place, "Place", 120),
    complaint: requireText(input.complaint, "Complaint / job details", 300),
    updatedAt: nowMs(),
  };
  await rw([db.services], async () => {
    await owned(db.services, userId, id, "Service job");
    await db.services.update(id, patch);
  });
}

const fail = (s: Service, action: string) =>
  new AppError(`Cannot ${action}: this job is currently "${s.status}".`);

/** Work finished: set the final bill. Balance = final - advance. */
export async function markSuccess(userId: ID, id: ID, finalIn: string | number, remarks: string): Promise<void> {
  const final = money(finalIn, "Final amount", { allowZero: false });
  const r = optionalText(remarks, "Remarks");
  await rw([db.services, db.serviceHistory], async () => {
    const s = await owned(db.services, userId, id, "Service job");
    if (s.status !== "New" && s.status !== "Success") throw fail(s, "mark as success");
    if (final < s.advance) throw new AppError(`Final amount (${final}) cannot be less than the advance already paid (${s.advance}).`);
    const next: Service = { ...s, final, balance: round2(final - s.advance), status: "Success", remarks: r || s.remarks, updatedAt: nowMs() };
    await db.services.put(next);
    await db.serviceHistory.add(histRow(userId, next, { paid: 0, returnAmount: 0 }));
  });
}

/** Customer collects the item and pays the balance (default = full balance). */
export async function deliver(userId: ID, id: ID, paidIn: string | number, remarks: string): Promise<void> {
  const r = optionalText(remarks, "Remarks");
  await rw([db.services, db.serviceHistory], async () => {
    const s = await owned(db.services, userId, id, "Service job");
    if (s.status !== "Success") throw fail(s, "deliver");
    const paid = String(paidIn).trim() === "" ? s.balance : money(paidIn, "Amount received");
    if (paid > s.balance) throw new AppError(`Amount received (${paid}) is more than the balance due (${s.balance}).`);
    const next: Service = { ...s, balance: round2(s.balance - paid), status: "Success Delivery", remarks: r || s.remarks, updatedAt: nowMs() };
    await db.services.put(next);
    await db.serviceHistory.add(histRow(userId, next, { paid, returnAmount: 0 }));
  });
}

/** Job cannot be done: balance and final bill go to zero; any advance is refunded at "Return Delivery". */
export async function markReturn(userId: ID, id: ID, remarks: string): Promise<void> {
  const r = optionalText(remarks, "Remarks");
  await rw([db.services, db.serviceHistory], async () => {
    const s = await owned(db.services, userId, id, "Service job");
    if (s.status !== "New" && s.status !== "Success") throw fail(s, "mark as return");
    const next: Service = { ...s, balance: 0, final: 0, status: "Return", remarks: r || s.remarks, updatedAt: nowMs() };
    await db.services.put(next);
    await db.serviceHistory.add(histRow(userId, next, { paid: 0, returnAmount: 0 }));
  });
}

/** Item handed back; refund (default = advance) is deducted from the advance. */
export async function returnDelivery(userId: ID, id: ID, refundIn: string | number, remarks: string): Promise<void> {
  const r = optionalText(remarks, "Remarks");
  await rw([db.services, db.serviceHistory], async () => {
    const s = await owned(db.services, userId, id, "Service job");
    if (s.status !== "Return") throw fail(s, "return-deliver");
    const refund = String(refundIn).trim() === "" ? s.advance : money(refundIn, "Refund amount");
    if (refund > s.advance) throw new AppError(`Refund (${refund}) is more than the advance paid (${s.advance}).`);
    const next: Service = { ...s, advance: round2(s.advance - refund), balance: 0, final: 0, status: "Return Delivery", remarks: r || s.remarks, updatedAt: nowMs() };
    await db.services.put(next);
    await db.serviceHistory.add(histRow(userId, next, { paid: 0, returnAmount: refund }));
  });
}

export async function addServiceRemark(userId: ID, id: ID, remarks: string): Promise<void> {
  const r = requireText(remarks, "Remarks", 300);
  await rw([db.services, db.serviceHistory], async () => {
    const s = await owned(db.services, userId, id, "Service job");
    const next = { ...s, remarks: r, updatedAt: nowMs() };
    await db.services.put(next);
    await db.serviceHistory.add(histRow(userId, next, { paid: 0, returnAmount: 0 }));
  });
}

export async function deleteService(userId: ID, id: ID): Promise<void> {
  await rw([db.services, db.serviceHistory], async () => {
    await owned(db.services, userId, id, "Service job");
    await db.serviceHistory.where("[userId+serviceId]").equals([userId, id]).delete();
    await db.services.delete(id);
  });
}

export type { ServiceStatus };
