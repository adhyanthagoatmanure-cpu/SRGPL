const ITERATIONS = 310_000;
const enc = new TextEncoder();

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return toB64(bits);
}

/** Salted PBKDF2-SHA256 hash. The plain-text password is never stored. */
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  return {
    passwordHash: await derive(password, salt, ITERATIONS),
    salt: toB64(salt),
    iterations: ITERATIONS,
    hashAlgo: "PBKDF2-SHA256" as const,
  };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password: string, rec: { passwordHash: string; salt: string; iterations: number }): Promise<boolean> {
  const hash = await derive(password, fromB64(rec.salt), rec.iterations);
  return constantTimeEqual(hash, rec.passwordHash);
}

/** SHA-256 hex digest, used as an integrity checksum for backup files. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
