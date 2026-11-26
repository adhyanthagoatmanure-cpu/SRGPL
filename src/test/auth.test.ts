import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import { AppError } from "../lib/errors";
import {
  approveUser, authenticate, changePassword, deleteUserAndData, listUsers, registerUser, rejectUser, updateProfile,
} from "../services/auth";
import { createCustomer, listCustomers } from "../services/customers";
import { resetDb, makeUser, USER_PASSWORD } from "./helpers";

beforeEach(resetDb);

describe("auth", () => {
  it("first user becomes the active owner, later users are pending", async () => {
    const owner = await makeUser("owner@x.com", "9000000001");
    expect(owner.role).toBe("owner");
    expect(owner.status).toBe("active");
    const staff = await registerUser({ shopName: "S", email: "staff@x.com", mobile: "9000000002", address: "A", pincode: "600001", password: USER_PASSWORD });
    expect(staff.role).toBe("staff");
    expect(staff.status).toBe("pending");
  });

  it("never stores the plain password and hashes with a salt", async () => {
    const u = await makeUser("a@x.com", "9000000001");
    const stored = await db.users.get(u.id);
    expect(JSON.stringify(stored)).not.toContain(USER_PASSWORD);
    expect(stored?.hashAlgo).toBe("PBKDF2-SHA256");
    const u2 = await registerUser({ shopName: "S", email: "b@x.com", mobile: "9000000002", address: "A", pincode: "600001", password: USER_PASSWORD });
    expect(u2.passwordHash).not.toBe(u.passwordHash);
  });

  it("rejects duplicate email / mobile and weak passwords", async () => {
    await makeUser("a@x.com", "9000000001");
    await expect(registerUser({ shopName: "S", email: "A@x.com", mobile: "9000000009", address: "A", pincode: "600001", password: USER_PASSWORD })).rejects.toThrow(/already registered/);
    await expect(registerUser({ shopName: "S", email: "n@x.com", mobile: "9000000001", address: "A", pincode: "600001", password: USER_PASSWORD })).rejects.toThrow(/mobile/);
    await expect(registerUser({ shopName: "S", email: "w@x.com", mobile: "9000000005", address: "A", pincode: "600001", password: "short" })).rejects.toThrow(AppError);
  });

  it("authenticates correct credentials, rejects wrong ones and pending accounts", async () => {
    const owner = await makeUser("a@x.com", "9000000001");
    expect((await authenticate("A@x.com", USER_PASSWORD)).id).toBe(owner.id);
    await expect(authenticate("a@x.com", "wrong-pass1")).rejects.toThrow(/Incorrect/);
    await expect(authenticate("nobody@x.com", USER_PASSWORD)).rejects.toThrow(/Incorrect/);
    const staff = await registerUser({ shopName: "S", email: "s@x.com", mobile: "9000000002", address: "A", pincode: "600001", password: USER_PASSWORD });
    await expect(authenticate("s@x.com", USER_PASSWORD)).rejects.toThrow(/waiting for approval/);
    await approveUser(owner.id, staff.id);
    expect((await authenticate("s@x.com", USER_PASSWORD)).status).toBe("active");
  });

  it("only the owner can manage accounts; reject removes the request", async () => {
    const owner = await makeUser("a@x.com", "9000000001");
    const staff = await registerUser({ shopName: "S", email: "s@x.com", mobile: "9000000002", address: "A", pincode: "600001", password: USER_PASSWORD });
    await expect(listUsers(staff.id)).rejects.toThrow(/owner/);
    await rejectUser(owner.id, staff.id);
    expect(await db.users.count()).toBe(1);
  });

  it("changes password only with the correct current password", async () => {
    const u = await makeUser("a@x.com", "9000000001");
    await expect(changePassword(u.id, "bad-pass-1", "NewPass123")).rejects.toThrow(/Current password/);
    await changePassword(u.id, USER_PASSWORD, "NewPass123");
    expect((await authenticate("a@x.com", "NewPass123")).id).toBe(u.id);
  });

  it("updates profile and blocks another account's mobile", async () => {
    const owner = await makeUser("a@x.com", "9000000001");
    await makeUser("b@x.com", "9000000002");
    const upd = await updateProfile(owner.id, { shopName: "New", mobile: "9000000003", address: "Addr", pincode: "600002" });
    expect(upd.shopName).toBe("New");
    await expect(updateProfile(owner.id, { shopName: "New", mobile: "9000000002", address: "Addr", pincode: "600002" })).rejects.toThrow(/another account/);
  });

  it("keeps data separated between users and deleting a user removes only their data", async () => {
    const owner = await makeUser("a@x.com", "9000000001");
    const other = await makeUser("b@x.com", "9000000002", owner.id);
    await createCustomer(owner.id, { name: "Ravi", mobile: "9111111111", place: "X", remarks: "" });
    await createCustomer(other.id, { name: "Sita", mobile: "9111111111", place: "Y", remarks: "" }); // same mobile is fine for another user
    expect((await listCustomers(owner.id)).map((c) => c.name)).toEqual(["Ravi"]);
    expect((await listCustomers(other.id)).map((c) => c.name)).toEqual(["Sita"]);
    await deleteUserAndData(owner.id, other.id);
    expect(await listCustomers(other.id)).toHaveLength(0);
    expect(await listCustomers(owner.id)).toHaveLength(1);
    await expect(deleteUserAndData(owner.id, owner.id)).rejects.toThrow(/cannot be deleted/);
  });
});
