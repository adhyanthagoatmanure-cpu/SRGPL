import { db } from "../db/db";
import type { User } from "../db/types";
import { approveUser, registerUser } from "../services/auth";

export const USER_PASSWORD = "Passw0rd!x";

export async function resetDb(): Promise<void> {
  await db.delete();
  await db.open();
}

/** Create an active user. When `ownerId` is given the user is created pending then approved. */
export async function makeUser(email: string, mobile: string, ownerId?: string): Promise<User> {
  const u = await registerUser({ shopName: "Shop", email, mobile, address: "Street 1", pincode: "600001", password: USER_PASSWORD });
  if (ownerId) {
    await approveUser(ownerId, u.id);
    return { ...u, status: "active" };
  }
  return u;
}
