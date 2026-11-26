import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import type { User } from "../db/types";
import { createBackup, exportCsv, importBackup, validateBackup, clearUserData } from "../services/backup";
import { createCustomer, listCustomers } from "../services/customers";
import { createStock, listStocks } from "../services/stocks";
import { addSale } from "../services/sales";
import { makeUser, resetDb } from "./helpers";

let u: User;
beforeEach(async () => {
  await resetDb();
  u = await makeUser("owner@x.com", "9000000001");
  await createCustomer(u.id, { name: "Ravi", mobile: "9111111111", place: "X", remarks: "=cmd|' /C calc'!A0" });
  const s = await createStock(u.id, { name: "Cable", quantity: 10, price: 50 });
  const item = (await db.items.where("stockId").equals(s.id).first())!;
  await addSale(u.id, { itemId: item.id, quantity: 2, remarks: "" });
});

describe("backup / restore", () => {
  it("round-trips a full backup into an empty device (accounts included)", async () => {
    const { json, summary } = await createBackup(u.id, "user");
    expect(summary.total).toBeGreaterThan(5);
    await resetDb();
    const preview = await validateBackup(json);
    expect(preview.ok).toBe(true);
    const res = await importBackup(preview, "skip", null);
    expect(res.added).toBe(summary.total);
    expect(await db.users.count()).toBe(1);
    expect(await listCustomers(u.id)).toHaveLength(1);
    expect((await listStocks(u.id))[0].quantity).toBe(8);
  });

  it("detects tampering via checksum and rejects non-backup files", async () => {
    const { json } = await createBackup(u.id, "user");
    const tampered = json.replace("Ravi", "Evil");
    const bad = await validateBackup(tampered);
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toMatch(/Integrity/);
    expect((await validateBackup("not json")).ok).toBe(false);
    expect((await validateBackup(JSON.stringify({ app: "other" }))).ok).toBe(false);
  });

  it("rejects structurally invalid rows and newer formats", async () => {
    const { json } = await createBackup(u.id, "user");
    const obj = JSON.parse(json);
    obj.format = 99;
    expect((await validateBackup(JSON.stringify(obj))).errors[0]).toMatch(/newer version/);
    const obj2 = JSON.parse(json);
    obj2.tables.sales[0].price = "abc";
    // recompute checksum so only the structure check fails
    const { sha256Hex } = await import("../lib/crypto");
    obj2.checksum = await sha256Hex(JSON.stringify(obj2.tables));
    const r = await validateBackup(JSON.stringify(obj2));
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/price/);
  });

  it("duplicate handling: skip keeps existing, overwrite replaces, replace wipes first", async () => {
    const { json } = await createBackup(u.id, "user");
    const c = (await listCustomers(u.id))[0];
    await db.customers.update(c.id, { place: "Changed" });
    await createCustomer(u.id, { name: "Extra", mobile: "9222222222", place: "Z", remarks: "" });

    const p1 = await validateBackup(json);
    expect(p1.duplicates).toBeGreaterThan(0);
    await importBackup(p1, "skip", u.id);
    expect((await db.customers.get(c.id))!.place).toBe("Changed");
    expect(await listCustomers(u.id)).toHaveLength(2);

    await importBackup(p1, "overwrite", u.id);
    expect((await db.customers.get(c.id))!.place).toBe("X");
    expect(await listCustomers(u.id)).toHaveLength(2);

    await importBackup(p1, "replace", u.id);
    expect(await listCustomers(u.id)).toHaveLength(1);
  });

  it("importing into a different account remaps ownership and keeps the account record untouched", async () => {
    const { json } = await createBackup(u.id, "user");
    await resetDb(); // e.g. a new device with a different account
    const other = await makeUser("b@x.com", "9000000002");
    const preview = await validateBackup(json);
    await importBackup(preview, "skip", other.id);
    const mine = await listCustomers(other.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].userId).toBe(other.id);
    expect((await db.users.get(other.id))!.email).toBe("b@x.com");
  });

  it("refuses to import records that already exist under another account (no cross-account overwrite)", async () => {
    const { json } = await createBackup(u.id, "user");
    const other = await makeUser("b@x.com", "9000000002", u.id);
    const preview = await validateBackup(json);
    await expect(importBackup(preview, "overwrite", other.id)).rejects.toThrow(/another account/);
    expect(await listCustomers(other.id)).toHaveLength(0);
    expect(await listCustomers(u.id)).toHaveLength(1);
  });

  it("raw account restore is refused when accounts already exist", async () => {
    const { json } = await createBackup(u.id, "user");
    const preview = await validateBackup(json);
    await expect(importBackup(preview, "skip", null)).rejects.toThrow(/no accounts/);
  });

  it("does not lower the ID counter when merging", async () => {
    const { json } = await createBackup(u.id, "user");
    await createCustomer(u.id, { name: "More", mobile: "9333333333", place: "Z", remarks: "" });
    const before = (await db.settings.get(`${u.id}:nextCode`))!.value as number;
    await importBackup(await validateBackup(json), "overwrite", u.id);
    expect((await db.settings.get(`${u.id}:nextCode`))!.value).toBe(before);
  });

  it("only the owner can create a device-wide backup", async () => {
    const staff = await makeUser("s@x.com", "9000000003", u.id);
    await expect(createBackup(staff.id, "device")).rejects.toThrow(/owner/);
    const all = await createBackup(u.id, "device");
    expect(JSON.parse(all.json).tables.users).toHaveLength(2);
  });

  it("CSV export neutralises spreadsheet formulas and clearUserData empties a user", async () => {
    const csv = await exportCsv(u.id, "customers");
    expect(csv.split("\r\n")[0]).toContain("name");
    expect(csv).toContain("'=cmd");
    await clearUserData(u.id);
    expect(await listCustomers(u.id)).toHaveLength(0);
    expect(await db.users.count()).toBe(1);
  });
});
