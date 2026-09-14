import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { config } from "@/db/schema";

export const SESSION_COOKIE = "sts_token";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || "12345";

export type AppConfig = {
  salt: string;
  passwordHash: string;
  secret: string;
  passwordChanged: boolean;
};

/* ---------------- config bootstrap ---------------- */

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

/** Reads the single config row, creating it (with the default password) on first run. */
export async function getConfig(): Promise<AppConfig> {
  await ensureSchema();
  const rows = await db.select().from(config).where(eq(config.id, "main")).limit(1);
  const row = rows[0];
  if (row) {
    return {
      salt: row.salt,
      passwordHash: row.passwordHash,
      secret: row.secret,
      passwordChanged: row.passwordChanged,
    };
  }
  const fresh: AppConfig = {
    salt: crypto.randomBytes(16).toString("hex"),
    passwordHash: "",
    secret: crypto.randomBytes(32).toString("hex"),
    passwordChanged: false,
  };
  fresh.passwordHash = hashPassword(DEFAULT_PASSWORD, fresh.salt);
  await db
    .insert(config)
    .values({ id: "main", ...fresh })
    .onConflictDoNothing();
  return fresh;
}

export async function verifyPassword(password: string): Promise<boolean> {
  const cfg = await getConfig();
  try {
    const a = Buffer.from(hashPassword(password, cfg.salt), "hex");
    const b = Buffer.from(cfg.passwordHash, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type ChangePasswordResult = "ok" | "wrong-current" | "invalid-next";

export async function changePassword(
  current: string,
  next: string,
): Promise<ChangePasswordResult> {
  if (typeof next !== "string" || next.length < 4 || next.length > 128) {
    return "invalid-next";
  }
  if (!(await verifyPassword(current))) return "wrong-current";
  const salt = crypto.randomBytes(16).toString("hex");
  await db
    .update(config)
    .set({ salt, passwordHash: hashPassword(next, salt), passwordChanged: true })
    .where(eq(config.id, "main"));
  return "ok";
}

/* ---------------- stateless session tokens (payload.exp + HMAC) ---------------- */

export function makeToken(secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function checkToken(token: string | null, secret: string): boolean {
  if (!token || !token.includes(".")) return false;
  const i = token.lastIndexOf(".");
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

/* ---------------- request helpers ---------------- */

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    if (part.slice(0, eqIdx).trim() === name) {
      return decodeURIComponent(part.slice(eqIdx + 1).trim());
    }
  }
  return null;
}

export async function isAuthed(req: Request): Promise<boolean> {
  const cfg = await getConfig();
  return checkToken(readCookie(req, SESSION_COOKIE), cfg.secret);
}

export function sessionCookie(token: string, req: Request): string {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(req: Request): string {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/* ---------------- login rate limiting (15 tries / 10 min per IP) ---------------- */

type Attempt = { first: number; count: number };
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 15;

const globalForAttempts = globalThis as typeof globalThis & {
  __stsLoginAttempts?: Map<string, Attempt>;
};
const attempts = (globalForAttempts.__stsLoginAttempts ??= new Map<string, Attempt>());

export function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) if (now - v.first > WINDOW_MS) attempts.delete(k);
  }
  const rec = attempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(ip, { first: now, count: 1 });
    return false;
  }
  rec.count++;
  return rec.count > MAX_ATTEMPTS;
}

export function clearAttempts(ip: string): void {
  attempts.delete(ip);
}
