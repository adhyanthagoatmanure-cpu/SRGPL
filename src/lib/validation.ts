import { AppError } from "./errors";

/** Remove control characters, trim and collapse surrounding whitespace. React escapes output; this keeps stored data clean. */
export function clean(value: unknown): string {
  // eslint-disable-next-line no-control-regex
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

export function requireText(value: unknown, label: string, max = 120): string {
  const v = clean(value);
  if (!v) throw new AppError(`${label} is required.`);
  if (v.length > max) throw new AppError(`${label} must be at most ${max} characters.`);
  return v;
}

export function optionalText(value: unknown, label: string, max = 300): string {
  const v = clean(value);
  if (v.length > max) throw new AppError(`${label} must be at most ${max} characters.`);
  return v;
}

/** Accepts digits, optional leading +, spaces and dashes; stores digits (and +) only. */
export function requireMobile(value: unknown, label = "Mobile number"): string {
  const v = clean(value).replace(/[\s-]/g, "");
  if (!/^\+?\d{7,15}$/.test(v)) throw new AppError(`${label} must contain 7 to 15 digits.`);
  return v;
}

export function optionalMobile(value: unknown, label = "Mobile number"): string {
  return clean(value) ? requireMobile(value, label) : "";
}

export function requireEmail(value: unknown): string {
  const v = clean(value).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || v.length > 254) throw new AppError("Enter a valid email address.");
  return v;
}

export function optionalPincode(value: unknown): string {
  const v = clean(value);
  if (v && !/^[A-Za-z0-9 -]{3,10}$/.test(v)) throw new AppError("Pincode must be 3 to 10 letters or digits.");
  return v;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export { round2 };

interface NumOpts {
  min?: number;
  max?: number;
  allowZero?: boolean;
  allowNegative?: boolean;
}

/** Parse a number typed by the user. Empty string -> error (use `optionalMoney` for optional fields). */
export function parseNumber(value: unknown, label: string, opts: NumOpts = {}): number {
  const raw = typeof value === "number" ? String(value) : clean(value);
  if (raw === "") throw new AppError(`${label} is required.`);
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new AppError(`${label} must be a valid number.`);
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new AppError(`${label} must be a valid number.`);
  if (n < 0 && !opts.allowNegative) throw new AppError(`${label} cannot be negative.`);
  if (n === 0 && opts.allowZero === false) throw new AppError(`${label} must be greater than zero.`);
  const max = opts.max ?? 1_000_000_000;
  if (Math.abs(n) > max) throw new AppError(`${label} is too large.`);
  if (opts.min !== undefined && n < opts.min) throw new AppError(`${label} must be at least ${opts.min}.`);
  return round2(n);
}

/** Money amount >= 0 (zero allowed unless allowZero === false). */
export const money = (v: unknown, label: string, opts: NumOpts = {}) => parseNumber(v, label, opts);

export function optionalMoney(v: unknown, label: string, fallback = 0, opts: NumOpts = {}): number {
  return clean(v) === "" ? fallback : parseNumber(v, label, opts);
}

/** Quantity: positive number (decimals allowed, e.g. 2.5 kg). */
export const quantity = (v: unknown, label = "Quantity") => parseNumber(v, label, { allowZero: false });

export function requireDate(value: unknown, label = "Date"): string {
  const v = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new AppError(`${label} must be a valid date.`);
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) throw new AppError(`${label} must be a valid date.`);
  return v;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  const v = clean(value) as T;
  if (!allowed.includes(v)) throw new AppError(`${label} is not valid.`);
  return v;
}

export function validatePassword(password: string): void {
  if (password.length < 8) throw new AppError("Password must be at least 8 characters.");
  if (password.length > 200) throw new AppError("Password is too long.");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new AppError("Password must contain at least one letter and one number.");
}
