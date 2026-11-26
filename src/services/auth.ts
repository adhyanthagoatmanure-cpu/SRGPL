import { db } from "../db/db";
import { TABLE_NAMES, type ID, type User } from "../db/types";
import { AppError } from "../lib/errors";
import { hashPassword, verifyPassword } from "../lib/crypto";
import { newId, nowMs } from "../lib/ids";
import {
  clean,
  optionalPincode,
  requireEmail,
  requireMobile,
  requireText,
  validatePassword,
} from "../lib/validation";
import { rw } from "./common";

/* --------------------------------------------------------------- session */

const SESSION_KEY = "srgpl.session";
const THROTTLE_KEY = "srgpl.loginThrottle";

function safeStorage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Local "session": only the user id is remembered (never the password or its hash).
 * remember = true  -> localStorage  (stays signed in after the browser is closed)
 * remember = false -> sessionStorage (cleared when the tab/browser is closed)
 */
export function saveSession(userId: ID, remember: boolean): void {
  clearSession();
  safeStorage(remember ? "local" : "session")?.setItem(SESSION_KEY, userId);
}
export function loadSession(): ID | null {
  return safeStorage("session")?.getItem(SESSION_KEY) ?? safeStorage("local")?.getItem(SESSION_KEY) ?? null;
}
export function clearSession(): void {
  safeStorage("local")?.removeItem(SESSION_KEY);
  safeStorage("session")?.removeItem(SESSION_KEY);
}

/* ------------------------------------------------------ login throttling */

interface Throttle {
  fails: number;
  until: number;
}
function readThrottle(): Throttle {
  try {
    return JSON.parse(safeStorage("local")?.getItem(THROTTLE_KEY) ?? "") as Throttle;
  } catch {
    return { fails: 0, until: 0 };
  }
}
function writeThrottle(t: Throttle) {
  safeStorage("local")?.setItem(THROTTLE_KEY, JSON.stringify(t));
}

/* ----------------------------------------------------------------- users */

export const countUsers = () => db.users.count();
export const getUser = (id: ID) => db.users.get(id);

export interface RegisterInput {
  shopName: string;
  email: string;
  mobile: string;
  address: string;
  pincode: string;
  password: string;
}

/**
 * Create a local user. The first user on a device becomes the active "owner". Later users are created as
 * "pending" and must be approved by the owner (same request/approve flow as the original admin panel).
 */
export async function registerUser(input: RegisterInput): Promise<User> {
  const shopName = requireText(input.shopName, "Shop name", 80);
  const email = requireEmail(input.email);
  const mobile = requireMobile(input.mobile);
  const address = requireText(input.address, "Address", 200);
  const pincode = optionalPincode(input.pincode);
  if (!pincode) throw new AppError("Pincode is required.");
  validatePassword(input.password);
  const pw = await hashPassword(input.password);

  return rw([db.users], async () => {
    if (await db.users.where("email").equals(email).count()) {
      throw new AppError("This email is already registered on this device. Try logging in.");
    }
    if (await db.users.where("mobile").equals(mobile).count()) {
      throw new AppError("This mobile number is already registered on this device.");
    }
    const first = (await db.users.count()) === 0;
    const t = nowMs();
    const user: User = {
      id: newId(),
      email,
      ...pw,
      shopName,
      mobile,
      address,
      pincode,
      role: first ? "owner" : "staff",
      status: first ? "active" : "pending",
      createdAt: t,
      updatedAt: t,
    };
    await db.users.add(user);
    return user;
  });
}

export async function authenticate(emailInput: string, password: string): Promise<User> {
  const th = readThrottle();
  if (th.until > nowMs()) {
    const secs = Math.ceil((th.until - nowMs()) / 1000);
    throw new AppError(`Too many failed attempts. Try again in ${secs} seconds.`);
  }
  const email = clean(emailInput).toLowerCase();
  const user = email ? await db.users.where("email").equals(email).first() : undefined;
  // Always run the hash so timing does not reveal whether the email exists.
  const ok = user
    ? await verifyPassword(password, user)
    : (await verifyPassword(password, { passwordHash: "", salt: "AAAAAAAAAAAAAAAAAAAAAA==", iterations: 1000 }), false);
  if (!user || !ok) {
    const fails = (th.fails ?? 0) + 1;
    writeThrottle({ fails, until: fails >= 5 ? nowMs() + Math.min(30_000 * 2 ** (fails - 5), 15 * 60_000) : 0 });
    throw new AppError("Incorrect email or password.");
  }
  if (user.status === "pending") {
    throw new AppError("Your registration is still waiting for approval by the owner account of this device.");
  }
  writeThrottle({ fails: 0, until: 0 });
  await db.users.update(user.id, { lastLoginAt: nowMs() });
  return { ...user, lastLoginAt: nowMs() };
}

export interface ProfileInput {
  shopName: string;
  mobile: string;
  address: string;
  pincode: string;
}

export async function updateProfile(userId: ID, input: ProfileInput): Promise<User> {
  const patch = {
    shopName: requireText(input.shopName, "Shop name", 80),
    mobile: requireMobile(input.mobile),
    address: requireText(input.address, "Address", 200),
    pincode: optionalPincode(input.pincode),
    updatedAt: nowMs(),
  };
  return rw([db.users], async () => {
    const other = await db.users.where("mobile").equals(patch.mobile).first();
    if (other && other.id !== userId) throw new AppError("This mobile number belongs to another account on this device.");
    await db.users.update(userId, patch);
    const u = await db.users.get(userId);
    if (!u) throw new AppError("Account not found.");
    return u;
  });
}

export async function changePassword(userId: ID, current: string, next: string): Promise<void> {
  const user = await db.users.get(userId);
  if (!user) throw new AppError("Account not found.");
  if (!(await verifyPassword(current, user))) throw new AppError("Current password is incorrect.");
  validatePassword(next);
  await db.users.update(userId, { ...(await hashPassword(next)), updatedAt: nowMs() });
}

/* -------------------------------------------- account management (owner) */

async function requireOwner(ownerId: ID): Promise<User> {
  const owner = await db.users.get(ownerId);
  if (!owner || owner.role !== "owner" || owner.status !== "active") {
    throw new AppError("Only the owner account of this device can do this.");
  }
  return owner;
}

export async function listUsers(ownerId: ID): Promise<User[]> {
  await requireOwner(ownerId);
  return (await db.users.toArray()).sort((a, b) => a.createdAt - b.createdAt);
}

export async function approveUser(ownerId: ID, userId: ID): Promise<void> {
  await requireOwner(ownerId);
  const n = await db.users.where("id").equals(userId).modify((u) => {
    if (u.status === "pending") {
      u.status = "active";
      u.updatedAt = nowMs();
    }
  });
  if (!n) throw new AppError("Registration request not found.");
}

/** Reject = remove the pending request (same as the original admin "reject"). */
export async function rejectUser(ownerId: ID, userId: ID): Promise<void> {
  await requireOwner(ownerId);
  const u = await db.users.get(userId);
  if (!u || u.status !== "pending") throw new AppError("Only pending requests can be rejected.");
  await db.users.delete(userId);
}

export async function resetUserPassword(ownerId: ID, userId: ID, newPassword: string): Promise<void> {
  await requireOwner(ownerId);
  const u = await db.users.get(userId);
  if (!u) throw new AppError("Account not found.");
  validatePassword(newPassword);
  await db.users.update(userId, { ...(await hashPassword(newPassword)), updatedAt: nowMs() });
}

/** Permanently delete a local user AND every record belonging to them. Callers must confirm first. */
export async function deleteUserAndData(ownerId: ID, userId: ID): Promise<void> {
  await requireOwner(ownerId);
  if (ownerId === userId) throw new AppError("The owner account cannot be deleted.");
  const tables = TABLE_NAMES.filter((n) => n !== "users").map((n) => db.table(n));
  await rw([db.users, ...tables], async () => {
    for (const t of tables) await t.where("userId").equals(userId).delete();
    await db.users.delete(userId);
  });
}

