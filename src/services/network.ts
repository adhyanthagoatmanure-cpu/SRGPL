import { db } from "../db/db";
import type { ID, Network, NetworkType, Recharge } from "../db/types";
import { AppError } from "../lib/errors";
import { baseFields, nextCode, nowMs, requireDateOrToday } from "../lib/ids";
import { money, oneOf, requireText, round2 } from "../lib/validation";
import { inRange, newestFirst, owned, rw } from "./common";
import type { DateRange } from "./sales";

export const NETWORK_TYPES = ["mobile", "dth", "other"] as const;
export const NETWORK_LABEL: Record<NetworkType, string> = { mobile: "Mobile", dth: "DTH", other: "Other" };

export const listNetworks = async (userId: ID, type?: NetworkType): Promise<Network[]> => {
  const rows = type
    ? await db.networks.where("[userId+type]").equals([userId, type]).toArray()
    : await db.networks.where("userId").equals(userId).toArray();
  return rows.sort((a, b) => a.name.localeCompare(b.name));
};

export async function createNetwork(userId: ID, input: { name: string; type: string }): Promise<Network> {
  const name = requireText(input.name, "Network name", 60);
  const type = oneOf<NetworkType>(input.type, NETWORK_TYPES, "Network type");
  return rw([db.networks], async () => {
    const dup = (await db.networks.where("[userId+type]").equals([userId, type]).toArray()).find((n) => n.name.toLowerCase() === name.toLowerCase());
    if (dup) throw new AppError(`"${dup.name}" already exists in ${NETWORK_LABEL[type]} networks.`);
    const n: Network = { ...baseFields(userId), code: await nextCode(userId), name, type };
    await db.networks.add(n);
    return n;
  });
}

/** Renaming also updates the daily sheet and recharge history labels (as the original did for daily). */
export async function renameNetwork(userId: ID, id: ID, nameIn: string): Promise<void> {
  const name = requireText(nameIn, "Network name", 60);
  await rw([db.networks, db.dailyTransactions, db.dailyHistory, db.recharges], async () => {
    const n = await owned(db.networks, userId, id, "Network");
    const dup = (await db.networks.where("[userId+type]").equals([userId, n.type]).toArray()).find((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase());
    if (dup) throw new AppError(`"${dup.name}" already exists.`);
    await db.networks.update(id, { name, updatedAt: nowMs() });
    await db.dailyTransactions.where("userId").equals(userId).filter((d) => d.networkId === id).modify({ item: name });
    await db.dailyHistory.where("userId").equals(userId).filter((d) => d.networkId === id).modify({ item: name });
    await db.recharges.where("userId").equals(userId).filter((r) => r.networkId === id).modify({ network: name });
  });
}

/** Deletes the network and its daily sheet rows. Past recharge records are kept (they store the network name). */
export async function deleteNetwork(userId: ID, id: ID): Promise<void> {
  await rw([db.networks, db.dailyTransactions, db.dailyHistory], async () => {
    await owned(db.networks, userId, id, "Network");
    await db.dailyTransactions.where("userId").equals(userId).filter((d) => d.networkId === id).delete();
    await db.dailyHistory.where("userId").equals(userId).filter((d) => d.networkId === id).delete();
    await db.networks.delete(id);
  });
}

/* --------------------------------------------------------------- recharges */

export const listRecharges = async (userId: ID, range: DateRange = {}): Promise<Recharge[]> =>
  newestFirst(await db.recharges.where("userId").equals(userId).filter((r) => inRange(r.date, range.from, range.to)).toArray());

export interface RechargeInput {
  networkId: ID;
  number: string;
  amount: string | number;
  oldBalance: string | number;
  newBalance: string | number;
  date?: string;
}

function calc(input: RechargeInput) {
  const amount = money(input.amount, "Recharge amount", { allowZero: false });
  const oldBalance = money(input.oldBalance, "Old balance");
  const newBalance = money(input.newBalance, "New balance");
  return { amount, oldBalance, newBalance, commission: round2(newBalance + amount - oldBalance) };
}

/** commission = new wallet balance + recharge amount - old wallet balance (original formula). */
export async function addRecharge(userId: ID, input: RechargeInput): Promise<Recharge> {
  const number = requireText(input.number, "Number / ID", 40);
  const c = calc(input);
  const date = requireDateOrToday(input.date);
  return rw([db.networks, db.recharges], async () => {
    const n = await owned(db.networks, userId, input.networkId, "Network");
    const r: Recharge = { ...baseFields(userId), networkId: n.id, network: n.name, networkType: n.type, number, ...c, date };
    await db.recharges.add(r);
    return r;
  });
}

export async function updateRecharge(userId: ID, id: ID, input: Omit<RechargeInput, "networkId">): Promise<void> {
  const number = requireText(input.number, "Number / ID", 40);
  const c = calc({ ...input, networkId: "" });
  const date = requireDateOrToday(input.date);
  await rw([db.recharges], async () => {
    await owned(db.recharges, userId, id, "Recharge");
    await db.recharges.update(id, { number, ...c, date, updatedAt: nowMs() });
  });
}

export async function deleteRecharge(userId: ID, id: ID): Promise<void> {
  await rw([db.recharges], async () => {
    await owned(db.recharges, userId, id, "Recharge");
    await db.recharges.delete(id);
  });
}

/* -------------------------------------------------------------- commission */

export interface CommissionRow {
  networkId: ID;
  network: string;
  type: NetworkType;
  count: number;
  amount: number;
  commission: number;
}

/**
 * Commission per mobile / DTH network in a date range = SUM of recharge commissions.
 * (The original page only displayed the last row's commission; summing is the documented deviation.)
 */
export async function commissionReport(userId: ID, range: DateRange): Promise<CommissionRow[]> {
  const rows = await listRecharges(userId, range);
  const map = new Map<ID, CommissionRow>();
  for (const r of rows) {
    if (r.networkType === "other") continue;
    const cur = map.get(r.networkId) ?? { networkId: r.networkId, network: r.network, type: r.networkType, count: 0, amount: 0, commission: 0 };
    cur.count += 1;
    cur.amount = round2(cur.amount + r.amount);
    cur.commission = round2(cur.commission + r.commission);
    cur.network = r.network;
    map.set(r.networkId, cur);
  }
  return [...map.values()].sort((a, b) => a.network.localeCompare(b.network));
}
